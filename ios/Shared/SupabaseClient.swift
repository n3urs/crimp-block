import Foundation
import Observation

/// Talks to the same Supabase project app.js does (`SUPABASE_URL`/
/// `SUPABASE_ANON` there), directly over REST — there is no Supabase JS SDK
/// on native, and PostgREST/GoTrue are plain HTTP underneath it anyway.
/// The anon key is not a secret (it's already embedded in the public web
/// bundle by design); RLS on `user_id` is what actually protects data, same
/// as on the web — confirmed live: an unauthenticated GET against
/// `sessions` returns `[]`, not an error and not other people's rows.
///
/// Mirrors the *shape* of Store/Loads in app.js closely enough that
/// NativeStore/NativeLoads can reproduce their exact optimistic-write/
/// rollback-on-failure semantics on top of this, not a different contract.
///
/// `@Observable` is load-bearing, not housekeeping: NativeAppView holds
/// this in `@State` and branches its whole body on `client.session == nil`
/// to decide between the sign-in screen and the app. Without observation,
/// signing in mutated `session` with SwiftUI never being told, so the
/// sign-in screen stayed put even though the session was live — the user
/// saw a tap that "did nothing", tapped SIGN IN again, and the second
/// request re-submitted a token the first (successful) verify had already
/// consumed. Supabase answers a consumed token with the same generic
/// `403 otp_expired "Token has expired or is invalid"` it uses for a
/// simply-wrong one (confirmed directly against the live endpoint), which
/// is what made this look like an expiry problem when it never was. Every
/// other class this view holds in `@State` (NativeStore, NativeLoads,
/// NativeProfile, SubscriptionManager, the timer controllers) was already
/// `@Observable`; this one was the lone exception, and only ever appeared
/// to work because `reload()` happens to flip an unrelated `loading` flag
/// that forced a re-render as a side effect.
@Observable
final class SupabaseClient {
    struct AuthSession: Codable {
        let accessToken: String
        let refreshToken: String
        let userID: String
        let email: String
    }

    enum ClientError: Error, CustomStringConvertible {
        case http(Int, String)
        case decoding(String)
        case notSignedIn

        var description: String {
            switch self {
            case .http(let code, let msg): return "HTTP \(code): \(msg)"
            case .decoding(let what): return "couldn't decode \(what)"
            case .notSignedIn: return "not signed in"
            }
        }
    }

    private let baseURL: URL
    private let anonKey: String
    private static let keychainKey = "session"

    private(set) var session: AuthSession? {
        didSet { persistSession() }
    }

    init(url: String, anonKey: String) {
        self.baseURL = URL(string: url)!
        self.anonKey = anonKey
        session = Self.loadPersistedSession()
    }

    // MARK: - Auth (GoTrue, /auth/v1/*)

    /// Sends the sign-in code. Mirrors `sb.auth.signInWithOtp` in app.js —
    /// there is no magic-link redirect to configure natively, the code
    /// entry flow (already the primary path on web too, see app.js's
    /// showCode() comment on why) is the only one that makes sense here.
    func sendOTP(email: String) async throws {
        var req = request("auth/v1/otp", method: "POST")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["email": email])
        _ = try await send(req)
    }

    func verifyOTP(email: String, token: String) async throws {
        var req = request("auth/v1/verify", method: "POST")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email, "token": token, "type": "email"
        ])
        let data = try await send(req)
        session = try Self.decodeAuthResponse(data)
    }

    func signOut() {
        session = nil
    }

    /// GoTrue's access token is short-lived (Supabase's default is one
    /// hour) — this was never captured before, so once it expired every
    /// authenticated call failed with "JWT expired" forever, with no way
    /// out except a full manual sign-out/sign-in. `sendAuthed` below
    /// catches exactly that failure once and retries after a refresh, so
    /// this only needs calling automatically, not from callers directly.
    private func refreshSession() async throws {
        guard let session else { throw ClientError.notSignedIn }
        var req = request("auth/v1/token?grant_type=refresh_token", method: "POST")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": session.refreshToken])
        do {
            let data = try await send(req)
            self.session = try Self.decodeAuthResponse(data)
        } catch {
            // The refresh token itself is also invalid/expired (a genuinely
            // stale session, not just an expired access token) — nothing
            // left to do but sign out cleanly so the app lands back on the
            // sign-in screen instead of staying stuck showing this error.
            self.session = nil
            throw error
        }
    }

    private static func decodeAuthResponse(_ data: Data) throws -> AuthSession {
        struct Response: Decodable {
            let access_token: String
            let refresh_token: String
            let user: User
            struct User: Decodable { let id: String; let email: String }
        }
        guard let resp = try? JSONDecoder().decode(Response.self, from: data) else {
            throw ClientError.decoding("auth response")
        }
        return AuthSession(accessToken: resp.access_token, refreshToken: resp.refresh_token, userID: resp.user.id, email: resp.user.email)
    }

    // MARK: - REST (PostgREST, /rest/v1/*)

    /// `query` is the raw query string, e.g. "select=date,type,load&date=gte.2026-08-01" —
    /// PostgREST's filter syntax is simple enough not to need a query builder here.
    func select(table: String, query: String) async throws -> Data {
        try await sendAuthed("rest/v1/\(table)?\(query)", method: "GET")
    }

    /// `resolution=merge-duplicates` on `Prefer` is what makes this an
    /// upsert rather than a plain insert — matches `.upsert(rows,
    /// {onConflict})` in app.js exactly, just spelled as HTTP.
    func upsert(table: String, rows: [[String: Any?]], onConflict: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: rows.map { row in row.mapValues { $0 ?? NSNull() } })
        _ = try await sendAuthed(
            "rest/v1/\(table)?on_conflict=\(onConflict)", method: "POST", body: body,
            extraHeaders: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    /// A partial UPDATE of an EXISTING row — not an upsert. The difference
    /// matters and is not stylistic: `upsert` above sends an
    /// `INSERT ... ON CONFLICT DO UPDATE`, and Postgres validates the
    /// proposed row's NOT NULL constraints BEFORE it resolves the
    /// conflict. So an upsert carrying only the one or two columns it
    /// wants to change is rejected outright whenever the table has any
    /// NOT NULL column without a default — `profiles.program_start_date`
    /// being exactly that. Updating a single field on a row that already
    /// exists is what PATCH is for, and it never has to satisfy columns
    /// it isn't touching.
    func patch(table: String, query: String, values: [String: Any?]) async throws {
        let body = try JSONSerialization.data(withJSONObject: values.mapValues { $0 ?? NSNull() })
        _ = try await sendAuthed(
            "rest/v1/\(table)?\(query)", method: "PATCH", body: body,
            extraHeaders: ["Prefer": "return=minimal"]
        )
    }

    func delete(table: String, query: String) async throws {
        _ = try await sendAuthed("rest/v1/\(table)?\(query)", method: "DELETE")
    }

    // MARK: - Plumbing

    /// `path` frequently already carries a query string (e.g.
    /// "rest/v1/sessions?select=...&date=gte.2026-06-19") — appendingPathComponent
    /// treats its whole argument as one literal path segment and percent-encodes
    /// the "?" into "%3F" rather than starting a real query, which silently
    /// turned every filtered/query-bearing request into a request for a
    /// nonexistent table named "sessions?select=...". URL(string:relativeTo:)
    /// parses "path?query" correctly instead. Confirmed both ways directly
    /// before making this change, not assumed.
    private func request(_ path: String, method: String) -> URLRequest {
        var req = URLRequest(url: URL(string: path, relativeTo: baseURL)!.absoluteURL)
        req.httpMethod = method
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return req
    }

    private func authedRequest(_ path: String, method: String) throws -> URLRequest {
        guard let session else { throw ClientError.notSignedIn }
        var req = request(path, method: method)
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        return req
    }

    /// Every authenticated REST call goes through here rather than calling
    /// authedRequest()+send() directly, specifically so an expired access
    /// token gets one silent refresh-and-retry instead of surfacing as a
    /// raw "JWT expired" error to whoever's using the app.
    @discardableResult
    private func sendAuthed(_ path: String, method: String, body: Data? = nil, extraHeaders: [String: String] = [:]) async throws -> Data {
        func build() throws -> URLRequest {
            var req = try authedRequest(path, method: method)
            for (key, value) in extraHeaders { req.setValue(value, forHTTPHeaderField: key) }
            req.httpBody = body
            return req
        }
        do {
            return try await send(build())
        } catch ClientError.http(401, let message) where message.contains("JWT expired") {
            try await refreshSession()
            return try await send(build())
        }
    }

    @discardableResult
    private func send(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.http(0, "no HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw ClientError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    // MARK: - Session persistence (Keychain — see Keychain.swift for why)

    private func persistSession() {
        guard let session, let data = try? JSONEncoder().encode(session),
              let json = String(data: data, encoding: .utf8) else {
            Keychain.remove(Self.keychainKey)
            return
        }
        Keychain.set(json, for: Self.keychainKey)
    }

    private static func loadPersistedSession() -> AuthSession? {
        guard let json = Keychain.get(keychainKey), let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }
}

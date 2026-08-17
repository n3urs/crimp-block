import Foundation

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
final class SupabaseClient {
    struct AuthSession: Codable {
        let accessToken: String
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
        struct Response: Decodable {
            let access_token: String
            let user: User
            struct User: Decodable { let id: String; let email: String }
        }
        guard let resp = try? JSONDecoder().decode(Response.self, from: data) else {
            throw ClientError.decoding("verifyOTP response")
        }
        session = AuthSession(accessToken: resp.access_token, userID: resp.user.id, email: resp.user.email)
    }

    func signOut() {
        session = nil
    }

    // MARK: - REST (PostgREST, /rest/v1/*)

    /// `query` is the raw query string, e.g. "select=date,type,load&date=gte.2026-08-01" —
    /// PostgREST's filter syntax is simple enough not to need a query builder here.
    func select(table: String, query: String) async throws -> Data {
        try await send(try authedRequest("rest/v1/\(table)?\(query)", method: "GET"))
    }

    /// `resolution=merge-duplicates` on `Prefer` is what makes this an
    /// upsert rather than a plain insert — matches `.upsert(rows,
    /// {onConflict})` in app.js exactly, just spelled as HTTP.
    func upsert(table: String, rows: [[String: Any?]], onConflict: String) async throws {
        var req = try authedRequest("rest/v1/\(table)?on_conflict=\(onConflict)", method: "POST")
        req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONSerialization.data(withJSONObject: rows.map { row in
            row.mapValues { $0 ?? NSNull() }
        })
        _ = try await send(req)
    }

    func delete(table: String, query: String) async throws {
        _ = try await send(try authedRequest("rest/v1/\(table)?\(query)", method: "DELETE"))
    }

    // MARK: - Plumbing

    private func request(_ path: String, method: String) -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
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

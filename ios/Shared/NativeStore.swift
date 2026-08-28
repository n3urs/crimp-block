import Foundation
import Observation

/// Native equivalent of `Store` in app.js — same table, same optimistic-
/// write-then-rollback-on-failure contract (a failed write must roll back
/// the local state and rethrow, not silently look identical to success;
/// see app.js's comment on why that was a real bug once). Reads/writes
/// `sessions` via SupabaseClient's REST calls instead of supabase-js.
@Observable
final class NativeStore {
    private(set) var days: [String: Entry] = [:]

    /// `sub` is a free-text sub-characterisation of `t`, currently only
    /// ever set for `climbHard` ("board" or "climb") — asked for at log
    /// time (see DailyCardView's climb-type confirmation) purely so
    /// stats/history can tell an actual board session apart from a hard
    /// climb that wasn't. nil for every other session type, and for any
    /// climbHard day logged before this existed — treated as "climb" (the
    /// more generic bucket) wherever that ambiguity has to resolve to
    /// something, since "board" is the more specific, deliberate choice.
    struct Entry: Codable { let t: String; let l: Double?; let sub: String? }
    private struct Row: Decodable { let date: String; let type: String; let load: Double?; let sub: String? }

    private let client: SupabaseClient
    private let startDate: String

    init(client: SupabaseClient, startDate: String) {
        self.client = client
        self.startDate = startDate
    }

    func all() -> [String: Entry] { days }
    func get(_ date: String) -> Entry? { days[date] }

    /// Window must reach back to `startDate` (block progression counts every
    /// training day since day one) AND cover a buffer before it (the
    /// week-dots row shows the last 7 days, and backdating pre-start days is
    /// normal) — see app.js's Store.load() comment for the bug this avoids.
    func load(engineCore: EngineBridgeDateHelper) async throws {
        let back = engineCore.addDays(engineCore.today(), -60)
        let from = back < startDate ? back : startDate
        let data = try await client.select(table: "sessions", query: "select=date,type,load,sub&date=gte.\(from)")
        let rows = try JSONDecoder().decode([Row].self, from: data)
        days = Dictionary(uniqueKeysWithValues: rows.map { ($0.date, Entry(t: $0.type, l: $0.load, sub: $0.sub)) })
    }

    /// `load` is read back in `Entry.l` (see `load(engineCore:)` above) but
    /// nothing anywhere — native or web — has ever written a non-nil value
    /// here since `exercise_loads` took over "what weight, on which
    /// exercise" as its own table (see SUPABASE.md: "This is deliberately
    /// NOT a column on `sessions`"). The write side of `sessions.load` was
    /// simply never cleaned up after that split, so this always upserted a
    /// literal `null` — dropped rather than left as a misleading parameter
    /// nobody was ever meant to pass. The column itself stays in Supabase
    /// (harmless, and dropping it is a schema change, not a code one).
    ///
    /// `sub` defaults to nil so every OTHER call site (undo/redo via the
    /// week strip, any future plain log) is unaffected — only the Done
    /// button's climb-type confirmation on a climbHard day ever passes a
    /// real value. See SUPABASE.md for the `sessions.sub` column this
    /// writes to.
    func set(date: String, type: String, sub: String? = nil) async throws {
        let prev = days[date]
        days[date] = Entry(t: type, l: nil, sub: sub)
        do {
            guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
            try await client.upsert(
                table: "sessions",
                rows: [["user_id": userID, "date": date, "type": type, "sub": sub]],
                onConflict: "user_id,date"
            )
        } catch {
            days[date] = prev
            throw error
        }
    }

    func clear(date: String) async throws {
        let prev = days[date]
        days[date] = nil
        do {
            try await client.delete(table: "sessions", query: "date=eq.\(date)")
        } catch {
            days[date] = prev
            throw error
        }
    }
}

/// The two EngineBridge date helpers NativeStore needs (today/addDays) —
/// a tiny protocol rather than a hard EngineBridge dependency, so the store
/// layer doesn't need a JSContext just to compute a load window.
protocol EngineBridgeDateHelper {
    func today() -> String
    func addDays(_ date: String, _ n: Int) -> String
}
extension EngineBridge: EngineBridgeDateHelper {}

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

    struct Entry: Codable { let t: String; let l: Double? }
    private struct Row: Decodable { let date: String; let type: String; let load: Double? }

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
        let data = try await client.select(table: "sessions", query: "select=date,type,load&date=gte.\(from)")
        let rows = try JSONDecoder().decode([Row].self, from: data)
        days = Dictionary(uniqueKeysWithValues: rows.map { ($0.date, Entry(t: $0.type, l: $0.load)) })
    }

    func set(date: String, type: String, load: Double?) async throws {
        let prev = days[date]
        days[date] = Entry(t: type, l: load)
        do {
            guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
            try await client.upsert(
                table: "sessions",
                rows: [["user_id": userID, "date": date, "type": type, "load": load]],
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

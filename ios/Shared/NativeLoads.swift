import Foundation
import Observation

/// Native equivalent of `Loads` in app.js — its own table (not a column on
/// sessions), because writing a weight must not mark the day as trained;
/// see app.js's comment on `Loads` for why. Same optimistic-write/rollback
/// contract as NativeStore.
@Observable
final class NativeLoads {
    struct Entry: Codable { let date: String; var kg: Double }
    private struct Row: Decodable { let date: String; let ex: String; let kg: Double }

    /// exercise id -> entries, newest first — matches Loads._d's shape and
    /// ordering in app.js exactly, since loadHistory()/target() in
    /// engine-core.js assume `past[0]` is the most recent entry.
    private(set) var byExercise: [String: [Entry]] = [:]

    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    func all() -> [String: [[String: Any]]] {
        byExercise.mapValues { entries in entries.map { ["date": $0.date, "kg": $0.kg] } }
    }

    func history(_ id: String) -> [Entry] { byExercise[id] ?? [] }
    func on(_ id: String, date: String) -> Entry? { byExercise[id]?.first { $0.date == date } }

    /// Not date-filtered, same reasoning as app.js: "what did I lift last
    /// time" has to survive a long layoff, and the table is small enough
    /// that loading all of it costs nothing.
    func load() async throws {
        do {
            let data = try await client.select(table: "exercise_loads", query: "select=date,ex,kg&order=date.desc")
            let rows = try JSONDecoder().decode([Row].self, from: data)
            var grouped: [String: [Entry]] = [:]
            for r in rows { grouped[r.ex, default: []].append(Entry(date: r.date, kg: r.kg)) }
            byExercise = grouped
        } catch SupabaseClient.ClientError.http(404, let message) where message.contains("PGRST205") {
            // Genuinely missing table (migration not run yet) must not take
            // the app down — weights just don't appear, same as app.js's
            // res.error branch. This used to catch every failure the same
            // way, which is exactly how a real bug (the URL-construction
            // bug elsewhere in this project, before it was found and
            // fixed) can hide behind "must be a missing-table thing" and
            // silently show empty instead of surfacing as a real error —
            // narrowed to the one specific case this was actually written
            // for.
            byExercise = [:]
        }
    }

    func set(date: String, id: String, kg: Double) async throws {
        var entries = byExercise[id] ?? []
        let prev = entries
        if let idx = entries.firstIndex(where: { $0.date == date }) {
            entries[idx].kg = kg
        } else {
            entries.append(Entry(date: date, kg: kg))
            entries.sort { $0.date > $1.date }
        }
        byExercise[id] = entries
        do {
            guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
            try await client.upsert(
                table: "exercise_loads",
                rows: [["user_id": userID, "date": date, "ex": id, "kg": kg]],
                onConflict: "user_id,date,ex"
            )
        } catch {
            byExercise[id] = prev
            throw error
        }
    }
}

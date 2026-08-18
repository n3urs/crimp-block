import Foundation
import Observation

/// Reads/writes one row in the `profiles` table (see SUPABASE.md's Phase C
/// section for the schema) — the record of which template a Standard-tier
/// user was quiz-assigned to, plus their modifiers and program start date.
///
/// Deliberately does NOT read the `templates` table over REST — Standard-
/// tier template content is already bundled in the app (templates.js), so
/// `assigned_template_id` is enough to resolve the real program locally via
/// TemplateResolver, exactly like the quiz demo already does. A live
/// `templates` table read only becomes necessary for Custom-tier profiles
/// (Phase F) where the program content itself can't be bundled ahead of
/// time — out of scope here.
@Observable
final class NativeProfile {
    struct Row: Codable {
        var assignedTemplateID: String?
        var programStartDate: String
        var modifiers: [String: AnyCodable]
        var tier: String
        var quizCompletedAt: String?
        var tutorialCompletedAt: String?

        enum CodingKeys: String, CodingKey {
            case assignedTemplateID = "assigned_template_id"
            case programStartDate = "program_start_date"
            case modifiers, tier
            case quizCompletedAt = "quiz_completed_at"
            case tutorialCompletedAt = "tutorial_completed_at"
        }
    }

    private(set) var row: Row?
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    /// nil `row` afterward means genuinely no profile yet (a real new
    /// user who hasn't done the quiz) — distinct from a network/decode
    /// failure, which throws instead of silently leaving `row` nil, so
    /// the caller doesn't mistake "couldn't check" for "definitely new."
    func load() async throws {
        let data = try await client.select(
            table: "profiles",
            query: "select=assigned_template_id,program_start_date,modifiers,tier,quiz_completed_at,tutorial_completed_at"
        )
        let rows = try JSONDecoder().decode([Row].self, from: data)
        row = rows.first
    }

    /// Called once, right after the quiz — creates the profile that turns
    /// a brand-new sign-in into a template-assigned Standard-tier user
    /// from then on.
    func create(templateID: String, startDate: String, modifiers: [String: Any]) async throws {
        guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
        try await client.upsert(
            table: "profiles",
            rows: [[
                "user_id": userID,
                "assigned_template_id": templateID,
                "program_start_date": startDate,
                "modifiers": modifiers,
                "tier": "standard",
                "quiz_completed_at": ISO8601DateFormatter().string(from: Date())
            ]],
            onConflict: "user_id"
        )
        row = Row(
            assignedTemplateID: templateID, programStartDate: startDate,
            modifiers: modifiers.mapValues { AnyCodable($0) }, tier: "standard",
            quizCompletedAt: ISO8601DateFormatter().string(from: Date()), tutorialCompletedAt: nil
        )
    }

    func markTutorialCompleted() async throws {
        guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
        try await client.upsert(
            table: "profiles",
            rows: [["user_id": userID, "tutorial_completed_at": ISO8601DateFormatter().string(from: Date())]],
            onConflict: "user_id"
        )
        row?.tutorialCompletedAt = ISO8601DateFormatter().string(from: Date())
    }
}

/// `modifiers` is a free-form JSON object (equipment/injuryFlags/weaknesses/
/// tripDate/daysPerWeek — see template-resolver.js) — genuinely
/// heterogeneous value types, so Codable needs a small type-erased wrapper
/// rather than a fixed Swift struct that would have to be kept in lockstep
/// with the JS side's modifier shape.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(String.self) { value = v }
        else if let v = try? container.decode(Double.self) { value = v }
        else if let v = try? container.decode(Bool.self) { value = v }
        else if let v = try? container.decode([String].self) { value = v }
        else if container.decodeNil() { value = NSNull() }
        else { value = NSNull() }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as String: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as Int: try container.encode(v)
        case let v as Bool: try container.encode(v)
        case let v as [String]: try container.encode(v)
        default: try container.encodeNil()
        }
    }
}

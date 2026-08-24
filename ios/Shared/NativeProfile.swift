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
        /// "standard" | "rehab" — which of EngineBridge/RehabBridge this
        /// profile currently renders through. Standard's own
        /// assignedTemplateID/programStartDate/modifiers and rehab's own
        /// rehabInjuryArea/rehabPhaseIndex are independently preserved
        /// (see Phase C.1 of the plan) — switching this field alone is
        /// what lets Standard -> Rehab -> Standard restore instantly,
        /// with no requiz, rather than the two tracks overwriting each
        /// other's assignment every time someone switches.
        var trackType: String
        var rehabInjuryArea: String?
        var rehabPhaseIndex: Int?

        enum CodingKeys: String, CodingKey {
            case assignedTemplateID = "assigned_template_id"
            case programStartDate = "program_start_date"
            case modifiers, tier
            case quizCompletedAt = "quiz_completed_at"
            case tutorialCompletedAt = "tutorial_completed_at"
            case trackType = "track_type"
            case rehabInjuryArea = "rehab_injury_area"
            case rehabPhaseIndex = "rehab_phase_index"
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
            query: "select=assigned_template_id,program_start_date,modifiers,tier,quiz_completed_at,tutorial_completed_at,track_type,rehab_injury_area,rehab_phase_index"
        )
        let rows = try JSONDecoder().decode([Row].self, from: data)
        row = rows.first
    }

    /// Called once, right after the quiz's standard branch — creates (or,
    /// for someone switching back into standard who's never had a
    /// standard assignment before, re-creates) the profile that makes
    /// this a template-assigned Standard-tier user from then on. Always
    /// stamps trackType "standard" explicitly, so this doubles as the
    /// "switch to a NEW standard assignment" path — switchToStandard()
    /// below is the separate, lighter path for restoring an assignment
    /// that already exists.
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
                "track_type": "standard",
                "quiz_completed_at": ISO8601DateFormatter().string(from: Date())
            ]],
            onConflict: "user_id"
        )
        row = Row(
            assignedTemplateID: templateID, programStartDate: startDate,
            modifiers: modifiers.mapValues { AnyCodable($0) }, tier: "standard",
            quizCompletedAt: ISO8601DateFormatter().string(from: Date()), tutorialCompletedAt: row?.tutorialCompletedAt,
            trackType: "standard", rehabInjuryArea: nil, rehabPhaseIndex: nil
        )
    }

    /// Assigns (or first-assigns) the rehab track for `injuryArea`,
    /// starting at `startingPhaseIndex` — not always 0 (unload); the
    /// quiz's "where are you already" question (QuizAnswers.
    /// RehabStartingPoint) lets someone who's already weeks into
    /// recovery skip straight to the phase that actually matches where
    /// they are, rather than restarting at the very beginning every
    /// time. Deliberately omits
    /// assigned_template_id/program_start_date/modifiers from the write
    /// when a profile row already exists — upsert's merge-duplicates
    /// only touches columns present in the payload, so any existing
    /// standard assignment is left completely untouched underneath the
    /// rehab track, ready to restore instantly via switchToStandard()
    /// once rehab is finished. A brand-new user (no row yet) has no
    /// prior assignment to preserve, so this also supplies today's date
    /// for program_start_date's NOT NULL constraint in that case only —
    /// unused while trackType stays "rehab".
    func assignRehab(injuryArea: String, startingPhaseIndex: Int = 0) async throws {
        guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
        var payload: [String: Any?] = [
            "user_id": userID,
            "track_type": "rehab",
            "rehab_injury_area": injuryArea,
            "rehab_phase_index": startingPhaseIndex,
            "quiz_completed_at": ISO8601DateFormatter().string(from: Date())
        ]
        let existing = row
        if existing == nil {
            payload["program_start_date"] = Self.isoDate(Date())
        }
        try await client.upsert(table: "profiles", rows: [payload], onConflict: "user_id")

        if var existing {
            existing.trackType = "rehab"
            existing.rehabInjuryArea = injuryArea
            existing.rehabPhaseIndex = startingPhaseIndex
            row = existing
        } else {
            row = Row(
                assignedTemplateID: nil, programStartDate: Self.isoDate(Date()),
                modifiers: [:], tier: "standard",
                quizCompletedAt: ISO8601DateFormatter().string(from: Date()), tutorialCompletedAt: nil,
                trackType: "rehab", rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex
            )
        }
    }

    /// Restores the Standard track using whatever assignment already
    /// exists on this profile — the "instant" path for someone who's
    /// finished rehab, no requiz. Only meaningful when
    /// row.assignedTemplateID is already set; SettingsView checks that
    /// before offering this action, falling back to the full quiz (and
    /// create(templateID:...) above) when there's nothing to restore.
    func switchToStandard() async throws {
        guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
        // PATCH for the same reason markTutorialCompleted() uses it — a
        // partial upsert here would have failed the NOT NULL check on
        // program_start_date exactly the same way.
        try await client.patch(
            table: "profiles",
            query: "user_id=eq.\(userID)",
            values: ["track_type": "standard"]
        )
        row?.trackType = "standard"
    }

    /// Persists a new rehab phase index after RehabBridge.advance() —
    /// called once every self-report criterion for the current phase has
    /// been checked and the user confirms they're ready to move on.
    func advanceRehabPhase(to phaseIndex: Int) async throws {
        guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
        // PATCH — same NOT NULL reasoning as the two methods above.
        try await client.patch(
            table: "profiles",
            query: "user_id=eq.\(userID)",
            values: ["rehab_phase_index": phaseIndex]
        )
        row?.rehabPhaseIndex = phaseIndex
    }

    /// PATCH, not upsert — see SupabaseClient.patch()'s doc comment. The
    /// upsert this used to be silently failed every time: it omitted
    /// program_start_date, which is NOT NULL with no default, so Postgres
    /// rejected the proposed row before it ever got to the DO UPDATE
    /// branch. completeTutorial() swallowed that with `try?`, so
    /// tutorial_completed_at never got written, and reload() put the
    /// tutorial straight back up — the "GET STARTED does nothing" bug.
    func markTutorialCompleted() async throws {
        guard let userID = client.session?.userID else { throw SupabaseClient.ClientError.notSignedIn }
        let now = ISO8601DateFormatter().string(from: Date())
        try await client.patch(
            table: "profiles",
            query: "user_id=eq.\(userID)",
            values: ["tutorial_completed_at": now]
        )
        row?.tutorialCompletedAt = now
    }

    /// "yyyy-MM-dd", matching program_start_date's `date` column type —
    /// same format QuizAnswers.modifiersPayload already uses for tripDate
    /// in QuizModel.swift, reused here rather than a second formatter.
    private static func isoDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
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

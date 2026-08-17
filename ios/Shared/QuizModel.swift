import Foundation

/// What the intake quiz collects, and how it turns into (a template id +
/// modifiers) for EngineBridge's template-based initializer. The mapping
/// itself is intentionally trivial — discipline + experience level compose
/// directly into one of the 6 keys in templates.js (e.g. "bouldering" +
/// "beginner" -> "boulderingBeginner") — so there's no separate lookup
/// table to keep in sync as the matrix grows; adding a new template cell
/// to templates.js is enough on its own.
struct QuizAnswers {
    enum Discipline: String, CaseIterable, Identifiable {
        case bouldering, sport
        var id: String { rawValue }
        var label: String { self == .bouldering ? "Bouldering" : "Sport climbing" }
    }

    enum ExperienceLevel: String, CaseIterable, Identifiable {
        case beginner, intermediate, advanced
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    /// Mirrors WEAKNESS_MODULES's seed keys in template-resolver.js —
    /// deliberately not a free-text field, since only these two IDs
    /// actually do anything (shift exercise emphasis). Adding a real
    /// option here means adding the matching module there first.
    enum Weakness: String, CaseIterable, Identifiable {
        case slopers, compression
        var id: String { rawValue }
        var label: String { self == .slopers ? "Slopers / open-hand strength" : "Compression / pinches" }
    }

    /// Mirrors EQUIPMENT_TAGS in template-resolver.js.
    enum Equipment: String, CaseIterable, Identifiable {
        case hangboard, pullBar, gym
        var id: String { rawValue }
        var label: String {
            switch self {
            case .hangboard: return "A hangboard"
            case .pullBar: return "A pull-up bar"
            case .gym: return "Regular gym access"
            }
        }
    }

    /// Mirrors INJURY_MODULES's seed keys in template-resolver.js — same
    /// reasoning as Weakness above: only these two currently attach a
    /// real caution + mandatory exercise.
    enum InjuryFlag: String, CaseIterable, Identifiable {
        case fingerPulley, bicepTendon
        var id: String { rawValue }
        var label: String { self == .fingerPulley ? "Finger or pulley injury history" : "Bicep tendon injury history" }
    }

    var discipline: Discipline = .bouldering
    var experienceLevel: ExperienceLevel = .beginner
    var weaknesses: Set<Weakness> = []
    var equipment: Set<Equipment> = []
    var injuryFlags: Set<InjuryFlag> = []
    var daysPerWeek: Int = 3
    var tripDate: Date? = nil

    /// e.g. "boulderingBeginner" — a key into TEMPLATES (templates.js).
    var templateId: String {
        discipline.rawValue + experienceLevel.rawValue.prefix(1).uppercased() + experienceLevel.rawValue.dropFirst()
    }

    /// The `modifiers` object template-resolver.js's resolveTemplate()
    /// expects, ready to hand straight to EngineBridge's template
    /// initializer.
    var modifiersPayload: [String: Any] {
        var payload: [String: Any] = [
            "equipment": equipment.map { $0.rawValue },
            "injuryFlags": injuryFlags.map { $0.rawValue },
            "weaknesses": weaknesses.map { $0.rawValue },
            "daysPerWeek": daysPerWeek
        ]
        if let tripDate {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyy-MM-dd"
            payload["tripDate"] = f.string(from: tripDate)
        }
        return payload
    }
}

/// Display copy for the quiz's summary screen, mirrored by hand from each
/// template's `meta` block in templates.js — same "hardcoded mirror of a
/// JS-side constant" pattern EngineBridge.order already uses for ORDER in
/// engine-core.js. A JSContext round-trip just to read two display strings
/// before the user has even confirmed their answers isn't worth it; the
/// real program (and its real meta) loads from templates.js itself the
/// moment the quiz hands off to EngineBridge. KEEP IN SYNC with
/// templates.js's `meta.name`/`meta.description` if either changes.
struct TemplateMeta { let name: String; let description: String }

let TEMPLATE_META: [String: TemplateMeta] = [
    "boulderingBeginner": TemplateMeta(
        name: "Bouldering — Beginner",
        description: "For someone newer to bouldering who wants real structure without heavy fingerboard loading on day one."
    ),
    "boulderingIntermediate": TemplateMeta(
        name: "Bouldering — Intermediate",
        description: "For someone a couple of years into bouldering who has hit the classic V3–V4 plateau."
    ),
    "boulderingAdvanced": TemplateMeta(
        name: "Bouldering — Advanced",
        description: "For someone climbing V8 and above who has already built real finger and pull strength."
    ),
    "sportBeginner": TemplateMeta(
        name: "Sport — Beginner",
        description: "For someone newer to sport climbing — endurance, not power, is the central quality here."
    ),
    "sportIntermediate": TemplateMeta(
        name: "Sport — Intermediate",
        description: "For someone a couple of years into sport climbing ready for structured power-endurance work."
    ),
    "sportAdvanced": TemplateMeta(
        name: "Sport — Advanced",
        description: "For an established sport climber training power-endurance deliberately rather than constantly."
    ),
]

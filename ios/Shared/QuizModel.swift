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

        /// Shown under each option in the quiz so people can place
        /// themselves by grade rather than guessing what "intermediate"
        /// means. Bouldering uses V-scale and sport uses French grades —
        /// matching the grading systems templates.js's own meta
        /// descriptions already use ("V8 and above", the "V3-V4
        /// plateau"). Draft bands, not a definitive scale — Oscar's call
        /// to adjust, not derived from anything authoritative.
        func gradeRange(for discipline: Discipline) -> String {
            switch (discipline, self) {
            case (.bouldering, .beginner): return "Roughly V0–V2"
            case (.bouldering, .intermediate): return "Roughly V3–V6"
            case (.bouldering, .advanced): return "V7 and above"
            case (.sport, .beginner): return "Roughly up to French 6a"
            case (.sport, .intermediate): return "Roughly French 6a–6c"
            case (.sport, .advanced): return "French 7a and above"
            }
        }
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
        case hangboard, pullBar, gym, pickupRig
        var id: String { rawValue }
        var label: String {
            switch self {
            case .hangboard: return "A hangboard"
            case .pullBar: return "A pull-up bar"
            case .gym: return "Regular gym access"
            case .pickupRig: return "A loading pin + edge/block/roller for weighted pickups"
            }
        }
    }

    /// Mirrors INJURY_MODULES's seed keys in template-resolver.js — same
    /// reasoning as Weakness above: only these four currently attach a
    /// real caution + mandatory exercise. Originally just the two Joe
    /// happened to have personal history with; expanded after checking
    /// actual climbing injury-epidemiology research, which flagged
    /// shoulder (77% lifetime pain prevalence in climbers) as a real,
    /// previously-uncovered gap, and split elbow out as its own flag
    /// rather than leaving it folded into bicepTendon — "climber's
    /// elbow" (medial epicondylitis) and bicep tendon issues are
    /// different structures with different causes and different
    /// prevention exercises, even though both get lumped together
    /// colloquially as "elbow/arm pain."
    enum InjuryFlag: String, CaseIterable, Identifiable {
        case fingerPulley, bicepTendon, shoulder, elbow
        var id: String { rawValue }
        var label: String {
            switch self {
            case .fingerPulley: return "Finger or pulley injury history"
            case .bicepTendon: return "Bicep tendon injury history"
            case .shoulder: return "Shoulder injury history"
            case .elbow: return "Elbow injury history"
            }
        }
        /// Short enough to disambiguate near-neighbors at a glance —
        /// bicep tendon and shoulder overlap anatomically (in climbers,
        /// "bicep tendon" pain is usually the long head tendon at the
        /// FRONT of the shoulder, not the elbow), and this is the
        /// cheapest way to help someone pick the right box without
        /// reading a paragraph of caution text first.
        var subtitle: String {
            switch self {
            case .fingerPulley: return "A2 pulley strain, tweaked finger joints"
            case .bicepTendon: return "Front-of-shoulder pain from gastons or compression"
            case .shoulder: return "Rotator cuff, impingement, general shoulder pain"
            case .elbow: return "Inner-elbow pain from gripping — “climber’s elbow”"
            }
        }
    }

    /// Single-select, unlike InjuryFlag above — that's "flag this as a
    /// caution on my normal program," this is "this is what I'm
    /// rehabbing," a different question with a different answer shape.
    /// Deliberately not folded into InjuryFlag/QuizAnswers itself; see
    /// QuizResult below for why the rehab branch stays its own case
    /// rather than a QuizAnswers with half its fields unused.
    enum RehabInjuryArea: String, CaseIterable, Identifiable {
        case fingerPulley, elbowMedial, elbowLateral, shoulder, bicepsTendon, wristTFCC
        var id: String { rawValue }
        var label: String {
            switch self {
            case .fingerPulley: return "Finger / Pulley"
            case .elbowMedial: return "Elbow — Inner (Climber’s Elbow)"
            case .elbowLateral: return "Elbow — Outer (Tennis Elbow)"
            case .shoulder: return "Shoulder"
            case .bicepsTendon: return "Biceps Tendon"
            case .wristTFCC: return "Wrist (TFCC)"
            }
        }
        /// Mirrors InjuryFlag's own subtitle pattern — short enough to
        /// disambiguate near-neighbors (the two elbow tracks, biceps vs.
        /// shoulder) at a glance rather than reading a paragraph first.
        var subtitle: String {
            switch self {
            case .fingerPulley: return "Sharp, localized pain at the base of a finger — a strained or torn pulley"
            case .elbowMedial: return "Inner-elbow pain from gripping — the most common climbing elbow injury"
            case .elbowLateral: return "Outer-elbow pain — less common in climbers, but real"
            case .shoulder: return "Rotator cuff, impingement, general shoulder pain"
            case .bicepsTendon: return "Front-of-shoulder pain from gastons or compression"
            case .wristTFCC: return "Pinky-side wrist pain, often from crimping or mantling"
            }
        }
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

/// Same hand-mirrored pattern as TEMPLATE_META above, one level simpler —
/// rehab-templates.js's REHAB_TEMPLATES has no experience-level/discipline
/// split to key off, just one entry per injury area. KEEP IN SYNC with
/// rehab-templates.js's own `meta.name`/`meta.description` per area.
let REHAB_META: [String: TemplateMeta] = [
    "fingerPulley": TemplateMeta(
        name: "Finger / Pulley",
        description: "For a strained or partially torn finger pulley — built around graded, progressive re-loading rather than prolonged rest."
    ),
    "elbowMedial": TemplateMeta(
        name: "Elbow — Inner (Climber’s Elbow)",
        description: "For pain on the inside of the elbow from gripping and pulling load — the most common elbow complaint in climbers."
    ),
    "elbowLateral": TemplateMeta(
        name: "Elbow — Outer (Tennis Elbow)",
        description: "For pain on the outside of the elbow — less common in climbers, but a real overuse injury."
    ),
    "shoulder": TemplateMeta(
        name: "Shoulder",
        description: "For general shoulder pain, impingement, or a rotator cuff strain — built around scapular control alongside rotator cuff strength."
    ),
    "bicepsTendon": TemplateMeta(
        name: "Biceps Tendon",
        description: "For front-of-shoulder pain from gastons or compression — rarely isolated, leans on scapular coordination alongside the biceps itself."
    ),
    "wristTFCC": TemplateMeta(
        name: "Wrist (TFCC)",
        description: "For pain on the pinky-side of the wrist, often from crimping or mantling — built around the wrist’s safest natural movement pattern."
    ),
]

/// What IntakeQuizView hands back — the standard branch's full QuizAnswers,
/// or just the chosen injury area for rehab (which needs nothing else:
/// no discipline/experience/equipment/trip-date question applies to a
/// rehab-first assignment). Kept as two cases rather than cramming both
/// into one QuizAnswers struct with half its fields meaningless on the
/// rehab branch.
enum QuizResult {
    case standard(QuizAnswers)
    case rehab(QuizAnswers.RehabInjuryArea)
}

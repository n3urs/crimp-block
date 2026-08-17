import Foundation
import JavaScriptCore

/// Loads engine-core.js (bundled into the app at build time, not fetched
/// live — see the plan at ~/.claude/plans/moonlit-juggling-catmull.md,
/// "The architecture question this plan resolves") into a JSContext and
/// exposes the rules engine to Swift with typed, Codable results.
///
/// This is deliberately thin: engine-core.js is the single source of truth
/// for every rule (recovery caps, deload, layoff taper, phase-scoped
/// weights — see the comments there for why each one works the way it
/// does). This file's only job is getting data in and out of it correctly.
/// engine-core.js itself is a pure, non-networked computation with no
/// callbacks into native code, which is what keeps it inside Apple's
/// Guideline 2.5.2 exception for WebKit/JavaScriptCore-executed script.
///
/// Note on JSValue nullability: `forProperty`, `atIndex`, and
/// `invokeMethod` are all Optional in Swift (nil on a genuine failure,
/// e.g. calling a method on a non-callable value) — but a merely MISSING
/// JS property still comes back as a non-nil JSValue wrapping JS
/// `undefined`, checked with `.isUndefined`, not by the Optional being nil.
/// Both checks are usually needed together.
final class EngineBridge {
    enum BridgeError: Error, CustomStringConvertible {
        case missingBundledResource(String)
        case unreadableResource(String)
        case missingGlobal(String)
        case jsException(String)

        var description: String {
            switch self {
            case .missingBundledResource(let name): return "\(name) is not bundled with the app"
            case .unreadableResource(let name): return "could not read bundled \(name)"
            case .missingGlobal(let name): return "engine-core.js did not define \(name) as expected"
            case .jsException(let msg): return "JavaScript exception: \(msg)"
            }
        }
    }

    let context: JSContext
    /// The chosen program (Oscar's, Joe's, ...) as a live JSValue — kept
    /// around (not just handed to createEngine and discarded) so callers can
    /// still reach into program.sessions[key].x to pass real exercise
    /// objects back into resolveEx()/target(), rather than reconstructing
    /// them from a lossy Swift model. Exercises carry too many optional,
    /// exercise-specific fields (rotate, interval, ph, dl, step...) to be
    /// worth modelling fully in Swift when the JS engine already owns them.
    let program: JSValue
    private let engine: JSValue
    private let engineCore: JSValue

    /// - Parameters:
    ///   - email: looked up in PROGRAMS (programs.js), lowercased, falling
    ///     back to 'default' — mirrors applyProgram() in app.js exactly.
    ///   - sessionLog: `{ "yyyy-MM-dd": {"t": type, "l": load-or-nil} }`,
    ///     the same shape as Store._d in app.js.
    ///   - loadLog: `{ "exerciseId": [{"date":..., "kg":...}, ...] }`, the
    ///     same shape as Loads._d in app.js.
    init(email: String, sessionLog: [String: Any], loadLog: [String: [[String: Any]]]) throws {
        guard let ctx = JSContext() else { throw BridgeError.missingGlobal("JSContext") }
        context = ctx
        var thrown: String?
        ctx.exceptionHandler = { _, exception in
            thrown = exception?.toString() ?? "unknown JS exception"
        }

        try Self.evaluate(resource: "engine-core", in: ctx)
        try Self.evaluate(resource: "programs", in: ctx)
        if let thrown { throw BridgeError.jsException(thrown) }

        guard let core = ctx.globalObject.forProperty("EngineCore"), !core.isUndefined else {
            throw BridgeError.missingGlobal("EngineCore")
        }
        engineCore = core

        guard let programs = ctx.globalObject.forProperty("PROGRAMS"), !programs.isUndefined else {
            throw BridgeError.missingGlobal("PROGRAMS")
        }

        let chosen = programs.forProperty(email.lowercased())
        let resolvedProgram = (chosen == nil || chosen!.isUndefined) ? programs.forProperty("default") : chosen
        guard let resolvedProgram, !resolvedProgram.isUndefined else {
            throw BridgeError.missingGlobal("PROGRAMS['default']")
        }
        program = resolvedProgram

        let data: [String: Any] = ["sessionLog": sessionLog, "loadLog": loadLog]
        guard let created = core.invokeMethod("createEngine", withArguments: [program as Any, data]),
              !created.isUndefined else {
            throw BridgeError.missingGlobal("createEngine(...) result")
        }
        if let thrown { throw BridgeError.jsException(thrown) }
        engine = created
    }

    private static func evaluate(resource name: String, in ctx: JSContext) throws {
        guard let url = Bundle.main.url(forResource: name, withExtension: "js") else {
            throw BridgeError.missingBundledResource("\(name).js")
        }
        guard let source = try? String(contentsOf: url, encoding: .utf8) else {
            throw BridgeError.unreadableResource("\(name).js")
        }
        ctx.evaluateScript(source, withSourceURL: url)
    }

    // MARK: - Dates (EngineCore.today/addDays — same 3am boundary as the web app)

    /// "Today" per DAY_START_HOUR (3am) — computed by engine-core.js itself
    /// rather than re-derived in Swift, so there is exactly one place that
    /// boundary logic lives.
    func today() -> String {
        engineCore.invokeMethod("today", withArguments: [])?.toString() ?? ""
    }

    func addDays(_ date: String, _ n: Int) -> String {
        engineCore.invokeMethod("addDays", withArguments: [date, n])?.toString() ?? date
    }

    // MARK: - Top-level engine calls (simple, fully-typed — JSON round-trip)

    struct Decision: Codable { let k: String; let why: String }

    func decide(date: String) -> Decision? {
        decode(engine.invokeMethod("decide", withArguments: [date]))
    }

    struct BlockInfo: Codable {
        let b: Int, w: Int, done: Int, per: Int, total: Int, wIdx: Int, over: Bool
    }

    func block(date: String) -> BlockInfo? {
        decode(engine.invokeMethod("block", withArguments: [date]))
    }

    func phaseNameAt(_ date: String) -> String? {
        guard let v = engine.invokeMethod("phaseNameAt", withArguments: [date]), !v.isUndefined else { return nil }
        return v.toString()
    }

    func isDeload(_ date: String) -> Bool {
        engine.invokeMethod("isDeload", withArguments: [date])?.toBool() ?? false
    }

    func isReturning(_ date: String) -> Bool {
        engine.invokeMethod("isReturning", withArguments: [date])?.toBool() ?? false
    }

    // MARK: - Session content (program.sessions[key] — read directly, not modelled)

    /// A session's display metadata (`n`ame, `w`here, `note`) — everything
    /// EXCEPT the exercise list, which resolveExercises(for:date:) handles
    /// separately since each exercise needs per-day resolution.
    struct SessionInfo {
        let name: String
        let where_: String
        let note: String?
    }

    func sessionInfo(_ key: String) -> SessionInfo? {
        guard let s = program.forProperty("sessions")?.forProperty(key), !s.isUndefined else { return nil }
        let note = s.forProperty("note")
        return SessionInfo(
            name: s.forProperty("n")?.toString() ?? key,
            where_: s.forProperty("w")?.toString() ?? "",
            note: (note == nil || note!.isUndefined) ? nil : note?.toString()
        )
    }

    /// One exercise, already resolved for rotation/phase/deload and paired
    /// with its weight target where it tracks one — the same two calls
    /// (resolveEx then target) app.js's render() makes, just from Swift.
    struct RenderedExercise: Identifiable {
        let id: String   // exercise id if it has one, else its title (unique enough for a List)
        let title: String
        let prescription: String
        let phaseAdjusted: Bool   // m differs from the exercise's default m — mirrors the '.ph' badge in the web UI
        let description: String?
        let restSeconds: Int?
        let weightKg: Double?
        let weightIsBump: Bool
        let hasWeightTracking: Bool   // true only when `id` is the exercise's REAL id, not the title fallback
        let step: Double              // nudge increment for the weight editor, mirrors e.step (default 2.5)
    }

    /// Every exercise in `key`'s session for `date`, in order, skipping any
    /// that resolveEx() drops for this phase (its `^skip` convention).
    func resolveExercises(for key: String, date: String, phaseName: String) -> [RenderedExercise] {
        guard let session = program.forProperty("sessions")?.forProperty(key),
              let raw = session.forProperty("x"), !raw.isUndefined else { return [] }
        let count = Int(raw.forProperty("length")?.toInt32() ?? 0)

        var out: [RenderedExercise] = []
        for i in 0..<count {
            guard let base = raw.atIndex(i) else { continue }
            guard let resolved = engine.invokeMethod("resolveEx", withArguments: [base, key, date, phaseName]),
                  !resolved.isNull, !resolved.isUndefined else { continue }

            let e = resolved.forProperty("e")
            let m = resolved.forProperty("m")?.toString() ?? ""
            let baseM = base.forProperty("m")?.toString()
            let title = e?.forProperty("t")?.toString() ?? "?"
            let idProp = e?.forProperty("id")
            let hasID = !(idProp == nil || idProp!.isUndefined)
            let id = hasID ? (idProp?.toString() ?? title) : title
            let descProp = e?.forProperty("d")
            let description = (descProp == nil || descProp!.isUndefined) ? nil : descProp?.toString()
            let restProp = e?.forProperty("r")
            let restSeconds = (restProp == nil || restProp!.isUndefined) ? nil : Int(restProp!.toInt32())

            var weightKg: Double? = nil
            var weightIsBump = false
            var step = 2.5
            if hasID, let e {
                let stepProp = e.forProperty("step")
                if let stepProp, !stepProp.isUndefined { step = stepProp.toDouble() }
                if let tg = engine.invokeMethod("target", withArguments: [e, date]), !tg.isNull, !tg.isUndefined {
                    weightKg = tg.forProperty("kg")?.toDouble()
                    weightIsBump = tg.forProperty("bump")?.toBool() ?? false
                }
            }

            out.append(RenderedExercise(
                id: id, title: title, prescription: m,
                phaseAdjusted: baseM != nil && baseM != m,
                description: description, restSeconds: restSeconds,
                weightKg: weightKg, weightIsBump: weightIsBump,
                hasWeightTracking: hasID, step: step
            ))
        }
        return out
    }

    // MARK: - JSON decode helper

    private func decode<T: Decodable>(_ value: JSValue?) -> T? {
        guard let value, !value.isNull, !value.isUndefined,
              let obj = value.toObject(),
              JSONSerialization.isValidJSONObject(obj) || obj is [Any],
              let data = try? JSONSerialization.data(withJSONObject: obj) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

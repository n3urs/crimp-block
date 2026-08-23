import Foundation
import JavaScriptCore

/// Loads rehab-templates.js/rehab-resolver.js into a JSContext and exposes
/// the current rehab-track phase to Swift — the rehab analog of
/// EngineBridge, but deliberately NOT a third EngineBridge initializer.
/// Rehab content is static per-phase data, not a "what should today's
/// session be" decision: it never touches decide()/block()/createEngine(),
/// and has no history, deload, or rotation concept at all — see Phase C.1
/// of the plan (~/.claude/plans/moonlit-juggling-catmull.md, "Why this
/// can't reuse decide()/block()") for why bending engine-core.js's
/// calendar-driven block() to fit self-report gating would risk
/// destabilizing it for every existing template/PROGRAMS user instead of
/// just giving rehab its own small, parallel path.
///
/// Exercises are handed back as EngineBridge.RenderedExercise — reusing
/// that exact type (rather than a parallel rehab-specific one) is what lets
/// the whole exercise-row/tally UI carry over with zero changes; rehab
/// exercises simply never populate the weight-tracking fields
/// (hasWeightTracking is always false — rehab prescriptions are text like
/// "3 × 15" or "4 × 8s", never a tracked external load).
final class RehabBridge {
    typealias BridgeError = EngineBridge.BridgeError

    let context: JSContext
    private let resolver: JSValue
    private let templates: JSValue

    let injuryArea: String
    private(set) var phaseIndex: Int

    /// - Parameters:
    ///   - injuryArea: a key into REHAB_TEMPLATES (rehab-templates.js),
    ///     e.g. "fingerPulley" — see RehabInjuryArea in QuizModel.swift.
    ///   - phaseIndex: 0=unload, 1=mobility, 2=strength,
    ///     3=returnToClimbing — persisted per-user in NativeProfile's
    ///     rehabPhaseIndex, advanced only via advance() below (self-report
    ///     gated, never a calendar).
    init(injuryArea: String, phaseIndex: Int) throws {
        guard let ctx = JSContext() else { throw BridgeError.missingGlobal("JSContext") }
        context = ctx
        var thrown: String?
        ctx.exceptionHandler = { _, exception in
            thrown = exception?.toString() ?? "unknown JS exception"
        }

        try Self.evaluate(resource: "rehab-resolver", in: ctx)
        try Self.evaluate(resource: "rehab-templates", in: ctx)
        if let thrown { throw BridgeError.jsException(thrown) }

        guard let res = ctx.globalObject.forProperty("RehabResolver"), !res.isUndefined else {
            throw BridgeError.missingGlobal("RehabResolver")
        }
        resolver = res
        guard let tpl = ctx.globalObject.forProperty("REHAB_TEMPLATES"), !tpl.isUndefined else {
            throw BridgeError.missingGlobal("REHAB_TEMPLATES")
        }
        templates = tpl

        self.injuryArea = injuryArea
        self.phaseIndex = phaseIndex
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

    struct ResolvedPhase {
        let areaName: String
        let areaDescription: String
        let phaseId: String
        let phaseName: String
        let phaseIndex: Int
        let cue: String
        let description: String
        let caution: String
        let selfReportCriteria: [String]
        let isFinalPhase: Bool
        let exercises: [EngineBridge.RenderedExercise]
    }

    /// The current phase's full content, resolved fresh from
    /// injuryArea/phaseIndex. Call again after advance() to pick up the
    /// new phase — this deliberately doesn't cache, since rehab-resolver.js
    /// is cheap and there's no history to keep consistent across calls the
    /// way EngineBridge's snapshot-based `program` is.
    func currentPhase() -> ResolvedPhase? {
        guard let result = resolver.invokeMethod("resolvePhase", withArguments: [templates, injuryArea, phaseIndex]),
              !result.isUndefined else { return nil }
        guard let phase = result.forProperty("phase"), !phase.isUndefined,
              let meta = result.forProperty("meta"), !meta.isUndefined else { return nil }

        return ResolvedPhase(
            areaName: meta.forProperty("name")?.toString() ?? "",
            areaDescription: meta.forProperty("description")?.toString() ?? "",
            phaseId: phase.forProperty("id")?.toString() ?? "",
            phaseName: phase.forProperty("name")?.toString() ?? "",
            phaseIndex: Int(result.forProperty("phaseIndex")?.toInt32() ?? Int32(phaseIndex)),
            cue: phase.forProperty("cue")?.toString() ?? "",
            description: phase.forProperty("description")?.toString() ?? "",
            caution: phase.forProperty("caution")?.toString() ?? "",
            selfReportCriteria: stringArray(phase.forProperty("selfReportCriteria")),
            isFinalPhase: result.forProperty("isFinalPhase")?.toBool() ?? false,
            exercises: renderExercises(from: phase)
        )
    }

    /// Whether every one of the current phase's self-report criteria has
    /// been checked — delegates to rehab-resolver.js's own canAdvance() so
    /// there's exactly one source of truth for the gate, not a duplicated
    /// Swift copy that could drift from it.
    func canAdvance(checked: Set<String>) -> Bool {
        guard let result = resolver.invokeMethod("resolvePhase", withArguments: [templates, injuryArea, phaseIndex]),
              let phase = result.forProperty("phase"), !phase.isUndefined else { return false }
        return resolver.invokeMethod("canAdvance", withArguments: [phase, Array(checked)])?.toBool() ?? false
    }

    /// Advances to the next phase, clamped at returnToClimbing (a no-op
    /// past the end, same as rehab-resolver.js's nextPhaseIndex). Callers
    /// re-render from currentPhase() and persist the new phaseIndex via
    /// NativeProfile.update(rehabPhaseIndex:) after calling this — this
    /// only updates the in-memory bridge, it doesn't write anywhere itself.
    func advance() {
        guard let next = resolver.invokeMethod("nextPhaseIndex", withArguments: [phaseIndex]) else { return }
        phaseIndex = Int(next.toInt32())
    }

    private func stringArray(_ value: JSValue?) -> [String] {
        guard let value, !value.isUndefined else { return [] }
        let count = Int(value.forProperty("length")?.toInt32() ?? 0)
        return (0..<count).compactMap { value.atIndex($0)?.toString() }
    }

    private func renderExercises(from phase: JSValue) -> [EngineBridge.RenderedExercise] {
        guard let raw = phase.forProperty("exercises"), !raw.isUndefined else { return [] }
        let count = Int(raw.forProperty("length")?.toInt32() ?? 0)
        var out: [EngineBridge.RenderedExercise] = []
        for i in 0..<count {
            guard let e = raw.atIndex(i) else { continue }
            let title = e.forProperty("t")?.toString() ?? "?"
            let prescription = e.forProperty("m")?.toString() ?? ""
            let descProp = e.forProperty("d")
            let description = (descProp == nil || descProp!.isUndefined) ? nil : descProp?.toString()
            let restProp = e.forProperty("r")
            let restSeconds = (restProp == nil || restProp!.isUndefined) ? nil : Int(restProp!.toInt32())
            out.append(EngineBridge.RenderedExercise(
                id: title, title: title, prescription: prescription,
                phaseAdjusted: false, description: description, restSeconds: restSeconds,
                weightKg: nil, weightIsBump: false, hasWeightTracking: false,
                step: 2.5, interval: nil
            ))
        }
        return out
    }
}

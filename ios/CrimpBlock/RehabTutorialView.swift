import SwiftUI

/// The rehab track's own post-quiz walkthrough — a separate flow from
/// TutorialDemoCardView, not a variant of it. RehabCardView is a
/// genuinely different screen (no weekly calendar strip, no today's-
/// session picker, no weight tracking) with its own real controls to
/// spotlight (a rest timer, the self-report checklist, the settings
/// gear) — reusing the standard tutorial's step list would either point
/// at controls that don't exist here or miss the ones that do.
///
/// Runs against fingerPulley's Strength phase specifically: it's the one
/// phase/area combination where every exercise carries a rest timer, so
/// the restTimerButton step always has something real to spotlight
/// regardless of which injury area or starting phase the person actually
/// picked in the quiz.
struct RehabTutorialView: View {
    var onDone: () -> Void

    private enum Stage { case intro, walkthrough, outro }

    @State private var stage: Stage = .intro
    @State private var bridge: RehabBridge?
    @State private var loadError: String?
    @State private var controller = TutorialController(steps: [
        TutorialStep(targetID: "restTimerButton", title: "Timed holds",
                     body: "Any exercise with a hold time gets a rest timer wired in — tap REST to start it, same as the main app."),
        TutorialStep(targetID: "checklistItem", title: "You decide when you're ready",
                     body: "Nothing here advances on its own. Once something is genuinely true for you, tap to check it off."),
        TutorialStep(targetID: "settingsGear", title: "Your settings",
                     body: "Switching back to your regular training whenever you're ready — or into rehab again later if you need to — lives behind this gear icon."),
    ])

    var body: some View {
        ZStack {
            Group {
                if let loadError {
                    engineBridgeErrorView(loadError)
                } else if let bridge, let phase = bridge.currentPhase() {
                    RehabCardView(
                        phase: phase,
                        footerNote: "Tutorial · rehab",
                        onTutorialSignal: { controller.handleTap($0) },
                        tutorialScrollTarget: stage == .walkthrough ? controller.currentStep?.targetID : nil
                    )
                } else {
                    ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
                }
            }
            .tutorialOverlay(controller, isActive: stage == .walkthrough)

            if stage == .intro {
                messageCard(
                    title: "Quick look around",
                    body: "A few things specific to the rehab track, worth knowing before you start — tap through them on the real screen.",
                    buttonLabel: "START",
                    skipAction: { onDone() }
                ) { stage = .walkthrough }
            } else if stage == .outro {
                messageCard(
                    title: "You're set",
                    body: "Work through this at your own pace. Once everything on a phase's checklist is genuinely true, ADVANCE TO NEXT PHASE unlocks — there's no rush and no clock running.",
                    buttonLabel: "GET STARTED"
                ) { onDone() }
            }
        }
        .task { if bridge == nil { load() } }
        .onChange(of: controller.finished) { _, finished in
            if finished { stage = .outro }
        }
    }

    /// Identical to TutorialDemoCardView's own messageCard — not worth
    /// extracting into a shared file for two call sites with no other
    /// coupling between them.
    private func messageCard(title: String, body: String, buttonLabel: String, skipAction: (() -> Void)? = nil, action: @escaping () -> Void) -> some View {
        ZStack {
            Color.black.opacity(0.75).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                Text(title)
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundStyle(SessionColours.fg)
                Text(body)
                    .font(.system(size: 14))
                    .foregroundStyle(SessionColours.dim)
                Button(action: action) {
                    Text(buttonLabel)
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundStyle(SessionColours.bg)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(SessionColours.fg)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.top, 4)
                if let skipAction {
                    Button(action: skipAction) {
                        Text("SKIP")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(SessionColours.faint)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(22)
            .frame(maxWidth: 340)
            .background(SessionColours.s1)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private func load() {
        do {
            bridge = try RehabBridge(injuryArea: "fingerPulley", phaseIndex: 2)
        } catch {
            loadError = "\(error)"
        }
    }
}

#Preview {
    RehabTutorialView(onDone: {})
}

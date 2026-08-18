import SwiftUI

/// The interactive, post-quiz walkthrough — supersedes the earlier
/// slide-based OnboardingTutorialView per Oscar's review: instead of
/// looking at screenshots, this spotlights the real controls on a real
/// (but fixed/staged, not the user's own) daily card and requires an
/// actual tap on each one to move on.
///
/// Runs against `boulderingAdvanced` specifically, chosen because its
/// Base phase already has an active, weight-trackable, timed exercise on
/// day one with no modifiers needed — every other template either skips
/// edge-specific work in its first phase (the beginner tiers, on purpose —
/// see templates.js) or otherwise isn't guaranteed to show every feature
/// this walkthrough needs to point at. A small seeded loadLog entry
/// guarantees a weight badge is actually on screen to spotlight (a truly
/// brand-new user's empty load history wouldn't have one yet — confirmed
/// live during Phase C verification, not assumed).
struct TutorialDemoCardView: View {
    var onDone: () -> Void

    private enum Stage { case intro, walkthrough, outro }

    @State private var stage: Stage = .intro
    @State private var state: DailyCardState?
    @State private var loadError: String?
    @State private var isLogged = false
    @State private var controller = TutorialController(steps: [
        TutorialStep(targetID: "phaseBadge", title: "The bigger picture",
                     body: "This badge shows where you are in your training block. Tap it any time to see the full plan — phases, deload weeks, and what changes when."),
        TutorialStep(targetID: "exerciseInfo", title: "Detail, out of the way",
                     body: "Every exercise keeps the essentials up front. Tap the info icon on any exercise to see the full reasoning behind it."),
        TutorialStep(targetID: "weightBadge", title: "Track your numbers",
                     body: "Tap a weight to log a different one for today. The app remembers it and adjusts future targets on its own."),
        TutorialStep(targetID: "restTimerButton", title: "Built-in timers",
                     body: "Every timed exercise has a rest timer wired in — tap to start it, right from here."),
        TutorialStep(targetID: "doneButton", title: "Log as you go",
                     body: "Tick exercises off as you do them, then mark today done here. Tap any other session dot to log something different instead."),
    ])

    var body: some View {
        ZStack {
            Group {
                if let loadError {
                    engineBridgeErrorView(loadError)
                } else if let state {
                    DailyCardView(
                        state: state,
                        footerNote: "Tutorial · \(state.today)",
                        isLogged: isLogged,
                        onTapWeight: { _ in controller.handleTap("weightBadge") },
                        onTapDone: {
                            isLogged.toggle()
                            controller.handleTap("doneButton")
                        },
                        onTutorialSignal: { controller.handleTap($0) }
                    )
                } else {
                    ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
                }
            }
            .tutorialOverlay(controller, isActive: stage == .walkthrough)

            if stage == .intro {
                messageCard(
                    title: "Quick look around",
                    body: "Five things worth knowing before your first session — tap through them on the real card.",
                    buttonLabel: "START"
                ) { stage = .walkthrough }
            } else if stage == .outro {
                messageCard(
                    title: "You're set",
                    body: "That's everything. You can always revisit this from settings later.",
                    buttonLabel: "GET STARTED"
                ) { onDone() }
            }
        }
        .task { if state == nil { load() } }
        .onChange(of: controller.finished) { _, finished in
            if finished { stage = .outro }
        }
    }

    private func messageCard(title: String, body: String, buttonLabel: String, action: @escaping () -> Void) -> some View {
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
            }
            .padding(22)
            .frame(maxWidth: 340)
            .background(SessionColours.s1)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private func load() {
        do {
            let cal = Calendar(identifier: .gregorian)
            func iso(_ daysAgo: Int) -> String {
                let d = cal.date(byAdding: .day, value: -daysAgo, to: Date())!
                let f = DateFormatter()
                f.locale = Locale(identifier: "en_US_POSIX")
                f.dateFormat = "yyyy-MM-dd"
                return f.string(from: d)
            }
            let loadLog: [String: [[String: Any]]] = ["tpl-adv-maw": [["date": iso(3), "kg": 20]]]
            let bridge = try EngineBridge(
                templateId: "boulderingAdvanced", startDate: iso(0),
                modifiers: [:], sessionLog: [:], loadLog: loadLog
            )
            guard let s = DailyCardState.load(bridge: bridge, displayKey: "maxFingers") else {
                loadError = "engine returned incomplete data for the tutorial template"
                return
            }
            state = s
        } catch {
            loadError = "\(error)"
        }
    }
}

#Preview {
    TutorialDemoCardView(onDone: {})
}

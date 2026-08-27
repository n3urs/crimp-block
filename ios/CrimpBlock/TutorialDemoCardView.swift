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
    /// Which session key (if any) is logged — NOT a flat Bool. A flat
    /// isLogged stayed true across a swipe to a completely different,
    /// never-touched session: DONE tapped on Max Fingers, then swipe to
    /// Hangboard, and Hangboard read as logged too, because nothing here
    /// was tracking WHICH session earned that state. The real app never
    /// has this bug — NativeAppView computes isLogged fresh per render
    /// from `store.get(today)?.t == displayKey` — this demo just never
    /// had an equivalent to compare against until now.
    @State private var loggedKey: String?
    @State private var ticks: Set<String> = []
    /// Ordered roughly top-to-bottom down the card, then out to the
    /// things that aren't visible controls at all. Several steps here
    /// exist specifically because someone who'd been using the app for
    /// weeks still had to ask what a piece of it meant — the gold
    /// prescription text, the gold weight number, and the two different
    /// dot styles were all real "what does this mean?" questions, not
    /// hypothetical ones. Anything that carries meaning by colour or
    /// shape alone gets said out loud here.
    @State private var controller = TutorialController(steps: [
        TutorialStep(targetID: "weekStrip", title: "Your last seven days",
                     body: "Each bar is one day, coloured by what you logged. Tap any of them to fill in a session you forgot — or to fix one you got wrong."),
        // "…then close it to carry on" is not padding: tapping this badge
        // opens the plan as a sheet OVER the card, and the walkthrough has
        // no way to dismiss someone else's @State sheet, so the next step
        // is sitting underneath it invisibly until they close it
        // themselves. Reported directly — a tester opened the plan and had
        // no idea the tutorial was waiting behind it.
        TutorialStep(targetID: "phaseBadge", title: "The bigger picture",
                     body: "This badge shows where you are in your training block. Tap it any time to see the full plan — phases, deload weeks, and what changes when. Close it with the button in the top left to carry on."),
        TutorialStep(targetID: "exerciseInfo", title: "Detail, out of the way",
                     body: "Every exercise keeps the essentials up front. Tap the info icon to see the full reasoning behind it. And when an exercise's sets and reps are written in gold, it means those numbers have been tuned for the phase you're in right now — they'll change as you move through the plan."),
        TutorialStep(targetID: "exerciseTick", title: "Tick them off",
                     body: "Check exercises off as you finish them. Ticked ones collapse out of the way, so what's left is always what's in front of you."),
        TutorialStep(targetID: "weightBadge", title: "Track your numbers",
                     body: "Tap a weight to log what you actually lifted today. When that number turns gold, it means you've held the same weight two sessions running — the app is telling you it's time to go up."),
        TutorialStep(targetID: "restTimerButton", title: "Built-in timers",
                     body: "Every timed exercise has a rest timer wired in — tap to start it, right from here. It keeps running on your lock screen, so you can put the phone down."),
        TutorialStep(targetID: "restTimerStop", title: "Stop anytime",
                     body: "Rest timers count down on their own, but you're never stuck waiting — tap STOP whenever you're ready to move on."),
        // Has to come AFTER every exercise-specific step above, not
        // before them: this is the one step that changes which session
        // is on screen, and a different session has different
        // exercises. With it earlier, a swipe to a session with no
        // weight-tracked exercise left the next step ("weightBadge")
        // with no anchor to point at — and an anchorless step renders
        // nothing at all, so the whole overlay vanished, SKIP link
        // included, and the walkthrough was stuck. Everything below
        // this line (Done, settings) exists on every session, so it's
        // safe to land anywhere.
        //
        // Deliberately the full-screen swipe demo rather than a masked
        // spotlight on the dots row, even though the copy is largely
        // ABOUT the dots: a spotlight dims everything else, and the
        // dots are 14pt circles at the top of the screen, so advancing
        // would mean landing a precise tap on one of seven small
        // targets. No mask means the dots stay lit while they're being
        // explained, and a swipe — a whole-screen gesture — moves it
        // on. Tapping a dot still advances it too.
        TutorialStep(targetID: "sessionDots", title: "Reading the dots",
                     body: "One dot per session type. The filled one is what you're looking at right now — not what you've done. The dot with a ring around it is what the app reckons you should do today, and it stays put even while you look around. Swipe left or right anywhere on the card to move between sessions, or tap a dot to jump straight to one.",
                     fullScreenSwipeDemo: true),
        TutorialStep(targetID: "doneButton", title: "Then log the session",
                     body: "When you're finished, mark the whole session done with the big button at the bottom. This is the bit that actually matters — logging is what the app reads to decide what you do next."),
        TutorialStep(targetID: "settingsGear", title: "Your settings",
                     body: "A sets counter that lets you tap through sets one at a time, an auto-start rest timer, and your account, all behind this gear icon."),
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
                        isLogged: loggedKey == state.displayKey,
                        ticks: ticks,
                        // Real tick state, not a no-op: the checkbox row
                        // is a genuine step now, and a checkbox that
                        // didn't visibly tick when pressed would teach
                        // the wrong thing. Ticking here also collapses
                        // the row exactly as it will on their own card.
                        onToggleTick: { id in
                            if ticks.contains(id) { ticks.remove(id) } else { ticks.insert(id) }
                        },
                        onTapWeight: { _ in controller.handleTap("weightBadge") },
                        onTapDone: {
                            // Toggle logged for whatever's ON SCREEN right
                            // now, matching the real app's "at most one
                            // logged session" model — mirrors
                            // toggleDone()'s own logic, not a bare flip.
                            loggedKey = (loggedKey == state.displayKey) ? nil : state.displayKey
                            controller.handleTap("doneButton")
                        },
                        onBrowse: { key in
                            browse(to: key)
                            controller.handleTap("sessionDots")
                        },
                        // Fabricated, unlike everything else on this card
                        // — a brand-new account has no history at all, so
                        // a real empty strip would be seven blank tiles
                        // with nothing to explain. These give the step
                        // something that looks like a real week.
                        weekDays: Self.demoWeekDays(bridge: state.bridge, today: state.today),
                        onTapDay: { _ in controller.handleTap("weekStrip") },
                        onTutorialSignal: { controller.handleTap($0) }
                    )
                } else {
                    ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
                }
            }
            .tutorialOverlay(controller, isActive: stage == .walkthrough)

            if stage == .intro {
                messageCard(
                    // The single most important thing about this app is
                    // also the least visible: it picks your session for
                    // you, from what you've logged and how recovered you
                    // are — it is not a weekly timetable you follow. Every
                    // spotlight step after this makes more sense once
                    // that's been said, and nothing on the card itself
                    // ever says it.
                    title: "How this works",
                    body: "Every day, the app tells you which session to do — worked out from what you've logged and how recovered you are, not a fixed weekly timetable. Rest days get recommended too, and they count. Log what you do and it adapts. Here's a quick look around.",
                    buttonLabel: "START",
                    skipAction: { onDone() }
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

    /// `skipAction` is only passed on the intro card — the outro card is
    /// already the exit itself, and every walkthrough step in between has
    /// its own SKIP link (TutorialSpotlight.swift's caption card). Without
    /// it here, someone who already knows the app would have to start the
    /// walkthrough just to reach the skip control on the first step.
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

    /// A plausible-looking week for the strip to show. Deliberately
    /// leaves a couple of days blank — a strip where every single day is
    /// filled would quietly imply you're meant to train daily, which is
    /// the opposite of what the engine actually does.
    private static func demoWeekDays(bridge: EngineBridge, today: String) -> [WeekDay] {
        let types: [String?] = ["pull", "rest", "maxFingers", nil, "climbHard", "rest", nil]
        var out: [WeekDay] = []
        for (offset, i) in stride(from: 6, through: 0, by: -1).enumerated() {
            let date = bridge.addDays(today, -i)
            out.append(WeekDay(
                id: date, dayLetter: dayLetter(date),
                colourVarName: types[offset].map { bridge.sessionColourVarName($0) },
                isToday: i == 0
            ))
        }
        return out
    }

    private static func dayLetter(_ date: String) -> String {
        let inFmt = DateFormatter()
        inFmt.locale = Locale(identifier: "en_US_POSIX")
        inFmt.dateFormat = "yyyy-MM-dd"
        guard let d = inFmt.date(from: date) else { return "" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.dateFormat = "EEE"
        return String(out.string(from: d).prefix(1))
    }

    /// Same idea as NativeEngineDemoView.browse(to:) — a real re-decide
    /// against the tutorial's own bridge, not a fake preview, so tapping a
    /// dot here shows the same thing it would for a real user.
    private func browse(to key: String) {
        guard let bridge = state?.bridge, key != state?.displayKey else { return }
        if let s = DailyCardState.load(bridge: bridge, displayKey: key) { state = s }
    }
}

#Preview {
    TutorialDemoCardView(onDone: {})
}

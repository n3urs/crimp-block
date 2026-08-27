import SwiftUI

/// Everything needed to render one day's card, already resolved through
/// EngineBridge — shared between NativeEngineDemoView (seeded sample data)
/// and NativeAppView (real Supabase-backed data), so the two don't drift
/// into two different renderings of the same thing.
struct DailyCardState {
    let bridge: EngineBridge
    let today: String
    /// The TRUE recommendation from decide() — kept even while browsing a
    /// different session, since it's still needed for the "rec" dot in the
    /// session strip (mirrors app.js's `k===d.k` check, where `d` is always
    /// today's real decide() result regardless of what's on screen).
    let decision: EngineBridge.Decision
    /// What's actually shown — equals decision.k unless browsing another
    /// session, matching app.js's `key` (browseIndex!==null ? ORDER[...] : d.k).
    let displayKey: String
    let block: EngineBridge.BlockInfo
    let phaseName: String
    let session: EngineBridge.SessionInfo
    let exercises: [EngineBridge.RenderedExercise]
    let accent: Color
    let accentVarName: String

    static func load(bridge: EngineBridge, displayKey: String? = nil) -> DailyCardState? {
        let today = bridge.today()
        guard let d = bridge.decide(date: today),
              let b = bridge.block(date: today),
              let phase = bridge.phaseNameAt(today) else { return nil }
        let key = displayKey ?? d.k
        guard let info = bridge.sessionInfo(key) else { return nil }

        let varName = bridge.sessionColourVarName(key)

        return DailyCardState(
            bridge: bridge, today: today, decision: d, displayKey: key, block: b, phaseName: phase, session: info,
            exercises: bridge.resolveExercises(for: key, date: today, phaseName: phase),
            accent: SessionColours.resolve(varName), accentVarName: varName
        )
    }
}

/// Interactivity is entirely optional (nil handlers) so NativeEngineDemoView
/// can keep rendering the seeded-sample card exactly as before, with no
/// Done button and no tap targets — there's nowhere real for a write to go
/// when the data is fake, so the affordances simply don't appear.
struct DailyCardView: View {
    let state: DailyCardState
    var footerNote: String
    var isLogged: Bool = false
    /// Which session (if any) is logged for today — at most one can be,
    /// so this is a single key rather than a set. `isLogged` above is just
    /// this compared against the currently displayed session, and stays
    /// the prop everything reads for the CURRENT card. This exists so the
    /// swipe peek can answer the same question about the session it's
    /// previewing: without it the LOGGED stamp had no way to know whether
    /// it belonged on the card being swiped to.
    var loggedSessionKey: String? = nil
    var ticks: Set<String> = []
    var onToggleTick: ((String) -> Void)? = nil
    var onTapWeight: ((EngineBridge.RenderedExercise) -> Void)? = nil
    var onTapDone: (() -> Void)? = nil
    var onBrowse: ((String) -> Void)? = nil
    var weekDays: [WeekDay] = []
    var onTapDay: ((String) -> Void)? = nil
    var accountEmail: String? = nil
    var onSignOut: (() -> Void)? = nil
    var onDeleteAccount: (() async throws -> Void)? = nil
    /// Re-runs the onboarding walkthrough — nil everywhere except the
    /// real signed-in card, since only NativeAppView owns the state
    /// that decides whether the tutorial is showing.
    var onReplayTutorial: (() -> Void)? = nil
    /// Phase C.1: threaded straight through to SettingsView's track
    /// switcher — nil in demo/sample-data mode, same as accountEmail.
    var profile: NativeProfile? = nil
    var onTrackChanged: (() async -> Void)? = nil
    var celebrationTrigger: Int = 0
    /// Fired for the handful of interactions that don't already have an
    /// external hook of their own (onTapDone/onTapWeight cover the rest) —
    /// exists purely so TutorialOverlay's host can call
    /// TutorialController.handleTap(_:) when the phase badge, an
    /// exercise's info toggle, or its rest-timer button gets tapped. Every
    /// other caller can safely leave this nil.
    var onTutorialSignal: ((String) -> Void)? = nil
    @State private var showPlan = false
    @State private var showSettings = false
    @State private var restTimer = RestTimerController()
    @State private var intervalTimer = IntervalTimerController()
    @State private var showIntervalTimer = false
    /// Decoupled from the raw `isLogged` prop so the persistent LOGGED
    /// card doesn't pop in at the exact same instant as
    /// CelebrationOverlay's own tick — see the onChange(of:
    /// celebrationTrigger) handler below for how the two get sequenced.
    @State private var showLoggedStamp = false
    /// Owns the big card's auto-dismiss — a real Task rather than a bare
    /// DispatchQueue.asyncAfter specifically so it's cancellable: an undo
    /// immediately followed by a re-log within the ~2.5s window would
    /// otherwise leave a stale timer from the FIRST completion armed to
    /// blow away the SECOND completion's freshly-shown card early.
    @State private var loggedStampDismissTask: Task<Void, Never>?
    /// True for the brief window after a fresh log while the tick
    /// animation is having its moment alone — while this is set, an
    /// isLogged flip (which typically lands mid-window once the
    /// parent's reload() finishes) is deliberately NOT mirrored into
    /// showLoggedStamp; the celebrationTrigger handler owns that reveal
    /// instead, once the tick's own beat is done.
    @State private var celebrating = false
    /// Gates a same-day SWAP onto a different session behind a confirm —
    /// direct feedback: toggleDone()'s single-log-per-day model correctly
    /// un-logs whatever was logged before, but doing that silently read as
    /// a real surprise ("I pressed Done on Volume and now Max Strength
    /// isn't logged?"). UNDO (isLogged already true) and the day's very
    /// first log (loggedSessionKey nil) both skip this — only swapping
    /// which session counts for today confirms first. See handleDoneTap.
    @State private var showSwapConfirm = false
    /// Live horizontal position of the current session's content — 0 at
    /// rest, tracks a finger 1:1 during an active swipe (set directly in
    /// onChanged, never animated there), animated only when a drag
    /// commits or springs back in onEnded. A canned .transition() that
    /// only plays after the gesture fully ends was reported as feeling
    /// laggy/disconnected from the touch itself — this instead mirrors
    /// the phone's own home-screen paging: content follows the thumb in
    /// real time and only "locks onto" the next page once you let go.
    @State private var dragOffset: CGFloat = 0
    /// The adjacent session's resolved content, computed the instant a
    /// drag commits to being horizontal — sits BEHIND the current
    /// content in the z-stack below, so sliding the current layer aside
    /// naturally reveals it, the same way dragging one card off a stack
    /// reveals the one underneath rather than needing its own offset math.
    @State private var peekState: DailyCardState?
    @State private var peekKey: String?
    /// Set the instant a swipe/tap commits, cleared once state.displayKey
    /// genuinely matches it — see commitAfter's own doc comment for why
    /// this indirection exists instead of just resetting immediately.
    @State private var pendingCommitKey: String?
    /// Per-gesture flag: whether THIS drag has been claimed as a
    /// horizontal swipe yet. Reset at the start of every new gesture so
    /// an ordinary vertical scroll never gets mistaken for one path into
    /// the next, and a genuine horizontal swipe doesn't un-claim itself
    /// just because the finger wobbles back toward vertical mid-drag.
    @State private var horizontalDragCommitted = false
    @State private var containerWidth: CGFloat = 400

    /// What the session dots (and the swipe's own "which session am I
    /// stepping from") should treat as current. Between a swipe finishing
    /// its slide and the parent's `state` prop actually catching up,
    /// state.displayKey is still the OLD session for that whole window —
    /// which left the dots visibly changing colour a beat after the card
    /// had already finished moving. pendingCommitKey is known the instant
    /// the slide completes, so the dots now turn over at the same moment
    /// the new card lands rather than after the parent round-trip.
    private var effectiveDisplayKey: String {
        pendingCommitKey ?? state.displayKey
    }

    /// "Today has been logged at all", NOT "the session I'm looking at is
    /// the logged one" — which is what the `rec` ring actually keys off in
    /// app.js (`logged = Store.get(today())`, line 226's `k===d.k&&!logged`).
    /// `isLogged` alone was a subtle divergence from that: browsing away
    /// from an already-logged session made it false again, so the
    /// recommendation ring popped back on mid-swipe and then off again on
    /// the way back. Falls back to isLogged for callers that don't pass a
    /// loggedSessionKey (the tutorial's synthetic card), keeping their
    /// behaviour exactly as it was.
    private var todayIsLogged: Bool { loggedSessionKey != nil || isLogged }

    /// Mirror of dragOffset for the INCOMING session's stamp: one full
    /// Tap-driven browsing (a dot, NEXT) — plays the exact same
    /// slide-and-settle the swipe gesture does, just driven
    /// programmatically instead of by a live touch, so the two ways of
    /// changing session never look or feel like two different features.
    private func animatedBrowse(to key: String) {
        guard onBrowse != nil, key != effectiveDisplayKey,
              let from = EngineBridge.order.firstIndex(of: effectiveDisplayKey),
              let to = EngineBridge.order.firstIndex(of: key) else { return }
        let goingNext = to >= from
        peekKey = key
        peekState = DailyCardState.load(bridge: state.bridge, displayKey: key)
        withAnimation(.easeInOut(duration: 0.3)) {
            dragOffset = goingNext ? -containerWidth : containerWidth
        } completion: {
            commit(key: key)
        }
    }

    /// Deliberately does NOT reset dragOffset/peekState here — onBrowse
    /// only tells the PARENT to reload; the real `state` prop reflecting
    /// `key` doesn't land until a later render. Resetting immediately
    /// (the original bug) snapped dragOffset back to 0 while `state` was
    /// still the OLD session for that one frame, showing it again before
    /// visibly jumping to the real new one right after — exactly the
    /// "goes back to Max Fingers, then to hangboard" report. The peek
    /// (still sitting at rest, already showing the right content) stays
    /// on screen untouched until settleOnRealUpdate() below confirms
    /// state.displayKey has genuinely caught up, at which point the
    /// switch from peek to real content is invisible — both show the
    /// same thing at that instant.
    ///
    /// Called from the completing slide's own `completion:` closure, not
    /// a GCD timer set to the same duration as the animation — a timer
    /// like that fired a hair before SwiftUI had actually finished
    /// rendering the last bit of the slide, which looked like the swipe
    /// freezing just short of the edge and then jumping the rest of the
    /// way once the timer's onBrowse call landed.
    private func commit(key: String) {
        pendingCommitKey = key
        // The big card is a one-time celebration, not something that
        // replays every time you swipe back onto a session you already
        // logged — direct feedback: it used to reappear on every return
        // visit (this line used to set it true again whenever the
        // destination was the logged session), which read as the app
        // re-congratulating you for the same thing repeatedly. Browsing
        // never shows the big card now, full stop — only a fresh DONE
        // (via celebrationTrigger) does. cardMessage's own isLogged
        // branch is what a browsed-to logged session shows instead: the
        // small persistent "LOGGED" text, immediately, no animation
        // needed since there's nothing being newly revealed.
        if !celebrating {
            var noAnim = Transaction()
            noAnim.disablesAnimations = true
            withTransaction(noAnim) { showLoggedStamp = false }
        }
        onBrowse?(key)
        // Safety net: if state.displayKey never ends up matching
        // (an onBrowse implementation that doesn't update it, or
        // ignores the request) don't leave the card stuck mid-swipe
        // forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            if pendingCommitKey == key { settle() }
        }
    }

    /// Runs the real Done/Undo action directly EXCEPT for the one case
    /// that's a surprising same-day swap: something else is already
    /// logged today and this isn't it. `isLogged` true means this IS
    /// today's logged session, so the button reads UNDO and needs no
    /// confirmation; `loggedSessionKey == nil` means nothing's logged yet
    /// today, so this is a plain first log, also no confirmation.
    private func handleDoneTap(_ action: @escaping () -> Void) {
        if !isLogged, let loggedSessionKey, loggedSessionKey != state.displayKey {
            showSwapConfirm = true
        } else {
            action()
        }
    }

    private func settle() {
        dragOffset = 0
        peekKey = nil
        peekState = nil
        pendingCommitKey = nil
    }

    /// Mirrors JS's `parseInt(string, 10)` — the leading run of digits,
    /// stopping at the first non-digit character. Used to read the set
    /// count straight from the currently-resolved prescription text (e.g.
    /// "5 × (10s on / 5s off × 5)" -> 5), same as startIntervalTimer() in
    /// app.js, so a deload week's already-cut set count is picked up for
    /// free with no extra logic here.
    private static func leadingInt(_ s: String) -> Int? {
        var digits = ""
        for ch in s.trimmingCharacters(in: .whitespaces) {
            if ch.isNumber { digits.append(ch) } else { break }
        }
        return Int(digits)
    }

    /// Mirrors app.js render()'s `msg` computation exactly — and
    /// deliberately does NOT include decision.why (the recommendation's
    /// own reasoning). Oscar was explicit about this: the daily card shows
    /// session + exercises only, zero behind-the-scenes narration on why
    /// THIS session got picked. The only things ever shown here are
    /// deload/easing-back guidance or the session's own `note` (e.g.
    /// climb-before-or-after ordering) — in that priority order, never
    /// combined with the note. The "logged" confirmation itself moved to
    /// loggedStamp below — a small inline "Logged. " prefix here read as
    /// an afterthought once that existed, not the actual confirmation.
    private var cardMessage: String { cardMessage(for: state, isLogged: isLogged) }

    /// Parameterized over the state rather than reading `state` directly,
    /// so the swipe peek can render its OWN message. It couldn't before,
    /// and the message is a whole text block sitting between the title and
    /// the exercise list — so the peek was laid out with that block
    /// missing, and everything below it visibly jumped down the moment the
    /// real content took over. Reported as "a bit of delay between the old
    /// one being wiped off and the description text appearing".
    private func cardMessage(for s: DailyCardState, isLogged: Bool) -> String {
        let key = s.displayKey
        let isDeload = s.block.w == 4
        let isReturning = !isDeload && s.bridge.isReturning(s.today)

        var msg = ""
        if isDeload && key != "rest" {
            msg += "Deload week — " + (s.session.isClimb
                ? "fewer hard attempts, and stop well short of failure. Times below are already cut."
                : "same weights as usual, fewer sets. The numbers below are already cut.")
        } else if isReturning && key != "rest" {
            msg += "Easing back in after a break — weights are cut, not just sets. Go by feel: back off further if anything below feels off, this is not the week to chase the number."
        }
        if msg.isEmpty {
            if isLogged {
                // The permanent, small "you're done" signal that's left
                // once the big celebratory card (showLoggedStamp) auto-
                // dismisses — see the body's timer below. Reuses this
                // exact slot/styling (already had isLogged-specific
                // colour/weight wired up below) rather than adding a new
                // element, and stays correctly hidden underneath the big
                // card the whole time it's up, since this view sits
                // earlier in the same ZStack.
                msg = "LOGGED"
            } else if let note = s.session.note {
                msg = note
            }
        }
        return msg
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // Only the exercise list scrolls — the header/dots/title stay
            // put. Previously this whole card (header included) was one
            // big ScrollView, which meant a long session (more exercises
            // than fit on screen, e.g. a Pull day) could scroll the title
            // itself out of view, and made the new swipe gesture feel
            // inconsistent depending on how far you'd scrolled. A plain
            // VStack sizes to its content by default, but a ScrollView
            // inside one still expands to fill whatever space is left —
            // that's what actually pins everything above it.
            VStack(alignment: .leading, spacing: 18) {
                if let onTapDay, !weekDays.isEmpty {
                    // Extra breathing room beyond the VStack's normal
                    // 18pt gap, on top of WeekStripView's own bar-shaped
                    // tiles (vs sessionDots' circles below) — together
                    // that's enough that the two rows read as separate
                    // controls rather than one continuous strip.
                    WeekStripView(days: weekDays, onTapDay: onTapDay)
                        .padding(.bottom, 10)
                        .tutorialTarget("weekStrip")
                }
                header
                if onBrowse != nil { sessionDots }
                // Peek sits behind, at rest (no offset of its own) — the
                // current content slides on top of it via dragOffset, so
                // dragging the top layer aside naturally reveals whatever
                // adjacent session is underneath, the same way sliding one
                // card off a stack reveals the next one without that card
                // needing to move at all.
                ZStack(alignment: .topLeading) {
                    if let peekState {
                        // Explicit maxWidth/maxHeight on BOTH layers here
                        // is load-bearing, not decoration: a ZStack sizes
                        // itself from each child's OWN natural size, and
                        // this peek (a plain VStack sized to its own
                        // content) is naturally shorter than the current
                        // layer's ScrollView — without forcing both to
                        // fill the same generous frame, the whole card
                        // visibly shrank down to the peek's height the
                        // instant a drag committed, before any real
                        // dragging had even happened.
                        peekContent(peekState)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }

                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(state.session.name.uppercased())
                                .font(AppFonts.heading(32))
                                .foregroundStyle(.white)
                            Text(state.session.where_)
                                .font(AppFonts.mono(13, weight: .medium))
                                .foregroundStyle(state.accent)
                        }
                        ScrollView {
                            VStack(alignment: .leading, spacing: 18) {
                                // Scrolls away with the exercise list rather than
                                // staying pinned above it — direct feedback: with
                                // the sets tally on, each row got taller, and a
                                // fixed description was eating space that mattered
                                // more as exercises to actually see on screen.
                                if !cardMessage.isEmpty {
                                    Text(cardMessage)
                                        .font(.system(size: 14, weight: isLogged ? .semibold : .regular))
                                        .foregroundStyle(isLogged ? state.accent : SessionColours.dim)
                                }
                                // Flat list with thin dividers between rows, matching
                                // .ex{border-bottom:1px solid var(--s2)} — the previous
                                // per-row card treatment (rounded background, gap
                                // between cards) was this native port's own addition,
                                // not something carried over from the original.
                                VStack(spacing: 0) {
                                    ForEach(Array(state.exercises.enumerated()), id: \.element.id) { index, ex in
                                        exerciseRow(ex, isTutorialTickTarget: index == 0)
                                        if index < state.exercises.count - 1 {
                                            Rectangle().fill(SessionColours.s2).frame(height: 1)
                                        }
                                    }
                                }
                                // Once today's logged, every exercise stays
                                // fully visible, ticks and all — direct
                                // feedback: dimming it away read as hiding
                                // what you'd just done rather than confirming
                                // it. Still untappable (ticking/timers/weights
                                // don't make sense to poke at anymore); UNDO
                                // is the one live escape hatch back into it.
                                .allowsHitTesting(!isLogged)

                                footer
                                if onTapDone != nil { Color.clear.frame(height: 64) } // room for the floating button
                            }
                        }
                        // The system scroll indicator (a thin bar down the right
                        // edge) sits on top of the exercise text at this width and
                        // reads as visual noise rather than a useful affordance —
                        // this list is short enough that "there's more below" is
                        // already obvious without one.
                        .scrollIndicators(.hidden)
                        // Content scrolling around underneath the big LOGGED
                        // card while IT stays fixed center-screen reads as
                        // broken, not "disabled" — so scrolling is only
                        // frozen for the few seconds that card is actually
                        // up (showLoggedStamp), not for the rest of the day.
                        // Once it auto-dismisses to the small "LOGGED" text
                        // above, the list needs to scroll again — that text
                        // is the whole point of keeping every exercise
                        // visible, and a list longer than one screen can't
                        // be reviewed if it's frozen.
                        .scrollDisabled(showLoggedStamp)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .background(SessionColours.bg)
                    .offset(x: dragOffset)
                }
            }
            .padding(20)
            // .simultaneousGesture (not .gesture) so this never competes
            // with the inner ScrollView's own vertical pan for
            // recognition — both see every touch, and this one only acts
            // in onEnded, on whichever swipes turn out to be clearly
            // horizontal. Attached to the whole card (not just the
            // scrollable part) so it still works from the header/title
            // area, not only over the exercise list. minimumDistance 24
            // is enough that a tap on a button underneath (near-zero
            // translation) never begins this gesture at all. onBrowse==nil
            // is guarded inside the handler itself, not here — Gesture is
            // a protocol with an associated type, so the modifier can't
            // be made conditional/optional at the call site the way a
            // plain view modifier could.
            .simultaneousGesture(swipeGesture)
            if let onTapDone {
                Button(action: { handleDoneTap(onTapDone) }) {
                    Text(isLogged ? "UNDO" : "DONE THIS WORKOUT")
                        .font(AppFonts.mono(14, weight: .bold))
                        .foregroundStyle(isLogged ? SessionColours.dim : SessionColours.bg)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(isLogged ? SessionColours.s2 : state.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(16)
                .tutorialTarget("doneButton")
            }
            // Fixed to the bottom, full-width, matching #tm's own
            // position:fixed;bottom:0 exactly — drawn after (so on top of)
            // the Done button above, same as .tm's higher z-index over
            // .bar in the web app: a running rest timer covers the Done
            // button rather than floating as a separate top banner, which
            // is where this previously lived. .move(edge: .bottom) + the
            // .animation binding below is what makes it actually slide up
            // (matching #tm's own transform .2s), not just pop in — a bare
            // `if` with no transition snaps instantly either way.
            // Wrapped in its own ZStack purely so the slide-up animation
            // below is scoped to the timer — it used to sit on the whole
            // card, which meant every unrelated change in the card
            // animated too whenever a timer started or stopped.
            ZStack(alignment: .bottom) {
                if restTimer.endDate != nil {
                    RestTimerOverlay(controller: restTimer, accent: state.accent, onTutorialSignal: onTutorialSignal)
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: restTimer.endDate != nil)
            // Centered on the whole card, not just the scrollable exercise
            // area below the fixed header — matching CelebrationOverlay's
            // own centering exactly, since the two used to disagree (this
            // was an .overlay on just the ScrollView, which put it
            // noticeably lower than centered on screen).
            // Sits out here rather than inside the swiping content so it
            // stays centred on the whole card (it was noticeably too low
            // when scoped to just the scrollable area).
            //
            // Deliberately no equivalent block for the PEEK session
            // anymore — this used to show the same big card creeping in
            // while swiping toward an already-logged session, which is
            // exactly the "re-celebrating something that already
            // happened" problem the big card is meant to avoid now.
            // peekContent's own cardMessage call already shows the small
            // "LOGGED" text for a logged peek target, which is all a
            // preview needs.
            if showLoggedStamp {
                loggedStamp(accent: state.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    .allowsHitTesting(false)
                    .offset(x: dragOffset)
                    // Asymmetric on purpose: arriving still gets the small
                    // scale-up pop (it's a genuine "ta-da" moment), but
                    // leaving is a plain fade — direct feedback that the
                    // auto-dismiss read as an abrupt disappearance rather
                    // than settling away. Shrinking AND fading on the way
                    // out read as more of a "poof" than a fade.
                    .transition(.asymmetric(
                        insertion: .scale(scale: 0.92).combined(with: .opacity),
                        removal: .opacity
                    ))
            }
            CelebrationOverlay(trigger: celebrationTrigger, accent: state.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .allowsHitTesting(false)
        }
        // NO blanket .animation(_:value:) on this ZStack. There used to be
        // three, and they were the "everything refreshes and the words
        // minimize then reappear" report: .animation(_:value:) animates
        // EVERY change in its subtree whenever its value changes, so a
        // swipe that happened to flip isLogged (stepping off a logged
        // session) cross-faded the entire card — title, message, every
        // exercise row — on top of the swipe itself. Each one is now
        // scoped to just the thing it's actually meant to animate: the
        // rest timer's own ZStack below, and explicit withAnimation calls
        // around showLoggedStamp in the onChange handlers.
        .background(SessionColours.bg)
        // Measures the FULL card width — deliberately attached out here on
        // the outer ZStack, not on the swiping content further in (which
        // sits inside a VStack with its own .padding(20)). That used to be
        // where this was measured, which was a real bug, not just a
        // timing one: dragOffset got set to that PADDED width (screen
        // width minus 40pt) as "fully off-screen", but content that starts
        // inset by 20pt and only travels that padded distance lands with
        // its trailing edge back at x=20, not x=0 — a permanent 20pt
        // sliver of the old session left sitting on the edge every single
        // swipe, which then vanished the instant settle() reset the
        // offset. The completion-based commit fix elsewhere in this file
        // removed a separate timing race and made that jump feel
        // smoother, but couldn't fix this — the animation itself was
        // always landing short of the edge. Measuring the true,
        // unpadded width here clears the screen with a few pixels of
        // margin instead of exactly (and insufficiently) zero.
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { containerWidth = geo.size.width }
                    .onChange(of: geo.size.width) { _, new in containerWidth = new }
            }
        )
        // Only reachable via handleDoneTap's swap branch, so onTapDone is
        // never nil here in practice — the Button that leads to it exists
        // only `if let onTapDone`. Confirming re-runs the exact same
        // action the direct tap would have, just gated behind an extra
        // step.
        .confirmationDialog(
            "Log \(state.session.name) instead?",
            isPresented: $showSwapConfirm,
            titleVisibility: .visible
        ) {
            Button("Log \(state.session.name.uppercased())") { onTapDone?() }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let loggedSessionKey, let loggedName = state.bridge.sessionInfo(loggedSessionKey)?.name {
                Text("You already logged \(loggedName.uppercased()) today — this will replace it.")
            }
        }
        .sheet(isPresented: $showPlan) {
            PlanSheetView(bridge: state.bridge, block: state.block, today: state.today)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(accountEmail: accountEmail, onSignOut: onSignOut, onDeleteAccount: onDeleteAccount, onReplayTutorial: onReplayTutorial, profile: profile, onTrackChanged: onTrackChanged)
        }
        .fullScreenCover(isPresented: $showIntervalTimer) {
            IntervalTimerView(controller: intervalTimer, onDismiss: { showIntervalTimer = false })
        }
        .onAppear {
            restTimer.requestNotificationPermission()
            // Reopening straight onto an already-logged day is not a
            // celebration moment — cardMessage's own isLogged branch
            // already shows "LOGGED" immediately with no card needed.
            // showLoggedStamp defaults false and stays that way here on
            // purpose; only a fresh DONE (celebrationTrigger, below)
            // ever sets it true.
        }
        // The real handoff from peek to actual content: state.displayKey
        // catching up to what a swipe/tap already committed to is the
        // ONLY correct moment to drop the peek and zero the offset —
        // both show identical content right at this instant, so the
        // switch is invisible rather than a visible flash back to
        // whatever was showing before.
        .onChange(of: state.displayKey) { _, newKey in
            if pendingCommitKey == newKey { settle() }
        }
        // No .onChange(of: isLogged) here on purpose — there used to be
        // one, showing the big card any time isLogged flipped true
        // outside of a fresh DONE (backdating a day via the picker,
        // reopening onto one, browsing onto one). All three read as the
        // app re-celebrating something that already happened. The big
        // card is now ENTIRELY owned by celebrationTrigger below — the
        // one true "you just did this" moment — and cardMessage's
        // isLogged branch covers every other case with the small text.
        .onChange(of: celebrationTrigger) { _, _ in
            celebrating = true
            showLoggedStamp = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                celebrating = false
                withAnimation(.easeInOut(duration: 0.25)) { showLoggedStamp = true }
            }
        }
        // The big card is a moment, not a resting state — direct feedback:
        // it used to just sit there until you undid or navigated away,
        // which read as blocking the card rather than celebrating on it.
        // Reacts to showLoggedStamp itself rather than each of the several
        // places that set it true (a fresh DONE, reopening an already-
        // logged day, browsing onto one) — one handler covers all of them
        // uniformly instead of duplicating a timer at every call site.
        // Cancellable via a real Task, not a bare asyncAfter: an undo
        // immediately followed by a re-log within the window would
        // otherwise leave the FIRST completion's stale timer armed to
        // blow away the SECOND one's freshly-shown card early. Once this
        // fires, cardMessage's own isLogged branch is what's left on
        // screen — see its doc comment for why that's already wired up
        // rather than a second UI element.
        .onChange(of: showLoggedStamp) { _, isShowing in
            loggedStampDismissTask?.cancel()
            guard isShowing else { return }
            loggedStampDismissTask = Task {
                try? await Task.sleep(for: .seconds(2.5))
                guard !Task.isCancelled else { return }
                // 0.4s, not the snappier 0.25s used for UI feedback
                // elsewhere on this card — this is a settle, not a
                // response to input, and 0.25s read as too abrupt to
                // register as a fade at all.
                withAnimation(.easeInOut(duration: 0.4)) { showLoggedStamp = false }
            }
        }
    }

    /// Native equivalent of #sdots + #upnext in app.js, sharing a row same
    /// as the web app: every session stays reachable by hand (including the
    /// climbing ones decide() never recommends), tap to browse and preview
    /// a different one than the recommendation. Matches .sdot's own visual
    /// language exactly — outline-only by default (.sdot{border,
    /// background:none}), filled only for whichever one is actually on
    /// screen (.sdot.cur), with a separate outer ring marking the real
    /// recommendation (.sdot.rec::after) rather than native's previous
    /// small-dot-underneath approach. "Current" and "recommended" are
    /// independent signals — you can browse away from the recommendation
    /// without it stopping being the recommendation, mirrors `k===d.k &&
    /// !logged` exactly.
    private var sessionDots: some View {
        HStack(spacing: 10) {
            HStack(spacing: 9) {
                ForEach(EngineBridge.order, id: \.self) { key in
                    let varName = state.bridge.sessionColourVarName(key)
                    let colour = SessionColours.resolve(varName)
                    let isCurrent = key == effectiveDisplayKey
                    let isRecommended = key == state.decision.k && !todayIsLogged
                    Button(action: { animatedBrowse(to: key) }) {
                        ZStack {
                            if isRecommended {
                                Circle()
                                    .strokeBorder(colour, lineWidth: 1.5)
                                    .frame(width: 22, height: 22)
                            }
                            Circle()
                                .strokeBorder(isCurrent ? colour : SessionColours.s4, lineWidth: 1.5)
                                .background(Circle().fill(isCurrent ? colour : .clear))
                                .frame(width: 14, height: 14)
                        }
                        .frame(width: 22, height: 22)
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
            if let next = nextUp {
                // Stacked (label+dot above, name below) rather than one
                // long row — sharing a row with all 7 session dots leaves
                // this chip little horizontal room, which was truncating
                // longer session names ("MAX FING…"). Wrapping onto its
                // own two lines uses the empty space underneath instead.
                Button(action: { animatedBrowse(to: next.key) }) {
                    VStack(alignment: .trailing, spacing: 4) {
                        HStack(spacing: 6) {
                            Text("NEXT")
                                .font(AppFonts.mono(9, weight: .medium))
                                .foregroundStyle(SessionColours.faint)
                            Circle()
                                .fill(next.color)
                                .frame(width: 7, height: 7)
                        }
                        Text(next.name.uppercased())
                            .font(.system(size: 13.5, weight: .bold))
                            .foregroundStyle(SessionColours.dim)
                            .multilineTextAlignment(.trailing)
                            .lineLimit(2)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .tutorialTarget("sessionDots")
    }

    /// Mirrors #upnext in app.js exactly: EngineBridge.upNext() is
    /// tomorrow's real projected recommendation (see its own doc comment),
    /// not just "the next session type in a fixed list" — shown purely as
    /// a preview/shortcut, tapping it browses today's card to that session
    /// without implying today itself gets logged as anything.
    private var nextUp: (key: String, name: String, color: Color)? {
        guard let un = state.bridge.upNext(), let info = state.bridge.sessionInfo(un.key) else { return nil }
        return (un.key, info.name, SessionColours.resolve(state.bridge.sessionColourVarName(un.key)))
    }

    /// The persistent "you're done" state — distinct from
    /// CelebrationOverlay's particle burst, which fires once at the
    /// moment of logging and fades a couple seconds later. This is what
    /// the card looks like every other time you see it today: a clear,
    /// standing confirmation rather than a small strikethrough you could
    /// miss, replacing the old "Logged. " text prefix on cardMessage.
    /// Takes its accent rather than reading state.accent so the swipe
    /// peek can render its own — the stamp belongs to a specific session,
    /// not to the card in general.
    private func loggedStamp(accent: Color) -> some View {
        VStack(spacing: 10) {
            Text("LOGGED")
                .font(AppFonts.heading(38))
                .foregroundStyle(.white)
            Text("Nice work today.")
                .font(.system(size: 14))
                .foregroundStyle(SessionColours.dim)
            if let nextUp {
                Rectangle()
                    .fill(SessionColours.s3)
                    .frame(height: 1)
                    .padding(.vertical, 6)
                Text("TOMORROW")
                    .font(AppFonts.mono(10, weight: .bold))
                    .foregroundStyle(SessionColours.faint)
                    .tracking(1.2)
                Text(nextUp.name.uppercased())
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(nextUp.color)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 24)
        .frame(maxWidth: 300)
        .background(SessionColours.s1)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(accent.opacity(0.45), lineWidth: 1.5))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.35), radius: 16, y: 6)
    }

    /// A lightweight, non-interactive preview of the adjacent session,
    /// shown only while a swipe or a tap-driven browse is actively
    /// animating — title, subtitle, and plain exercise rows (no
    /// checkboxes, timers, or weight badges, since none of that is
    /// Reuses the exact same exerciseRow rendering the real content
    /// uses (just pointed at the peek session's own exercises/accent) —
    /// an earlier version rendered a stripped-down, title-only stand-in
    /// here instead, on the assumption it would only ever be on screen
    /// for a fraction of a second. In practice it stayed visible for the
    /// whole drag, so swapping to the REAL detailed rows the instant a
    /// swipe settled looked exactly like what it was: a simplified
    /// preview suddenly replaced by the real thing. Pixel-identical
    /// rendering is what actually makes that handoff invisible.
    /// allowsHitTesting(false) rather than threading a "read-only" flag
    /// through ExerciseRowView itself — simpler, and guarantees nothing
    /// in the peek is tappable regardless of what real content this
    /// happens to be a preview of.
    @ViewBuilder
    private func peekContent(_ peek: DailyCardState) -> some View {
        // Mirrors the real content's structure block for block — same
        // spacings, same message slot, same ScrollView wrapper, same
        // footer. Anything present there but missing here shifts
        // everything below it, and that shift is visible as a jump the
        // instant the real content takes over: the message block being
        // absent was exactly that, reported as the description text
        // appearing a beat late.
        let peekLogged = loggedSessionKey != nil && loggedSessionKey == peek.displayKey
        let msg = cardMessage(for: peek, isLogged: peekLogged)
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text(peek.session.name.uppercased())
                    .font(AppFonts.heading(32))
                    .foregroundStyle(.white)
                Text(peek.session.where_)
                    .font(AppFonts.mono(13, weight: .medium))
                    .foregroundStyle(peek.accent)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if !msg.isEmpty {
                        Text(msg)
                            .font(.system(size: 14, weight: peekLogged ? .semibold : .regular))
                            .foregroundStyle(peekLogged ? peek.accent : SessionColours.dim)
                    }
                    VStack(spacing: 0) {
                        ForEach(Array(peek.exercises.enumerated()), id: \.element.id) { index, ex in
                            exerciseRow(ex, accent: peek.accent, accentVarName: peek.accentVarName)
                            if index < peek.exercises.count - 1 {
                                Rectangle().fill(SessionColours.s2).frame(height: 1)
                            }
                        }
                    }
                    .opacity(peekLogged ? 0.35 : 1)

                    footer
                    if onTapDone != nil { Color.clear.frame(height: 64) }
                }
            }
            .scrollIndicators(.hidden)
            .scrollDisabled(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SessionColours.bg)
        .allowsHitTesting(false)
    }

    /// Swipe left/right anywhere on the card to step through
    /// EngineBridge.order — the same fixed session order sessionDots
    /// already browses by tap, just a second way to reach it. Wraps at
    /// both ends (rest -> max fingers, max fingers -> rest) rather than
    /// clamping — reversed from an earlier version that stopped dead at
    /// either end, per explicit feedback: a carousel that keeps going is
    /// what was actually wanted, not a hard stop with the dots row as the
    /// only way past it.
    ///
    /// A real finger-tracked drag, not a canned animation played after
    /// the gesture ends — reported as feeling laggy, "a delay between
    /// swiping and it moving". onChanged sets dragOffset directly (no
    /// animation — it should feel exactly as fast as the touch itself);
    /// onEnded is the only place anything gets animated, either
    /// completing the slide (past ~30% of the width) or springing back.
    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                guard onBrowse != nil else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                if !horizontalDragCommitted {
                    // Ambiguous small movements are left alone (no offset
                    // applied yet) so an ordinary vertical scroll attempt
                    // never gets grabbed as a swipe partway through it —
                    // only once a drag is unambiguously more horizontal
                    // than vertical does this claim the gesture for the
                    // rest of its lifetime.
                    guard abs(dx) > 12, abs(dx) > abs(dy) * 1.5 else { return }
                    horizontalDragCommitted = true
                    if let from = EngineBridge.order.firstIndex(of: effectiveDisplayKey) {
                        let count = EngineBridge.order.count
                        // + count before % wraps a step off either end back
                        // around instead of clamping — Swift's % can return
                        // a negative result for a negative left-hand side
                        // (e.g. -1 % 7 == -1, not 6), so the raw index has
                        // to be pushed positive first.
                        let toIndex = ((dx < 0 ? from + 1 : from - 1) + count) % count
                        let key = EngineBridge.order[toIndex]
                        peekKey = key
                        peekState = DailyCardState.load(bridge: state.bridge, displayKey: key)
                    }
                }
                dragOffset = dx
            }
            .onEnded { value in
                guard horizontalDragCommitted else { return }
                horizontalDragCommitted = false
                if let key = peekKey, abs(dragOffset) > containerWidth * 0.3 {
                    let goingNext = dragOffset < 0
                    withAnimation(.easeOut(duration: 0.2)) {
                        dragOffset = goingNext ? -containerWidth : containerWidth
                    } completion: {
                        commit(key: key)
                    }
                } else {
                    withAnimation(.interactiveSpring(response: 0.32, dampingFraction: 0.82)) {
                        dragOffset = 0
                    }
                    let capturedKey = peekKey
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
                        if peekKey == capturedKey { peekKey = nil; peekState = nil }
                    }
                }
            }
    }

    /// Matches the web app's .top row exactly: phase badge (an outlined
    /// pill, not filled — the accent shows in the text/border, not as a
    /// background) and the date, nothing else. "X/Y this week" used to
    /// live here too, but the web app never puts it in the top bar at all
    /// — it's plan-sheet-only content (see PlanSheetView's own "X of Y
    /// sessions into this week" line), so showing it twice was this native
    /// port's own addition, not something carried over from the original.
    private var header: some View {
        HStack {
            Button(action: { showPlan = true; onTutorialSignal?("phaseBadge") }) {
                HStack(spacing: 4) {
                    Text("\(state.phaseName.uppercased()) · WK \(state.block.w)" + (state.block.w == 4 ? " · DELOAD" : ""))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                }
                .font(AppFonts.mono(12, weight: .bold))
                .foregroundStyle(state.accent)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(SessionColours.s1)
                .overlay(Capsule().stroke(SessionColours.s3, lineWidth: 1))
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .tutorialTarget("phaseBadge")
            Spacer()
            Text(formattedDate)
                .font(AppFonts.mono(10.5, weight: .medium))
                .foregroundStyle(SessionColours.faint)
                .textCase(.uppercase)
            // Not gated on accountEmail the way the old person-icon button
            // was — the sets-counter preferences underneath are useful
            // regardless of sign-in state (sample/demo mode included), and
            // SettingsView itself only renders the ACCOUNT section when
            // there's actually an email to show.
            Button(action: { showSettings = true; onTutorialSignal?("settingsGear") }) {
                Image(systemName: "gearshape")
                    .font(.system(size: 17))
                    .foregroundStyle(SessionColours.dim)
            }
            .buttonStyle(.plain)
            .padding(.leading, 8)
            .tutorialTarget("settingsGear")
        }
    }

    private var formattedDate: String {
        let inFmt = DateFormatter()
        inFmt.locale = Locale(identifier: "en_US_POSIX")
        inFmt.dateFormat = "yyyy-MM-dd"
        guard let d = inFmt.date(from: state.today) else { return state.today }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.dateFormat = "EEE, d MMM"
        return out.string(from: d)
    }

    /// `accent`/`accentVarName` default to the current state's but can be
    /// overridden — peekContent below passes the PEEK session's own,
    /// since reusing this same real row rendering (rather than a
    /// simplified stand-in) is what makes the handoff from peek to real
    /// content at the end of a swipe invisible instead of a visible
    /// "suddenly the detail appears" jump.
    /// `isTutorialTickTarget` is only ever true for the FIRST row of the
    /// live card — tutorialTarget ids merge last-one-wins, so tagging
    /// every row's checkbox would leave the spotlight on whichever
    /// happened to render last rather than the one being taught. The
    /// swipe peek (the other caller) never passes it at all, for the
    /// same reason: two live "exerciseTick" anchors would fight.
    private func exerciseRow(_ ex: EngineBridge.RenderedExercise, accent: Color? = nil, accentVarName: String? = nil, isTutorialTickTarget: Bool = false) -> some View {
        ExerciseRowView(
            ex: ex, accent: accent ?? state.accent, accentVarName: accentVarName ?? state.accentVarName,
            isTicked: ticks.contains(ex.id), onToggleTick: onToggleTick, onTapWeight: onTapWeight,
            restTimer: restTimer, intervalTimer: intervalTimer,
            showIntervalTimer: $showIntervalTimer, leadingInt: Self.leadingInt,
            onTutorialSignal: onTutorialSignal, isTutorialTickTarget: isTutorialTickTarget
        )
    }

    private var footer: some View {
        Text(footerNote)
            .font(AppFonts.mono(10, weight: .medium))
            .foregroundStyle(SessionColours.faint)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 12)
    }
}

/// Direct feedback: "3 × 8" doesn't say which number is sets and which is
/// reps. Prescription text is free-form across templates.js/programs.js,
/// not structured {sets, reps} data, and genuinely inconsistent in ways
/// that make a blind "first number is always sets" transform actively
/// wrong for some real entries — "10s × 5" (a hold duration FIRST, sets
/// second) and "5 min on / 5 min off × 3" (a cycle description, no set
/// count up front at all) both exist in the real template data. So this
/// only touches the one pattern that's genuinely unambiguous: a plain
/// leading integer immediately followed by "×" (only whitespace allowed
/// between them, no "s" or other character) — checked against every real
/// prescription string in the template library, and independently
/// verified against this exact Swift implementation, before trusting it.
/// Anything else (durations-first, cycle descriptions, already-explicit
/// "3 sets" text) is left exactly as-is rather than risk a wrong label.
private func clarifySets(_ s: String) -> String {
    guard s.range(of: #"^\d+\s*×"#, options: .regularExpression) != nil,
          let crossRange = s.range(of: "×") else { return s }
    let count = s.prefix(while: \.isNumber)
    let rest = s[crossRange.lowerBound...].dropFirst() // everything after "×"
    return "\(count) sets ×\(rest)"
}

/// One exercise on the daily card. Owns its own local "show full detail"
/// toggle — purely ephemeral display state, nothing else on the card needs
/// to know about it — so title + prescription stay the only things visible
/// by default, matching the zero-narration standard the rest of the card
/// already holds itself to. The longer description (often several
/// sentences of sourced training-methodology reasoning — see
/// templates.js — that matters when reviewing a template, not when
/// actually doing the set) sits behind a small info toggle instead of
/// always being on screen.
private struct ExerciseRowView: View {
    let ex: EngineBridge.RenderedExercise
    let accent: Color
    let accentVarName: String
    let isTicked: Bool
    let onToggleTick: ((String) -> Void)?
    let onTapWeight: ((EngineBridge.RenderedExercise) -> Void)?
    let restTimer: RestTimerController
    let intervalTimer: IntervalTimerController
    @Binding var showIntervalTimer: Bool
    let leadingInt: (String) -> Int?
    var onTutorialSignal: ((String) -> Void)? = nil
    var isTutorialTickTarget: Bool = false

    @State private var showDetail = false
    /// Local, ephemeral, never synced — this is purely an in-session tally
    /// aid. The actually-persisted state is still just isTicked (via
    /// onToggleTick), same as before this existed; this only tracks
    /// progress TOWARD that, kept in sync with it below.
    @State private var completedSets = 0
    /// A real Button's tap recognizer fires on finger-lift regardless of
    /// .simultaneousGesture — so a long-press-to-undo (which completes
    /// at 0.45s, still held) was always immediately followed by the
    /// Button's own tap on release, silently re-adding the set it just
    /// removed. This flag is set only when the long-press actually
    /// undid something, and consumed by the very next tap so that one
    /// release doesn't double as a fresh tap. A genuine follow-up tap
    /// works normally straight after.
    @State private var suppressNextTap = false
    @AppStorage("setsCounterEnabled") private var setsCounterEnabled = false
    @AppStorage("autoStartRestOnTally") private var autoStartRestOnTally = false

    /// nil hides the tally entirely rather than guessing. leadingInt()
    /// ALONE isn't enough here — it just grabs a leading digit run with no
    /// check for what follows, so bare leadingInt("15 min") happily
    /// returns 15, which is exactly the bug a live check on the real
    /// sample data caught: a 15-MINUTE warm-up rendered a 15-pip tally.
    /// Two leading-number phrasings in the template library are
    /// unambiguously a set count: "N × ..." (e.g. "3 × 8") and bare
    /// "N sets"/"N supersets" (e.g. Wrist roller's "3 sets", Antagonists'
    /// "3 supersets") — checked against every real prescription string in
    /// the library before trusting it. A RANGE like "4–5 sets" does NOT
    /// match this (the en dash right after the digit isn't whitespace),
    /// which is the correct outcome — there's no single right pip count
    /// for a range. Those exercises are also already excluded by the
    /// ex.interval guard below regardless, since ranged set counts in
    /// this library only ever show up on interval exercises.
    /// Skipped for interval exercises too — those get their own
    /// full-screen set/rep tracking once started, so a second tally here
    /// would just be a redundant, out-of-sync copy of it.
    private var totalSets: Int? {
        guard ex.interval == nil,
              ex.prescription.range(of: #"^\d+\s*(?:×|(?:super)?sets?\b)"#, options: .regularExpression) != nil,
              let n = leadingInt(ex.prescription), n > 1
        else { return nil }
        return n
    }

    /// Matches .ex.checked exactly: ticking an exercise off doesn't just
    /// strike its title through, it collapses the WHOLE row down to just
    /// the checkbox + title — prescription, weight, description, and any
    /// timer button all disappear and the row's own padding tightens. The
    /// list visibly gets shorter as you go rather than every done row
    /// still taking full room, which is the actual point of it.
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if let onToggleTick {
                Button(action: { onToggleTick(ex.id); onTutorialSignal?("exerciseTick") }) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 3)
                            .strokeBorder(isTicked ? .clear : SessionColours.s4, lineWidth: 1.5)
                        if isTicked {
                            RoundedRectangle(cornerRadius: 3).fill(accent)
                            Image(systemName: "checkmark")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(SessionColours.bg)
                        }
                    }
                    .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
                .padding(.top, 1)
                .tutorialTarget(isTutorialTickTarget ? "exerciseTick" : nil)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    // 19px bold was sized to visually match the web app's
                    // 20px .en — but that's set in Barlow Condensed, a
                    // genuinely narrower typeface per point than the
                    // system font used here, so the same point size reads
                    // noticeably bigger and wraps far more eagerly on
                    // real exercise names ("ONE-ARM TRANSITION HOLDS" hit
                    // 3 lines). Direct feedback, confirmed live: pulled
                    // back until it stopped wrapping awkwardly. A real
                    // condensed font is a separate, later decision — see
                    // the same feedback for that.
                    Text(ex.title.uppercased())
                        .font(.system(size: 15.5, weight: .bold))
                        .foregroundStyle(isTicked ? SessionColours.faint : .white)
                        .strikethrough(isTicked)
                    if !isTicked, ex.description != nil {
                        Button(action: {
                            withAnimation(.easeInOut(duration: 0.15)) { showDetail.toggle() }
                            onTutorialSignal?("exerciseInfo")
                        }) {
                            Image(systemName: showDetail ? "info.circle.fill" : "info.circle")
                                .font(.system(size: 12))
                                .foregroundStyle(SessionColours.faint)
                        }
                        .buttonStyle(.plain)
                        .tutorialTarget(showDetail ? nil : "exerciseInfo")
                    }
                    if !isTicked {
                        Spacer()
                        // Inline with the prescription, not stacked under it —
                        // stacking made a weighted exercise's right-hand column
                        // two lines tall regardless of the title, so a short
                        // one-line title (e.g. "PINCH BLOCK") left a visibly
                        // empty gap below it before the next row started —
                        // more noticeable now the sets tally sits right there.
                        HStack(alignment: .center, spacing: 8) {
                            Text(clarifySets(ex.prescription))
                                .font(AppFonts.mono(12, weight: .medium))
                                .foregroundStyle(ex.phaseAdjusted ? accent : SessionColours.faint)
                                .multilineTextAlignment(.trailing)
                            if let kg = ex.weightKg {
                                weightBadge(kg: kg)
                            } else if ex.hasWeightTracking {
                                // No history yet, so target() returns nil and
                                // there's no number to show — but the badge IS
                                // the only way to open the weight editor, so
                                // rendering nothing here left a weight-tracked
                                // exercise with no way to record a first
                                // weight, ever. app.js has always handled this
                                // (`.wt.add`, a dashed "set kg" button); the
                                // native port just never carried that state
                                // over. Invisible until now only because every
                                // exercise on the built-in programs already had
                                // history from the web app — a brand-new
                                // account, or any newly-added exercise id, hits
                                // it immediately.
                                setWeightBadge()
                            }
                        }
                    }
                }
                if !isTicked {
                    if showDetail, let d = ex.description {
                        Text(d)
                            .font(.system(size: 12.5))
                            .foregroundStyle(SessionColours.dim)
                            .transition(.opacity)
                    }
                    if setsCounterEnabled, let totalSets {
                        setsTally(totalSets)
                    }
                    if let interval = ex.interval {
                        Button(action: {
                            let sets = leadingInt(ex.prescription) ?? 1
                            intervalTimer.start(
                                config: interval, setRestSecs: ex.restSeconds ?? 120,
                                sets: max(1, sets), label: ex.title
                            )
                            showIntervalTimer = true
                        }) {
                            Text("START")
                                .font(AppFonts.mono(10.5, weight: .semibold))
                                .foregroundStyle(SessionColours.bg)
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(accent)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 2)
                    } else if let r = ex.restSeconds {
                        Button(action: {
                            restTimer.start(secs: r, label: ex.title, colourHex: SessionColours.hex(accentVarName))
                            onTutorialSignal?("restTimerButton")
                        }) {
                            Text("Rest \(r / 60):\(String(format: "%02d", r % 60))")
                                .font(AppFonts.mono(10.5, weight: .medium))
                                .foregroundStyle(SessionColours.dim)
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(SessionColours.s3, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 2)
                        .tutorialTarget("restTimerButton")
                    }
                }
            }
        }
        .padding(.vertical, isTicked ? 11 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Ticking collapses the row substantially (hides prescription/
        // weight/description/timer, tightens padding) — without this it
        // was an instant snap, not the smooth collapse a "done" moment
        // should feel like. Lives here rather than at each call site's
        // state mutation so every current and future caller gets it for
        // free, not just whichever one remembered to wrap it.
        .animation(.easeInOut(duration: 0.2), value: isTicked)
        // Keeps the tally in sync with whichever side actually changed
        // isTicked — filling every pip below sets it via onToggleTick, but
        // the checkbox itself is still tappable directly too (bypassing
        // the tally entirely), and an external Undo can flip it back to
        // false. Either direction, the tally should reflect reality: full
        // when done, reset to zero the moment it isn't.
        .onChange(of: isTicked) { _, newValue in
            guard let totalSets else { return }
            completedSets = newValue ? totalSets : 0
        }
    }

    /// One tap zone for the whole row, not one per pip (that was an
    /// earlier version, reverted per direct feedback: "just one box, tap
    /// anywhere, count goes up").
    private func setsTally(_ totalSets: Int) -> some View {
        // Back to a real Button for the tap (proven reliable everywhere
        // else on this row — checkbox, info icon, weight badge, START/
        // Rest all use one), with a SEPARATE .simultaneousGesture for the
        // long-press layered on top, rather than one custom gesture doing
        // both. Two earlier approaches were tried and confirmed live not
        // to work through this card: SwiftUI's own
        // LongPressGesture.exclusively(before: TapGesture()), and a
        // single hand-timed DragGesture(minimumDistance: 0) — neither
        // fired at all (no undo, no fallback tap) even held for 1.5s.
        // Most likely cause: this row sits nested inside the card's own
        // swipe gesture AND the ScrollView's pan gesture, both already
        // DragGesture-based — a bare custom gesture here has to compete
        // with those directly, where a Button's own tap recognizer
        // apparently doesn't. .simultaneousGesture is explicitly "let
        // this recognize independently alongside whatever's already
        // there" rather than a second recognizer racing for exclusivity.
        Button(action: { tapTally(totalSets: totalSets) }) {
            HStack(spacing: 7) {
                ForEach(0..<totalSets, id: \.self) { i in
                    let lit = i < completedSets
                    Circle()
                        .strokeBorder(lit ? .clear : SessionColours.s4, lineWidth: 1.5)
                        .background(Circle().fill(lit ? accent : .clear))
                        .frame(width: 20, height: 20)
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle()) // the padded gaps between/around pips are tappable too, not just the circles themselves
        }
        .buttonStyle(.plain)
        // Long-press to remove the last completed set — direct feedback:
        // an earlier version made every pip its own tap target so you
        // could undo by tapping a lit one, but that got reverted for
        // being fussier than "one box, tap to add." This restores a
        // correction path without bringing that back — subtle by design,
        // no visible extra control, and it only needs to reach 0 not any
        // arbitrary index, so a single "remove the last one" action is
        // enough on its own.
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.45).onEnded { _ in
                if undoLastSet() { suppressNextTap = true }
            }
        )
        .padding(.top, 2)
        // Separate from the interval START / plain Rest button just
        // below this same row, not touching it — reported directly:
        // tapping for "just start the timer" landed on the tally instead
        // and added a set too. The two are already independent controls
        // (Rest/START never touches the tally), but the gap between them
        // had gotten tight enough on a real touchscreen to mis-tap,
        // right after an earlier fix deliberately tightened the gap
        // ABOVE the tally (title-to-tally) for a different, unrelated
        // reason. This widens only the gap below it, not both.
        .padding(.bottom, 6)
    }

    private func tapTally(totalSets: Int) {
        if suppressNextTap {
            suppressNextTap = false // this tap is the release from a long-press undo, not a real add
            return
        }
        guard completedSets < totalSets else { return } // already full — row will have collapsed via the tick below anyway
        completedSets += 1
        if autoStartRestOnTally, let r = ex.restSeconds {
            restTimer.start(secs: r, label: ex.title, colourHex: SessionColours.hex(accentVarName))
        }
        if completedSets >= totalSets, !isTicked {
            onToggleTick?(ex.id)
        }
    }

    /// Only reachable while the tally itself is visible, which only
    /// happens while isTicked is false (the row collapses and hides the
    /// tally the instant it flips true) — so there's no case in practice
    /// where completedSets can be undone out from under an
    /// already-ticked exercise; onToggleTick never needs calling here.
    @discardableResult
    private func undoLastSet() -> Bool {
        guard completedSets > 0 else { return false }
        completedSets -= 1
        return true
    }

    /// The empty-state twin of weightBadge below — dashed border and faint
    /// text, mirroring app.js's `.wt.add` styling, so it reads as "nothing
    /// recorded yet, tap to set" rather than as a real logged number.
    @ViewBuilder
    private func setWeightBadge() -> some View {
        let label = Text("SET kg")
            .font(AppFonts.mono(12, weight: .bold))
            .foregroundStyle(SessionColours.faint)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(SessionColours.s4, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            )
        if let onTapWeight {
            Button(action: { onTapWeight(ex) }) { label }.buttonStyle(.plain).tutorialTarget("weightBadge")
        } else {
            label
        }
    }

    @ViewBuilder
    private func weightBadge(kg: Double) -> some View {
        let label = Text("\(kg.formatted(.number.precision(.fractionLength(0...2))))kg")
            .font(AppFonts.mono(12, weight: .bold))
            .foregroundStyle(ex.weightIsBump ? accent : SessionColours.dim)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(SessionColours.s3)
            .clipShape(RoundedRectangle(cornerRadius: 4))
        if let onTapWeight {
            Button(action: { onTapWeight(ex) }) { label }.buttonStyle(.plain).tutorialTarget("weightBadge")
        } else {
            label
        }
    }
}

/// `onRetry`/`onSignOut` are optional only because the demo and tutorial
/// callers have nothing real to retry or sign out of. On the REAL signed-in
/// path both are supplied, and they matter: this view is shown as a whole
/// screen, replacing the card entirely, so without a control on it there is
/// literally nothing to press. One failed load — a dropped connection
/// mid-launch, a profile row the engine can't resolve — and the app was a
/// dead end that force-quitting couldn't fix if the cause persisted, with
/// no way to even sign out and try another account.
func engineBridgeErrorView(_ message: String, onRetry: (() -> Void)? = nil, onSignOut: (() -> Void)? = nil) -> some View {
    VStack(spacing: 10) {
        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        Text("Couldn't load").foregroundStyle(.white).font(.headline)
        Text(message)
            .font(.system(size: 12, design: .monospaced))
            .foregroundStyle(SessionColours.dim)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
        if onRetry != nil || onSignOut != nil {
            VStack(spacing: 14) {
                if let onRetry {
                    Button(action: onRetry) {
                        Text("TRY AGAIN")
                            .font(AppFonts.mono(13, weight: .bold))
                            .foregroundStyle(SessionColours.bg)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(SessionColours.fg)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
                if let onSignOut {
                    Button(action: onSignOut) {
                        Text("SIGN OUT")
                            .font(AppFonts.mono(12, weight: .bold))
                            .foregroundStyle(SessionColours.restC)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: 280)
            .padding(.top, 18)
        }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(SessionColours.bg)
}

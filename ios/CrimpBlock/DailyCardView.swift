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
    var ticks: Set<String> = []
    var onToggleTick: ((String) -> Void)? = nil
    var onTapWeight: ((EngineBridge.RenderedExercise) -> Void)? = nil
    var onTapDone: (() -> Void)? = nil
    var onBrowse: ((String) -> Void)? = nil
    var weekDays: [WeekDay] = []
    var onTapDay: ((String) -> Void)? = nil
    var accountEmail: String? = nil
    var onSignOut: (() -> Void)? = nil
    var celebrationTrigger: Int = 0
    /// Fired for the handful of interactions that don't already have an
    /// external hook of their own (onTapDone/onTapWeight cover the rest) —
    /// exists purely so TutorialOverlay's host can call
    /// TutorialController.handleTap(_:) when the phase badge, an
    /// exercise's info toggle, or its rest-timer button gets tapped. Every
    /// other caller can safely leave this nil.
    var onTutorialSignal: ((String) -> Void)? = nil
    @State private var showPlan = false
    @State private var showAccount = false
    @State private var restTimer = RestTimerController()
    @State private var intervalTimer = IntervalTimerController()
    @State private var showIntervalTimer = false
    /// Which edge new content enters from when browsing to a different
    /// session — updated right before every onBrowse call (swipe, a dot
    /// tap, or the NEXT chip) by comparing the target's position in
    /// EngineBridge.order against the current one, so a jump-to-tap gets
    /// the same sensible direction a swipe would: forward through the
    /// list slides in from the right, backward from the left.
    @State private var browseEdge: Edge = .trailing

    /// Every path that changes which session is showing goes through
    /// here rather than calling onBrowse directly, so the slide direction
    /// is never forgotten on one of the three call sites (swipe, dots,
    /// NEXT chip).
    private func browse(to key: String) {
        if let from = EngineBridge.order.firstIndex(of: state.displayKey),
           let to = EngineBridge.order.firstIndex(of: key) {
            browseEdge = to >= from ? .trailing : .leading
        }
        onBrowse?(key)
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
    private var cardMessage: String {
        let key = state.displayKey
        let isDeload = state.block.w == 4
        let isReturning = !isDeload && state.bridge.isReturning(state.today)

        var msg = ""
        if isDeload && key != "rest" {
            msg += "Deload week — " + (state.session.isClimb
                ? "fewer hard attempts, and stop well short of failure. Times below are already cut."
                : "same weights as usual, fewer sets. The numbers below are already cut.")
        } else if isReturning && key != "rest" {
            msg += "Easing back in after a break — weights are cut, not just sets. Go by feel: back off further if anything below feels off, this is not the week to chase the number."
        }
        if msg.isEmpty, !isLogged, let note = state.session.note {
            msg = note
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
                    // 18pt gap: this dot row and sessionDots below are
                    // both plain circular dots of a similar size, close
                    // enough in style that they read as one continuous
                    // strip rather than two separate controls without
                    // more separation than the header row alone gives.
                    WeekStripView(days: weekDays, onTapDay: onTapDay)
                        .padding(.bottom, 10)
                }
                header
                if onBrowse != nil { sessionDots }
                // Tagged with the session key as its identity: when that
                // changes (a swipe, a dot tap, NEXT), SwiftUI treats this
                // as a whole new view being inserted in place of the old
                // one rather than the same view quietly updating its
                // content — which is what actually makes .transition()
                // below fire instead of just snapping instantly. browseEdge
                // (set alongside every browse(to:) call) picks which side
                // it slides in from, so the animation always agrees with
                // which way you swiped instead of a fixed direction.
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(state.session.name.uppercased())
                            .font(AppFonts.heading(32))
                            .foregroundStyle(.white)
                        Text(state.session.where_)
                            .font(AppFonts.mono(13, weight: .medium))
                            .foregroundStyle(state.accent)
                    }
                    if !cardMessage.isEmpty {
                        Text(cardMessage)
                            .font(.system(size: 14, weight: isLogged ? .semibold : .regular))
                            .foregroundStyle(isLogged ? state.accent : SessionColours.dim)
                    }

                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            // Flat list with thin dividers between rows, matching
                            // .ex{border-bottom:1px solid var(--s2)} — the previous
                            // per-row card treatment (rounded background, gap
                            // between cards) was this native port's own addition,
                            // not something carried over from the original.
                            VStack(spacing: 0) {
                                ForEach(Array(state.exercises.enumerated()), id: \.element.id) { index, ex in
                                    exerciseRow(ex)
                                    if index < state.exercises.count - 1 {
                                        Rectangle().fill(SessionColours.s2).frame(height: 1)
                                    }
                                }
                            }
                            // Once today's logged, the exercise list reads as
                            // closed rather than just quietly unchanged —
                            // dimmed and untappable (ticking/timers/weights
                            // don't make sense to poke at anymore), with the
                            // LOGGED stamp doing the actual talking below.
                            // Still scrollable, so you can look back over what
                            // you did, just not interact with it — only UNDO
                            // (the actual escape hatch) stays fully live.
                            .opacity(isLogged ? 0.35 : 1)
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
                    .overlay {
                        if isLogged { loggedStamp.padding(.horizontal, 20) }
                    }
                    .animation(.easeInOut(duration: 0.25), value: isLogged)
                }
                .id(state.displayKey)
                .transition(.asymmetric(
                    insertion: .move(edge: browseEdge).combined(with: .opacity),
                    removal: .move(edge: browseEdge == .trailing ? .leading : .trailing).combined(with: .opacity)
                ))
            }
            .animation(.easeInOut(duration: 0.3), value: state.displayKey)
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
                Button(action: onTapDone) {
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
            if restTimer.endDate != nil {
                RestTimerOverlay(controller: restTimer, accent: state.accent, onTutorialSignal: onTutorialSignal)
                    .transition(.move(edge: .bottom))
            }
            CelebrationOverlay(trigger: celebrationTrigger, accent: state.accent, nextUp: nextUp)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .allowsHitTesting(false)
        }
        .animation(.easeInOut(duration: 0.2), value: restTimer.endDate != nil)
        .background(SessionColours.bg)
        .sheet(isPresented: $showPlan) {
            PlanSheetView(bridge: state.bridge, block: state.block, today: state.today)
        }
        .fullScreenCover(isPresented: $showIntervalTimer) {
            IntervalTimerView(controller: intervalTimer, onDismiss: { showIntervalTimer = false })
        }
        .onAppear { restTimer.requestNotificationPermission() }
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
                    let isCurrent = key == state.displayKey
                    let isRecommended = key == state.decision.k && !isLogged
                    Button(action: { browse(to: key) }) {
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
                Button(action: { browse(to: next.key) }) {
                    HStack(spacing: 6) {
                        Text("NEXT")
                            .font(AppFonts.mono(9, weight: .medium))
                            .foregroundStyle(SessionColours.faint)
                        Circle()
                            .fill(SessionColours.resolve(state.bridge.sessionColourVarName(next.key)))
                            .frame(width: 7, height: 7)
                        Text(next.name.uppercased())
                            .font(.system(size: 13.5, weight: .bold))
                            .foregroundStyle(SessionColours.dim)
                            .lineLimit(1)
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
    private var nextUp: (key: String, name: String)? {
        guard let un = state.bridge.upNext(), let info = state.bridge.sessionInfo(un.key) else { return nil }
        return (un.key, info.name)
    }

    /// The persistent "you're done" state — distinct from
    /// CelebrationOverlay's particle burst, which fires once at the
    /// moment of logging and fades a couple seconds later. This is what
    /// the card looks like every other time you see it today: a clear,
    /// standing confirmation rather than a small strikethrough you could
    /// miss, replacing the old "Logged. " text prefix on cardMessage.
    private var loggedStamp: some View {
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
                    .foregroundStyle(state.accent)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 24)
        .frame(maxWidth: 300)
        .background(SessionColours.s1)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(state.accent.opacity(0.45), lineWidth: 1.5))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.35), radius: 16, y: 6)
        .allowsHitTesting(false)
        .transition(.scale(scale: 0.92).combined(with: .opacity))
    }

    /// Swipe left/right anywhere on the card to step through
    /// EngineBridge.order — the same fixed session order sessionDots
    /// already browses by tap, just a second way to reach it. Clamped at
    /// the ends rather than wrapping: looping from "rest" back around to
    /// "max fingers" reads as a bug the first time it happens, not a
    /// feature, and the dots row is right there for jumping further.
    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                guard onBrowse != nil else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > 60, abs(dx) > abs(dy) * 1.5 else { return }
                guard let index = EngineBridge.order.firstIndex(of: state.displayKey) else { return }
                let nextIndex = dx < 0 ? index + 1 : index - 1
                guard EngineBridge.order.indices.contains(nextIndex) else { return }
                browse(to: EngineBridge.order[nextIndex])
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
            if let accountEmail {
                Button(action: { showAccount = true }) {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: 17))
                        .foregroundStyle(SessionColours.dim)
                }
                .buttonStyle(.plain)
                .padding(.leading, 8)
                .confirmationDialog(accountEmail, isPresented: $showAccount, titleVisibility: .visible) {
                    Button("Sign Out", role: .destructive) { onSignOut?() }
                }
            }
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

    private func exerciseRow(_ ex: EngineBridge.RenderedExercise) -> some View {
        ExerciseRowView(
            ex: ex, accent: state.accent, accentVarName: state.accentVarName,
            isTicked: ticks.contains(ex.id), onToggleTick: onToggleTick, onTapWeight: onTapWeight,
            restTimer: restTimer, intervalTimer: intervalTimer,
            showIntervalTimer: $showIntervalTimer, leadingInt: Self.leadingInt,
            onTutorialSignal: onTutorialSignal
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

    @State private var showDetail = false

    /// Matches .ex.checked exactly: ticking an exercise off doesn't just
    /// strike its title through, it collapses the WHOLE row down to just
    /// the checkbox + title — prescription, weight, description, and any
    /// timer button all disappear and the row's own padding tightens. The
    /// list visibly gets shorter as you go rather than every done row
    /// still taking full room, which is the actual point of it.
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if let onToggleTick {
                Button(action: { onToggleTick(ex.id) }) {
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
                        VStack(alignment: .trailing, spacing: 5) {
                            Text(clarifySets(ex.prescription))
                                .font(AppFonts.mono(12, weight: .medium))
                                .foregroundStyle(ex.phaseAdjusted ? accent : SessionColours.faint)
                                .multilineTextAlignment(.trailing)
                            if let kg = ex.weightKg {
                                weightBadge(kg: kg)
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

func engineBridgeErrorView(_ message: String) -> some View {
    VStack(spacing: 10) {
        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        Text("Couldn't load").foregroundStyle(.white).font(.headline)
        Text(message)
            .font(.system(size: 12, design: .monospaced))
            .foregroundStyle(SessionColours.dim)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(SessionColours.bg)
}

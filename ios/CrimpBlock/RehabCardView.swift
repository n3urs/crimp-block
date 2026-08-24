import SwiftUI

/// The rehab track's daily screen — the analog of DailyCardView, but for
/// RehabBridge's much simpler static-phase content rather than
/// EngineBridge's day-picking. No weekly calendar strip, no today's-session
/// picker, no deload/streak concepts — see Phase C.1 of the plan
/// (~/.claude/plans/moonlit-juggling-catmull.md, "Why this can't reuse
/// decide()/block()") for why rehab doesn't route through decide()/block()
/// at all. Shows the current phase's description, caution, exercises, and
/// a self-report checklist that gates an explicit "Advance to next phase"
/// action — progression here is entirely the user's own call, never a
/// calendar the way the standard engine's phases are.
///
/// Deliberately does NOT reuse DailyCardView's ExerciseRowView — that type
/// is coupled to a real assigned exercise's weight-tracking/sets-tally/
/// interval-timer machinery, none of which applies to a rehab exercise
/// (plain text prescription, sometimes a rest timer, nothing else). A
/// smaller dedicated row here stays visually consistent (same fonts/
/// colours) without forcing an ill-fitting reuse.
struct RehabCardView: View {
    let phase: RehabBridge.ResolvedPhase
    var footerNote: String = ""
    var accountEmail: String? = nil
    var onSignOut: (() -> Void)? = nil
    var onDeleteAccount: (() async throws -> Void)? = nil
    var onReplayTutorial: (() -> Void)? = nil
    var profile: NativeProfile? = nil
    var onTrackChanged: (() async -> Void)? = nil
    /// Called once every self-report criterion is checked and the user
    /// confirms — NativeAppView owns persisting the new phase index via
    /// NativeProfile.advanceRehabPhase(to:) and re-resolving; this view
    /// only reports the moment, not the mechanics.
    var onAdvance: (() -> Void)? = nil
    /// See DailyCardView's own onTutorialSignal doc — same purpose here
    /// for RehabTutorialView, a separate walkthrough for this screen
    /// (it's a different enough shape from the standard card that
    /// reusing TutorialDemoCardView's steps wouldn't point at anything
    /// real). Every other caller can safely leave this nil.
    var onTutorialSignal: ((String) -> Void)? = nil
    /// The current tutorial step's targetID, or nil outside the
    /// walkthrough — set by RehabTutorialView. Without this, a step whose
    /// real control sits below the fold (the checklist, on a phase with
    /// several exercises above it) gets spotlighted at a rect that's
    /// scrolled out of view, which reads as "no highlight at all" —
    /// reported directly on the checklistItem step. DailyCardView hasn't
    /// needed this: its own tutorial deliberately seeds a scenario where
    /// every target already fits on screen (see its own doc comment) —
    /// RehabCardView's content is more variable (any exercise count, any
    /// number of criteria), so scrolling to the target is the actually
    /// robust fix rather than re-curating content to dodge the issue.
    var tutorialScrollTarget: String? = nil

    /// Resets whenever the phase itself changes (see .onChange below) —
    /// a checked box from a PREVIOUS phase should never silently carry
    /// over and make the new phase's "Advance" button look ready when
    /// none of its own criteria have actually been confirmed yet.
    @State private var checked: Set<String> = []
    @State private var showSettings = false
    @State private var restTimer = RestTimerController()

    private var canAdvance: Bool {
        !phase.selfReportCriteria.isEmpty && phase.selfReportCriteria.allSatisfy { checked.contains($0) }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            SessionColours.bg.ignoresSafeArea()
            // header stays put; only the phase content below it scrolls —
            // same reasoning, and the same fix, as DailyCardView's own
            // header/ScrollView split ("Only the exercise list scrolls —
            // the header/dots/title stay put"). Originally had header
            // INSIDE the ScrollView here, which meant the settings gear —
            // the one thing you might want reachable from ANY scroll
            // position, not just the top — could itself scroll out of
            // view. Reported directly against the tutorial's settingsGear
            // step (no highlight visible, same root cause as the
            // checklist bug this fixed a moment earlier: a real target
            // scrolled out of frame, not a spotlight-rendering bug).
            VStack(alignment: .leading, spacing: 20) {
                header
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            phaseHeader
                            cautionBox
                            exercisesSection
                            if phase.isFinalPhase {
                                finalPhaseNote
                            } else {
                                checklistSection
                            }
                            if !footerNote.isEmpty {
                                Text(footerNote)
                                    .font(AppFonts.mono(9, weight: .medium))
                                    .foregroundStyle(SessionColours.faint)
                                    .padding(.top, 4)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, restTimer.endDate != nil ? 90 : 20)
                    }
                    .onChange(of: tutorialScrollTarget) { _, target in
                        guard let target else { return }
                        withAnimation { proxy.scrollTo(target, anchor: .center) }
                    }
                }
            }
            if restTimer.endDate != nil {
                RestTimerOverlay(controller: restTimer, accent: SessionColours.readyC)
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(accountEmail: accountEmail, onSignOut: onSignOut, onDeleteAccount: onDeleteAccount, onReplayTutorial: onReplayTutorial, profile: profile, onTrackChanged: onTrackChanged)
        }
        .onAppear { restTimer.requestNotificationPermission() }
        .onChange(of: phase.phaseId) { _, _ in checked = [] }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            HStack(spacing: 4) {
                Image(systemName: "bandage.fill")
                    .font(.system(size: 10))
                Text("REHAB · \(phase.areaName.uppercased())")
            }
            .font(AppFonts.mono(12, weight: .bold))
            .foregroundStyle(SessionColours.readyC)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(SessionColours.s1)
            .overlay(Capsule().stroke(SessionColours.s3, lineWidth: 1))
            .clipShape(Capsule())
            Spacer()
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

    // MARK: - Phase

    private var phaseHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PHASE \(phase.phaseIndex + 1) OF \(4) · \(phase.phaseName.uppercased())")
                .font(AppFonts.mono(10.5, weight: .bold))
                .foregroundStyle(SessionColours.faint)
                .tracking(1)
            Text(phase.cue)
                .font(AppFonts.heading(22))
                .foregroundStyle(SessionColours.fg)
            Text(phase.description)
                .font(.system(size: 14))
                .foregroundStyle(SessionColours.dim)
        }
    }

    private var cautionBox: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 13))
                .foregroundStyle(SessionColours.readyC)
                .padding(.top, 1)
            Text(phase.caution)
                .font(.system(size: 12.5))
                .foregroundStyle(SessionColours.dim)
        }
        .padding(14)
        .background(SessionColours.s1)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(SessionColours.readyC.opacity(0.35), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Exercises

    private var exercisesSection: some View {
        // Only the FIRST exercise carrying a rest timer gets tagged —
        // tutorialTarget ids merge by "last one wins" (see
        // TutorialAnchorKey's reduce), so tagging every rest button with
        // the same id would spotlight whichever renders last, not
        // necessarily a real one worth demonstrating.
        let firstRestExerciseID = phase.exercises.first(where: { ($0.restSeconds ?? 0) > 0 })?.id
        return VStack(alignment: .leading, spacing: 12) {
            ForEach(phase.exercises) { ex in
                exerciseRow(ex, isTutorialRestTarget: ex.id == firstRestExerciseID)
            }
        }
    }

    private func exerciseRow(_ ex: EngineBridge.RenderedExercise, isTutorialRestTarget: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(ex.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SessionColours.fg)
                Spacer()
                Text(ex.prescription)
                    .font(AppFonts.mono(13, weight: .medium))
                    .foregroundStyle(SessionColours.dim)
            }
            if let description = ex.description {
                Text(description)
                    .font(.system(size: 12.5))
                    .foregroundStyle(SessionColours.faint)
            }
            if let restSeconds = ex.restSeconds, restSeconds > 0 {
                Button(action: {
                    restTimer.start(secs: restSeconds, label: ex.title, colourHex: SessionColours.hex("--gorse"))
                    if isTutorialRestTarget { onTutorialSignal?("restTimerButton") }
                }) {
                    Text("REST \(restSeconds / 60):\(String(format: "%02d", restSeconds % 60))")
                        .font(AppFonts.mono(11, weight: .bold))
                        .foregroundStyle(SessionColours.dim)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(SessionColours.s3, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
                .tutorialTarget(isTutorialRestTarget ? "restTimerButton" : nil)
            }
        }
        .padding(14)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        // Only the tagged row gets an explicit .id() — every row already
        // has its own identity via ForEach's Identifiable conformance
        // (ex.id), so giving every OTHER row the same extra `.id(nil)`
        // here would collide them onto one shared identity and confuse
        // SwiftUI's diffing. The whole row, not just the button, so
        // scrollTo(_:anchor:.center) brings the full exercise into view.
        .modifier(OptionalScrollID(id: isTutorialRestTarget ? "restTimerButton" : nil))
    }

    // MARK: - Self-report checklist

    private var checklistSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("READY FOR THE NEXT PHASE?")
                .font(AppFonts.mono(11, weight: .bold))
                .foregroundStyle(SessionColours.faint)
                .tracking(1.2)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(phase.selfReportCriteria.enumerated()), id: \.element) { index, criterion in
                    Button(action: { toggle(criterion); if index == 0 { onTutorialSignal?("checklistItem") } }) {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: checked.contains(criterion) ? "checkmark.square.fill" : "square")
                                .font(.system(size: 17))
                                .foregroundStyle(checked.contains(criterion) ? SessionColours.readyC : SessionColours.faint)
                            Text(criterion)
                                .font(.system(size: 14))
                                .foregroundStyle(SessionColours.fg)
                            Spacer(minLength: 0)
                        }
                    }
                    .buttonStyle(.plain)
                    .tutorialTarget(index == 0 ? "checklistItem" : nil)
                    .modifier(OptionalScrollID(id: index == 0 ? "checklistItem" : nil))
                }
            }
            .padding(14)
            .background(SessionColours.s1)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Button(action: { onAdvance?() }) {
                Text("ADVANCE TO NEXT PHASE")
                    .font(AppFonts.mono(13, weight: .bold))
                    .foregroundStyle(canAdvance ? SessionColours.bg : SessionColours.faint)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(canAdvance ? SessionColours.readyC : SessionColours.s1)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .disabled(!canAdvance)
        }
    }

    private var finalPhaseNote: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("FINAL PHASE")
                .font(AppFonts.mono(11, weight: .bold))
                .foregroundStyle(SessionColours.faint)
                .tracking(1.2)
            Text("Once you're confidently back to full training, switch back to your regular program from Settings.")
                .font(.system(size: 13))
                .foregroundStyle(SessionColours.dim)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func toggle(_ criterion: String) {
        if checked.contains(criterion) { checked.remove(criterion) } else { checked.insert(criterion) }
    }
}

/// Applies `.id(id)` only when `id` is non-nil, leaving the view's
/// identity as whatever its parent ForEach already gives it otherwise —
/// unlike `.tutorialTarget(_:)` (which is a no-op preference write when
/// nil, harmless to apply everywhere), `.id(_:)` sets real SwiftUI view
/// identity, so giving every non-target sibling row the SAME `.id(nil)`
/// would collide them onto one shared identity and break diffing for the
/// whole list. Conditionally skipping the modifier entirely, rather than
/// passing an optional value into it, is what avoids that.
private struct OptionalScrollID: ViewModifier {
    let id: String?
    func body(content: Content) -> some View {
        if let id {
            content.id(id)
        } else {
            content
        }
    }
}

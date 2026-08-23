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
    var profile: NativeProfile? = nil
    var onTrackChanged: (() async -> Void)? = nil
    /// Called once every self-report criterion is checked and the user
    /// confirms — NativeAppView owns persisting the new phase index via
    /// NativeProfile.advanceRehabPhase(to:) and re-resolving; this view
    /// only reports the moment, not the mechanics.
    var onAdvance: (() -> Void)? = nil

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
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
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
                .padding(20)
                .padding(.bottom, restTimer.endDate != nil ? 90 : 20)
            }
            if restTimer.endDate != nil {
                RestTimerOverlay(controller: restTimer, accent: SessionColours.readyC)
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(accountEmail: accountEmail, onSignOut: onSignOut, profile: profile, onTrackChanged: onTrackChanged)
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
            Button(action: { showSettings = true }) {
                Image(systemName: "gearshape")
                    .font(.system(size: 17))
                    .foregroundStyle(SessionColours.dim)
            }
            .buttonStyle(.plain)
            .padding(.leading, 8)
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
        VStack(alignment: .leading, spacing: 12) {
            ForEach(phase.exercises) { ex in
                exerciseRow(ex)
            }
        }
    }

    private func exerciseRow(_ ex: EngineBridge.RenderedExercise) -> some View {
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
                }) {
                    Text("REST \(restSeconds / 60):\(String(format: "%02d", restSeconds % 60))")
                        .font(AppFonts.mono(11, weight: .bold))
                        .foregroundStyle(SessionColours.dim)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(SessionColours.s3, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
        .padding(14)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Self-report checklist

    private var checklistSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("READY FOR THE NEXT PHASE?")
                .font(AppFonts.mono(11, weight: .bold))
                .foregroundStyle(SessionColours.faint)
                .tracking(1.2)
            VStack(alignment: .leading, spacing: 10) {
                ForEach(phase.selfReportCriteria, id: \.self) { criterion in
                    Button(action: { toggle(criterion) }) {
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

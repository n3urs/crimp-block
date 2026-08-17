import SwiftUI

/// Everything needed to render one day's card, already resolved through
/// EngineBridge — shared between NativeEngineDemoView (seeded sample data)
/// and NativeAppView (real Supabase-backed data), so the two don't drift
/// into two different renderings of the same thing.
struct DailyCardState {
    let today: String
    let decision: EngineBridge.Decision
    let block: EngineBridge.BlockInfo
    let phaseName: String
    let session: EngineBridge.SessionInfo
    let exercises: [EngineBridge.RenderedExercise]
    let accent: Color

    static func load(bridge: EngineBridge) -> DailyCardState? {
        let today = bridge.today()
        guard let d = bridge.decide(date: today),
              let b = bridge.block(date: today),
              let phase = bridge.phaseNameAt(today),
              let info = bridge.sessionInfo(d.k) else { return nil }

        var accent = SessionColours.resolve("--gorse")
        // The session's own colour lives in programs.js as e.g. "--gorse" —
        // same lookup app.js does via v(s.c), just against the native
        // palette instead of computed CSS.
        if let c = bridge.program.forProperty("sessions")?.forProperty(d.k)?.forProperty("c")?.toString() {
            accent = SessionColours.resolve(c)
        }

        return DailyCardState(
            today: today, decision: d, block: b, phaseName: phase, session: info,
            exercises: bridge.resolveExercises(for: d.k, date: today, phaseName: phase),
            accent: accent
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

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    VStack(alignment: .leading, spacing: 4) {
                        Text(state.session.name.uppercased())
                            .font(.system(size: 32, weight: .heavy))
                            .foregroundStyle(.white)
                            .strikethrough(isLogged, color: state.accent)
                        Text(state.session.where_)
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundStyle(state.accent)
                    }
                    if isLogged {
                        Text("Logged.")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(state.accent)
                    } else if let note = state.session.note {
                        Text(note)
                            .font(.system(size: 14))
                            .foregroundStyle(SessionColours.dim)
                    }
                    Text(state.decision.why)
                        .font(.system(size: 12))
                        .foregroundStyle(SessionColours.faint)
                        .italic()

                    VStack(spacing: 10) {
                        ForEach(state.exercises) { ex in
                            exerciseRow(ex)
                        }
                    }

                    footer
                    if onTapDone != nil { Color.clear.frame(height: 64) } // room for the floating button
                }
                .padding(20)
            }
            if let onTapDone {
                Button(action: onTapDone) {
                    Text(isLogged ? "UNDO" : "DONE THIS WORKOUT")
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundStyle(isLogged ? SessionColours.dim : SessionColours.bg)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(isLogged ? SessionColours.s2 : state.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(16)
            }
        }
        .background(SessionColours.bg)
    }

    private var header: some View {
        HStack {
            Text("\(state.phaseName.uppercased()) · WK \(state.block.w)" + (state.block.w == 4 ? " · DELOAD" : ""))
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(SessionColours.bg)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(state.accent)
                .clipShape(Capsule())
            Spacer()
            Text("\(state.block.done)/\(state.block.per) this week")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(SessionColours.faint)
        }
    }

    private func exerciseRow(_ ex: EngineBridge.RenderedExercise) -> some View {
        HStack(alignment: .top, spacing: 10) {
            if let onToggleTick {
                Button(action: { onToggleTick(ex.id) }) {
                    Image(systemName: ticks.contains(ex.id) ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundStyle(ticks.contains(ex.id) ? state.accent : SessionColours.faint)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(ex.title.uppercased())
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                    Spacer()
                    Text(ex.prescription)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(ex.phaseAdjusted ? state.accent : SessionColours.faint)
                    if let kg = ex.weightKg {
                        weightBadge(kg: kg, ex: ex)
                    }
                }
                if let d = ex.description {
                    Text(d)
                        .font(.system(size: 12.5))
                        .foregroundStyle(SessionColours.dim)
                }
                if let r = ex.restSeconds {
                    Text("Rest \(r / 60):\(String(format: "%02d", r % 60))")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(SessionColours.faint)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func weightBadge(kg: Double, ex: EngineBridge.RenderedExercise) -> some View {
        let label = Text("\(kg.formatted(.number.precision(.fractionLength(0...2))))kg")
            .font(.system(size: 12, weight: .bold, design: .monospaced))
            .foregroundStyle(ex.weightIsBump ? state.accent : SessionColours.dim)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(SessionColours.s3)
            .clipShape(RoundedRectangle(cornerRadius: 4))
        return Group {
            if let onTapWeight {
                Button(action: { onTapWeight(ex) }) { label }.buttonStyle(.plain)
            } else {
                label
            }
        }
    }

    private var footer: some View {
        Text(footerNote)
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(SessionColours.faint)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 12)
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

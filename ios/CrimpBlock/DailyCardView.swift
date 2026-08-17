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

struct DailyCardView: View {
    let state: DailyCardState
    var footerNote: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                VStack(alignment: .leading, spacing: 4) {
                    Text(state.session.name.uppercased())
                        .font(.system(size: 32, weight: .heavy))
                        .foregroundStyle(.white)
                    Text(state.session.where_)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(state.accent)
                }
                if let note = state.session.note {
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
            }
            .padding(20)
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
                    Text("\(kg.formatted(.number.precision(.fractionLength(0...2))))kg")
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundStyle(ex.weightIsBump ? state.accent : SessionColours.dim)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(SessionColours.s3)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
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
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 10))
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

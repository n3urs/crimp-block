import SwiftUI

/// Native equivalent of showPlan()/showPhase() in app.js — tapping the
/// phase/week badge on the daily card opens this. Same content: overall
/// block progress, the current phase's own progress, the "coming back"
/// taper card when returning from a layoff, and a tappable list of every
/// phase showing what changes in each (derived from `ph` overrides, same
/// as the web version, so it can't drift from what resolveEx() applies).
struct PlanSheetView: View {
    let bridge: EngineBridge
    let block: EngineBridge.BlockInfo
    let today: String
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPhase: EngineBridge.Phase?

    private var phases: [EngineBridge.Phase] { bridge.phases }
    private var currentIndex: Int { bridge.phaseIndexAt(block: block.b) }
    private var current: EngineBridge.Phase? { phases.indices.contains(currentIndex) ? phases[currentIndex] : nil }

    var body: some View {
        NavigationStack {
            ZStack {
                SessionColours.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        overallBar
                        if let current { currentCard(current) }
                        Text(block.over
                            ? "You've worked through all six blocks — the structured plan is complete. It doesn't stop or reset: you now hold here indefinitely, still on the same 4-week rhythm with a deload every fourth trained week."
                            : "A week advances when you've banked \(block.per) sessions that carried load — not every 7 days. Take a fortnight off and you pick up exactly where you left off. Four weeks make a block, and every fourth week is a deload.")
                            .font(.system(size: 13.5))
                            .foregroundStyle(SessionColours.dim)

                        if let ret = bridge.returnInfo(date: today) {
                            comingBackCard(ret)
                        }

                        VStack(spacing: 8) {
                            ForEach(Array(phases.enumerated()), id: \.element.id) { i, phase in
                                Button(action: { selectedPhase = phase }) {
                                    phaseRow(phase, isCurrent: i == currentIndex)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("The Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(SessionColours.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .sheet(item: $selectedPhase) { phase in
                PhaseDetailView(bridge: bridge, phase: phase, isCurrent: phase.id == current?.id, block: block)
            }
        }
    }

    private var overallBar: some View {
        HStack(spacing: 3) {
            ForEach(1...6, id: \.self) { b in
                let frac = max(0, min(1, (Double(block.wIdx) - Double(b - 1) * 4) / 4))
                let colour = b <= phases.count ? SessionColours.resolve(phases.last(where: { $0.from <= b })?.c ?? "--gorse") : SessionColours.s3
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        SessionColours.s2
                        colour.frame(width: geo.size.width * frac)
                    }
                }
                .frame(height: 6)
                .clipShape(RoundedRectangle(cornerRadius: 3))
            }
        }
    }

    private func currentCard(_ phase: EngineBridge.Phase) -> some View {
        let accent = SessionColours.resolve(phase.c)
        return VStack(alignment: .leading, spacing: 8) {
            Text("\(phase.n.uppercased()) · \(block.over ? "ONGOING" : "BLOCK \(block.b)") · WEEK \(block.w)" + (block.w == 4 ? " · DELOAD" : ""))
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(accent)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    SessionColours.s2
                    accent.frame(width: geo.size.width * min(1, Double(block.done) / Double(max(block.per, 1))))
                }
            }
            .frame(height: 8)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            Text("\(block.done) of \(block.per) sessions into this week · \(block.total) logged since you started")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(SessionColours.faint)
        }
        .padding(14)
        .background(SessionColours.s1)
        .overlay(Rectangle().fill(accent).frame(width: 3), alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func comingBackCard(_ ret: EngineBridge.ReturnInfo) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("COMING BACK")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(SessionColours.dim)
            Text("\(ret.gap) days off, back since \(ret.resumed) — session \(ret.session) of 2 in the taper. Weights are cut and volume is trimmed. Normal prescriptions from the session after this.")
                .font(.system(size: 13.5))
                .foregroundStyle(SessionColours.dim)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func phaseRow(_ phase: EngineBridge.Phase, isCurrent: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(phase.n.uppercased())
                    .font(.system(size: 15, weight: .bold))
                Text((isCurrent ? "NOW · " : "") + bridge.phaseRange(phases.firstIndex(where: { $0.id == phase.id }) ?? 0))
                    .font(.system(size: 11, design: .monospaced))
                    .opacity(0.7)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 12)).opacity(0.4)
        }
        .foregroundStyle(isCurrent ? SessionColours.resolve(phase.c) : SessionColours.dim)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .opacity(isCurrent ? 1 : 0.75)
    }
}

private struct PhaseDetailView: View {
    let bridge: EngineBridge
    let phase: EngineBridge.Phase
    let isCurrent: Bool
    let block: EngineBridge.BlockInfo
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                SessionColours.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(phase.d)
                            .font(.system(size: 14))
                            .foregroundStyle(SessionColours.dim)

                        let changes = bridge.phaseChanges(phase.n)
                        Text("WHAT CHANGES IN THIS PHASE")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(SessionColours.faint)
                        if changes.isEmpty {
                            Text("Sessions run at their standard prescriptions — this is the phase the others are written against.")
                                .font(.system(size: 13.5))
                                .foregroundStyle(SessionColours.dim)
                        } else {
                            VStack(spacing: 8) {
                                ForEach(Array(changes.enumerated()), id: \.offset) { _, c in
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack {
                                            Text(c.title.uppercased()).font(.system(size: 13, weight: .semibold))
                                            Spacer()
                                            Text(c.sessionName).font(.system(size: 10, design: .monospaced)).foregroundStyle(SessionColours.faint)
                                        }
                                        Text(c.prescription)
                                            .font(.system(size: 12, design: .monospaced))
                                            .foregroundStyle(SessionColours.resolve(phase.c))
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(12)
                                    .background(SessionColours.s1)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle(phase.n)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(SessionColours.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }
}

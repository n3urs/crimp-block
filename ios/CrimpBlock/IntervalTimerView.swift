import SwiftUI

/// Native equivalent of the full-screen .ivt overlay in index.html — same
/// green/red/amber traffic-light metaphor (ready = amber, hang/on = green,
/// rest/off = red), same big countdown number, same status line. Presented
/// full-screen since this is meant to run unattended while hanging off a
/// board looking at your hand, not glancing at a small in-card widget.
struct IntervalTimerView: View {
    @Bindable var controller: IntervalTimerController
    var onDismiss: () -> Void

    private var phaseColour: Color {
        switch controller.phase {
        case .ready: return SessionColours.readyC
        case .on: return SessionColours.go
        case .off, .setrest: return SessionColours.restC
        case .done: return SessionColours.go
        case nil: return SessionColours.bg
        }
    }

    var body: some View {
        ZStack {
            // Matches .ivt{transition:background .2s ease} — without this
            // the background snapped instantly between green/red/amber on
            // every phase change instead of crossfading.
            phaseColour.ignoresSafeArea()
                .animation(.easeInOut(duration: 0.2), value: controller.phase)

            VStack(spacing: 18) {
                Spacer()

                if controller.phase == .done {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.white)
                } else {
                    Text(fmt(controller.remainingSeconds))
                        .font(.system(size: 96, weight: .heavy, design: .monospaced))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.default, value: controller.remainingSeconds)
                }

                Text(controller.statusText)
                    .font(.system(size: 15, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.85))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                Text(controller.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))

                Spacer()

                if controller.phase != .done {
                    // Progress within the current phase segment, resets each
                    // ready/on/off/setrest step — mirrors #ivtBar's scaleX.
                    GeometryReader { geo in
                        let fraction = controller.tTot > 0 ? Double(controller.remainingSeconds) / Double(controller.tTot) : 0
                        ZStack(alignment: .leading) {
                            Color.white.opacity(0.25)
                            Color.white.frame(width: geo.size.width * max(0, min(1, fraction)))
                        }
                    }
                    .frame(height: 5)
                    .clipShape(RoundedRectangle(cornerRadius: 2.5))
                    .padding(.horizontal, 32)

                    Button(action: { controller.stop(); onDismiss() }) {
                        Text("STOP")
                            .font(.system(size: 13, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 24).padding(.vertical, 12)
                            .background(.white.opacity(0.15))
                            .clipShape(Capsule())
                    }
                    .padding(.top, 8)
                }

                Spacer()
            }
            .padding(.bottom, 24)
        }
        .onChange(of: controller.phase) { _, newPhase in
            if newPhase == nil { onDismiss() }
        }
    }

    private func fmt(_ secs: Int) -> String {
        "\(secs / 60):\(String(format: "%02d", secs % 60))"
    }
}

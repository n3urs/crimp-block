import SwiftUI

/// Native equivalent of the full-screen .ivt overlay in index.html — same
/// green/red/amber traffic-light metaphor (ready = amber, hang/on = green,
/// rest/off = red), same big countdown number, same status line. Presented
/// full-screen since this is meant to run unattended while hanging off a
/// board looking at your hand, not glancing at a small in-card widget.
struct IntervalTimerView: View {
    @Bindable var controller: IntervalTimerController
    var onDismiss: () -> Void

    @State private var now = Date()
    private let tick = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()

    /// remainingSeconds only changes once a whole second (it's the
    /// ceiling-rounded value used for the big number), which made the
    /// progress bar visibly step rather than drain continuously. This
    /// computes sub-second precision from tEnd instead, same pattern
    /// RestTimerOverlay already uses for its own bar. Frozen on the
    /// paused snapshot rather than live time while isPaused — tEnd itself
    /// doesn't move during a pause, so measuring straight against
    /// wall-clock `now` would keep draining the bar even though the
    /// countdown itself has stopped.
    private var smoothFraction: Double {
        guard controller.tTot > 0 else { return 0 }
        if controller.isPaused {
            return Double(controller.remainingSeconds) / Double(controller.tTot)
        }
        let remaining = max(0, controller.tEnd.timeIntervalSince(now))
        return min(1, remaining / Double(controller.tTot))
    }

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
                        .font(AppFonts.timerDigits(168))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5) // room to shrink on a narrower phone rather than clip
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.default, value: controller.remainingSeconds)
                }

                Text(controller.isPaused ? "PAUSED" : controller.statusText)
                    .font(AppFonts.mono(15, weight: .bold))
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
                        ZStack(alignment: .leading) {
                            Color.white.opacity(0.25)
                            Color.white.frame(width: geo.size.width * smoothFraction)
                        }
                    }
                    .frame(height: 5)
                    .clipShape(RoundedRectangle(cornerRadius: 2.5))
                    .padding(.horizontal, 32)

                    HStack(spacing: 12) {
                        Button(action: { controller.togglePause() }) {
                            Text(controller.isPaused ? "RESUME" : "PAUSE")
                                .font(AppFonts.mono(13, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 24).padding(.vertical, 12)
                                .background(.white.opacity(0.15))
                                .clipShape(Capsule())
                        }
                        Button(action: { controller.stop(); onDismiss() }) {
                            Text("STOP")
                                .font(AppFonts.mono(13, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 24).padding(.vertical, 12)
                                .background(.white.opacity(0.15))
                                .clipShape(Capsule())
                        }
                    }
                    .padding(.top, 8)
                }

                Spacer()
            }
            .padding(.bottom, 24)
            .onReceive(tick) { now = $0 }
        }
        // Sits above the ready/on/off/setrest cues on the outer ZStack
        // (not the inner VStack's own content flow) so it stays fixed in
        // the corner regardless of phase, and stays clear of the status
        // bar/notch by not opting into ignoresSafeArea the way the
        // background colour does.
        .overlay(alignment: .topTrailing) {
            if controller.phase != .done {
                Button(action: { controller.isMuted.toggle() }) {
                    Image(systemName: controller.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(.white.opacity(0.15))
                        .clipShape(Circle())
                }
                .padding(.top, 8)
                .padding(.trailing, 16)
            }
        }
        .onChange(of: controller.phase) { _, newPhase in
            if newPhase == nil { onDismiss() }
        }
    }

    private func fmt(_ secs: Int) -> String {
        "\(secs / 60):\(String(format: "%02d", secs % 60))"
    }
}

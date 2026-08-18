import SwiftUI

/// Native equivalent of the plain rest-timer bar (#tm in index.html) — a
/// full-width bar fixed to the bottom, not a floating card: a 3px progress
/// strip flush with the top edge, then a big countdown number, the label,
/// and a text "Stop" button, matching #tmbar/.tmin/.tmn/.tml/.tmx exactly.
/// Shown while RestTimerController has an active endDate. The Live
/// Activity (Lock Screen / Dynamic Island) is a separate, parallel display
/// of the same countdown, driven by the same controller — this is just
/// the in-app one.
struct RestTimerOverlay: View {
    @Bindable var controller: RestTimerController
    var accent: Color
    /// See DailyCardView's own onTutorialSignal doc — the tutorial needs to
    /// know when STOP gets tapped so it can advance past this timer instead
    /// of leaving it running and covering the Done button spotlight below.
    var onTutorialSignal: ((String) -> Void)? = nil

    @State private var now = Date()
    private let tick = Timer.publish(every: 0.2, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if let endDate = controller.endDate {
                let remaining = max(0, endDate.timeIntervalSince(now))
                let fraction = controller.totalSeconds > 0 ? remaining / Double(controller.totalSeconds) : 0

                VStack(spacing: 0) {
                    GeometryReader { geo in
                        accent.frame(width: geo.size.width * fraction)
                    }
                    .frame(height: 3)
                    HStack(alignment: .center, spacing: 16) {
                        Text(format(remaining))
                            .font(.system(size: 34, weight: .bold, design: .monospaced))
                            .foregroundStyle(accent)
                        Text(controller.label.uppercased())
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(SessionColours.faint)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Button(action: {
                            controller.end(cancelNotification: true)
                            onTutorialSignal?("restTimerStop")
                        }) {
                            Text("STOP")
                                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                .foregroundStyle(SessionColours.dim)
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(SessionColours.s3, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .tutorialTarget("restTimerStop")
                    }
                    .padding(16)
                }
                .background(SessionColours.s1)
                .overlay(alignment: .top) { Rectangle().fill(SessionColours.s3).frame(height: 1) }
                .onReceive(tick) { newNow in
                    now = newNow
                    if newNow >= endDate { controller.end(cancelNotification: false) }
                }
            }
        }
    }

    private func format(_ interval: TimeInterval) -> String {
        let s = Int(interval.rounded())
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }
}

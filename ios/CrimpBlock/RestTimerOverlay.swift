import SwiftUI

/// Native equivalent of the plain rest-timer bar (#tm in index.html) — a
/// full-width bar fixed to the bottom, not a floating card: a 3px progress
/// strip flush with the top edge, then a big countdown number and a text
/// "Stop" button, nothing else. Used to also show the exercise name as a
/// label between them, dropped per feedback — the number and Stop are all
/// that's needed here, the exercise itself is still right there on the
/// card underneath. Shown while RestTimerController has an active
/// endDate. The Live Activity (Lock Screen / Dynamic Island) is a
/// separate, parallel display of the same countdown, driven by the same
/// controller — this is just the in-app one.
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
                    // A ZStack rather than an HStack with a Spacer — with
                    // the label gone, an HStack{number; Spacer; STOP} left
                    // the number sitting wherever it happened to fall
                    // rather than centered in the bar. This centers it
                    // across the FULL width regardless of STOP's own
                    // size, with STOP overlaid pinned to the trailing edge.
                    ZStack {
                        Text(format(remaining))
                            .font(AppFonts.timerDigits(34))
                            .foregroundStyle(accent)
                            .frame(maxWidth: .infinity)
                        HStack {
                            Spacer()
                            Button(action: {
                                controller.end(cancelNotification: true)
                                onTutorialSignal?("restTimerStop")
                            }) {
                                Text("STOP")
                                    .font(AppFonts.mono(13, weight: .semibold))
                                    .foregroundStyle(SessionColours.dim)
                                    .padding(.horizontal, 14).padding(.vertical, 9)
                                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(SessionColours.s3, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .tutorialTarget("restTimerStop")
                        }
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

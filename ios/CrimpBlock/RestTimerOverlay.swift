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
    /// Was silent while actively watching this: the only sound wired up
    /// was a scheduled UNNotification, and iOS suppresses a notification's
    /// own banner/sound while the app is in the foreground with no
    /// delegate opting back in — exactly the state you're in staring at
    /// this countdown. Reuses IntervalTonePlayer's already-tuned `.go`
    /// cue (rising, audible through the silent switch, real media volume)
    /// rather than inventing a new melody — "rest just ended, go again"
    /// is the same moment `.go` already marks on the repeater timer.
    /// Played via controller.tones, NOT a locally-owned player here — see
    /// RestTimerController's own doc comment on why that ownership matters
    /// (this view disappears the instant the timer ends, which used to
    /// kill the tone mid-melody along with it).

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
                    // REST to the left of the number rather than stacked
                    // above it — stacking made this a tall two-row block
                    // with a lot of empty width either side of a short
                    // word; one row keeps the bar the size it actually
                    // needs to be.
                    HStack(alignment: .center, spacing: 12) {
                        Text("REST")
                            .font(AppFonts.mono(11, weight: .bold))
                            .foregroundStyle(SessionColours.faint)
                            .tracking(1.5)

                        Spacer(minLength: 0)

                        Text(format(remaining))
                            .font(AppFonts.timerDigits(44))
                            .foregroundStyle(accent)

                        Spacer(minLength: 0)

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
                    .padding(16)
                }
                .background(SessionColours.s1)
                .overlay(alignment: .top) { Rectangle().fill(SessionColours.s3).frame(height: 1) }
                .onReceive(tick) { newNow in
                    now = newNow
                    if newNow >= endDate {
                        controller.tones.play(.go)
                        controller.end(cancelNotification: false)
                    }
                }
            }
        }
    }

    private func format(_ interval: TimeInterval) -> String {
        let s = Int(interval.rounded())
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }
}

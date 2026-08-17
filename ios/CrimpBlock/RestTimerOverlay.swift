import SwiftUI

/// Native equivalent of the plain rest-timer bar (#tm in index.html) — a
/// countdown with a progress bar and a cancel button, shown while
/// RestTimerController has an active endDate. The Live Activity (Lock
/// Screen / Dynamic Island) is a separate, parallel display of the same
/// countdown, driven by the same controller — this is just the in-app one.
struct RestTimerOverlay: View {
    @Bindable var controller: RestTimerController
    var accent: Color

    @State private var now = Date()
    private let tick = Timer.publish(every: 0.2, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if let endDate = controller.endDate {
                let remaining = max(0, endDate.timeIntervalSince(now))
                let fraction = controller.totalSeconds > 0 ? remaining / Double(controller.totalSeconds) : 0

                VStack(spacing: 12) {
                    HStack(alignment: .center) {
                        Text(controller.label.uppercased())
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Spacer()
                        Text(format(remaining))
                            .font(.system(size: 24, weight: .bold, design: .monospaced))
                            .foregroundStyle(accent)
                        Button(action: { controller.end(cancelNotification: true) }) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(SessionColours.faint)
                        }
                        .buttonStyle(.plain)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            SessionColours.s2
                            accent.frame(width: geo.size.width * fraction)
                        }
                    }
                    .frame(height: 5)
                    .clipShape(RoundedRectangle(cornerRadius: 2.5))
                }
                .padding(14)
                .background(SessionColours.s1)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
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

import ActivityKit
import WidgetKit
import SwiftUI

/// Lock Screen + Dynamic Island for the rest timer — the parking-meter-style
/// countdown Oscar asked for, so the remaining time is visible without
/// unlocking the phone or having the app open.
///
/// Both `Text(timerInterval:)` and `ProgressView(timerInterval:)` tick on the
/// system clock once given a date range — no per-second updates from the app
/// keep this accurate, which is the whole point of using them here instead
/// of pushing a new ContentState every second.
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(bg)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let accent = accentColour(context)

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "timer")
                            .foregroundStyle(accent)
                        Text(context.attributes.label)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: countdownRange(context), countsDown: true)
                        .font(.system(size: 22, weight: .bold, design: .monospaced))
                        .foregroundStyle(accent)
                        .frame(width: 66, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(timerInterval: barRange(context), countsDown: true)
                        .tint(accent)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(accent)
            } compactTrailing: {
                Text(timerInterval: countdownRange(context), countsDown: true)
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(accent)
                    .frame(width: 42, alignment: .trailing)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(accent)
            }
        }
    }

    // MARK: bits

    private let bg = Color(red: 0.094, green: 0.106, blue: 0.133)   // --bg

    private func accentColour(_ context: ActivityViewContext<RestTimerAttributes>) -> Color {
        let c = parseHexColour(context.attributes.colour)
        return Color(red: c.r, green: c.g, blue: c.b)
    }

    /// now...endDate, guarded against a past endDate (a stale read right as
    /// the timer finishes, or before the "stop" message has landed) — an
    /// invalid ClosedRange where lower > upper traps at runtime, so this
    /// collapses to a zero-width range instead of crashing the extension.
    private func countdownRange(_ context: ActivityViewContext<RestTimerAttributes>) -> ClosedRange<Date> {
        let now = Date(), end = context.state.endDate
        return now < end ? now...end : end...end
    }

    private func barRange(_ context: ActivityViewContext<RestTimerAttributes>) -> ClosedRange<Date> {
        let end = context.state.endDate
        let start = end.addingTimeInterval(-Double(context.attributes.totalSeconds))
        return start < end ? start...end : end...end
    }

    private func lockScreen(_ context: ActivityViewContext<RestTimerAttributes>) -> some View {
        let accent = accentColour(context)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "timer")
                    .foregroundStyle(accent)
                Text(context.attributes.label.uppercased())
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(timerInterval: countdownRange(context), countsDown: true)
                    .font(.system(size: 24, weight: .bold, design: .monospaced))
                    .foregroundStyle(accent)
            }
            ProgressView(timerInterval: barRange(context), countsDown: true)
                .tint(accent)
        }
        .padding(16)
    }
}

#Preview("Lock Screen", as: .content, using: RestTimerAttributes(
    label: "Pickups — half crimp", totalSeconds: 90, colour: "#F2B134"
)) {
    RestTimerLiveActivity()
} contentStates: {
    RestTimerAttributes.ContentState(endDate: Date().addingTimeInterval(60))
    RestTimerAttributes.ContentState(endDate: Date().addingTimeInterval(5))
}

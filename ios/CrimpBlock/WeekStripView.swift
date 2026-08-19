import SwiftUI

/// Native equivalent of #dots/#dow in app.js — the last 7 days at a
/// glance, each dot coloured by whatever was logged that day (empty if
/// nothing was), with the day-initial underneath. Tap any day to log or
/// edit it, not just today — backdating a session is a normal thing to do
/// after a few days away from the app.
struct WeekDay: Identifiable {
    let id: String   // date, yyyy-MM-dd
    var date: String { id }
    let dayLetter: String
    let colourVarName: String?   // nil = nothing logged that day
    let isToday: Bool
}

struct WeekStripView: View {
    let days: [WeekDay]
    var onTapDay: (String) -> Void

    /// Deliberately NOT round dots — sessionDots below this uses small
    /// circles, and a second row of small circles right above it read as
    /// one continuous strip / more of the same control rather than a
    /// calendar. A short bar in a squared tile is a distinct enough shape
    /// that the two rows no longer look like duplicates at a glance.
    /// Each day also takes an equal share of the full row width
    /// (maxWidth:.infinity per tile) instead of a fixed spacing that left
    /// a blank gap when the container was wider than 7 tightly-packed dots.
    var body: some View {
        HStack(spacing: 4) {
            ForEach(days) { day in
                Button(action: { onTapDay(day.date) }) {
                    VStack(spacing: 6) {
                        Group {
                            if let colourVarName = day.colourVarName {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(SessionColours.resolve(colourVarName))
                            } else {
                                RoundedRectangle(cornerRadius: 2)
                                    .strokeBorder(SessionColours.s4, lineWidth: 1.5)
                            }
                        }
                        .frame(height: 5)

                        Text(day.dayLetter)
                            .font(.system(size: 11, weight: day.isToday ? .bold : .semibold, design: .monospaced))
                            .foregroundStyle(day.isToday ? .white : SessionColours.faint)
                    }
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(day.isToday ? SessionColours.s2 : .clear)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Native equivalent of pick(date) in app.js — every session reachable by
/// hand for a specific day, plus Clear when something's already logged.
struct DayPickerView: View {
    let date: String
    let bridge: EngineBridge
    let hasExistingEntry: Bool
    var onPick: (String) -> Void
    var onClear: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                SessionColours.bg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(EngineBridge.order, id: \.self) { key in
                            if let info = bridge.sessionInfo(key) {
                                Button(action: { onPick(key); dismiss() }) {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(info.name.uppercased())
                                                .font(.system(size: 15, weight: .bold))
                                            Text(info.where_)
                                                .font(.system(size: 11, design: .monospaced))
                                                .opacity(0.7)
                                        }
                                        Spacer()
                                    }
                                    .foregroundStyle(SessionColours.resolve(bridge.sessionColourVarName(key)))
                                    .padding(14)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(SessionColours.s1)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        if hasExistingEntry {
                            Button(action: { onClear(); dismiss() }) {
                                Text("CLEAR")
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                                    .foregroundStyle(SessionColours.dim)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(SessionColours.s2)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle(dateLabel)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(SessionColours.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }

    private var dateLabel: String {
        let inFmt = DateFormatter()
        inFmt.locale = Locale(identifier: "en_US_POSIX")
        inFmt.dateFormat = "yyyy-MM-dd"
        guard let d = inFmt.date(from: date) else { return date }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.dateFormat = "EEEE d MMM"
        return out.string(from: d)
    }
}

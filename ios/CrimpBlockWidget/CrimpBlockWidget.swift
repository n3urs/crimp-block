import WidgetKit
import SwiftUI

// MARK: - Timeline

struct Entry: TimelineEntry {
    let date: Date
    let day: Forecast.Day?
    let stale: Bool     // cache exists but has nothing for this date
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), day: Self.sample, stale: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(entryFor(Date().appDay))
    }

    /// One entry per remaining forecast day, so the widget rolls over at
    /// midnight on its own rather than waiting for the app to be opened.
    ///
    /// `startOfToday` is computed ONCE from the real current moment via
    /// `.appDay` (which looks at the actual current hour to decide whether
    /// "today" has started yet). Every subsequent day in the loop is then
    /// plain calendar-day addition from that anchor — deliberately NOT
    /// re-running the hour check on each one, since `.appDay` collapses to
    /// midnight (hour 0) and midnight always looks like "before the
    /// boundary": re-applying it per offset would shift the whole 14-day
    /// series back by an extra day.
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let cal = Calendar.current
        let startOfToday = Date().appDay
        var entries: [Entry] = []

        for offset in 0..<14 {
            guard let date = cal.date(byAdding: .day, value: offset, to: startOfToday) else { continue }
            // The first entry must be "now" or WidgetKit may not show it until
            // the next midnight.
            entries.append(entryFor(date, at: offset == 0 ? Date() : date))
        }

        // Refresh after the window runs out, or sooner when the app is opened
        // (which calls reloadAllTimelines directly).
        let refresh = cal.date(byAdding: .day, value: 7, to: startOfToday) ?? Date()
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }

    private func entryFor(_ forDate: Date, at displayDate: Date? = nil) -> Entry {
        let day = SharedStore.day(for: forDate)
        return Entry(date: displayDate ?? forDate,
                     day: day,
                     stale: day == nil && SharedStore.load() != nil)
    }

    static let sample = Forecast.Day(
        date: "2026-08-10", key: "maxFingers", name: "Max Fingers",
        where: "Home · 50 min", colour: "#F2B134", logged: false,
        phase: "Base", cue: "Submaximal — build capacity, not a top set",
        exercises: [
            .init(t: "Warm up", m: "15 min"),
            .init(t: "Pickups — half crimp", m: "4 × 8s / hand"),
            .init(t: "Pinch block", m: "4 × 5s / hand")
        ])
}

// MARK: - Views

private let bg = Color(red: 0.094, green: 0.106, blue: 0.133)      // --bg
private let dim = Color(red: 0.60, green: 0.63, blue: 0.68)        // --dim
private let faint = Color(red: 0.40, green: 0.42, blue: 0.48)      // --faint

private extension Forecast.Day {
    var accent: Color {
        let c = uiColour
        return Color(red: c.r, green: c.g, blue: c.b)
    }

    /// "TUE 11" from the yyyy-MM-dd the web app sent. Parsed rather than
    /// taken from Date() so it always matches the entry actually shown.
    var dayLabel: String {
        let inFmt = DateFormatter()
        inFmt.locale = Locale(identifier: "en_US_POSIX")
        inFmt.dateFormat = "yyyy-MM-dd"
        guard let d = inFmt.date(from: date) else { return "" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.dateFormat = "EEE d"
        return out.string(from: d).uppercased()
    }
}

struct WidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry

    var body: some View {
        Group {
            if let day = entry.day {
                switch family {
                case .systemSmall: small(day)
                default:           medium(day)
                }
            } else {
                empty
            }
        }
        .containerBackground(bg, for: .widget)
    }

    // MARK: small

    private func small(_ day: Forecast.Day) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            banner(day)
            Spacer(minLength: 8)
            Text(day.name.uppercased())
                .font(.system(size: 21, weight: .heavy))
                .foregroundStyle(day.logged ? dim : .white)
                .strikethrough(day.logged, pattern: .solid, color: day.accent)
                .minimumScaleFactor(0.55)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 6)
            if day.logged {
                doneBadge(day, size: 20)
            } else {
                Text(day.where)
                    .font(.system(size: 9.5, weight: .medium, design: .monospaced))
                    .foregroundStyle(day.accent.opacity(0.85))
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: medium

    private func medium(_ day: Forecast.Day) -> some View {
        /* Fixed spacing, not Spacers: an expanding Spacer under the banner
           pushed the columns down far enough that the exercise list ran off
           the bottom edge. Everything hangs from the top and any slack
           collects at the bottom instead. */
        VStack(alignment: .leading, spacing: 8) {
            banner(day)
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(day.name.uppercased())
                        .font(.system(size: 25, weight: .heavy))
                        .foregroundStyle(day.logged ? dim : .white)
                        .strikethrough(day.logged, pattern: .solid, color: day.accent)
                        .minimumScaleFactor(0.55)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(day.where)
                        .font(.system(size: 9.5, weight: .medium, design: .monospaced))
                        .foregroundStyle(day.accent.opacity(0.85))
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Logged replaces the exercise list rather than sitting
                // alongside it — once it's done, what was prescribed stops
                // being the point; a big done marker is.
                if day.logged {
                    doneBadge(day, size: 34)
                        .frame(maxWidth: .infinity, alignment: .center)
                } else if !day.exercises.isEmpty {
                    // 3, not 4 — four rows overflowed the bottom on the
                    // longest sessions once widget padding is accounted for.
                    let shown = day.exercises.prefix(3)
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(shown.enumerated()), id: \.offset) { _, ex in
                            HStack(alignment: .top, spacing: 5) {
                                RoundedRectangle(cornerRadius: 1)
                                    .fill(day.accent.opacity(0.55))
                                    .frame(width: 2)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(ex.t.uppercased())
                                        .font(.system(size: 9, weight: .semibold))
                                        .foregroundStyle(dim)
                                        .lineLimit(1)
                                    Text(ex.m)
                                        .font(.system(size: 8.5, design: .monospaced))
                                        .foregroundStyle(faint)
                                        .lineLimit(1)
                                }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                        }
                        if day.exercises.count > shown.count {
                            Text("+\(day.exercises.count - shown.count) more")
                                .font(.system(size: 8.5, design: .monospaced))
                                .foregroundStyle(faint)
                                .padding(.leading, 7)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: bits

    /// The big done marker that replaces exercise detail once logged —
    /// same reasoning as the strikethrough title: once it's done, what was
    /// prescribed isn't the point anymore, "done" is.
    private func doneBadge(_ day: Forecast.Day, size: CGFloat) -> some View {
        VStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: size))
                .foregroundStyle(day.accent)
            Text("DONE")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(day.accent)
        }
    }

    /// Full-width accent strip: a status word (if there is one worth
    /// showing) on the left, the day on the right. Deliberately not the
    /// phase name — the widget is a glance, not a briefing, so "where you
    /// are in the plan" stays out unless it's actionable (logged, deload).
    private func banner(_ day: Forecast.Day) -> some View {
        HStack(spacing: 6) {
            let status = day.logged ? "LOGGED"
                : day.phase == "Deload" ? "DELOAD"
                : day.phase == "Returning" ? "EASING IN"
                : ""
            if !status.isEmpty {
                Text(status)
                    .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 4)
            Text(day.dayLabel)
                .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                .lineLimit(1)
                .layoutPriority(1)
        }
        .foregroundStyle(bg)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity)
        .background(day.accent)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("CRIMP BLOCK")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(faint)
            Text(entry.stale ? "Open the app to refresh" : "Open the app to get started")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(dim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - Widget

@main
struct CrimpBlockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CrimpBlockWidget", provider: Provider()) { entry in
            WidgetView(entry: entry)
        }
        .configurationDisplayName("Today's Session")
        .description("What Crimp Block recommends you train today.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemSmall) {
    CrimpBlockWidget()
} timeline: {
    Entry(date: .now, day: Provider.sample, stale: false)
}

#Preview(as: .systemMedium) {
    CrimpBlockWidget()
} timeline: {
    Entry(date: .now, day: Provider.sample, stale: false)
    Entry(date: .now, day: nil, stale: true)
}

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
        completion(entryFor(Date()))
    }

    /// One entry per remaining forecast day, so the widget rolls over at
    /// midnight on its own rather than waiting for the app to be opened.
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let cal = Calendar.current
        let startOfToday = cal.startOfDay(for: Date())
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
            phaseChip(day)
            Spacer(minLength: 6)
            Text(day.name.uppercased())
                .font(.system(size: 21, weight: .heavy, design: .default))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            Text(day.where)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(day.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: medium

    private func medium(_ day: Forecast.Day) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                phaseChip(day)
                Spacer(minLength: 6)
                Text(day.name.uppercased())
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Text(day.where)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(day.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if !day.exercises.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(Array(day.exercises.prefix(4).enumerated()), id: \.offset) { _, ex in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(ex.t.uppercased())
                                .font(.system(size: 9.5, weight: .semibold))
                                .foregroundStyle(dim)
                                .lineLimit(1)
                            Text(ex.m)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(faint)
                                .lineLimit(1)
                        }
                    }
                    if day.exercises.count > 4 {
                        Text("+\(day.exercises.count - 4) more")
                            .font(.system(size: 8.5, design: .monospaced))
                            .foregroundStyle(faint)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: bits

    private func phaseChip(_ day: Forecast.Day) -> some View {
        HStack(spacing: 5) {
            Circle().fill(day.accent).frame(width: 6, height: 6)
            Text(day.logged ? "LOGGED" : day.phase.uppercased())
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(day.accent)
                .lineLimit(1)
        }
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

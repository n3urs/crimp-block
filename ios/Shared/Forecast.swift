import Foundation

/// The payload the web app hands us over the WKScriptMessageHandler bridge.
/// Mirrors `forecast()` in app.js — see the comment there for why the phase
/// is fixed at generation time rather than projected forward.
struct Forecast: Codable {
    let v: Int
    let generated: String
    let days: [Day]

    struct Day: Codable {
        let date: String        // yyyy-MM-dd
        let key: String         // session key, e.g. "maxFingers"
        let name: String        // display name, e.g. "Max Fingers"
        let `where`: String     // "Home · 50 min"
        let colour: String      // resolved hex, e.g. "#F2B134"
        let logged: Bool
        let phase: String       // "Base", or "Deload" on a deload week
        let cue: String         // effort target; empty on Rest
        let exercises: [Exercise]
    }

    struct Exercise: Codable {
        let t: String           // title
        let m: String           // prescription for the current phase
    }
}

/// The one place the app and the widget agree on where cached data lives.
/// Both targets must carry this App Group in their entitlements or the
/// widget silently reads nothing.
enum SharedStore {
    static let appGroup = "group.uk.co.sullivanltd.crimpblock"
    private static let key = "forecast.v1"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func save(rawJSON: String) {
        defaults?.set(rawJSON, forKey: key)
    }

    static func load() -> Forecast? {
        guard let raw = defaults?.string(forKey: key),
              let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Forecast.self, from: data)
    }

    /// Today's entry, or nil if the cache predates today and has nothing for it.
    /// Deliberately matches on the date string rather than taking `days.first`,
    /// so a stale cache reports "no entry" instead of confidently showing a
    /// workout from whenever the app was last opened.
    static func day(for date: Date = Date()) -> Forecast.Day? {
        guard let f = load() else { return nil }
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = .current
        fmt.dateFormat = "yyyy-MM-dd"
        let key = fmt.string(from: date)
        return f.days.first { $0.date == key }
    }
}

extension Forecast.Day {
    /// Hex like "#F2B134" from the web app's CSS custom properties.
    var uiColour: (r: Double, g: Double, b: Double) {
        var hex = colour.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let n = UInt32(hex, radix: 16) else {
            return (0.95, 0.69, 0.20) // fall back to --gorse
        }
        return (Double((n >> 16) & 0xFF) / 255.0,
                Double((n >> 8) & 0xFF) / 255.0,
                Double(n & 0xFF) / 255.0)
    }
}

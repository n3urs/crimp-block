import SwiftUI

/// Native equivalent of the `--gorse`/`--tidepool`/... custom properties in
/// index.html's :root. There is no CSS on native, so these are the one
/// place the palette has to be kept in sync by hand — session/phase colours
/// in programs.js are just the variable NAME (e.g. "--gorse"); this is what
/// turns that name into an actual Color.
enum SessionColours {
    static let bg     = Color(hex: "#181B22")
    static let s1     = Color(hex: "#1E222B")
    static let s2     = Color(hex: "#272C37")
    static let s3     = Color(hex: "#333947")
    static let s4     = Color(hex: "#454C5C")
    static let fg     = Color(hex: "#EDEBE5")
    static let dim    = Color(hex: "#9AA0AE")
    static let faint  = Color(hex: "#666C7A")

    // The interval timer's traffic-light phases — --go/--rest-c/--ready-c in index.html.
    static let go     = Color(hex: "#1FA24A")
    static let restC  = Color(hex: "#D6383D")
    static let readyC = Color(hex: "#D69A1F")

    private static let namedHex: [String: String] = [
        "--gorse":    "#F2B134",
        "--tidepool": "#4FB3A5",
        "--slate":    "#7B93E0",
        "--heather":  "#C9739B",
        "--grey":     "#5A6069",
    ]

    /// Falls back to --gorse for anything unrecognised, same as
    /// parseHexColour() in Forecast.swift does for a malformed hex string.
    static func resolve(_ variableName: String) -> Color {
        Color(hex: hex(variableName))
    }

    /// The resolved hex string rather than a SwiftUI Color — needed
    /// wherever a colour crosses into something that isn't SwiftUI, e.g.
    /// RestTimerAttributes (ActivityKit, parses hex the same way the web
    /// bridge's already-resolved `v('--c')` string does).
    static func hex(_ variableName: String) -> String {
        namedHex[variableName] ?? namedHex["--gorse"]!
    }
}

extension Color {
    init(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if h.hasPrefix("#") { h.removeFirst() }
        var n: UInt64 = 0
        Scanner(string: h).scanHexInt64(&n)
        self.init(
            red: Double((n >> 16) & 0xFF) / 255.0,
            green: Double((n >> 8) & 0xFF) / 255.0,
            blue: Double(n & 0xFF) / 255.0
        )
    }
}

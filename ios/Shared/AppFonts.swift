import SwiftUI

/// Real bundled fonts (see Info.plist's UIAppFonts, files in CrimpBlock/Fonts)
/// replacing the system font on the daily card and its timers — picked from
/// a live side-by-side comparison with Oscar against the actual card layout,
/// not chosen blind. Archivo Black for the one heading role, Roboto Mono for
/// everything else that was already monospaced, except the rest/interval
/// timer countdown itself: that one is Space Mono specifically, his own call
/// on the numbers after seeing both next to each other.
enum AppFonts {
    static func heading(_ size: CGFloat) -> Font {
        .custom("ArchivoBlack-Regular", size: size)
    }

    /// `weight` only chooses which of the two bundled Roboto Mono cuts to
    /// use — there's no continuous weight axis on a static TTF the way
    /// there is on the system font. Font.Weight isn't Comparable, so this
    /// is an explicit allowlist rather than a threshold check.
    private static let boldWeights: Set<Font.Weight> = [.bold, .heavy, .black, .semibold]
    static func mono(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(boldWeights.contains(weight) ? "RobotoMono-Bold" : "RobotoMono-Medium", size: size)
    }

    static func timerDigits(_ size: CGFloat) -> Font {
        .custom("SpaceMono-Bold", size: size)
    }
}

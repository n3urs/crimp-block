import XCTest
import UIKit
@testable import CrimpBlock

/// Guards the one thing that's actually broken twice while bundling these
/// fonts this session (once via a WOFF2/EOT format that iOS can't load,
/// once via two static weights sharing a PostScript name) — a build can
/// succeed and the app can still launch with these silently falling back
/// to the system font, since Font.custom() has no compile-time check
/// against what's actually registered at runtime.
final class AppFontsTests: XCTestCase {
    func testBundledFontsAreRegistered() {
        let expected = [
            "ArchivoBlack-Regular",
            "RobotoMono-Bold",
            "RobotoMono-Medium",
            "SpaceMono-Bold",
        ]
        for name in expected {
            XCTAssertNotNil(UIFont(name: name, size: 12), "\(name) is not registered — check Info.plist's UIAppFonts and the Resources build phase")
        }
    }

    /// The two Roboto Mono weights are separate static instances of what
    /// was originally one variable font — this is the specific failure
    /// mode from bundling them (both silently resolving to the same
    /// PostScript name) that a "did it load at all" check above wouldn't
    /// catch on its own.
    func testRobotoMonoWeightsAreDistinct() {
        guard let bold = UIFont(name: "RobotoMono-Bold", size: 12),
              let medium = UIFont(name: "RobotoMono-Medium", size: 12) else {
            XCTFail("Roboto Mono weights not registered")
            return
        }
        XCTAssertNotEqual(bold.fontName, medium.fontName)
    }
}

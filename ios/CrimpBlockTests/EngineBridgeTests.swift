import XCTest
@testable import CrimpBlock

/// Covers the Swift <-> JSContext bridge layer itself — resource loading,
/// email/templateId resolution, JSON round-tripping — as opposed to the
/// rules engine's own logic, which already has 67 Jest tests against
/// engine-core.js directly. This is an app-hosted test target (TEST_HOST
/// points at CrimpBlock.app) specifically because EngineBridge loads its
/// bundled .js files via Bundle.main: a standalone/library-based test
/// bundle would resolve Bundle.main to the test runner, not the app, and
/// every one of these would fail to find engine-core.js at all — hosting
/// inside the real app is what makes these tests exercise the same
/// resource-loading path the shipping app actually uses.
final class EngineBridgeTests: XCTestCase {

    // MARK: - email: initializer

    func testKnownEmailResolvesBuiltInProgram() throws {
        let bridge = try EngineBridge(email: "oscar@sullivanltd.co.uk", sessionLog: [:], loadLog: [:])
        XCTAssertTrue(bridge.isBuiltInProgram)
    }

    func testEmailLookupIsCaseInsensitive() throws {
        let lower = try EngineBridge(email: "oscar@sullivanltd.co.uk", sessionLog: [:], loadLog: [:])
        let upper = try EngineBridge(email: "OSCAR@SULLIVANLTD.CO.UK", sessionLog: [:], loadLog: [:])
        XCTAssertTrue(upper.isBuiltInProgram)
        XCTAssertEqual(lower.phases.count, upper.phases.count)
    }

    func testUnknownEmailFallsBackToDefaultProgram() throws {
        let bridge = try EngineBridge(email: "definitely-not-a-real-user@example.com", sessionLog: [:], loadLog: [:])
        XCTAssertFalse(bridge.isBuiltInProgram)
        // The 'default' program must still be a real, usable program, not
        // an empty placeholder — a template-assigned user's fallback path
        // if something ever goes wrong should still produce a real card.
        XCTAssertFalse(bridge.phases.isEmpty)
    }

    // MARK: - templateId: initializer

    func testKnownTemplateResolves() throws {
        let bridge = try EngineBridge(
            templateId: "boulderingBeginner", startDate: "2026-01-01",
            modifiers: [:], sessionLog: [:], loadLog: [:]
        )
        XCTAssertFalse(bridge.isBuiltInProgram, "template-resolved programs must never be treated as built-in")
        XCTAssertFalse(bridge.phases.isEmpty)
    }

    func testUnknownTemplateIdThrows() {
        XCTAssertThrowsError(
            try EngineBridge(templateId: "notARealTemplate", startDate: "2026-01-01", modifiers: [:], sessionLog: [:], loadLog: [:])
        ) { error in
            guard let bridgeError = error as? EngineBridge.BridgeError else {
                return XCTFail("expected a BridgeError, got \(error)")
            }
            if case .missingGlobal = bridgeError {} else {
                XCTFail("expected .missingGlobal, got \(bridgeError)")
            }
        }
    }

    func testModifiersAffectResolution() throws {
        let plain = try EngineBridge(
            templateId: "boulderingBeginner", startDate: "2026-01-01",
            modifiers: [:], sessionLog: [:], loadLog: [:]
        )
        let withDaysOverride = try EngineBridge(
            templateId: "boulderingBeginner", startDate: "2026-01-01",
            modifiers: ["daysPerWeek": 5], sessionLog: [:], loadLog: [:]
        )
        // Doesn't assert an exact perWeek value (that belongs to the JS
        // suite) — just that the Swift layer actually threads modifiers
        // through to resolveTemplate() rather than silently dropping them.
        XCTAssertNotEqual(
            plain.program.forProperty("perWeek")?.toInt32(),
            withDaysOverride.program.forProperty("perWeek")?.toInt32()
        )
    }

    // MARK: - Dates

    func testAddDaysRoundTrips() throws {
        let bridge = try EngineBridge(email: "default", sessionLog: [:], loadLog: [:])
        let start = "2026-03-10"
        XCTAssertEqual(bridge.addDays(start, 5), "2026-03-15")
        XCTAssertEqual(bridge.addDays(bridge.addDays(start, 5), -5), start)
    }

    func testTodayMatchesDayFormat() throws {
        let bridge = try EngineBridge(email: "default", sessionLog: [:], loadLog: [:])
        XCTAssertNotNil(bridge.today().range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression))
    }

    // MARK: - Top-level engine calls

    func testDecideReturnsARealDecisionForFreshHistory() throws {
        let bridge = try EngineBridge(
            templateId: "boulderingBeginner", startDate: "2026-01-01",
            modifiers: [:], sessionLog: [:], loadLog: [:]
        )
        let decision = bridge.decide(date: "2026-01-01")
        XCTAssertNotNil(decision)
        XCTAssertFalse(decision!.k.isEmpty)
        XCTAssertFalse(decision!.why.isEmpty)
    }

    func testResolveExercisesReturnsContentForARealSession() throws {
        let bridge = try EngineBridge(
            templateId: "boulderingAdvanced", startDate: "2026-01-01",
            modifiers: [:], sessionLog: [:], loadLog: [:]
        )
        let exercises = bridge.resolveExercises(for: "maxFingers", date: "2026-01-01", phaseName: bridge.phaseNameAt("2026-01-01") ?? "")
        XCTAssertFalse(exercises.isEmpty)
        XCTAssertFalse(exercises[0].title.isEmpty)
    }

    // MARK: - Forecast (Swift-side colour resolution is specific to this bridge)

    func testNativeForecastResolvesRealHexColours() throws {
        let bridge = try EngineBridge(email: "oscar@sullivanltd.co.uk", sessionLog: [:], loadLog: [:])
        let forecast = try XCTUnwrap(bridge.nativeForecast(days: 14))
        XCTAssertEqual(forecast.days.count, 14)
        for day in forecast.days {
            // engine-core.js hands back a raw "--variable-name"; EngineBridge
            // must resolve it to a real hex string before this ever reaches
            // Codable/JSON (the widget decodes this exact shape) — a
            // leftover "--" here would mean that resolution silently broke.
            XCTAssertFalse(day.colour.hasPrefix("--"), "day \(day.date) has an unresolved colour var: \(day.colour)")
            XCTAssertTrue(day.colour.hasPrefix("#"), "day \(day.date) colour isn't a hex string: \(day.colour)")
        }
    }
}

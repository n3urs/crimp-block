import XCTest
@testable import CrimpBlock

/// Covers RehabBridge's own JSContext bridge layer — resource loading,
/// injury-area resolution, phase advancement, JSON-free exercise
/// marshalling — as opposed to rehab-resolver.js's own logic, which
/// already has 18 Jest tests against it directly (see rehab-resolver.test.js).
/// Same app-hosted rationale as EngineBridgeTests: RehabBridge loads its
/// bundled .js files via Bundle.main, so this needs to run inside the real
/// app, not a standalone test bundle.
final class RehabBridgeTests: XCTestCase {

    func testKnownInjuryAreaResolves() throws {
        let bridge = try RehabBridge(injuryArea: "fingerPulley", phaseIndex: 0)
        let phase = try XCTUnwrap(bridge.currentPhase())
        XCTAssertEqual(phase.phaseId, "unload")
        XCTAssertEqual(phase.phaseIndex, 0)
        XCTAssertFalse(phase.isFinalPhase)
        XCTAssertFalse(phase.exercises.isEmpty)
        XCTAssertFalse(phase.selfReportCriteria.isEmpty)
        XCTAssertTrue(phase.caution.lowercased().contains("physio"))
    }

    func testAllSixInjuryAreasResolve() throws {
        for area in ["fingerPulley", "elbowMedial", "elbowLateral", "shoulder", "bicepsTendon", "wristTFCC"] {
            let bridge = try RehabBridge(injuryArea: area, phaseIndex: 0)
            XCTAssertNotNil(bridge.currentPhase(), "expected \(area) to resolve a phase")
        }
    }

    func testFinalPhaseIsReturnToClimbing() throws {
        let bridge = try RehabBridge(injuryArea: "fingerPulley", phaseIndex: 3)
        let phase = try XCTUnwrap(bridge.currentPhase())
        XCTAssertEqual(phase.phaseId, "returnToClimbing")
        XCTAssertTrue(phase.isFinalPhase)
    }

    func testCanAdvanceRequiresEveryCriterionChecked() throws {
        let bridge = try RehabBridge(injuryArea: "fingerPulley", phaseIndex: 0)
        let phase = try XCTUnwrap(bridge.currentPhase())
        XCTAssertFalse(bridge.canAdvance(checked: []))
        XCTAssertFalse(bridge.canAdvance(checked: [phase.selfReportCriteria[0]]))
        XCTAssertTrue(bridge.canAdvance(checked: Set(phase.selfReportCriteria)))
    }

    func testAdvanceIncrementsPhaseIndexAndClampsAtTheEnd() throws {
        let bridge = try RehabBridge(injuryArea: "fingerPulley", phaseIndex: 0)
        bridge.advance()
        XCTAssertEqual(bridge.phaseIndex, 1)

        let clamped = try RehabBridge(injuryArea: "fingerPulley", phaseIndex: 3)
        clamped.advance()
        XCTAssertEqual(clamped.phaseIndex, 3, "advancing past the final phase must be a no-op, not an error")
    }
}

import SwiftUI

/// Phase B proof-of-concept: the SAME rules engine (engine-core.js, bundled
/// into the app, run via JavaScriptCore through EngineBridge) driving a real
/// SwiftUI screen (DailyCardView), with no WKWebView anywhere in this view.
///
/// Seeded with a small, realistic sample history (mirroring the fake-
/// Supabase harness used to verify the web side of this same extraction)
/// rather than real logged data, so this view works standalone without
/// signing in — see NativeAppView for the real-data version, built once
/// this proved the architecture worked.
struct NativeEngineDemoView: View {
    @State private var state: DailyCardState?
    @State private var loadError: String?

    var body: some View {
        Group {
            if let loadError {
                engineBridgeErrorView(loadError)
            } else if let state {
                DailyCardView(state: state, footerNote: "Native SwiftUI (sample data) · engine-core.js via JavaScriptCore · \(state.today)")
            } else {
                ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
            }
        }
        .task { load() }
    }

    private func load() {
        do {
            let (sessionLog, loadLog) = Self.sampleData()
            let bridge = try EngineBridge(email: "oscar@sullivanltd.co.uk", sessionLog: sessionLog, loadLog: loadLog)
            guard let s = DailyCardState.load(bridge: bridge) else {
                loadError = "engine returned incomplete data"; return
            }
            state = s
        } catch {
            loadError = "\(error)"
        }
    }

    /// Mirrors the fake-Supabase harness (scratchpad/harness/stub.js) used
    /// to verify the web side of this same engine extraction: a week of
    /// plausible recent training plus one held-twice weight entry, so
    /// decide()/target() have something real to compute against rather than
    /// an empty history.
    private static func sampleData() -> ([String: Any], [String: [[String: Any]]]) {
        let cal = Calendar(identifier: .gregorian)
        func iso(_ daysAgo: Int) -> String {
            let d = cal.date(byAdding: .day, value: -daysAgo, to: Date())!
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyy-MM-dd"
            return f.string(from: d)
        }
        let sessionLog: [String: Any] = [
            iso(6): ["t": "maxFingers"],
            iso(5): ["t": "climbHard"],
            iso(4): ["t": "outdoorHard"],
            iso(3): ["t": "rest"],
            iso(2): ["t": "hangboard"],
            iso(1): ["t": "pull"],
        ]
        let loadLog: [String: [[String: Any]]] = [
            "osc-pinch": [
                ["date": iso(3), "kg": 20],
            ]
        ]
        return (sessionLog, loadLog)
    }
}

#Preview {
    NativeEngineDemoView()
}

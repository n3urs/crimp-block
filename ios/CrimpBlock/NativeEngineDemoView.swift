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
///
/// Week strip and account button are faked here too (no real NativeStore or
/// SupabaseClient backing this view) purely so they're visible without
/// needing a real sign-in — tapping a day or Sign Out here doesn't persist
/// anything, it just re-renders against the same fixed sample data.
struct NativeEngineDemoView: View {
    @State private var state: DailyCardState?
    @State private var loadError: String?
    @State private var sampleSessionLog: [String: Any] = [:]

    var body: some View {
        Group {
            if let loadError {
                engineBridgeErrorView(loadError)
            } else if let state {
                DailyCardView(
                    state: state,
                    footerNote: "Native SwiftUI (sample data) · engine-core.js via JavaScriptCore · \(state.today)",
                    onBrowse: { key in browse(to: key) },
                    weekDays: weekDays(bridge: state.bridge, today: state.today),
                    onTapDay: { _ in }, // sample data isn't editable — nowhere real to write a change to
                    accountEmail: "oscar@sullivanltd.co.uk (sample)",
                    onSignOut: { load() } // nothing to sign out of here — just re-rolls the same sample data
                )
            } else {
                ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
            }
        }
        .task { load() }
    }

    private func load() {
        do {
            let (sessionLog, loadLog) = Self.sampleData()
            sampleSessionLog = sessionLog
            let bridge = try EngineBridge(email: "oscar@sullivanltd.co.uk", sessionLog: sessionLog, loadLog: loadLog)
            guard let s = DailyCardState.load(bridge: bridge) else {
                loadError = "engine returned incomplete data"; return
            }
            state = s
        } catch {
            loadError = "\(error)"
        }
    }

    private func browse(to key: String) {
        guard let bridge = state?.bridge, key != state?.displayKey else { return }
        if let s = DailyCardState.load(bridge: bridge, displayKey: key) { state = s }
    }

    /// Same idea as NativeAppView.weekDays(around:), just reading the fixed
    /// sample sessionLog directly instead of a real NativeStore.
    private func weekDays(bridge: EngineBridge, today: String) -> [WeekDay] {
        var out: [WeekDay] = []
        for i in stride(from: 6, through: 0, by: -1) {
            let date = bridge.addDays(today, -i)
            let type = (sampleSessionLog[date] as? [String: Any])?["t"] as? String
            out.append(WeekDay(
                id: date, dayLetter: Self.dayLetter(date),
                colourVarName: type.map { bridge.sessionColourVarName($0) },
                isToday: i == 0
            ))
        }
        return out
    }

    private static func dayLetter(_ date: String) -> String {
        let inFmt = DateFormatter()
        inFmt.locale = Locale(identifier: "en_US_POSIX")
        inFmt.dateFormat = "yyyy-MM-dd"
        guard let d = inFmt.date(from: date) else { return "" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.dateFormat = "EEE"
        return String(out.string(from: d).prefix(1))
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

import SwiftUI

/// Lets Oscar browse Max Pamplin's hand-authored program (programs.js,
/// 'maxpamplin2000@googlemail.com') before Max has ever signed in himself —
/// no OTP needed, same trick NativeEngineDemoView already uses to preview
/// Oscar's own program without a real Supabase session.
///
/// Unlike NativeEngineDemoView, there's no seeded sample history here — an
/// empty sessionLog/loadLog is the honest starting state, since this is
/// previewing what Max will actually see the first time he opens the app,
/// not a populated "week in" view.
struct MaxProgramPreviewView: View {
    @State private var state: DailyCardState?
    @State private var loadError: String?

    private static let email = "maxpamplin2000@googlemail.com"

    var body: some View {
        Group {
            if let loadError {
                engineBridgeErrorView(loadError)
            } else if let state {
                DailyCardView(
                    state: state,
                    footerNote: "Preview only — Max hasn't signed in yet · \(state.today)",
                    onBrowse: { key in browse(to: key) },
                    weekDays: weekDays(bridge: state.bridge, today: state.today),
                    onTapDay: { _ in }, // no real history to backdate into
                    accountEmail: "\(Self.email) (preview)",
                    onSignOut: { load() } // nothing to sign out of — just re-rolls the same fresh state
                )
            } else {
                ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
            }
        }
        .task { load() }
    }

    private func load() {
        do {
            let bridge = try EngineBridge(email: Self.email, sessionLog: [:], loadLog: [:])
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

    /// No sessions logged yet, so every day in the strip is blank — still
    /// worth rendering so the week strip's empty state is visible too.
    private func weekDays(bridge: EngineBridge, today: String) -> [WeekDay] {
        var out: [WeekDay] = []
        for i in stride(from: 6, through: 0, by: -1) {
            let date = bridge.addDays(today, -i)
            out.append(WeekDay(id: date, dayLetter: Self.dayLetter(date), colourVarName: nil, isToday: i == 0))
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
}

#Preview {
    MaxProgramPreviewView()
}

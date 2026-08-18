import SwiftUI
import WebKit
import WidgetKit

/// The app is deliberately a thin shell around the live web app rather than a
/// reimplementation: pushing to GitHub Pages updates the phone with no
/// rebuild, and there is only ever one copy of the training logic.
private let appURL = URL(string: "https://n3urs.github.io/crimp-block/")!

struct ContentView: View {
    #if DEBUG
    @State private var showDebugMenu = false
    @State private var debugDestination: DebugDestination?

    private enum DebugDestination: Identifiable {
        case sample, webShell, quiz, paywall, tutorialDebug
        var id: Self { self }
    }
    #endif

    /// The native SwiftUI + JavaScriptCore rebuild (see the plan at
    /// ~/.claude/plans/moonlit-juggling-catmull.md) is now the app's real
    /// entry point — this is the cutover the plan's Phase B/C/D work was
    /// building toward, done only once EngineBridge's output was
    /// re-verified against real logged history, not just seeded data.
    /// `WebView` (below) is kept, not deleted: reachable from the DEBUG
    /// menu's "Web shell (compare)" entry for exactly that kind of
    /// side-by-side verification, and as a fallback if a real problem
    /// ever needs comparing against the previously-shipping behavior.
    var body: some View {
        #if DEBUG
        NativeAppView()
            // Plain SwiftUI gesture is enough here — the old WKWebView-only
            // custom UILongPressGestureRecognizer dance (see git history)
            // existed only because WKWebView has its own competing built-in
            // long-press recognizer; a pure SwiftUI tree has no such
            // conflict to work around.
            .onLongPressGesture(minimumDuration: 1.2) { showDebugMenu = true }
            .confirmationDialog("Debug tools", isPresented: $showDebugMenu) {
                Button("Sample data") { debugDestination = .sample }
                Button("Web shell (compare)") { debugDestination = .webShell }
                Button("Template quiz (Phase C)") { debugDestination = .quiz }
                Button("Paywall (Phase D)") { debugDestination = .paywall }
                Button("Tutorial (verify skip)") { debugDestination = .tutorialDebug }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(item: $debugDestination) { dest in
                switch dest {
                case .sample: NativeEngineDemoView()
                case .webShell:
                    WebView()
                        .background(Color(red: 0.094, green: 0.106, blue: 0.133)) // --bg #181B22
                case .quiz: QuizDemoView()
                case .paywall: PaywallView(onSubscribed: {}, onCancel: { debugDestination = nil })
                case .tutorialDebug: TutorialDemoCardView(onDone: { debugDestination = nil })
                }
            }
        #else
        NativeAppView()
        #endif
    }
}

struct WebView: UIViewRepresentable {
    #if DEBUG
    var onLongPress: (() -> Void)? = nil
    #endif

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Persistent store so the Supabase session survives app restarts —
        // otherwise you'd be asked to sign in on every launch.
        config.websiteDataStore = .default()

        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "crimp")
        controller.add(context.coordinator, name: "timer")
        config.userContentController = controller

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.094, green: 0.106, blue: 0.133, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        // The web app already handles its own pull-to-refresh semantics via
        // the visibilitychange listener; bouncing just looks broken here.
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = false
        web.load(URLRequest(url: appURL))

        // WKWebView keeps its already-loaded page alive across a background/
        // foreground cycle — switching away and back does NOT refetch
        // anything, unlike a browser tab. Without this, a fix pushed to the
        // web app would only ever reach the phone on a true cold launch
        // (force-quit, then reopen), which is easy to not realise.
        //
        // Reload only after a real gap (60s), not every foreground: a quick
        // glance at another app shouldn't wipe in-progress tick marks, which
        // only live in memory and aren't persisted by design.
        context.coordinator.webView = web
        context.coordinator.observeLifecycle()
        context.coordinator.requestNotificationPermission()
        #if DEBUG
        context.coordinator.onLongPress = onLongPress
        context.coordinator.attachLongPress(to: web)
        #endif

        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, UIGestureRecognizerDelegate {
        weak var webView: WKWebView?
        private var backgroundedAt: Date?
        private let staleAfter: TimeInterval = 60
        private var observing = false

        #if DEBUG
        var onLongPress: (() -> Void)?

        /// A real UIKit recognizer, not a SwiftUI `.onLongPressGesture` —
        /// WKWebView owns its own long-press recognizer (for text selection
        /// / link previews) which otherwise wins outright and the SwiftUI
        /// gesture never fires at all. Declaring simultaneous recognition
        /// via the delegate callback below is what lets this one fire
        /// alongside it instead of losing the arbitration.
        func attachLongPress(to view: UIView) {
            let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
            recognizer.minimumPressDuration = 1.2
            recognizer.delegate = self
            view.addGestureRecognizer(recognizer)
        }

        @objc private func handleLongPress(_ recognizer: UILongPressGestureRecognizer) {
            guard recognizer.state == .began else { return }
            onLongPress?()
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            true
        }
        #endif

        func observeLifecycle() {
            guard !observing else { return }
            observing = true
            let nc = NotificationCenter.default
            nc.addObserver(self, selector: #selector(didEnterBackground),
                            name: UIApplication.didEnterBackgroundNotification, object: nil)
            nc.addObserver(self, selector: #selector(willEnterForeground),
                            name: UIApplication.willEnterForegroundNotification, object: nil)
        }

        @objc private func didEnterBackground() {
            backgroundedAt = Date()
        }

        @objc private func willEnterForeground() {
            guard let since = backgroundedAt,
                  Date().timeIntervalSince(since) > staleAfter else { return }
            webView?.reload()
        }

        func userContentController(_ controller: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard let json = message.body as? String,
                  let data = json.data(using: .utf8) else { return }

            switch message.name {
            case "crimp":
                SharedStore.save(rawJSON: json)
                WidgetCenter.shared.reloadAllTimelines()
            case "timer":
                guard let msg = try? JSONDecoder().decode(TimerMessage.self, from: data) else { return }
                handleTimerMessage(msg)
            default:
                break
            }
        }

        // MARK: - Rest timer: Live Activity + completion notification
        // (RestTimerController.swift owns the actual ActivityKit lifecycle —
        // shared with the native rest-timer UI so there's one implementation,
        // not two. This Coordinator just translates web-bridge messages into
        // calls on it.)

        private struct TimerMessage: Decodable {
            var action: String
            var secs: Int?
            var label: String?
            var colour: String?
            var cancelNotification: Bool?
        }

        private let restTimer = RestTimerController()

        func requestNotificationPermission() {
            restTimer.requestNotificationPermission()
        }

        private func handleTimerMessage(_ msg: TimerMessage) {
            switch msg.action {
            case "start":
                guard let secs = msg.secs, let label = msg.label, let colour = msg.colour else { return }
                restTimer.start(secs: secs, label: label, colourHex: colour)
            case "stop":
                restTimer.end(cancelNotification: msg.cancelNotification ?? false)
            case "keepAwake":
                // The interval repeater timer — screen stays on and unlocked
                // for its whole run, which is the opposite situation to the
                // rest timer above (that one is FOR when the phone locks).
                // No Live Activity involved: the screen never goes dark
                // during this, so there is nothing for a Lock Screen to show.
                UIApplication.shared.isIdleTimerDisabled = true
            case "allowSleep":
                UIApplication.shared.isIdleTimerDisabled = false
            default:
                break
            }
        }
    }
}

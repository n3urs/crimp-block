import SwiftUI
import WebKit
import WidgetKit
import ActivityKit
import UserNotifications

/// The app is deliberately a thin shell around the live web app rather than a
/// reimplementation: pushing to GitHub Pages updates the phone with no
/// rebuild, and there is only ever one copy of the training logic.
private let appURL = URL(string: "https://n3urs.github.io/crimp-block/")!

struct ContentView: View {
    var body: some View {
        WebView()
            .background(Color(red: 0.094, green: 0.106, blue: 0.133)) // --bg #181B22
    }
}

struct WebView: UIViewRepresentable {
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

        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private var backgroundedAt: Date?
        private let staleAfter: TimeInterval = 60
        private var observing = false

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

        private struct TimerMessage: Decodable {
            var action: String
            var secs: Int?
            var label: String?
            var colour: String?
            var cancelNotification: Bool?
        }

        private var restActivity: Activity<RestTimerAttributes>?
        private let notificationID = "rest-timer"

        func requestNotificationPermission() {
            UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }

        private func handleTimerMessage(_ msg: TimerMessage) {
            switch msg.action {
            case "start":
                guard let secs = msg.secs, let label = msg.label, let colour = msg.colour else { return }
                startRestActivity(secs: secs, label: label, colour: colour)
            case "stop":
                endRestActivity(cancelNotification: msg.cancelNotification ?? false)
            default:
                break
            }
        }

        /// Ends whatever activity is already running first — restarting a
        /// timer (a new exercise, or the same one again) must never leave a
        /// stale one showing alongside the new one.
        private func startRestActivity(secs: Int, label: String, colour: String) {
            endRestActivity(cancelNotification: true)

            let end = Date().addingTimeInterval(TimeInterval(secs))
            let attrs = RestTimerAttributes(label: label, totalSeconds: secs, colour: colour)
            let state = RestTimerAttributes.ContentState(endDate: end)
            // A generous stale date, not a hard timeout: if the "stop"
            // message is ever lost (the app was force-quit mid-rest), this
            // is what keeps an expired countdown from just sitting there —
            // the system marks it stale rather than this code having to
            // guess when to tidy up.
            let stale = end.addingTimeInterval(5 * 60)

            restActivity = try? Activity.request(
                attributes: attrs,
                content: .init(state: state, staleDate: stale),
                pushType: nil
            )

            scheduleCompletionNotification(secs: secs, label: label)
        }

        private func endRestActivity(cancelNotification: Bool) {
            if let activity = restActivity {
                Task { await activity.end(nil, dismissalPolicy: .immediate) }
                restActivity = nil
            }
            if cancelNotification {
                UNUserNotificationCenter.current()
                    .removePendingNotificationRequests(withIdentifiers: [notificationID])
            }
        }

        private func scheduleCompletionNotification(secs: Int, label: String) {
            let content = UNMutableNotificationContent()
            content.title = "Rest over"
            content.body = label
            content.sound = .default

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(secs), repeats: false)
            let request = UNNotificationRequest(identifier: notificationID, content: content, trigger: trigger)

            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [notificationID])
            center.add(request)
        }
    }
}

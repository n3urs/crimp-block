import SwiftUI
import WebKit
import WidgetKit

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
            guard message.name == "crimp",
                  let json = message.body as? String else { return }
            SharedStore.save(rawJSON: json)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}

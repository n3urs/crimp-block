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
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        func userContentController(_ controller: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "crimp",
                  let json = message.body as? String else { return }
            SharedStore.save(rawJSON: json)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}

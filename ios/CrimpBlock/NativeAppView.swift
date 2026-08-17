import SwiftUI

/// The real thing: sign in (or resume a persisted Keychain session), load
/// actual Store/Loads data over REST, and render today's card via the same
/// DailyCardView NativeEngineDemoView uses with sample data. This is the
/// point where Phase B stops being a proof-of-concept and starts being a
/// genuinely usable native screen — still reached only via the same
/// DEBUG-only long-press as the demo, not wired in as the app's default.
///
/// Known limitation, honestly scoped rather than hidden: this loads once
/// and renders — logging a session or setting a weight (not built yet)
/// would need the EngineBridge recreated against the updated data, since
/// unlike the web version's live-mutating Store/Loads, the data handed to
/// createEngine() here is a snapshot taken at construction time. Fine for
/// a read-only daily-card view; matters once writes are added.
struct NativeAppView: View {
    @State private var client = SupabaseClient(
        url: "https://lbhsgkadlhcqqnlbfswr.supabase.co",
        anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiaHNna2FkbGhjcXFubGJmc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNTg2NzMsImV4cCI6MjEwMTkzNDY3M30.3Df2BW9YVfJYZVSalLWGsx54iY_RvnZdln71Kehljug"
    )
    @State private var state: DailyCardState?
    @State private var loadError: String?
    @State private var loading = false

    var body: some View {
        Group {
            if client.session == nil {
                NativeSignInView(client: client, onSignedIn: { Task { await loadReal() } })
            } else if let loadError {
                engineBridgeErrorView(loadError)
            } else if let state {
                DailyCardView(
                    state: state,
                    footerNote: "Native SwiftUI (live data) · \(client.session?.email ?? "") · \(state.today)"
                )
            } else {
                ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
                    .task {
                        if !loading { await loadReal() }
                    }
            }
        }
    }

    private func loadReal() async {
        guard let session = client.session, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            // A throwaway bridge just for today()/addDays()/the program's
            // startDate — needed to compute NativeStore's load window
            // before the REAL bridge (built from what that load returns)
            // can exist. Cheap: JSContext creation is not the bottleneck
            // here, network round-trips are.
            let probe = try EngineBridge(email: session.email, sessionLog: [:], loadLog: [:])
            let startDate = probe.program.forProperty("startDate")?.toString() ?? probe.today()

            let store = NativeStore(client: client, startDate: startDate)
            try await store.load(engineCore: probe)
            let loads = NativeLoads(client: client)
            try await loads.load()

            var sessionLog: [String: Any] = [:]
            for (date, entry) in store.all() { sessionLog[date] = ["t": entry.t] }

            let bridge = try EngineBridge(email: session.email, sessionLog: sessionLog, loadLog: loads.all())
            guard let s = DailyCardState.load(bridge: bridge) else {
                loadError = "engine returned incomplete data for \(session.email)"; return
            }
            state = s
        } catch {
            loadError = "\(error)"
        }
    }
}

#Preview {
    NativeAppView()
}

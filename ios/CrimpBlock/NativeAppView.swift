import SwiftUI

/// The real thing: sign in (or resume a persisted Keychain session), load
/// actual Store/Loads data over REST, and render + interact with today's
/// card via the same DailyCardView NativeEngineDemoView uses with sample
/// data. Reached only via the same DEBUG-only long-press as the demo, not
/// wired in as the app's default.
///
/// EngineBridge takes a data SNAPSHOT at construction (createEngine() in
/// engine-core.js doesn't mutate live like the web version's Store/Loads
/// do) — so every write here rebuilds the bridge from the just-updated
/// NativeStore/NativeLoads afterward. That rebuild is the "reload()" this
/// view keeps calling; it's not wasted work, it's how a snapshot-based
/// engine stays correct after a write.
struct NativeAppView: View {
    @State private var client = SupabaseClient(
        url: "https://lbhsgkadlhcqqnlbfswr.supabase.co",
        anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiaHNna2FkbGhjcXFubGJmc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNTg2NzMsImV4cCI6MjEwMTkzNDY3M30.3Df2BW9YVfJYZVSalLWGsx54iY_RvnZdln71Kehljug"
    )
    @State private var store: NativeStore?
    @State private var loads: NativeLoads?
    @State private var state: DailyCardState?
    @State private var loadError: String?
    @State private var saveError: String?
    @State private var loading = false
    @State private var ticks: Set<String> = []
    @State private var editingExercise: EngineBridge.RenderedExercise?
    @State private var browsedKey: String?

    var body: some View {
        Group {
            if client.session == nil {
                NativeSignInView(client: client, onSignedIn: { Task { await reload() } })
            } else if let loadError {
                engineBridgeErrorView(loadError)
            } else if let state {
                DailyCardView(
                    state: state,
                    footerNote: "Native SwiftUI (live data) · \(client.session?.email ?? "") · \(state.today)"
                        + (saveError != nil ? " · save failed" : ""),
                    isLogged: store?.get(state.today)?.t == state.displayKey,
                    ticks: ticks,
                    onToggleTick: { id in
                        if ticks.contains(id) { ticks.remove(id) } else { ticks.insert(id) }
                    },
                    onTapWeight: { ex in editingExercise = ex },
                    onTapDone: { Task { await toggleDone() } },
                    onBrowse: { key in browse(to: key) }
                )
            } else {
                ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
                    .task { if !loading { await reload() } }
            }
        }
        .sheet(item: $editingExercise) { ex in
            WeightEditView(exercise: ex) { kg in
                Task { await saveWeight(id: ex.id, kg: kg) }
            }
        }
    }

    // MARK: - Loading

    /// Rebuilds the EngineBridge from whatever NativeStore/NativeLoads
    /// currently hold — the one path both initial load AND every write
    /// funnel through, so there's exactly one place "recompute today's
    /// card" happens.
    private func reload() async {
        guard let session = client.session, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            if store == nil || loads == nil {
                let probe = try EngineBridge(email: session.email, sessionLog: [:], loadLog: [:])
                let startDate = probe.program.forProperty("startDate")?.toString() ?? probe.today()
                let newStore = NativeStore(client: client, startDate: startDate)
                try await newStore.load(engineCore: probe)
                let newLoads = NativeLoads(client: client)
                try await newLoads.load()
                store = newStore
                loads = newLoads
            } else {
                let probe = try EngineBridge(email: session.email, sessionLog: [:], loadLog: [:])
                try await store?.load(engineCore: probe)
                try await loads?.load()
            }

            var sessionLog: [String: Any] = [:]
            for (date, entry) in store?.all() ?? [:] { sessionLog[date] = ["t": entry.t] }

            let bridge = try EngineBridge(email: session.email, sessionLog: sessionLog, loadLog: loads?.all() ?? [:])
            guard let s = DailyCardState.load(bridge: bridge, displayKey: browsedKey) else {
                loadError = "engine returned incomplete data for \(session.email)"; return
            }
            ticks = []
            state = s
            loadError = nil
        } catch {
            loadError = "\(error)"
        }
    }

    /// Mirrors app.js's session dots: tap a different session to preview
    /// and (if you choose) log THAT one instead of the recommendation.
    private func browse(to key: String) {
        guard key != state?.displayKey else { return }
        browsedKey = key
        Task { await reload() }
    }

    // MARK: - Writes

    /// Mirrors finish()/doneBtn in app.js: ticking an exercise off doubles
    /// as confirming the weight shown, so a ticked, weight-tracked exercise
    /// with nothing already recorded today gets its target auto-saved —
    /// computed and saved BEFORE the day itself is logged, same ordering
    /// app.js uses and for the same reason (logging can tip the block into
    /// a deload week, which would change what target() says).
    private func toggleDone() async {
        guard let state, let store, let loads else { return }
        saveError = nil
        do {
            if store.get(state.today)?.t == state.displayKey {
                try await store.clear(date: state.today)
            } else {
                for ex in state.exercises where ticks.contains(ex.id) && ex.hasWeightTracking {
                    guard loads.on(ex.id, date: state.today) == nil, let kg = ex.weightKg else { continue }
                    try await loads.set(date: state.today, id: ex.id, kg: kg)
                }
                try await store.set(date: state.today, type: state.displayKey, load: nil)
            }
            browsedKey = nil // mirrors app.js: logging/undoing TODAY resets browseIndex
            await reload()
        } catch {
            saveError = "\(error)"
        }
    }

    private func saveWeight(id: String, kg: Double) async {
        guard let state, let loads else { return }
        saveError = nil
        do {
            try await loads.set(date: state.today, id: id, kg: kg)
            await reload()
        } catch {
            saveError = "\(error)"
        }
    }
}

#Preview {
    NativeAppView()
}

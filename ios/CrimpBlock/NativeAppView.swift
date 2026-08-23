import SwiftUI
import WidgetKit

/// The real thing: sign in (or resume a persisted Keychain session), load
/// actual Store/Loads data over REST, and render + interact with today's
/// card via the same DailyCardView NativeEngineDemoView uses with sample
/// data. Reached only via the same DEBUG-only long-press as the demo, not
/// wired in as the app's default.
///
/// Two account kinds, one flow: `EngineBridge.isBuiltInProgram` (see
/// EngineBridge.swift) tells `reload()` which path a signed-in email takes.
/// Oscar and Joe are Deadpoint's own hand-authored athletes, not customers
/// of the template system (per the plan's Phase C) — they go straight to
/// their PROGRAMS entry, no quiz, no paywall, ever. Everyone else is a
/// Standard-tier template user: no `profiles` row yet means the quiz hasn't
/// been done (`needsQuiz`), a row with no `tutorialCompletedAt` means the
/// one-time walkthrough hasn't run (`needsTutorial`), and no active
/// StoreKit entitlement means the paywall blocks the card (`needsPaywall`)
/// — an Offer-Code redemption satisfies this the same as a paid purchase,
/// since StoreKit doesn't distinguish the two (see PaywallView's "Have a
/// code?" button). `reload()` is the one place all of this is decided, so
/// there's exactly one source of truth for "what should this person see
/// right now" — not scattered across the view.
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
    @State private var profile: NativeProfile?
    @State private var isBuiltInProgram = false
    @State private var subscriptionManager = SubscriptionManager()
    @State private var needsQuiz = false
    @State private var needsTutorial = false
    @State private var needsPaywall = false
    @State private var state: DailyCardState?
    @State private var loadError: String?
    @State private var saveError: String?
    @State private var loading = false
    @State private var ticks: Set<String> = []
    @State private var editingExercise: EngineBridge.RenderedExercise?
    @State private var browsedKey: String?
    @State private var pickingDate: String?
    @State private var celebrationTrigger = 0
    /// Device-level, not account-level — shown once ever per install, not
    /// once per sign-in. A returning user who's already seen it shouldn't
    /// see it again just because they signed out (see WelcomeView's doc
    /// comment for why this is a separate gate from `client.session`).
    @AppStorage("hasSeenWelcome") private var hasSeenWelcome = false

    var body: some View {
        Group {
            if !hasSeenWelcome {
                WelcomeView(onContinue: { hasSeenWelcome = true })
            } else if client.session == nil {
                NativeSignInView(client: client, onSignedIn: { Task { await reload() } })
            } else if needsQuiz {
                // onCancel matters here specifically: this is a brand-new
                // sign-in with no profile row yet, so if someone typed the
                // wrong email and only notices once they see the quiz, this
                // is the one moment nothing has been written for that
                // account yet — signing out and back in with the right
                // email costs them nothing. Once the quiz is submitted a
                // profile row exists and this stops being reachable.
                IntakeQuizView(onComplete: { answers in Task { await completeQuiz(answers) } }, onCancel: { signOut() })
            } else if needsTutorial {
                TutorialDemoCardView(onDone: { Task { await completeTutorial() } })
            } else if needsPaywall {
                PaywallView(onSubscribed: { Task { await reload() } }, onCancel: { signOut() })
            } else if let loadError {
                engineBridgeErrorView(loadError)
            } else if let state {
                DailyCardView(
                    state: state,
                    footerNote: "Native SwiftUI (live data) · \(client.session?.email ?? "") · \(state.today)"
                        + (saveError != nil ? " · save failed" : ""),
                    isLogged: store?.get(state.today)?.t == state.displayKey,
                    loggedSessionKey: store?.get(state.today)?.t,
                    ticks: ticks,
                    onToggleTick: { id in
                        if ticks.contains(id) { ticks.remove(id) } else { ticks.insert(id) }
                    },
                    onTapWeight: { ex in editingExercise = ex },
                    onTapDone: { Task { await toggleDone() } },
                    onBrowse: { key in browse(to: key) },
                    weekDays: weekDays(around: state),
                    onTapDay: { date in pickingDate = date },
                    accountEmail: client.session?.email,
                    onSignOut: { signOut() },
                    celebrationTrigger: celebrationTrigger
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
        .sheet(item: Binding(get: { pickingDate.map { PickingDate(date: $0) } }, set: { pickingDate = $0?.date })) { picking in
            if let state {
                DayPickerView(
                    date: picking.date, bridge: state.bridge,
                    hasExistingEntry: store?.get(picking.date) != nil,
                    onPick: { key in Task { await logDay(picking.date, key: key) } },
                    onClear: { Task { await clearDay(picking.date) } }
                )
            }
        }
    }

    /// The last 7 days including today, coloured by whatever NativeStore
    /// has for each — mirrors app.js's week-dots loop exactly (7 days back
    /// from `today()`, using each session's own accent colour).
    private func weekDays(around state: DailyCardState) -> [WeekDay] {
        guard let store else { return [] }
        var out: [WeekDay] = []
        for i in stride(from: 6, through: 0, by: -1) {
            let date = state.bridge.addDays(state.today, -i)
            let entry = store.get(date)
            let letter = Self.dayLetter(date)
            out.append(WeekDay(
                id: date, dayLetter: letter,
                colourVarName: entry.map { state.bridge.sessionColourVarName($0.t) },
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

    // MARK: - Loading

    /// The single place "what should this account see right now" is
    /// decided (see the type doc comment above) AND the place that rebuilds
    /// the EngineBridge from whatever NativeStore/NativeLoads currently
    /// hold — every write in this file funnels back through here, so
    /// there's exactly one place "recompute today's card" happens.
    private func reload() async {
        guard let session = client.session, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let probe = try EngineBridge(email: session.email, sessionLog: [:], loadLog: [:])
            isBuiltInProgram = probe.isBuiltInProgram

            if probe.isBuiltInProgram {
                needsQuiz = false; needsTutorial = false; needsPaywall = false
                let startDate = probe.program.forProperty("startDate")?.toString() ?? probe.today()
                try await ensureStoreAndLoadsLoaded(startDate: startDate, dateHelper: probe)
                let bridge = try EngineBridge(email: session.email, sessionLog: currentSessionLogPayload(), loadLog: loads?.all() ?? [:])
                try finishLoad(bridge: bridge, label: session.email)
                return
            }

            if profile == nil {
                let p = NativeProfile(client: client)
                try await p.load()
                profile = p
            }

            guard let assignedTemplateID = profile?.row?.assignedTemplateID,
                  let startDate = profile?.row?.programStartDate else {
                needsQuiz = true
                return
            }
            needsQuiz = false

            guard profile?.row?.tutorialCompletedAt != nil else {
                needsTutorial = true
                return
            }
            needsTutorial = false

            await subscriptionManager.loadProduct()
            await subscriptionManager.refreshEntitlement()
            guard subscriptionManager.isSubscribed else {
                needsPaywall = true
                return
            }
            needsPaywall = false

            let modifiers = (profile?.row?.modifiers ?? [:]).mapValues { $0.value }
            let templateProbe = try EngineBridge(templateId: assignedTemplateID, startDate: startDate, modifiers: modifiers, sessionLog: [:], loadLog: [:])
            try await ensureStoreAndLoadsLoaded(startDate: startDate, dateHelper: templateProbe)
            let bridge = try EngineBridge(templateId: assignedTemplateID, startDate: startDate, modifiers: modifiers, sessionLog: currentSessionLogPayload(), loadLog: loads?.all() ?? [:])
            try finishLoad(bridge: bridge, label: session.email)
        } catch {
            loadError = "\(error)"
        }
    }

    /// Shared by both the built-in and template paths: loads NativeStore
    /// (first time) / refreshes it (subsequent reloads), same for
    /// NativeLoads — identical either way since both just read the
    /// `sessions`/`loads` tables for whoever is signed in.
    private func ensureStoreAndLoadsLoaded(startDate: String, dateHelper: EngineBridgeDateHelper) async throws {
        if store == nil || loads == nil {
            let newStore = NativeStore(client: client, startDate: startDate)
            try await newStore.load(engineCore: dateHelper)
            let newLoads = NativeLoads(client: client)
            try await newLoads.load()
            store = newStore
            loads = newLoads
        } else {
            try await store?.load(engineCore: dateHelper)
            try await loads?.load()
        }
    }

    private func currentSessionLogPayload() -> [String: Any] {
        var sessionLog: [String: Any] = [:]
        for (date, entry) in store?.all() ?? [:] { sessionLog[date] = ["t": entry.t] }
        return sessionLog
    }

    private struct EngineOutOfSyncError: Error, CustomStringConvertible {
        let label: String
        var description: String { "engine returned incomplete data for \(label)" }
    }

    private func finishLoad(bridge: EngineBridge, label: String) throws {
        guard let s = DailyCardState.load(bridge: bridge, displayKey: browsedKey) else {
            throw EngineOutOfSyncError(label: label)
        }
        // Only when the actually-displayed session changed (a different
        // day, or a genuinely different session type) — NOT on every
        // reload. reload() also runs after a weight save and after Done/
        // Undo, which refresh data for the SAME session; unconditionally
        // clearing here wiped ticks on exercises you'd already checked
        // off, purely as a side effect of editing one unrelated
        // exercise's weight. Reported directly: changing one weight
        // un-ticked two others in the same session. browse(to:) already
        // handles the genuine-session-change case on its own (it never
        // goes through reload()/finishLoad at all), so this only needs
        // to catch the cases that DO come through here — Done on a
        // browsed (non-recommended) session landing back on the real
        // recommendation, or the day rolling over while the app is open.
        if state?.today != s.today || state?.displayKey != s.displayKey {
            ticks = []
        }
        state = s
        loadError = nil

        // Keeps the home-screen widget in sync with whatever the native
        // app just showed — mirrors pushNative()'s call at the end of
        // every render() on the web side. Without this, logging a
        // session natively would leave the widget showing yesterday's
        // forecast until the WKWebView app was next opened.
        if let forecast = bridge.nativeForecast(days: 14),
           let json = try? JSONEncoder().encode(forecast),
           let jsonString = String(data: json, encoding: .utf8) {
            SharedStore.save(rawJSON: jsonString)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    /// Called once, right after the quiz — writes the profile that turns
    /// this sign-in into a template-assigned Standard-tier user, then lets
    /// reload() pick the very next gate (the tutorial) on its own.
    private func completeQuiz(_ answers: QuizAnswers) async {
        do {
            let p = profile ?? NativeProfile(client: client)
            let fmt = DateFormatter()
            fmt.locale = Locale(identifier: "en_US_POSIX")
            fmt.dateFormat = "yyyy-MM-dd"
            let startDate = fmt.string(from: Date().appDay)
            try await p.create(templateID: answers.templateId, startDate: startDate, modifiers: answers.modifiersPayload)
            profile = p
            await reload()
        } catch {
            loadError = "\(error)"
        }
    }

    /// A failed write here shouldn't trap someone behind the tutorial gate
    /// forever — worst case reload() shows it again next launch, which is
    /// harmless, so this doesn't surface as loadError the way completeQuiz's
    /// failure does.
    private func completeTutorial() async {
        needsTutorial = false
        try? await profile?.markTutorialCompleted()
        await reload()
    }

    /// Mirrors app.js's session dots: tap a different session to preview
    /// and (if you choose) log THAT one instead of the recommendation.
    private func browse(to key: String) {
        guard key != state?.displayKey, let bridge = state?.bridge else { return }
        browsedKey = key
        // Deliberately NOT reload(): browsing only changes WHICH session is
        // on screen, and the engine already holds everything needed to
        // answer that. reload() re-fetched both Supabase tables and rebuilt
        // the whole EngineBridge (a fresh JSContext evaluation) for what is
        // a purely local view change — so every swipe paid a network
        // round-trip, and the card visibly re-rendered when the new state
        // finally landed, well after the swipe had finished. Rebuilding the
        // state straight off the existing bridge is synchronous and lands
        // in the same frame the swipe commits in.
        guard let s = DailyCardState.load(bridge: bridge, displayKey: key) else { return }
        ticks = []  // same as finishLoad — a different session means different exercises
        state = s
    }

    /// Mirrors app.js's signOutBtn handler (sb.auth.signOut().then(() =>
    /// location.reload())) — client.signOut() clears the Keychain session,
    /// and every piece of THIS user's data is dropped too, not just left
    /// stale for whoever signs in next.
    private func signOut() {
        client.signOut()
        store = nil
        loads = nil
        profile = nil
        needsQuiz = false
        needsTutorial = false
        needsPaywall = false
        state = nil
        ticks = []
        browsedKey = nil
        pickingDate = nil
        loadError = nil
        saveError = nil
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
                celebrationTrigger += 1 // mirrors app.js's finish(): celebrate() fires on logging TODAY, never on undo
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

    /// Logging/clearing a PAST day via the week strip — same store call as
    /// today's Done button, just a different date. Doesn't touch
    /// ticks/weight auto-recording (that's specific to logging TODAY's
    /// session as you do it), and only resets browsing if the day in
    /// question happens to be today, same as toggleDone().
    private func logDay(_ date: String, key: String) async {
        guard let store else { return }
        saveError = nil
        do {
            try await store.set(date: date, type: key, load: nil)
            if date == state?.today { browsedKey = nil }
            await reload()
        } catch {
            saveError = "\(error)"
        }
    }

    private func clearDay(_ date: String) async {
        guard let store else { return }
        saveError = nil
        do {
            try await store.clear(date: date)
            if date == state?.today { browsedKey = nil }
            await reload()
        } catch {
            saveError = "\(error)"
        }
    }
}

private struct PickingDate: Identifiable {
    let date: String
    var id: String { date }
}

#Preview {
    NativeAppView()
}

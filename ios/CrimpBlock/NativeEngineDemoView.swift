import SwiftUI

/// Phase B proof-of-concept: the SAME rules engine (engine-core.js, bundled
/// into the app, run via JavaScriptCore through EngineBridge) driving a real
/// SwiftUI screen, with no WKWebView anywhere in this view. Nothing here
/// talks to Supabase yet — that's real, separate plumbing (auth + syncing
/// Store/Loads natively) deliberately left for after this proves the
/// harder architectural bet: that engine-core.js can be the single source
/// of truth for BOTH the web app and a fully native one.
///
/// Seeded with a small, realistic sample history (mirroring the fake-
/// Supabase harness used to verify the web side of this same extraction)
/// rather than Oscar's real logged data, so this view works standalone.
struct NativeEngineDemoView: View {
    @State private var bridge: EngineBridge?
    @State private var loadError: String?
    @State private var today = ""
    @State private var decision: EngineBridge.Decision?
    @State private var blockInfo: EngineBridge.BlockInfo?
    @State private var phaseName = ""
    @State private var sessionInfo: EngineBridge.SessionInfo?
    @State private var exercises: [EngineBridge.RenderedExercise] = []
    @State private var accent: Color = SessionColours.resolve("--gorse")

    var body: some View {
        ZStack {
            SessionColours.bg.ignoresSafeArea()
            if let loadError {
                errorView(loadError)
            } else if let decision, let blockInfo, let sessionInfo {
                content(decision: decision, block: blockInfo, session: sessionInfo)
            } else {
                ProgressView().tint(.white)
            }
        }
        .task { load() }
    }

    // MARK: - Loading

    private func load() {
        do {
            let (sessionLog, loadLog) = Self.sampleData()
            let bridge = try EngineBridge(email: "oscar@sullivanltd.co.uk", sessionLog: sessionLog, loadLog: loadLog)
            self.bridge = bridge

            let today = bridge.today()
            self.today = today
            guard let d = bridge.decide(date: today) else {
                loadError = "decide() returned nothing"; return
            }
            guard let b = bridge.block(date: today) else {
                loadError = "block() returned nothing"; return
            }
            let phase = bridge.phaseNameAt(today) ?? "?"
            guard let info = bridge.sessionInfo(d.k) else {
                loadError = "no session content for '\(d.k)'"; return
            }
            decision = d
            blockInfo = b
            phaseName = phase
            sessionInfo = info
            exercises = bridge.resolveExercises(for: d.k, date: today, phaseName: phase)

            // The session's own colour lives in programs.js as e.g.
            // "--gorse" — same lookup app.js does via v(s.c), just against
            // the native palette instead of computed CSS.
            if let c = bridge.program.forProperty("sessions")?.forProperty(d.k)?.forProperty("c")?.toString() {
                accent = SessionColours.resolve(c)
            }
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

    // MARK: - Content

    private func content(decision: EngineBridge.Decision, block: EngineBridge.BlockInfo, session: EngineBridge.SessionInfo) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header(block: block)
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.name.uppercased())
                        .font(.system(size: 32, weight: .heavy))
                        .foregroundStyle(.white)
                    Text(session.where_)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(accent)
                }
                if let note = session.note {
                    Text(note)
                        .font(.system(size: 14))
                        .foregroundStyle(SessionColours.dim)
                }
                Text(decision.why)
                    .font(.system(size: 12))
                    .foregroundStyle(SessionColours.faint)
                    .italic()

                VStack(spacing: 10) {
                    ForEach(exercises) { ex in
                        exerciseRow(ex)
                    }
                }

                footer
            }
            .padding(20)
        }
    }

    private func header(block: EngineBridge.BlockInfo) -> some View {
        HStack {
            Text("\(phaseName.uppercased()) · WK \(block.w)" + (block.w == 4 ? " · DELOAD" : ""))
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(SessionColours.bg)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(accent)
                .clipShape(Capsule())
            Spacer()
            Text("\(block.done)/\(block.per) this week")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(SessionColours.faint)
        }
    }

    private func exerciseRow(_ ex: EngineBridge.RenderedExercise) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(ex.title.uppercased())
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Text(ex.prescription)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(ex.phaseAdjusted ? accent : SessionColours.faint)
                if let kg = ex.weightKg {
                    Text("\(kg.formatted(.number.precision(.fractionLength(0...2))))kg")
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundStyle(ex.weightIsBump ? accent : SessionColours.dim)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(SessionColours.s3)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            if let d = ex.description {
                Text(d)
                    .font(.system(size: 12.5))
                    .foregroundStyle(SessionColours.dim)
            }
            if let r = ex.restSeconds {
                Text("Rest \(r / 60):\(String(format: "%02d", r % 60))")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(SessionColours.faint)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var footer: some View {
        Text("Native SwiftUI · engine-core.js via JavaScriptCore · \(today)")
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(SessionColours.faint)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 12)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            Text("EngineBridge failed to load").foregroundStyle(.white).font(.headline)
            Text(message)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(SessionColours.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
    }
}

#Preview {
    NativeEngineDemoView()
}

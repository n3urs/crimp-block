import SwiftUI

/// One consolidated sheet for account + preferences, reached from the
/// header's gear icon. Previously the header had a separate person-icon
/// button that only opened a plain confirmationDialog for sign-out — that
/// became the ACCOUNT section here rather than staying a second small icon
/// alongside a new settings cog, per direct confirmation this session that
/// consolidating was preferred over cluttering an already-minimal header.
struct SettingsView: View {
    var accountEmail: String?
    var onSignOut: (() -> Void)?
    /// Phase C.1: nil in demo/sample-data mode (NativeEngineDemoView),
    /// present whenever there's a real signed-in account — reading
    /// profile.row directly (rather than a snapshot passed in) means the
    /// TRAINING TRACK section always reflects the account's actual
    /// current assignment, not what it was when this sheet was opened.
    var profile: NativeProfile?
    /// Called after a track switch/assignment write succeeds — the
    /// caller (NativeAppView) re-derives everything via reload(), the
    /// same "every write funnels back through one place" pattern the
    /// rest of that file already uses; this view has no opinion about
    /// what happens after, same as onSignOut.
    var onTrackChanged: (() async -> Void)?
    @Environment(\.dismiss) private var dismiss

    /// Plain UserDefaults, not synced anywhere — these are device-local
    /// display preferences, not account data, so there's no reason to
    /// route them through Supabase the way logged sessions/weights are.
    @AppStorage("setsCounterEnabled") private var setsCounterEnabled = false
    @AppStorage("autoStartRestOnTally") private var autoStartRestOnTally = false

    @State private var showTrackQuiz = false
    @State private var switching = false
    @State private var switchError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                SessionColours.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        if let accountEmail {
                            section("ACCOUNT") {
                                VStack(alignment: .leading, spacing: 14) {
                                    Text(accountEmail)
                                        .font(AppFonts.mono(13, weight: .medium))
                                        .foregroundStyle(SessionColours.dim)
                                    Button(action: { onSignOut?(); dismiss() }) {
                                        Text("SIGN OUT")
                                            .font(AppFonts.mono(12, weight: .bold))
                                            .foregroundStyle(SessionColours.restC)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        if profile != nil {
                            trackSection
                        }

                        section("EXERCISE TRACKING") {
                            VStack(alignment: .leading, spacing: 18) {
                                toggleRow(
                                    title: "SETS COUNTER",
                                    subtitle: "Tap through a tally of sets on each exercise, instead of ticking it off all at once. Only shows up where the set count is unambiguous in the prescription text.",
                                    isOn: $setsCounterEnabled
                                )
                                if setsCounterEnabled {
                                    Rectangle().fill(SessionColours.s3).frame(height: 1)
                                    toggleRow(
                                        title: "AUTO-START REST TIMER",
                                        subtitle: "Every tally tap also starts that exercise's rest timer, so you don't have to tap Rest separately.",
                                        isOn: $autoStartRestOnTally
                                    )
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(SessionColours.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .sheet(isPresented: $showTrackQuiz) {
                IntakeQuizView(
                    onComplete: { result in
                        showTrackQuiz = false
                        Task { await applyTrackSwitch(result) }
                    },
                    onCancel: { showTrackQuiz = false }
                )
            }
        }
    }

    // MARK: - Training track (Phase C.1)

    private var trackSection: some View {
        section("TRAINING TRACK") {
            VStack(alignment: .leading, spacing: 14) {
                Text(trackSummaryText)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)

                Button(action: { showTrackQuiz = true }) {
                    Text(switching ? "…" : "SWITCH TRACK")
                        .font(AppFonts.mono(12, weight: .bold))
                        .foregroundStyle(SessionColours.fg)
                }
                .buttonStyle(.plain)
                .disabled(switching)

                // Only offered when there's actually something to restore
                // without a requiz — a rehab-track profile that already
                // has a standard assignment underneath it (see
                // NativeProfile.assignRehab()'s doc comment on why that
                // assignment is left untouched rather than overwritten).
                if profile?.row?.trackType == "rehab", let standardName {
                    Button(action: { Task { await restoreStandard() } }) {
                        Text("RESTORE “\(standardName)” INSTANTLY")
                            .font(AppFonts.mono(11, weight: .medium))
                            .foregroundStyle(SessionColours.faint)
                    }
                    .buttonStyle(.plain)
                    .disabled(switching)
                }

                if let switchError {
                    Text(switchError)
                        .font(.system(size: 11))
                        .foregroundStyle(SessionColours.restC)
                }
            }
        }
    }

    private var trackSummaryText: String {
        guard let row = profile?.row else { return "—" }
        if row.trackType == "rehab" {
            let areaName = row.rehabInjuryArea.flatMap { REHAB_META[$0]?.name } ?? row.rehabInjuryArea ?? "Rehab"
            let phaseNames = ["Tissue Unload", "Mobility", "Strength", "Return to Climbing"]
            let idx = row.rehabPhaseIndex ?? 0
            let phaseName = (idx >= 0 && idx < phaseNames.count) ? phaseNames[idx] : phaseNames[0]
            return "Rehab — \(areaName), \(phaseName)"
        }
        let name = row.assignedTemplateID.flatMap { TEMPLATE_META[$0]?.name } ?? row.assignedTemplateID ?? "Standard"
        return "Standard — \(name)"
    }

    private var standardName: String? {
        guard let row = profile?.row, let id = row.assignedTemplateID else { return nil }
        return TEMPLATE_META[id]?.name ?? id
    }

    private func restoreStandard() async {
        guard let profile else { return }
        switching = true
        defer { switching = false }
        do {
            try await profile.switchToStandard()
            await onTrackChanged?()
            dismiss()
        } catch {
            switchError = "\(error)"
        }
    }

    private func applyTrackSwitch(_ result: QuizResult) async {
        guard let profile else { return }
        switching = true
        defer { switching = false }
        do {
            switch result {
            case .standard(let answers):
                let fmt = DateFormatter()
                fmt.locale = Locale(identifier: "en_US_POSIX")
                fmt.dateFormat = "yyyy-MM-dd"
                let startDate = fmt.string(from: Date().appDay)
                try await profile.create(templateID: answers.templateId, startDate: startDate, modifiers: answers.modifiersPayload)
            case .rehab(let area):
                try await profile.assignRehab(injuryArea: area.rawValue)
            }
            await onTrackChanged?()
            dismiss()
        } catch {
            switchError = "\(error)"
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(AppFonts.mono(11, weight: .bold))
                .foregroundStyle(SessionColours.faint)
                .tracking(1.2)
            content()
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SessionColours.s1)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private func toggleRow(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: isOn) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .tint(SessionColours.resolve("--gorse"))
            Text(subtitle)
                .font(.system(size: 12))
                .foregroundStyle(SessionColours.faint)
        }
    }
}

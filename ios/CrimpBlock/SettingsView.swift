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
    @Environment(\.dismiss) private var dismiss

    /// Plain UserDefaults, not synced anywhere — these are device-local
    /// display preferences, not account data, so there's no reason to
    /// route them through Supabase the way logged sessions/weights are.
    @AppStorage("setsCounterEnabled") private var setsCounterEnabled = false
    @AppStorage("autoStartRestOnTally") private var autoStartRestOnTally = false

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

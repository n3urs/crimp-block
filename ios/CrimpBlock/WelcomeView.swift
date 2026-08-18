import SwiftUI

/// The very first thing a brand-new install shows, before the email
/// sign-in form — a bare "SIGN IN" field with zero context was too cold a
/// first impression for someone downloading the app fresh (direct
/// feedback: it needs a welcome screen before sign-in). Deliberately
/// minimal, holding to the same "simple, not overwhelming" standard the
/// rest of the app does: wordmark, one line, one button — the actual
/// pitch happens by using the app, not by reading about it here.
///
/// Shown once ever per install (`hasSeenWelcome` in NativeAppView), not
/// once per sign-in — a returning, already-authenticated user should never
/// see this again just because they signed out and back in.
struct WelcomeView: View {
    var onContinue: () -> Void

    var body: some View {
        ZStack {
            SessionColours.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                Spacer()
                Text("DEADPOINT")
                    .font(.system(size: 44, weight: .heavy))
                    .foregroundStyle(SessionColours.fg)
                Text("Adaptive daily training for climbers — one recommended session a day, built around your own recovery.")
                    .font(.system(size: 16))
                    .foregroundStyle(SessionColours.dim)
                Spacer()
                Button(action: onContinue) {
                    Text("GET STARTED")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundStyle(SessionColours.bg)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(SessionColours.resolve("--gorse"))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(24)
        }
    }
}

#Preview {
    WelcomeView(onContinue: {})
}

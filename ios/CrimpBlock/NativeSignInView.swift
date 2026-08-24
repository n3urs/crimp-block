import SwiftUI

/// Native equivalent of showLogin()/showCode() in app.js — same two-step
/// flow (email, then a typed code) and same reasoning for typing the code
/// rather than relying on the emailed link: tapping a link opens Safari,
/// which has separate storage from this app, so a link that signs you in
/// on the website would leave the app itself still signed out.
struct NativeSignInView: View {
    let client: SupabaseClient
    var onSignedIn: () -> Void

    private enum Step { case email, code }
    @State private var step: Step = .email
    @State private var email = ""
    @State private var code = ""
    @State private var message: String?
    @State private var isError = false
    @State private var sending = false
    /// Belt-and-braces against the real failure mode this whole thing
    /// exists to prevent: a second SEND CODE tap silently invalidates
    /// whatever code Supabase already sent, since only the newest one
    /// stays valid. The screen swapping to "ENTER CODE" was the only
    /// success signal, easy to miss, so an unsure user's natural next
    /// move — tap it again — was quietly killing their real code. This
    /// disables another send for a stretch after one already went out,
    /// on top of (not instead of) making that first send obviously
    /// visible below.
    @State private var resendCooldown: Int = 0
    private static let resendCooldownSeconds = 30
    private let cooldownTick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            SessionColours.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                Text(step == .email ? "SIGN IN" : "ENTER CODE")
                    .font(.system(size: 32, weight: .heavy))
                    .foregroundStyle(.white)
                Text(step == .email ? "Deadpoint" : "Sign-in")
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(SessionColours.resolve("--gorse"))

                // Three real states, three distinct looks — an error used to
                // be styled identically to routine instructions (same dim
                // grey either way), which made a genuine failure easy to
                // read as just more copy rather than something that went
                // wrong. A fresh, successful send gets its own accent-
                // coloured, bolder confirmation for the same reason in
                // reverse: "it worked" needs to be obvious, not just present.
                Text(message ?? defaultMessage)
                    .font(.system(size: 14, weight: (step == .code && message == nil) ? .semibold : .regular))
                    .foregroundStyle(messageColour)

                if step == .email {
                    placeholderField("you@example.com", text: $email, keyboardType: .emailAddress, autocapitalization: .never, autocorrection: false)
                        .onChange(of: email) { _, _ in
                            // A cooldown protecting the PREVIOUS address
                            // shouldn't block sending to a freshly-typed
                            // different one, e.g. fixing a typo.
                            resendCooldown = 0
                        }
                    Button(action: sendCode) {
                        Text(sendButtonLabel).buttonLabelStyle()
                    }
                    .disabled(!emailLooksValid || sending || resendCooldown > 0)
                    .opacity((!emailLooksValid || sending || resendCooldown > 0) ? 0.5 : 1)
                    .onReceive(cooldownTick) { _ in
                        if resendCooldown > 0 { resendCooldown -= 1 }
                    }
                } else {
                    placeholderField("code from email", text: $code, keyboardType: .numberPad)
                    HStack(spacing: 10) {
                        Button(action: { step = .email; message = nil; isError = false }) {
                            Text("BACK").buttonLabelStyle(secondary: true)
                        }
                        Button(action: verifyCode) {
                            Text(sending ? "CHECKING…" : "SIGN IN").buttonLabelStyle()
                        }
                        .disabled(code.filter(\.isNumber).count < 4 || sending)
                        .opacity((code.filter(\.isNumber).count < 4 || sending) ? 0.5 : 1)
                    }
                }
                Spacer()
            }
            .padding(20)
        }
    }

    private var defaultMessage: String {
        step == .email
            ? "Enter your email. Each email gets its own private log."
            : "✓ Code sent to \(email) — check your inbox and type it below."
    }

    /// Error red for a real failure, accent gold for "it worked, look at
    /// this," dim grey for routine instructions the rest of the time —
    /// previously all three were the exact same muted colour, which is
    /// why a successful send didn't read as an obvious confirmation.
    private var messageColour: Color {
        if isError { return SessionColours.restC }
        if step == .code && message == nil { return SessionColours.resolve("--gorse") }
        return SessionColours.dim
    }

    /// Counts down instead of just re-reading "SEND CODE" — the cooldown
    /// existing at all is useless if there's no visible reason not to tap
    /// through it the instant it looks tappable again.
    private var sendButtonLabel: String {
        if sending { return "SENDING…" }
        if resendCooldown > 0 { return "RESEND IN \(resendCooldown)s" }
        return "SEND CODE"
    }

    /// A real inbox can't be confirmed client-side — this only rules out
    /// obviously malformed input (no @, no domain, stray spaces) before
    /// wasting a network round trip. sendOTP() below still hits Supabase's
    /// real auth endpoint, which is the authoritative check; its rejection
    /// already surfaces through the existing catch block in sendCode().
    private var emailLooksValid: Bool {
        email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    }

    private func sendCode() {
        sending = true
        message = nil
        isError = false
        Task {
            do {
                try await client.sendOTP(email: email)
                sending = false
                step = .code
                // Starts the moment a code genuinely goes out, so it also
                // covers hitting BACK then SEND CODE again right away —
                // the exact sequence that was silently invalidating an
                // already-sent, still-good code.
                resendCooldown = Self.resendCooldownSeconds
            } catch {
                sending = false
                isError = true
                message = "Something went wrong: \(error)"
            }
        }
    }

    private func verifyCode() {
        sending = true
        isError = false
        message = nil
        Task {
            do {
                try await client.verifyOTP(email: email, token: code.filter(\.isNumber))
                sending = false
                onSignedIn()
            } catch {
                sending = false
                isError = true
                message = verifyFailureMessage(for: error)
            }
        }
    }

    /// Supabase answers a wrong code, an already-used code and a genuinely
    /// expired one with the exact same `403 otp_expired "Token has expired
    /// or is invalid"` — confirmed by calling the live endpoint with a
    /// deliberately wrong token. The old copy here read that literally and
    /// told people their code had expired, which sent at least one real
    /// debugging session chasing expiry when the true cause was a code
    /// being submitted twice. This says what 403 actually means and gives
    /// the one instruction that always works, without asserting which of
    /// the three it was.
    private func verifyFailureMessage(for error: Error) -> String {
        if case SupabaseClient.ClientError.http(403, _) = error {
            return "That code didn't work. Each code only works once, and only for a few minutes — tap BACK and send yourself a fresh one."
        }
        return "Couldn't sign you in: \(error)"
    }

    /// A manually-drawn placeholder rather than TextField's built-in
    /// `prompt:` styling — the prompt's own .foregroundStyle/.foregroundColor
    /// is unreliable here, getting overridden by the field's own text
    /// colour regardless of which of the two APIs it's set with (confirmed
    /// live: it still rendered the system default blue). An independent
    /// Text sibling, shown only while the field is empty, isn't subject to
    /// that TextField-internal styling at all.
    @ViewBuilder
    private func placeholderField(
        _ placeholder: String, text: Binding<String>,
        keyboardType: UIKeyboardType = .default,
        autocapitalization: TextInputAutocapitalization = .sentences,
        autocorrection: Bool = true
    ) -> some View {
        ZStack(alignment: .leading) {
            if text.wrappedValue.isEmpty {
                Text(placeholder)
                    .foregroundStyle(SessionColours.faint)
            }
            TextField("", text: text)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled(!autocorrection)
        }
        .font(.system(size: 16, design: .monospaced))
        .foregroundStyle(.white)
        .padding(14)
        .background(SessionColours.s2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private extension View {
    func buttonLabelStyle(secondary: Bool = false) -> some View {
        self
            .font(.system(size: 13, weight: .bold, design: .monospaced))
            .foregroundStyle(secondary ? SessionColours.dim : SessionColours.bg)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(secondary ? SessionColours.s2 : SessionColours.resolve("--gorse"))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

#Preview {
    NativeSignInView(client: SupabaseClient(
        url: "https://lbhsgkadlhcqqnlbfswr.supabase.co",
        anonKey: "anon"
    ), onSignedIn: {})
}

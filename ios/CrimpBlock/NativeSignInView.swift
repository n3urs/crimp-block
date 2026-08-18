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
    @State private var sending = false

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

                Text(message ?? defaultMessage)
                    .font(.system(size: 14))
                    .foregroundStyle(SessionColours.dim)

                if step == .email {
                    TextField("you@example.com", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .textFieldStyle()
                    Button(action: sendCode) {
                        Text(sending ? "SENDING…" : "SEND CODE").buttonLabelStyle()
                    }
                    .disabled(!emailLooksValid || sending)
                    .opacity((!emailLooksValid || sending) ? 0.5 : 1)
                } else {
                    TextField("code from email", text: $code)
                        .keyboardType(.numberPad)
                        .textFieldStyle()
                    HStack(spacing: 10) {
                        Button(action: { step = .email; message = nil }) {
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
            : "Sign-in code sent to \(email). Typing it here signs you in on this device."
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
        Task {
            do {
                try await client.sendOTP(email: email)
                sending = false
                step = .code
            } catch {
                sending = false
                message = "Something went wrong: \(error)"
            }
        }
    }

    private func verifyCode() {
        sending = true
        Task {
            do {
                try await client.verifyOTP(email: email, token: code.filter(\.isNumber))
                sending = false
                onSignedIn()
            } catch {
                sending = false
                message = "That code didn't work: \(error). Codes expire, so request a new one if it's been a while."
            }
        }
    }
}

private extension View {
    func textFieldStyle() -> some View {
        self
            .font(.system(size: 16, design: .monospaced))
            .foregroundStyle(.white)
            .padding(14)
            .background(SessionColours.s2)
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

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

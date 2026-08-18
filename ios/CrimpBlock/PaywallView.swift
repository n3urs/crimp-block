import SwiftUI
import StoreKit

/// The Standard-tier paywall — shown after the quiz, gating the real daily
/// card behind the trial/subscription per the plan's Phase D. Deliberately
/// plain: price, trial terms, what you get, one button. Restore Purchases
/// is required by App Store Review Guideline 3.1.1 for any subscription
/// product, included from the start rather than added later under review
/// pressure.
struct PaywallView: View {
    var onSubscribed: () -> Void
    var onCancel: (() -> Void)? = nil

    @State private var manager = SubscriptionManager()
    @State private var purchasing = false
    @State private var restoring = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            SessionColours.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 20) {
                if let onCancel {
                    HStack {
                        Spacer()
                        Button(action: onCancel) {
                            Image(systemName: "xmark")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(SessionColours.faint)
                        }
                    }
                }

                Spacer()

                VStack(alignment: .leading, spacing: 10) {
                    Text("DEADPOINT STANDARD")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(SessionColours.faint)
                        .tracking(1.5)
                    Text("Your plan, every day")
                        .font(.system(size: 30, weight: .heavy))
                        .foregroundStyle(SessionColours.fg)
                    if let loadError = manager.loadError {
                        Text(loadError)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(SessionColours.restC)
                    } else {
                        Text("7 days free, then \(manager.product?.displayPrice ?? "£0.99") a month. Cancel any time.")
                            .font(.system(size: 15))
                            .foregroundStyle(SessionColours.dim)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    featureRow("Your quiz-assigned training plan")
                    featureRow("Live progress and weight tracking")
                    featureRow("Rest and interval timers, built in")
                    featureRow("Home screen widget")
                }
                .padding(.top, 4)

                Spacer()

                if let errorMessage {
                    Text(errorMessage)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(SessionColours.restC)
                }

                Button(action: { Task { await purchase() } }) {
                    HStack(spacing: 8) {
                        if purchasing { ProgressView().tint(SessionColours.bg) }
                        Text(purchasing ? "PROCESSING" : "START FREE TRIAL")
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                    }
                    .foregroundStyle(SessionColours.bg)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(SessionColours.fg)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                // .disabled() alone stops the tap from doing anything, but
                // a custom-styled button (no system ButtonStyle) doesn't
                // dim itself automatically the way .buttonStyle(.bordered)
                // etc. would — without this a genuinely inert button still
                // looks fully active, which reads as broken rather than
                // "wait for the product to load."
                .opacity(manager.product == nil ? 0.4 : 1)
                .disabled(manager.product == nil || purchasing || restoring)

                HStack(spacing: 16) {
                    Button(action: { Task { await restore() } }) {
                        Text(restoring ? "RESTORING…" : "RESTORE PURCHASES")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(SessionColours.dim)
                    }
                    .disabled(purchasing || restoring)

                    // For friends/testers gifted an App Store Connect
                    // Offer Code — see legal/offer-codes.md for how those
                    // get created. Once redeemed, StoreKit treats it as a
                    // normal entitlement, so no separate "comped" concept
                    // exists anywhere else in the app — refreshEntitlement()
                    // picks it up the same way it would a paid purchase.
                    Button(action: { Task { await redeemCode() } }) {
                        Text("HAVE A CODE?")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(SessionColours.dim)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)

                Text("Payment is charged to your Apple ID after the trial ends unless cancelled at least 24 hours before it's up. Manage or cancel any time in Settings.")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(SessionColours.faint)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)
            }
            .padding(24)
        }
        .task {
            await manager.loadProduct()
            await manager.refreshEntitlement()
            if manager.isSubscribed { onSubscribed() }
        }
        .onChange(of: manager.isSubscribed) { _, subscribed in
            if subscribed { onSubscribed() }
        }
    }

    private func featureRow(_ text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(SessionColours.go)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(SessionColours.dim)
        }
    }

    private func purchase() async {
        purchasing = true
        errorMessage = nil
        do {
            try await manager.purchase()
        } catch {
            errorMessage = "\(error)"
        }
        purchasing = false
    }

    private func restore() async {
        restoring = true
        errorMessage = nil
        do {
            try await manager.restore()
            if !manager.isSubscribed { errorMessage = "No active subscription found for this Apple ID." }
        } catch {
            errorMessage = "\(error)"
        }
        restoring = false
    }

    /// Apple's own system sheet for redeeming an Offer Code — no custom
    /// code-entry UI needed. Codes generated in App Store Connect also
    /// come with a direct redemption URL that works without ever opening
    /// this sheet at all (send the link, App Store handles the rest) —
    /// this button is a convenience for someone already in the app with a
    /// code in hand, not the only way in.
    private func redeemCode() async {
        guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else { return }
        do {
            try await AppStore.presentOfferCodeRedeemSheet(in: scene)
            await manager.refreshEntitlement()
        } catch {
            errorMessage = "\(error)"
        }
    }
}

#Preview {
    PaywallView(onSubscribed: {}, onCancel: {})
}

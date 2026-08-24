import Foundation
import StoreKit

/// Client-side entitlement checking via StoreKit 2 — `Transaction.currentEntitlements`
/// is verified on-device, no server round-trip needed for v1. Per the plan's Phase D:
/// server-side verification (App Store Server Notifications into a Supabase Edge
/// Function) is the natural upgrade path if entitlement abuse becomes an actual
/// problem, not something to build pre-emptively for a launch with no users yet.
@Observable
final class SubscriptionManager {
    static let standardMonthlyID = "uk.co.sullivanltd.crimpblock.standard.monthly"

    /// True for a TestFlight or Xcode-debug install, false for a real App
    /// Store download — the receipt URL's last path component is
    /// literally named `sandboxReceipt` in the former case and something
    /// else in the latter, which is Apple's own documented way to tell
    /// them apart on-device. Exists because Offer Codes — the intended
    /// way to get testers past the paywall without a real purchase —
    /// turned out to require the subscription to already be Approved and
    /// the app Ready for Distribution (confirmed directly in App Store
    /// Connect, not assumed), which makes them useless for testing before
    /// the first submission. NativeAppView.reload() uses this to skip the
    /// paywall gate for testers specifically, never for a real download —
    /// production purchasing itself is completely untouched by this, and
    /// the paywall stays reachable on demand from the DEBUG menu for
    /// anyone who wants to look at it anyway.
    static var isRunningInSandbox: Bool {
        Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
    }

    private(set) var product: Product?
    private(set) var isSubscribed = false
    private(set) var loadError: String?
    private var updatesTask: Task<Void, Never>?

    init() {
        updatesTask = Task { [weak self] in await self?.observeTransactionUpdates() }
    }

    deinit {
        updatesTask?.cancel()
    }

    func loadProduct() async {
        do {
            let products = try await Product.products(for: [Self.standardMonthlyID])
            product = products.first
            loadError = products.isEmpty
                ? "Product not found — check Configuration.storekit is attached to this scheme's Run action (Edit Scheme → Run → Options → StoreKit Configuration)."
                : nil
        } catch {
            loadError = "\(error)"
        }
    }

    /// The on-device source of truth for "does this person currently have
    /// an active subscription" — walks every entitlement StoreKit has
    /// verified for this Apple ID, not just ones this session purchased,
    /// so a restored/family-shared/already-subscribed-elsewhere account
    /// is picked up correctly too.
    func refreshEntitlement() async {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == Self.standardMonthlyID {
                isSubscribed = true
                return
            }
        }
        isSubscribed = false
    }

    func purchase() async throws {
        guard let product else { return }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            if case .verified(let transaction) = verification {
                await transaction.finish()
                await refreshEntitlement()
            }
        case .userCancelled, .pending:
            break
        @unknown default:
            break
        }
    }

    /// App Store Review Guideline 3.1.1 requires a restore path for any
    /// non-consumable/subscription purchase — AppStore.sync() re-pulls
    /// this Apple ID's transaction history from Apple, then
    /// refreshEntitlement() re-derives status from it.
    func restore() async throws {
        try await AppStore.sync()
        await refreshEntitlement()
    }

    /// Transaction.updates carries anything that happens outside a
    /// direct purchase() call in this session — a renewal, a
    /// cancellation, a family-sharing grant, Ask-to-Buy approval. Started
    /// once in init() and kept alive for the app's lifetime, same pattern
    /// Apple's own StoreKit 2 sample code uses.
    private func observeTransactionUpdates() async {
        for await result in Transaction.updates {
            guard case .verified(let transaction) = result else { continue }
            await transaction.finish()
            await refreshEntitlement()
        }
    }
}

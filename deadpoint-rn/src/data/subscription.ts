/** RevenueCat SDK wrapper + the paywall's single on/off switch.
    Task 2 of docs/superpowers/plans/2026-09-03-app-store-readiness.md:
    this file wires up entitlement checking end to end but PAYWALL_ENABLED
    stays false — nobody's experience changes until a later, separately
    reviewed task flips it (see the test asserting it below).

    hasEntitlement is the one piece of real decision logic here and is
    fully unit tested (subscription.test.ts) — everything else is a thin
    pass-through to the RevenueCat SDK, which is native and not
    unit-testable under this project's Jest setup (same reasoning as
    useRestTimer.ts's own doc comment: no test renderer, and mocking the
    native module would only prove the mock does what the mock does).
    Verified live on device instead (Task 2's Step 7). */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

/** The single switch that turns the paywall gate on. False in this task
    on purpose — Task 2 only builds the entitlement-checking plumbing.
    Flipping this to true is a deliberate, reviewed change (Task 4), and
    doing so requires deleting the test below that pins it to false. */
export const PAYWALL_ENABLED = false;

/** RevenueCat entitlement identifier backing the app's one paid tier. */
export const ENTITLEMENT_ID = 'standard';

/** Not a secret: RevenueCat's iOS SDK key is a public identifier meant to
    ship inside the app bundle — same class of value as SUPABASE_ANON in
    supabase.ts, not the "secret key" RevenueCat's own dashboard warns
    against exposing (that one's server-side only and never belongs in a
    client). Placeholder until Oscar supplies the real key from the
    RevenueCat dashboard; configureRevenueCat() below is safe to call
    with this value (it can't reach RevenueCat's servers, it just
    shouldn't crash launch — see _layout.tsx's try/catch around the call). */
export const REVENUECAT_API_KEY_IOS = 'REPLACE_WITH_REVENUECAT_PUBLIC_IOS_SDK_KEY';

/** Pure — the only part of this file with real decision logic, so it's
    the only part unit tested. Defends against every malformed shape a
    caller could hand it, and denies access rather than granting it on
    any of them: a bug here would otherwise silently let everyone in
    (missing entitlement treated as truthy) or lock everyone out
    (crashing before the caller's own fallback runs). Never trust a
    locally-cached CustomerInfo as the source of truth — this function
    only judges whatever CustomerInfo it's handed; useEntitlement below
    always hands it the result of a fresh Purchases.getCustomerInfo(). */
export function hasEntitlement(customerInfo: CustomerInfo | null | undefined, entitlementId: string): boolean {
  return Boolean(customerInfo?.entitlements?.active?.[entitlementId]);
}

/** Called once at app root (app/_layout.tsx). Android is out of scope —
    the app only ships on iOS today (matches the Platform.OS guard style
    already established in useRestTimer.ts's ensurePermission()). */
export function configureRevenueCat(): void {
  if (Platform.OS !== 'ios') return;
  Purchases.configure({ apiKey: REVENUECAT_API_KEY_IOS });
}

export function useEntitlement() {
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      setHasActiveSubscription(hasEntitlement(customerInfo, ENTITLEMENT_ID));
    } catch (e) {
      // Never trust a stale cache as a fallback here: a failed check
      // must deny access, not silently keep whatever was there before.
      console.error('useEntitlement.refresh failed:', e);
      setHasActiveSubscription(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { hasActiveSubscription, loaded, refresh };
}

/** Task 3.5: the two configured packages (£0.99/month with a 7-day trial,
    £9.99/year, both granting ENTITLEMENT_ID) — fetched once so the
    paywall can offer a choice instead of assuming a single package.
    `.monthly`/`.annual` are RevenueCat's own typed shortcuts on the
    current Offering (confirmed against
    @revenuecat/purchases-typescript-internal/dist/offerings.d.ts), not a
    manual search of availablePackages by identifier. Either can come
    back null — Offering not fully configured yet (true of Oscar's
    current placeholder RevenueCat setup) or getOfferings() itself
    failing — and the paywall is responsible for disabling whichever
    option that leaves out; this hook's job is only to report what's
    there, same one-shot useEffect+useState shape as useEntitlement above. */
export function useOfferings() {
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  const [annual, setAnnual] = useState<PurchasesPackage | null>(null);

  const refresh = useCallback(async () => {
    try {
      const offerings = await Purchases.getOfferings();
      setMonthly(offerings.current?.monthly ?? null);
      setAnnual(offerings.current?.annual ?? null);
    } catch (e) {
      console.error('useOfferings.refresh failed:', e);
      setMonthly(null);
      setAnnual(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { monthly, annual };
}

/** Buys whichever package the paywall's caller picked (Task 3.5: monthly
    or annual — see useOfferings above). The caller owns fetching
    offerings and choosing a package; this no longer reaches into
    getOfferings() itself to guess one (that's the change from Task 3).
    A user backing out of the purchase sheet is not a failure — RevenueCat
    surfaces that as e.userCancelled on the thrown error, which this
    deliberately swallows; every other error re-throws so the paywall can
    show it. */
export async function purchaseStandard(pkg: PurchasesPackage): Promise<void> {
  try {
    await Purchases.purchasePackage(pkg);
  } catch (e: any) {
    if (e?.userCancelled) return;
    throw e;
  }
}

/** Restores a prior purchase (re-install, new device) and reports whether
    that actually grants the standard entitlement — RevenueCat's
    restorePurchases() itself is authoritative CustomerInfo, same as
    getCustomerInfo() above, so this re-uses hasEntitlement rather than
    trusting anything cached locally. */
export async function restorePurchases(): Promise<boolean> {
  const customerInfo = await Purchases.restorePurchases();
  return hasEntitlement(customerInfo, ENTITLEMENT_ID);
}

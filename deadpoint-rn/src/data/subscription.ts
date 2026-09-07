/** RevenueCat SDK wrapper + the paywall's single on/off switch.
    Task 5 of docs/superpowers/plans/2026-09-03-app-store-readiness.md:
    PAYWALL_ENABLED is now true — Oscar's App Store Connect (Paid
    Applications Agreement, both subscriptions) and RevenueCat (real
    products replacing the seeded Test Store ones, both attached to the
    deadpoint_pro entitlement, default Offering pointing at them) setup
    is done. The test that used to pin this to false is deleted (this
    exact file's own doc comment above required that before flipping it).

    hasEntitlement is the one piece of real decision logic here and is
    fully unit tested (subscription.test.ts) — everything else is a thin
    pass-through to the RevenueCat SDK, which is native and not
    unit-testable under this project's Jest setup (same reasoning as
    useRestTimer.ts's own doc comment: no test renderer, and mocking the
    native module would only prove the mock does what the mock does).
    Verified live on device instead. */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

/** The single switch that turns the paywall gate on. */
export const PAYWALL_ENABLED = true;

/** RevenueCat entitlement identifier backing the app's one paid tier.
    Named `deadpoint_pro` in the RevenueCat dashboard (not `standard`, the
    plan's original suggested name) — Oscar's project already had this
    identifier from RevenueCat's own seeded sample data, and both real
    products (Monthly Subscription, Annual Membership) are attached to it,
    so the code matches what actually exists rather than the other way
    round. */
export const ENTITLEMENT_ID = 'deadpoint_pro';

/** Not a secret: RevenueCat's iOS SDK key is a public identifier meant to
    ship inside the app bundle — same class of value as SUPABASE_ANON in
    supabase.ts, not the "secret key" RevenueCat's own dashboard warns
    against exposing (that one's server-side only and never belongs in a
    client). Real key, from the Deadpoint (App Store) app RevenueCat
    project — but this alone does NOT make purchases live: PAYWALL_ENABLED
    is still false below, and the Product catalog/Offering/Entitlement on
    RevenueCat's side aren't set up yet either (blocked on Oscar's App
    Store Connect subscription products existing first). Safe to ship
    with the real key while still inert: configureRevenueCat() below just
    connects the SDK; nothing reads what it returns until the flag flips. */
export const REVENUECAT_API_KEY_IOS = 'appl_KjyvfSZFCWyTrBZlyypQLJOljFY';

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

/** Android is out of scope — the app only ships on iOS today (matches the
    Platform.OS guard style already established in useRestTimer.ts's
    ensurePermission()). */
export function configureRevenueCat(): void {
  if (Platform.OS !== 'ios') return;
  Purchases.configure({ apiKey: REVENUECAT_API_KEY_IOS });
}

// Called once, at module load — not from a useEffect in app/_layout.tsx
// (where Task 2/4 originally put it). Task 4's review traced a LogBox
// toast seen on a genuine cold launch ("There...") and found it matches
// UninitializedPurchasesError's message at least as plausibly as a
// credentials rejection — meaning RootLayout's own configure-on-mount
// effect may not have run yet by the time a child screen's
// useEntitlement() effect fires. React runs effects child-before-parent
// within one commit, so if expo-font's useFonts ever resolves
// synchronously (e.g. fonts already registered), RootLayout and its first
// child could mount in the same commit — Index's effect would then win
// the race. Module evaluation order removes the race outright: every
// importer of this file (app/_layout.tsx, app/index.tsx, app/paywall.tsx)
// triggers this exactly once, and it runs before any of their component
// code, let alone an effect, ever executes. Kept in its own try/catch
// (not the caller's) so a bad key can't crash bundle evaluation itself.
try {
  configureRevenueCat();
} catch (e) {
  console.error('configureRevenueCat failed:', e);
}

export function useEntitlement() {
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Distinct from hasActiveSubscription=false: that value alone can't
  // tell "checked and genuinely not subscribed" apart from "the check
  // itself failed" (network hiccup, SDK not yet configured, etc). Task 4's
  // review flagged this conflation as a latent payment-UX bug — once the
  // paywall gate is live, a real subscriber hitting a transient failure
  // would otherwise be routed to the paywall with no way back short of
  // manually tapping RESTORE PURCHASES. app/index.tsx wires this into a
  // retry screen, the same shape as the existing profileFetchFailed one.
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      setHasActiveSubscription(hasEntitlement(customerInfo, ENTITLEMENT_ID));
      setFailed(false);
    } catch (e) {
      // Never trust a stale cache as a fallback here: a failed check
      // must deny access, not silently keep whatever was there before.
      console.error('useEntitlement.refresh failed:', e);
      setHasActiveSubscription(false);
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { hasActiveSubscription, loaded, failed, refresh };
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

/** Ties RevenueCat's customer identity to the real signed-in account,
    instead of the SDK's own silent default: an anonymous per-install ID
    ($RCAnonymousID:...) with no connection to who the person actually is.
    Real gap found 2026-09-07 investigating how to comp a specific tester
    a free pass — RevenueCat's dashboard can grant a named customer a
    promotional entitlement (no purchase, no code, exactly the free ride
    built-in accounts already get via isBuiltInProgram, but for an
    ordinary customer-shaped account instead of hand-authored content),
    but only if there's something to find them by. Without this, every
    customer — real subscribers included, not just testers — would sit in
    RevenueCat as an unlabelled anonymous ID forever.

    Called from useSession.ts's own onAuthStateChange for every real auth
    transition (sign in, restore, sign out) — logIn/setEmail/logOut are
    all safe to call repeatedly with the same value, so re-firing on a
    token refresh or a second screen's own useSession() instance costs
    nothing beyond a redundant network call. userId (Supabase's own uuid)
    is the stable identity RevenueCat's own docs recommend using as
    app_user_id rather than PII; email is layered on as a searchable
    customer attribute purely so Oscar can find a tester by the address he
    actually knows, without needing their uuid to hand. */
export async function syncRevenueCatIdentity(userId: string | null, email: string | null): Promise<void> {
  try {
    if (userId == null) {
      await Purchases.logOut();
      return;
    }
    await Purchases.logIn(userId);
    if (email != null) await Purchases.setEmail(email);
  } catch (e) {
    // Never let an identity-sync hiccup take down the auth flow itself —
    // same "log and continue" precedent as every other best-effort call
    // in this codebase (this file's own configureRevenueCat() try/catch,
    // useSession.ts's deleteAccount). Worst case a customer stays
    // anonymous in RevenueCat until the next successful sync, not a
    // crash or a blocked sign-in.
    console.error('syncRevenueCatIdentity failed:', e);
  }
}

/** Was hardcoded to "7-DAY FREE TRIAL" on the paywall for the monthly
    tier regardless of whether RevenueCat actually had a trial configured
    — meaning a user could be told "start free trial" and then get
    charged immediately, since the claim never read real data at all.
    introPrice is null whenever no introductory offer exists on the App
    Store Connect side; price is 0 specifically for a FREE trial — a paid
    intro price (e.g. "$0.99 for the first month") is a real discount but
    not a free trial, and must not be labelled as one. */
export function trialLabel(pkg: PurchasesPackage | null): string | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  // Adjectival compound stays singular regardless of n ("7-DAY", not
  // "7-DAYS", same as "a two-week vacation").
  return `${intro.periodNumberOfUnits}-${intro.periodUnit.toUpperCase()} FREE TRIAL`;
}

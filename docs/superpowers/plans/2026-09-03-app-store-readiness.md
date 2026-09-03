# App Store Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Deadpoint from "works on TestFlight" to "submittable to the App Store as a paid subscription app" — closing the one guaranteed-rejection gap (in-app account deletion) and building the subscription system that currently exists only as an inert mockup.

**Architecture:** Two independent halves, deliberately ordered so the first ships value with zero external dependencies:
- **Account deletion** — the Supabase Edge Function (`supabase/functions/delete-account/index.ts`) already exists, is well-written, and does the whole job (cascading deletes handle every dependent table). Only the *client* half is missing: a DELETE ACCOUNT control in Settings with a confirmation dialog. No new backend work, no external accounts.
- **Subscriptions via RevenueCat** — `react-native-purchases` autolinks under our existing prebuild setup (no config plugin needed; it has no native config to inject). A thin `useEntitlement` hook wraps the SDK, `paywall.tsx`'s three inert callbacks become real, and the `TODO(Phase 7)` slot in `computeRoute()` becomes a real gate. **The gate ships OFF** behind a single flag until Oscar's App Store Connect + RevenueCat setup is done, so none of this can strand a real user mid-build.

**Tech Stack:** `react-native-purchases` (RevenueCat SDK v10), existing Supabase Edge Function + `supabase-js`, existing `computeRoute()` routing chain, existing `paywall.tsx` UI.

## Global Constraints

- **The paywall gate ships OFF.** `computeRoute()` gains a real `hasActiveSubscription` input, but the caller passes a value derived so that nobody is ever routed to `/paywall` until `PAYWALL_ENABLED` (a single exported boolean constant) is flipped true. Rationale: a subscription gate wired live against unconfigured RevenueCat products returns "no entitlement" for *everyone*, which would lock Oscar and both real users out of their own training app on the next TestFlight build. Flipping one constant is the deliberate, reviewable moment that turns it on — not a side effect of merging this plan.
- **Built-in accounts never see the paywall.** `isBuiltInProgram(email)` (already in `computeRoute.ts`) is the existing carve-out for hand-authored programs keyed by email — Oscar, Joe, Max. Confirmed with Oscar: these stay free forever. The gate must sit *after* the existing `isBuiltInProgram` branch, which already returns early — verify this is genuinely true rather than assuming it.
- **Gate placement:** everything after the quiz is paid. Concretely, the gate goes between the `tutorialCompletedAt` check and the track-routing below it — exactly where the existing `// TODO(Phase 7)` comment sits. Do not move it.
- **Never trust a local entitlement cache as the source of truth.** RevenueCat's `getCustomerInfo()` is the authority. A cached value may be used to avoid a blocking spinner on cold launch, but a stale "subscribed" must never survive a real "not subscribed" response.
- **Account deletion is destructive and irreversible.** It must require an explicit confirmation step that a mis-tap cannot satisfy, and must state plainly that all training history is deleted. Match the existing `Alert`-based confirmation pattern already used in `DailyCard.tsx` (see its "two confirmation dialogs" comment) rather than inventing a new dialog style.
- **No secrets in the repo.** The RevenueCat *public* SDK key is safe to ship in client code (it is designed to be public, same class as the Supabase anon key already in this repo). The RevenueCat *secret* key must never appear anywhere. If any step seems to need a secret key client-side, stop — that is a design error, not a configuration problem.
- Verification is local-build-only, never Xcode GUI. `expo prebuild --platform ios` needs `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.
- Work only in `deadpoint-rn/` (and `supabase/`) inside the worktree `/Users/oscarsullivan/crimp-block/.worktrees/react-native-rebuild`, on branch `react-native-rebuild`.

## Pricing (added after Task 2 shipped — Task 3.5 below, not a rewrite of Tasks 1-2)

Two tiers, not one: **£0.99/month** (7-day free trial) or **£9.99/year**, user's choice on the paywall. Both grant the exact same `standard` entitlement — RevenueCat doesn't care which one someone bought, `hasEntitlement()` from Task 2 needs no change at all. Only the *purchase* side needs to know which package the user picked, not the *check* side.

## What Oscar must do himself (blocking for Task 4's live verification only)

Not agent-doable — flag these to him early so they happen in parallel with Tasks 1–3:
1. **App Store Connect → Agreements, Tax, and Banking** — sign the Paid Applications Agreement, add banking + tax details. Without this, subscription products cannot go live at all.
2. **App Store Connect → create TWO subscription products, in the SAME subscription group** (same group is what makes them mutually-exclusive tiers of one thing, not two separate purchases someone could hold at once): a monthly auto-renewable at £0.99 with a 7-day free trial, and an annual auto-renewable at £9.99. Note both product IDs.
3. **RevenueCat** — create an account + project, connect it to App Store Connect, add BOTH products to the same Offering (RevenueCat's own `monthly`/`annual` package-type shortcuts are the natural fit — use those, not arbitrary custom identifiers, so `offerings.current.monthly`/`.annual` resolve directly instead of a manual find-by-id), create ONE Entitlement (suggested identifier: `standard`) attached to both products, and copy the **public** Apple SDK key.
4. Give the agent the entitlement identifier and public SDK key.

---

### Task 1: In-app account deletion (the App Store blocker)

**Files:**
- Modify: `deadpoint-rn/src/data/useSession.ts` (add a `deleteAccount` function alongside the existing `signOut`)
- Modify: `deadpoint-rn/app/settings.tsx` (add DELETE ACCOUNT to the ACCOUNT section; update the file's top doc comment, which currently states account deletion is out of scope and that no Edge Function exists — both now false)
- Test: `deadpoint-rn/src/data/__tests__/deleteAccount.test.ts`

**Interfaces:**
- Consumes: the existing deployed Edge Function at `supabase/functions/delete-account/index.ts` — a POST with the caller's `Authorization` header, returning `{success: true}` or `{error: string}`.
- Produces: `deleteAccount(): Promise<void>` on `useSession()`'s returned object — throws on failure so the caller can surface a real error rather than silently appearing to succeed.

- [ ] **Step 1: Read the existing pieces before writing anything**

Read `deadpoint-rn/src/data/useSession.ts` in full (note how `signOut` is written and what the hook returns), and `supabase/functions/delete-account/index.ts` (already read into this plan — it expects `POST` + `Authorization`). Read `app/settings.tsx`'s ACCOUNT section (around line 160) and its top doc comment.

Also check whether the function is actually **deployed**: `supabase functions list` if the CLI is available and linked. If you cannot confirm deployment, that is fine — note it in your report as something for Oscar to confirm, and continue (the client code is correct either way).

- [ ] **Step 2: Write the failing test**

```typescript
// deadpoint-rn/src/data/__tests__/deleteAccount.test.ts
import { callDeleteAccount } from '../deleteAccount';

test('posts to the delete-account function with the caller\'s bearer token', async () => {
  const calls: any[] = [];
  const fetcher = async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true }) } as any;
  };

  await callDeleteAccount('https://proj.supabase.co', 'anon-key', 'the-jwt', fetcher);

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://proj.supabase.co/functions/v1/delete-account');
  expect(calls[0].init.method).toBe('POST');
  expect(calls[0].init.headers.Authorization).toBe('Bearer the-jwt');
});

test('throws with the server\'s own message when deletion fails', async () => {
  const fetcher = async () => ({ ok: false, json: async () => ({ error: 'Invalid or expired session' }) } as any);
  await expect(callDeleteAccount('https://p.supabase.co', 'k', 'jwt', fetcher))
    .rejects.toThrow('Invalid or expired session');
});

test('throws a usable message even when the error body is not JSON', async () => {
  const fetcher = async () => ({ ok: false, json: async () => { throw new Error('not json'); } } as any);
  await expect(callDeleteAccount('https://p.supabase.co', 'k', 'jwt', fetcher)).rejects.toThrow();
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd deadpoint-rn && npx jest src/data/__tests__/deleteAccount.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `callDeleteAccount`**

Create `deadpoint-rn/src/data/deleteAccount.ts` exporting a pure-ish `callDeleteAccount(supabaseUrl, anonKey, accessToken, fetcher = fetch)`. Injecting `fetcher` is what makes it testable without mocking global fetch — same pure-logic-extraction discipline as `overallBar.ts`/`cardMessage.ts`. It POSTs to `${supabaseUrl}/functions/v1/delete-account` with headers `Authorization: Bearer ${accessToken}` and `apikey: ${anonKey}`, and throws `new Error(body.error ?? 'Could not delete your account.')` when `!res.ok`.

Note: `SUPABASE_URL` and `SUPABASE_ANON` in `src/data/supabase.ts` are currently module-private `const`s (not exported). Export them so `useSession` can pass them in — do NOT duplicate the literal values into a second file, which would silently drift the day the project is pointed at a different Supabase instance.

- [ ] **Step 5: Run the test again, confirm it passes**

- [ ] **Step 6: Wire it into `useSession`**

Add `deleteAccount` to the object `useSession()` returns. It reads the current session's `access_token` (the hook already holds a session — do not make a fresh network call to fetch one, matching how `useStore.set`/`useLoads.set` deliberately read the already-held session rather than calling `supabase.auth.getUser()`), calls `callDeleteAccount(...)`, then calls `supabase.auth.signOut()` so the now-deleted account's local session does not linger.

- [ ] **Step 7: Add the Settings UI**

In `app/settings.tsx`'s ACCOUNT section, below SIGN OUT, add a DELETE ACCOUNT control styled as destructive (use `Colours.restC`, the existing error/destructive colour used by `sign-in.tsx`'s error text and `weight-edit.tsx`'s). On press, show a confirmation via React Native's `Alert.alert` with two buttons — a `style: 'cancel'` Cancel and a `style: 'destructive'` Delete — and copy that states plainly this permanently deletes the account and all training history, and cannot be undone. Only the destructive button calls `deleteAccount()`. On success, `router.replace('/')`. On failure, surface the real error message to the user (do not swallow it into a console log — a deletion that silently did nothing is exactly the failure mode Apple's reviewer will hit).

Update the file's top doc comment: the claim that account deletion is out of scope and that no Edge Function exists is now false and would actively mislead the next reader.

- [ ] **Step 8: Verify**

```bash
cd deadpoint-rn && npx jest && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: in-app account deletion (App Store guideline 5.1.1(v))"
```

---

### Task 2: RevenueCat SDK + entitlement hook

**Files:**
- Modify: `deadpoint-rn/package.json` (add `react-native-purchases`)
- Create: `deadpoint-rn/src/data/subscription.ts` (the `PAYWALL_ENABLED` flag, RevenueCat configuration, and a `useEntitlement()` hook)
- Create: `deadpoint-rn/src/data/__tests__/subscription.test.ts`
- Modify: `deadpoint-rn/app/_layout.tsx` (configure the SDK once at app root)

**Interfaces:**
- Produces:
  - `PAYWALL_ENABLED: boolean` — exported constant, **`false` in this task**. The single switch that turns the gate on.
  - `useEntitlement(): { hasActiveSubscription: boolean; loaded: boolean; refresh: () => Promise<void> }`
  - `purchaseStandard(): Promise<void>` and `restorePurchases(): Promise<boolean>` — used by Task 3's paywall.
  - `ENTITLEMENT_ID: string` — the RevenueCat entitlement identifier (`'standard'` unless Oscar says otherwise).

- [ ] **Step 1: Install**

```bash
cd deadpoint-rn && npx expo install react-native-purchases
```

`react-native-purchases` is a standard autolinked native module — it needs no Expo config plugin (verified: it injects no native configuration of its own). Confirm after prebuild that it appears in `ios/Podfile.lock`.

- [ ] **Step 2: Write the failing test for the pure decision logic**

The SDK itself is not unit-testable here (no test renderer, and mocking a native module proves nothing) — but the *decision* of whether someone is subscribed is pure and is exactly where a bug would silently let everyone in or lock everyone out:

```typescript
// deadpoint-rn/src/data/__tests__/subscription.test.ts
import { hasEntitlement, PAYWALL_ENABLED } from '../subscription';

test('reads the named entitlement from a RevenueCat CustomerInfo shape', () => {
  expect(hasEntitlement({ entitlements: { active: { standard: {} } } } as any, 'standard')).toBe(true);
});

test('a DIFFERENT active entitlement does not grant access', () => {
  expect(hasEntitlement({ entitlements: { active: { other: {} } } } as any, 'standard')).toBe(false);
});

test('no active entitlements means no access', () => {
  expect(hasEntitlement({ entitlements: { active: {} } } as any, 'standard')).toBe(false);
});

test('a malformed or absent CustomerInfo denies access rather than granting it', () => {
  expect(hasEntitlement(null as any, 'standard')).toBe(false);
  expect(hasEntitlement({} as any, 'standard')).toBe(false);
  expect(hasEntitlement({ entitlements: {} } as any, 'standard')).toBe(false);
});

test('the paywall gate ships OFF — flipping this is a deliberate, reviewed change', () => {
  expect(PAYWALL_ENABLED).toBe(false);
});
```

That last test is not busywork: it is what makes turning the gate on impossible to do by accident, and forces whoever flips it to also delete the test asserting it is off.

- [ ] **Step 3: Run it, confirm it fails**

- [ ] **Step 4: Implement `subscription.ts`**

Export `PAYWALL_ENABLED = false`, `ENTITLEMENT_ID = 'standard'`, a pure `hasEntitlement(customerInfo, entitlementId)` that defends against every malformed shape above, a `configureRevenueCat()` that calls `Purchases.configure({ apiKey })` (iOS only — guard with `Platform.OS === 'ios'`, matching the established guard style in `useRestTimer.ts`), and the `useEntitlement()` hook. Read the public API key from an exported constant with a clearly-marked placeholder value until Oscar supplies the real one; note in a comment that this key is *designed* to be public (same class as the Supabase anon key already committed here) and is not a secret.

`purchaseStandard()` and `restorePurchases()` wrap the SDK's own `purchasePackage`/`restorePurchases`, re-throwing real errors but treating a user-cancelled purchase as a non-error (RevenueCat surfaces cancellation via `e.userCancelled`) — a cancelled purchase is not a failure to report.

- [ ] **Step 5: Run the test again, confirm it passes**

- [ ] **Step 6: Configure at app root**

In `app/_layout.tsx`, call `configureRevenueCat()` once on mount. It must be safe to call with a placeholder key — wrap in try/catch and `console.error`, never let a bad key crash launch.

- [ ] **Step 7: Prebuild, rebuild, verify**

```bash
cd deadpoint-rn
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios
grep -c "RevenueCat\|PurchasesHybridCommon" ios/Podfile.lock
npx expo run:ios --device "iPhone 17"
npx jest && npx tsc --noEmit
```

The grep must be non-zero (the pod genuinely linked). The app must launch and reach the daily card exactly as before — this task changes no user-visible behaviour, and confirming that is the point.

- [ ] **Step 8: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: RevenueCat SDK + entitlement hook (paywall gate still off)"
```

---

### Task 3: Make the paywall real

**Files:**
- Modify: `deadpoint-rn/app/paywall.tsx` (replace the three inert callbacks)
- Modify: `deadpoint-rn/app/_layout.tsx` (register `paywall` as a route — it currently is not registered at all, so nothing can navigate to it)

**Interfaces:**
- Consumes: `purchaseStandard`, `restorePurchases`, `useEntitlement` from Task 2.

- [ ] **Step 1: Register the route**

`app/paywall.tsx` exists but has no `<Stack.Screen>` entry in `app/_layout.tsx`. Add one. It is **not** a modal — it is a full-screen gate the user cannot dismiss past, so it must not use `presentation: 'modal'` (a modal is swipe-dismissable, which would let anyone swipe past the paywall).

- [ ] **Step 2: Wire the real callbacks**

Replace `onSubscribe`, `onRestore`, `onRedeemCode`:
- `onSubscribe` → `purchaseStandard()`, with a disabled/in-flight state on the button while it runs (matching how `weight-edit.tsx`'s SAVE disables itself via `saving`) so a double-tap cannot start two purchases. On success, `router.replace('/')` so the root gate re-routes them into the app. On a user cancellation, do nothing. On a real error, show it.
- `onRestore` → `restorePurchases()`. If it returns true, `router.replace('/')`. If false, tell the user plainly that no previous purchase was found — silence here reads as a broken button.
- `onRedeemCode` → `Purchases.presentCodeRedemptionSheet()` on iOS. If unavailable, leave the control out entirely rather than shipping a button that does nothing.

- [ ] **Step 3: Verify**

```bash
cd deadpoint-rn && npx jest && npx tsc --noEmit && npx expo run:ios --device "iPhone 17"
```

Navigate to `/paywall` manually (temporarily, e.g. via a dev-only deep link or by briefly hardcoding the route) and confirm: the screen renders, the buttons show in-flight state, and — with placeholder RevenueCat credentials — failures surface as visible errors rather than silent no-ops. Revert any temporary navigation hack before committing. Real purchase testing is Task 4.

- [ ] **Step 4: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: wire real purchase/restore into the paywall screen"
```

---

### Task 3.5: Two pricing tiers — monthly and annual (added after Task 3 landed)

Oscar decided on two options rather than one: **£0.99/month** with the existing 7-day trial, or **£9.99/year**. This task changes `purchaseStandard()`'s signature and the paywall's layout — do this as its own reviewed step rather than folding it into Task 3, since Task 3 already shipped against the single-package assumption.

**Files:**
- Modify: `deadpoint-rn/src/data/subscription.ts` (`purchaseStandard` takes which package to buy, rather than always grabbing the first one)
- Modify: `deadpoint-rn/src/data/__tests__/subscription.test.ts` if `purchaseStandard`'s new shape has anything pure/testable about it (the SDK call itself still isn't unit-testable — same reasoning as Task 2)
- Modify: `deadpoint-rn/app/paywall.tsx` (two selectable price rows instead of one price line)

**Interfaces:**
- `purchaseStandard(pkg: PurchasesPackage): Promise<void>` — was `purchaseStandard(): Promise<void>`. The caller (paywall) now owns picking which package; `purchaseStandard` no longer reaches into `getOfferings()` to guess.
- New: a way for the paywall to list both packages to choose from — read them directly off `useEntitlement`'s own `Purchases.getOfferings()` call, or add a small `useOfferings()` alongside `useEntitlement` in `subscription.ts` if that's cleaner; use your judgement, but don't duplicate the offerings-fetch logic in two places.

- [ ] **Step 1: Read Task 3's actual landed code first**

Task 3 already wired `onSubscribe` against the old single-package `purchaseStandard()` — read `app/paywall.tsx` and `src/data/subscription.ts` as they now exist (not as the original brief described them) before changing either.

- [ ] **Step 2: Update `purchaseStandard`**

Change its signature to take the chosen `PurchasesPackage` and pass it straight to `Purchases.purchasePackage(pkg)` — remove the internal `getOfferings()` call entirely, that responsibility moves to the paywall screen. Keep the existing cancelled-purchase handling (`e.userCancelled` swallowed, everything else re-thrown) exactly as Task 2 wrote it.

- [ ] **Step 3: Fetch offerings in the paywall**

In `paywall.tsx`, fetch `Purchases.getOfferings()` on mount (a plain `useEffect` + `useState`, matching the existing codebase convention for a one-shot async fetch on a screen — e.g. how `weight-edit.tsx`/`day-picker.tsx` resolve their own data). Prefer `offerings.current?.monthly` and `offerings.current?.annual` (RevenueCat's own typed shortcuts, matching how Oscar was asked to set up the Offering in RevenueCat) over manually searching `availablePackages` by identifier. If either is missing (Offering not fully configured yet), disable that specific option rather than crashing the whole screen — this must render sensibly against the current placeholder RevenueCat setup, not just the eventual real one.

- [ ] **Step 4: Update the UI**

Replace the single `<Text style={styles.price}>` line with two selectable rows — a monthly option and an annual one, each showing its real price (`pkg.product.priceString`, RevenueCat's own localized, currency-correct price string — do not hand-write "£0.99"/"£9.99" as static copy, since the real product's actual price is the source of truth and could differ by region or if Oscar changes it later). Track which one is selected in local state, defaulting to monthly (matches the existing trial-focused copy). `onSubscribe` passes the selected package to `purchaseStandard`.

- [ ] **Step 5: Verify**

```bash
cd deadpoint-rn && npx jest && npx tsc --noEmit && npx expo run:ios --device "iPhone 17"
```

Same deep-link approach as Task 3 (`xcrun simctl openurl <udid> "deadpointrn:///paywall"`) to confirm both options render, are individually selectable, and show real price strings (or a sensible disabled state, given the RevenueCat Offering isn't fully configured until Task 5).

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: two subscription tiers on the paywall (monthly / annual)"
```

---

### Task 4: The routing gate (ships off) + live verification

**Files:**
- Modify: `deadpoint-rn/src/routing/computeRoute.ts` (real gate at the `TODO(Phase 7)` slot)
- Modify: `deadpoint-rn/__tests__/computeRoute.test.ts` (extend existing tests — note this lives at the repo-root `__tests__/`, NOT alongside the source in `src/routing/`; this project mixes both conventions)
- Modify: `deadpoint-rn/app/index.tsx` (supply the new input)

**Interfaces:**
- Consumes: `useEntitlement()`, `PAYWALL_ENABLED` (Task 2).

- [ ] **Step 1: Read the existing routing tests first**

`computeRoute` already has a test file with an established shape. Read it before adding — match its conventions rather than inventing a parallel style.

- [ ] **Step 2: Write the failing tests**

Add `hasActiveSubscription: boolean` to `RouteInputs` and `'/paywall'` to the `Route` union. Tests to add:
- a quiz-and-tutorial-complete, non-built-in, unsubscribed user routes to `/paywall`
- the same user *with* a subscription routes to `/card` as before
- a **built-in** account (Oscar/Joe/Max) with `hasActiveSubscription: false` still routes to `/card`, never `/paywall` — the carve-out Oscar explicitly confirmed
- a user who has not finished the quiz still routes to `/quiz`, not `/paywall` — the gate sits after onboarding, not before it
- a rehab-track user's existing `/rehab-coming-soon` routing is unaffected

- [ ] **Step 3: Run, confirm they fail. Implement. Run, confirm they pass.**

Place the gate exactly at the existing `// TODO(Phase 7)` comment — after the `tutorialCompletedAt` check, before the `trackType` routing. Delete that TODO comment as part of the change.

- [ ] **Step 4: Wire the caller with the flag**

In `app/index.tsx`, pass `hasActiveSubscription: !PAYWALL_ENABLED || entitlement.hasActiveSubscription`. When the flag is off this is unconditionally `true`, so `computeRoute` can never return `/paywall` — the gate is fully built and fully tested, and provably inert until the flag flips. Also extend `isRouteReady` so a signed-in, non-built-in user waits for `entitlement.loaded` **only when `PAYWALL_ENABLED` is true** — otherwise cold launch would block on a network call whose answer is being ignored anyway.

- [ ] **Step 5: Verify the gate is genuinely inert**

```bash
cd deadpoint-rn && npx jest && npx tsc --noEmit && npx expo run:ios --device "iPhone 17"
```

Launch and confirm the app behaves **exactly** as before — straight to the daily card, no paywall, no added launch delay. This is the most important check in the task: the whole safety argument rests on it.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: subscription routing gate (inert until PAYWALL_ENABLED flips)"
```

---

### Task 5: Turn it on — BLOCKED on Oscar's setup, do not start early

**Do not begin this task until Oscar confirms all four setup items** from "What Oscar must do himself" above are done and has supplied the entitlement identifier and public SDK key. Starting early produces a build that locks real users out.

- [ ] **Step 1:** Replace the placeholder API key and, if different, `ENTITLEMENT_ID`.
- [ ] **Step 2:** Flip `PAYWALL_ENABLED` to `true` and delete the test asserting it is false.
- [ ] **Step 3:** Verify against a real StoreKit sandbox account: a fresh sandbox user sees the paywall with BOTH real prices showing, can complete a purchase on EITHER tier (test at least one, ideally both across two sandbox accounts since they're separate purchases), and lands on the daily card; force-quitting and relaunching keeps them in; RESTORE PURCHASES works on a reinstall regardless of which tier was purchased.
- [ ] **Step 4:** Verify Oscar's own account (a built-in program) still bypasses the paywall entirely.
- [ ] **Step 5:** Bump `ios.buildNumber`, archive, and hand to Oscar for upload.

---

## Out of scope for this plan

- **Android subscriptions.** RevenueCat handles both, and the entitlement hook is already platform-neutral, but Google Play Billing needs its own product setup and a separate Play Console agreement. Worth doing — as its own plan, once iOS is live.
- **App Store listing assets** — screenshots, description, keywords, age rating, privacy policy URL. All Oscar's, all required before submission, none of them code.
- **Server-side receipt validation beyond RevenueCat's own.** RevenueCat validates receipts as its core function; adding a second layer is not warranted for this app's scale.

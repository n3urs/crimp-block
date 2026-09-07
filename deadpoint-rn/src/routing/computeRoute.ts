/** Direct port of NativeAppView.swift's gating chain (body's top-level
    if/else branches, plus reload()'s own guard sequence) as one pure,
    directly-testable priority list — same "one function, same order as
    Swift's own checks" discipline every prior phase's gating logic has
    used. Adapted for expo-router: instead of swapping which view
    renders in place, this returns which single route the caller should
    router.replace() to. */
import { isIsaac } from '../engine/isaac/isaacEngine';

export type Route = '/welcome' | '/sign-in' | '/quiz' | '/tutorial' | '/rehab-coming-soon' | '/paywall' | '/card';

export interface RouteInputs {
  hasSeenWelcome: boolean;
  isSignedIn: boolean;
  email: string | null;
  isBuiltInProgram: boolean;
  hasSeenBuiltInTutorial: boolean;
  quizCompletedAt: string | null;
  tutorialCompletedAt: string | null;
  trackType: string | null;
  /** Whether this account currently holds the paid entitlement. Read only
      for non-built-in accounts, after quiz+tutorial — see the gate below.
      Irrelevant (and never read) for a built-in account, whose branch
      above returns before this field is ever consulted. */
  hasActiveSubscription: boolean;
}

export function computeRoute(inputs: RouteInputs): Route {
  if (!inputs.hasSeenWelcome) return '/welcome';
  if (!inputs.isSignedIn) return '/sign-in';

  if (inputs.isBuiltInProgram) {
    // No quiz (their program is hand-authored, nothing to ask) and no
    // paywall (they aren't customers) — but the tutorial still runs. A
    // hand-authored program means the program was written for them, not
    // that they've ever seen this app before.
    return inputs.hasSeenBuiltInTutorial ? '/card' : '/tutorial';
  }

  // quizCompletedAt, not any template-assignment field, is the real
  // "has this account finished ONE of the two quiz branches" signal — a
  // rehab-only user may never get a template assignment at all.
  if (inputs.quizCompletedAt == null) return '/quiz';
  if (inputs.tutorialCompletedAt == null) return '/tutorial';

  // Phase 7 gate: only a non-built-in account reaches this line (the
  // isBuiltInProgram branch above already returned), and only after quiz
  // and tutorial are both done — so this can never preempt onboarding, and
  // never applies to a built-in account regardless of hasActiveSubscription.
  // Sits above the trackType check below on purpose: an unsubscribed
  // rehab-track user must hit the paywall too, not slip through to
  // /rehab-coming-soon unchecked.
  if (!inputs.hasActiveSubscription) return '/paywall';

  if (inputs.trackType === 'rehab') return '/rehab-coming-soon';
  return '/card';
}

// programs.js is plain JS (no .d.ts) — same require-not-import pattern
// app/(main)/card.tsx, app/tutorial.tsx, and the engine facade itself
// already use.
const PROGRAMS = require('../engine/programs.js');

/** email.toLowerCase() in PROGRAMS && email.toLowerCase() !== 'default' —
    the Phase 5 design spec's own definition of a "built-in" account: a
    hand-authored program keyed directly by real account email, distinct
    from the shared 'default' fallback anyone else's quiz assignment
    ultimately falls through to (see programs.js's own header comment).
    Defined once here (rather than duplicated in app/index.tsx and
    app/tutorial.tsx's onDone, as the plan's own draft did) since it's a
    tiny pure function with no dependencies beyond the same programs.js
    every other screen already requires this same way.

    Broadened 2026-09-07 to also cover Isaac (phillipsisaac14@gmail.com) —
    a hand-authored, quiz-free, non-climbing account in exactly the same
    sense Oscar/Joe/Max are, just resolved through src/engine/isaac/ rather
    than programs.js. Isaac isn't IN programs.js (his content has nothing
    to do with climbing — see isaacEngine.ts's own doc comment for why it's
    a fully separate engine), so this needed a second check, not a second
    programs.js entry. */
export function isBuiltInProgram(email: string | null): boolean {
  if (!email) return false;
  if (isIsaac(email)) return true;
  const key = email.toLowerCase();
  return key !== 'default' && Object.prototype.hasOwnProperty.call(PROGRAMS, key);
}

/** Task 11 bug-fix round 5: the root routing gate in app/index.tsx (the
    condition deciding whether it's safe to call computeRoute()/
    router.replace() at all, versus render a spinner/retry screen) was
    previously an inline boolean expression with no test of its own — the
    exact kind of gap that let round 4's regression (useProfile's
    `!forUserId` branch settling to `idle` instead of `ready`, permanently
    stranding every signed-out user on a spinner) ship undetected. Four
    consecutive review rounds on this file have each found a real bug only
    by hand-tracing a scenario nobody had written down as a test. Extracted
    here, alongside computeRoute() itself, so the actual gating logic used
    at runtime (app/index.tsx just calls this) IS the tested function, not
    a parallel copy of the same expression that could silently drift from
    it.

    Inputs are plain values, same discipline as RouteInputs above — no
    React hooks or live state, so this is callable from a plain Jest test
    with no rendering/mocking machinery at all.

    Priority order deliberately mirrors computeRoute()'s own: `hasSeenWelcome`
    and `isSignedIn` are checked first, before anything built-in- or
    profile-related, because computeRoute() itself returns '/welcome' or
    '/sign-in' immediately for those cases without ever looking at a
    profile or built-in-tutorial field. A signed-out user's profile fetch
    (src/data/useProfile.ts's own `!forUserId` branch) settles to `ready`
    with `row: null` precisely so this case doesn't have to wait on
    anything — but this function is written to not depend on that even
    being true: it reports ready for a signed-out user unconditionally,
    matching computeRoute()'s own structural independence from profile
    data in that case, rather than merely happening to agree with it. */
export interface RouteReadinessInputs {
  /** True once the real auth state (signed in vs genuinely signed out) is
      known — see app/index.tsx's top doc comment, adaptation (1). */
  authReady: boolean;
  /** `null` until the AsyncStorage read resolves. */
  hasSeenWelcome: boolean | null;
  isSignedIn: boolean;
  isBuiltInProgram: boolean;
  /** `null` until the per-email built-in-tutorial flag has resolved FOR
      THE CURRENT email — see app/index.tsx's top doc comment, adaptation
      (2), for why this is pre-keyed to email rather than a bare boolean. */
  builtInSeen: boolean | null;
  /** `useProfile(userId).loaded` — irrelevant (and NOT checked here) for a
      signed-out user or a built-in account, matching computeRoute()'s own
      branches never reading a profile field in either of those cases. */
  profileLoaded: boolean;
  /** True only for a non-built-in, signed-in account whose profile fetch
      genuinely threw — see app/index.tsx's own `profileFetchFailed`
      derivation. Irrelevant for a built-in account (its route never reads
      a profile field) or a signed-out one (no fetch to fail). */
  profileFetchFailed: boolean;
  /** Task 4: subscription.ts's PAYWALL_ENABLED, passed in as a plain value
      (not imported here) so this function stays pure and testable with no
      module-level state at all. False today, which makes the next field
      unconditionally irrelevant — see that field's own doc comment. */
  paywallEnabled: boolean;
  /** useEntitlement().loaded. Only consulted when paywallEnabled is true —
      when it's false (the current, shipped value) cold launch must not
      pick up a single frame of delay from a network call whose answer is
      being ignored anyway (computeRoute() only reads hasActiveSubscription
      for a non-built-in account, and app/index.tsx's caller-side
      derivation makes that field unconditionally true whenever
      PAYWALL_ENABLED is false, regardless of this value). Irrelevant for a
      built-in account (its route never reads hasActiveSubscription either)
      or a signed-out one, same as profileLoaded above. */
  entitlementLoaded: boolean;
  /** useEntitlement().failed — true only when the RevenueCat check itself
      threw (network, misconfiguration), never for a genuine "checked and
      not subscribed" answer (subscription.ts's own doc comment on the
      `failed` field explains why that distinction has to exist at all).
      Same irrelevant-while-paywallEnabled-is-false treatment as
      entitlementLoaded above, and for the same reason: this must not add
      a stall — or a wrongful retry screen — to a shipped, flag-off build. */
  entitlementFetchFailed: boolean;
}

export function isRouteReady(inputs: RouteReadinessInputs): boolean {
  if (!inputs.authReady) return false;
  if (inputs.hasSeenWelcome == null) return false;
  // computeRoute() returns '/sign-in' here without ever consulting a
  // profile or built-in field — so neither should this gate. This is the
  // exact branch that was missing before round 4's regression: nothing
  // else in this function may block readiness for a signed-out user.
  if (!inputs.isSignedIn) return true;
  if (inputs.isBuiltInProgram) return inputs.builtInSeen != null;
  if (inputs.profileFetchFailed) return false;
  if (!inputs.profileLoaded) return false;
  // Only ever waits on this when the paywall is actually on — with
  // paywallEnabled false this line can't fire, so this is a strict
  // no-op today, preserving the exact prior return value (profileLoaded)
  // byte for byte. Checked ahead of entitlementLoaded below even though
  // useEntitlement() sets `loaded: true` in its own finally block either
  // way (so entitlementLoaded would already be true on a failure too) —
  // ordering it first mirrors profileFetchFailed vs. profileLoaded above
  // and keeps the two checks meaning what their names say, rather than
  // relying on one subsuming the other by accident of implementation.
  if (inputs.paywallEnabled && inputs.entitlementFetchFailed) return false;
  if (inputs.paywallEnabled && !inputs.entitlementLoaded) return false;
  return true;
}

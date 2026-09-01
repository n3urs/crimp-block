/** Direct port of NativeAppView.swift's gating chain (body's top-level
    if/else branches, plus reload()'s own guard sequence) as one pure,
    directly-testable priority list — same "one function, same order as
    Swift's own checks" discipline every prior phase's gating logic has
    used. Adapted for expo-router: instead of swapping which view
    renders in place, this returns which single route the caller should
    router.replace() to. */

export type Route = '/welcome' | '/sign-in' | '/quiz' | '/tutorial' | '/rehab-coming-soon' | '/card';

export interface RouteInputs {
  hasSeenWelcome: boolean;
  isSignedIn: boolean;
  email: string | null;
  isBuiltInProgram: boolean;
  hasSeenBuiltInTutorial: boolean;
  quizCompletedAt: string | null;
  tutorialCompletedAt: string | null;
  trackType: string | null;
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

  // TODO(Phase 7): real subscription gate goes here, between the
  // tutorial check above and the track-routing below — see the Phase 5
  // design spec's Decision 4 for why it's deliberately absent for now
  // (needsPaywall is hardcoded false; real IAP is Phase 7).

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
    every other screen already requires this same way. */
export function isBuiltInProgram(email: string | null): boolean {
  if (!email) return false;
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
  return inputs.profileLoaded;
}

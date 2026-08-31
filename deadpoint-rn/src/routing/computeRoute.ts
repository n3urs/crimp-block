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

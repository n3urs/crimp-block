import { computeRoute, isBuiltInProgram, isRouteReady, type RouteInputs, type RouteReadinessInputs } from '../src/routing/computeRoute';

const base: RouteInputs = {
  hasSeenWelcome: true, isSignedIn: true, email: 'new@example.com', isBuiltInProgram: false,
  hasSeenBuiltInTutorial: false, quizCompletedAt: null, tutorialCompletedAt: null, trackType: null,
  // Defaults to subscribed so every pre-existing test below (none of which
  // is about the paywall) keeps exercising exactly the path it did before
  // this field existed — only the new tests further down override it.
  hasActiveSubscription: true,
};

test('welcome comes first, before anything else', () => {
  expect(computeRoute({ ...base, hasSeenWelcome: false })).toBe('/welcome');
});

test('sign-in comes right after welcome, before any account-specific check', () => {
  expect(computeRoute({ ...base, isSignedIn: false })).toBe('/sign-in');
});

// Adaptation: the brief's own draft of this test left hasSeenBuiltInTutorial
// at base's default (false), which made it contradict the very next test
// (identical isBuiltInProgram/hasSeenBuiltInTutorial inputs, different
// expected routes - impossible for a pure function). This test's own name
// is about quiz-skipping specifically, which is orthogonal to the tutorial
// step, so hasSeenBuiltInTutorial is set true here to isolate that: a
// built-in account with quizCompletedAt still null must reach '/card'
// (proving quiz is never checked for it), not fall through to '/quiz'.
test('a built-in account skips quiz entirely, even with no quizCompletedAt', () => {
  expect(computeRoute({ ...base, isBuiltInProgram: true, hasSeenBuiltInTutorial: true, email: 'oscar@sullivanltd.co.uk' })).toBe('/card');
});

test('a built-in account still gets the tutorial once, tracked device-locally', () => {
  expect(computeRoute({ ...base, isBuiltInProgram: true, hasSeenBuiltInTutorial: false })).toBe('/tutorial');
});

// Fix 4 (Task 11 bug-fix pass): pins "a built-in account's route is decided
// entirely independent of every server-side profile field" — under-tested
// before this pass, which only covered quizCompletedAt (above). A built-in
// account never takes the quiz, so it has no real trackType in practice,
// but computeRoute's own branch structure should still be pinned to prove
// the built-in path structurally can't reach the rehab check at all: it
// returns before the `trackType === 'rehab'` line is ever evaluated.
test('a built-in account with a rehab trackType still resolves to /card, never /rehab-coming-soon', () => {
  expect(computeRoute({
    ...base, isBuiltInProgram: true, hasSeenBuiltInTutorial: true,
    quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z',
    trackType: 'rehab',
  })).toBe('/card');
});

// Fix 4, second case: proves the built-in branch uses ONLY the device-local
// hasSeenBuiltInTutorial flag, never the server-side tutorialCompletedAt
// field, even when tutorialCompletedAt is a real (non-null) timestamp.
test('a built-in account with tutorialCompletedAt set but hasSeenBuiltInTutorial false still resolves to /tutorial', () => {
  expect(computeRoute({
    ...base, isBuiltInProgram: true, hasSeenBuiltInTutorial: false,
    tutorialCompletedAt: '2026-08-01T00:00:00Z',
  })).toBe('/tutorial');
});

test('a quiz-eligible account with no quizCompletedAt needs the quiz', () => {
  expect(computeRoute(base)).toBe('/quiz');
});

test('a quizzed account with no tutorialCompletedAt needs the tutorial', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z' })).toBe('/tutorial');
});

// Uses base's default hasActiveSubscription: true, so this also pins that
// the Phase 7 gate below leaves this existing rehab routing unaffected for
// a subscribed user — see the unsubscribed counterpart further down for the
// gate's actual ordering relative to trackType.
test('a rehab-track account past quiz+tutorial has nowhere real to go yet', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'rehab' })).toBe('/rehab-coming-soon');
});

test('a fully onboarded standard-track account reaches the real card', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'standard' })).toBe('/card');
});

// Phase 7 (Task 4): the real subscription gate. It sits between the
// tutorialCompletedAt check and the trackType routing below it — same slot
// the old // TODO(Phase 7) comment used to mark. This is the ONLY place
// the '/paywall' literal can be produced; every other branch above it
// returns before ever reading hasActiveSubscription.
test('an unsubscribed, non-built-in, fully onboarded user is routed to the paywall', () => {
  expect(computeRoute({
    ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z',
    trackType: 'standard', hasActiveSubscription: false,
  })).toBe('/paywall');
});

test('the same user, subscribed, reaches the real card exactly as before', () => {
  expect(computeRoute({
    ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z',
    trackType: 'standard', hasActiveSubscription: true,
  })).toBe('/card');
});

// The carve-out Oscar explicitly confirmed: built-in accounts (Oscar/Joe/
// Max) are not customers and must never see the paywall, regardless of
// subscription status. Structurally guaranteed here too — the
// isBuiltInProgram branch returns above, before quizCompletedAt is even
// read — but pinned directly since this is exactly the kind of built-in-
// account carve-out this file's own history shows gets silently broken.
test('a built-in account bypasses the paywall regardless of subscription status', () => {
  expect(computeRoute({
    ...base, isBuiltInProgram: true, hasSeenBuiltInTutorial: true, hasActiveSubscription: false,
    quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z',
  })).toBe('/card');
});

// The gate sits AFTER onboarding, not before it: an unsubscribed user who
// hasn't finished the quiz yet still goes to /quiz, never /paywall.
test('a user who has not finished the quiz still routes to the quiz, not the paywall, even when unsubscribed', () => {
  expect(computeRoute({ ...base, hasActiveSubscription: false })).toBe('/quiz');
});

// The gate sits BEFORE trackType routing (per the brief's placement: right
// after tutorialCompletedAt, above the `trackType === 'rehab'` check) — so
// an unsubscribed rehab-track user hits the paywall first, same as a
// standard-track one, rather than reaching /rehab-coming-soon unchecked.
test('the gate sits before track-routing: an unsubscribed rehab-track user hits the paywall first', () => {
  expect(computeRoute({
    ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z',
    trackType: 'rehab', hasActiveSubscription: false,
  })).toBe('/paywall');
});

// isBuiltInProgram: previously duplicated inline in the plan's draft for
// both app/index.tsx and app/tutorial.tsx's onDone; defined once here
// instead (see this task's brief) and imported by both. Tested directly
// against the real programs.js keys, not a synthetic fixture — same
// "real data, not a mock" precedent __tests__/engine-parity.test.ts and
// __tests__/deviceFlags.test.ts already use for account emails.
test('isBuiltInProgram is true for a real hand-authored account email', () => {
  expect(isBuiltInProgram('oscar@sullivanltd.co.uk')).toBe(true);
});

test('isBuiltInProgram is case-insensitive, matching how programs.js itself keys accounts', () => {
  expect(isBuiltInProgram('Oscar@SullivanLtd.co.uk')).toBe(true);
});

test('isBuiltInProgram is false for the "default" fallback key itself', () => {
  expect(isBuiltInProgram('default')).toBe(false);
});

test('isBuiltInProgram is false for an email with no matching program', () => {
  expect(isBuiltInProgram('nobody@example.com')).toBe(false);
});

test('isBuiltInProgram is false for null (not yet signed in)', () => {
  expect(isBuiltInProgram(null)).toBe(false);
});

// isRouteReady: Task 11 round 5's extraction of the root routing gate from
// app/index.tsx (the boolean expression deciding whether it's safe to call
// computeRoute()/router.replace() at all, versus render a spinner/retry
// screen) into a pure, directly-testable function — see its own doc
// comment in computeRoute.ts for why this extraction exists: four
// consecutive review rounds on this file each found a real bug only by
// hand-tracing a scenario nobody had written down as a test, and this was
// previously an inline expression with no test coverage of its own at all.
const readyBase: RouteReadinessInputs = {
  authReady: true, hasSeenWelcome: true, isSignedIn: true, isBuiltInProgram: false,
  builtInSeen: null, profileLoaded: true, profileFetchFailed: false,
  // Defaults to the real PAYWALL_ENABLED value (false) so every
  // pre-existing test below keeps its original meaning untouched —
  // entitlementLoaded/entitlementFetchFailed are irrelevant whenever
  // paywallEnabled is false.
  paywallEnabled: false, entitlementLoaded: false, entitlementFetchFailed: false,
};

test('not ready: authReady still false', () => {
  expect(isRouteReady({ ...readyBase, authReady: false })).toBe(false);
});

test('not ready: hasSeenWelcome not yet loaded from AsyncStorage', () => {
  expect(isRouteReady({ ...readyBase, hasSeenWelcome: null })).toBe(false);
});

test('not ready: non-built-in account, profile not yet loaded', () => {
  expect(isRouteReady({ ...readyBase, profileLoaded: false })).toBe(false);
});

test('not ready: non-built-in account, profile fetch errored', () => {
  expect(isRouteReady({ ...readyBase, profileLoaded: false, profileFetchFailed: true })).toBe(false);
});

test('not ready: built-in account, builtInSeen not yet resolved for this email', () => {
  expect(isRouteReady({ ...readyBase, isBuiltInProgram: true, builtInSeen: null, profileLoaded: false })).toBe(false);
});

// Task 11 round 4's actual regression, pinned directly: a signed-out
// user's profile is irrelevant to routing at all — computeRoute() returns
// '/sign-in' immediately, before ever looking at a profile or built-in
// field (see computeRoute()'s own priority order above) — so readiness
// must not wait on profile.loaded (or builtInSeen) for this case. Proven
// here by leaving BOTH profileLoaded false and builtInSeen null and still
// expecting `true`: before this fix, useProfile's signed-out branch never
// settled `loaded` to true at all, so this exact combination is what
// permanently stranded every signed-out user on a spinner.
test('ready: signed-out user, without waiting on profile data at all', () => {
  expect(isRouteReady({ ...readyBase, isSignedIn: false, profileLoaded: false, builtInSeen: null })).toBe(true);
});

test('ready: non-built-in account, profile genuinely loaded', () => {
  expect(isRouteReady(readyBase)).toBe(true);
});

test('ready: built-in account, builtInSeen resolved true', () => {
  expect(isRouteReady({ ...readyBase, isBuiltInProgram: true, builtInSeen: true, profileLoaded: false })).toBe(true);
});

// "Resolved" means non-null, not "resolved truthy" — a built-in account
// that has genuinely never seen its tutorial (builtInSeen: false) is just
// as ready to route (to /tutorial, per computeRoute()) as one that has.
test('ready: built-in account, builtInSeen resolved false', () => {
  expect(isRouteReady({ ...readyBase, isBuiltInProgram: true, builtInSeen: false, profileLoaded: false })).toBe(true);
});

// Defensive/structural: pins that a genuine fetch error always blocks
// readiness for a non-built-in account, even given a (structurally
// unreachable via the real useProfile union, but worth pinning at the
// boundary of this pure function itself) contradictory profileLoaded:true.
test('not ready: profile fetch errored takes precedence even if profileLoaded is also true', () => {
  expect(isRouteReady({ ...readyBase, profileLoaded: true, profileFetchFailed: true })).toBe(false);
});

// Phase 7 (Task 4): the whole safety case for shipping the gate inert rests
// on this one — with the real, current PAYWALL_ENABLED value (false),
// readiness must NEVER wait on entitlement.loaded, so cold launch cannot
// pick up so much as one added frame of delay from a network call whose
// answer is being ignored anyway. readyBase already defaults to
// paywallEnabled: false/entitlementLoaded: false, so this is really just
// readyBase restated — pinned explicitly here so a future edit that starts
// gating on entitlementLoaded unconditionally fails loudly.
test('ready: paywall disabled — never blocks on entitlement.loaded, even when it is false', () => {
  expect(isRouteReady({ ...readyBase, paywallEnabled: false, entitlementLoaded: false })).toBe(true);
});

test('not ready: paywall enabled, entitlement not yet loaded for a non-built-in account', () => {
  expect(isRouteReady({ ...readyBase, paywallEnabled: true, entitlementLoaded: false })).toBe(false);
});

test('ready: paywall enabled, entitlement genuinely loaded', () => {
  expect(isRouteReady({ ...readyBase, paywallEnabled: true, entitlementLoaded: true })).toBe(true);
});

// A built-in account's route never reads hasActiveSubscription at all (see
// computeRoute's isBuiltInProgram branch) — so its readiness must not wait
// on entitlement.loaded either, even with the paywall enabled.
test('ready: built-in account ignores entitlement.loaded entirely, even with the paywall enabled', () => {
  expect(isRouteReady({
    ...readyBase, isBuiltInProgram: true, builtInSeen: true, profileLoaded: false,
    paywallEnabled: true, entitlementLoaded: false,
  })).toBe(true);
});

// Task 4 review fix: useEntitlement().failed distinguishes "the check
// itself errored" from "checked and genuinely not subscribed" — see
// subscription.ts's own doc comment on that field. isRouteReady must fail
// closed on the former (hold on a retry screen) rather than either sailing
// through as ready or spinning forever, since `loaded` turns true in
// useEntitlement's finally block on this path too.
test('ready: paywall disabled — never blocks on entitlement.failed either', () => {
  expect(isRouteReady({ ...readyBase, paywallEnabled: false, entitlementFetchFailed: true })).toBe(true);
});

test('not ready: paywall enabled, the entitlement check itself failed', () => {
  expect(isRouteReady({
    ...readyBase, paywallEnabled: true, entitlementLoaded: true, entitlementFetchFailed: true,
  })).toBe(false);
});

test('ready: built-in account ignores entitlement.failed entirely, even with the paywall enabled', () => {
  expect(isRouteReady({
    ...readyBase, isBuiltInProgram: true, builtInSeen: true, profileLoaded: false,
    paywallEnabled: true, entitlementLoaded: true, entitlementFetchFailed: true,
  })).toBe(true);
});

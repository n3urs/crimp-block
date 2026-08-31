import { computeRoute, isBuiltInProgram, type RouteInputs } from '../src/routing/computeRoute';

const base: RouteInputs = {
  hasSeenWelcome: true, isSignedIn: true, email: 'new@example.com', isBuiltInProgram: false,
  hasSeenBuiltInTutorial: false, quizCompletedAt: null, tutorialCompletedAt: null, trackType: null,
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

test('a quiz-eligible account with no quizCompletedAt needs the quiz', () => {
  expect(computeRoute(base)).toBe('/quiz');
});

test('a quizzed account with no tutorialCompletedAt needs the tutorial', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z' })).toBe('/tutorial');
});

test('a rehab-track account past quiz+tutorial has nowhere real to go yet', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'rehab' })).toBe('/rehab-coming-soon');
});

test('a fully onboarded standard-track account reaches the real card', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'standard' })).toBe('/card');
});

test('paywall is never routed to in this phase, even conceptually - not a reachable branch at all', () => {
  // No RouteInputs combination should ever produce '/paywall' - confirmed
  // by there being no such literal anywhere in computeRoute's return
  // type or implementation. This test exists as a marker, not a real
  // behavioral check: see Decision 4 in the design spec (needsPaywall
  // hardcoded off, real gate is Phase 7).
  const result = computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'standard' });
  expect(result).not.toBe('/paywall');
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

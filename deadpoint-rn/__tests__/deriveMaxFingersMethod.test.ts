// __tests__/deriveMaxFingersMethod.test.ts
// The hangboard-vs-pickup follow-up used to show (and had to be
// manually answered) whenever pickupRig was selected, even for someone
// with no hangboard at all — not a genuine either/or. See
// deriveMaxFingersMethod's own doc comment in StandardSteps.tsx for why
// the fix isn't simply "only show the question when both are selected".
import { deriveMaxFingersMethod } from '../src/screens/quiz/quizModel';

test('no pickup rig at all: the question does not apply, regardless of hangboard', () => {
  expect(deriveMaxFingersMethod([], null)).toBeNull();
  expect(deriveMaxFingersMethod(['hangboard'], 'pickup')).toBeNull();
});

test('pickup rig but no hangboard: auto-assigns pickup — there is no real choice to make', () => {
  expect(deriveMaxFingersMethod(['pickupRig'], null)).toBe('pickup');
});

test('pickup rig and hangboard both selected: a genuine either/or, so an existing choice is kept, not reset', () => {
  expect(deriveMaxFingersMethod(['pickupRig', 'hangboard'], 'hangboard')).toBe('hangboard');
  expect(deriveMaxFingersMethod(['pickupRig', 'hangboard'], 'pickup')).toBe('pickup');
  expect(deriveMaxFingersMethod(['pickupRig', 'hangboard'], null)).toBeNull();
});

test('removing hangboard while pickup rig stays selected falls back to the one remaining real option', () => {
  // Simulates: both were selected and 'hangboard' was chosen, then the
  // user unticks hangboard — pickup is now the only real option left,
  // so the stale 'hangboard' choice must not survive.
  expect(deriveMaxFingersMethod(['pickupRig'], 'hangboard')).toBe('pickup');
});

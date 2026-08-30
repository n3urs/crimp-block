import { advancePhase, leadingInt, statusText, type PhaseState } from '../src/components/timers/intervalTimerLogic';

test('ready advances to on, set/rep unchanged', () => {
  const state: PhaseState = { phase: 'ready', set: 1, rep: 1 };
  expect(advancePhase(state, 3, 5)).toEqual({ phase: 'on', set: 1, rep: 1 });
});

test('on advances to off when more reps remain in this set', () => {
  const state: PhaseState = { phase: 'on', set: 1, rep: 2 };
  expect(advancePhase(state, 3, 5)).toEqual({ phase: 'off', set: 1, rep: 2 });
});

test('on advances to off on the very last rep of the very last set (still takes the ordinary rest)', () => {
  const state: PhaseState = { phase: 'on', set: 3, rep: 5 };
  expect(advancePhase(state, 3, 5)).toEqual({ phase: 'off', set: 3, rep: 5 });
});

test('on skips straight to setrest on the last rep of a set that has another one after it', () => {
  const state: PhaseState = { phase: 'on', set: 1, rep: 5 };
  expect(advancePhase(state, 3, 5)).toEqual({ phase: 'setrest', set: 1, rep: 5 });
});

test('off advances to on and increments rep when more reps remain', () => {
  const state: PhaseState = { phase: 'off', set: 1, rep: 2 };
  expect(advancePhase(state, 3, 5)).toEqual({ phase: 'on', set: 1, rep: 3 });
});

test('off falls back to setrest when reps are exhausted but sets remain (documented as not normally reached)', () => {
  const state: PhaseState = { phase: 'off', set: 1, rep: 5 };
  expect(advancePhase(state, 3, 5)).toEqual({ phase: 'setrest', set: 1, rep: 5 });
});

test('off finishes when both reps and sets are exhausted', () => {
  const state: PhaseState = { phase: 'off', set: 3, rep: 5 };
  expect(advancePhase(state, 3, 5)).toBe('finish');
});

test('setrest advances to on, incrementing set and resetting rep to 1', () => {
  const state: PhaseState = { phase: 'setrest', set: 1, rep: 5 };
  expect(advancePhase(state, 3, 5)).toEqual({ phase: 'on', set: 2, rep: 1 });
});

test('done is a no-op', () => {
  const state: PhaseState = { phase: 'done', set: 3, rep: 5 };
  expect(advancePhase(state, 3, 5)).toEqual(state);
});

test('leadingInt reads the leading digit run, same as parseInt(s, 10)', () => {
  expect(leadingInt('5 × (10s on / 5s off × 5)')).toBe(5);
});

test('leadingInt returns undefined with no leading digit', () => {
  expect(leadingInt('no digits here')).toBeUndefined();
});

test('statusText for ready', () => {
  expect(statusText({ phase: 'ready', set: 1, rep: 1 }, 3, 5)).toBe('GET READY — SET 1 OF 3');
});

test('statusText for on', () => {
  expect(statusText({ phase: 'on', set: 2, rep: 4 }, 3, 5)).toBe('SET 2 OF 3 · REP 4 OF 5 · HANG');
});

test('statusText for off', () => {
  expect(statusText({ phase: 'off', set: 2, rep: 4 }, 3, 5)).toBe('SET 2 OF 3 · REP 4 OF 5 · REST');
});

test('statusText for setrest', () => {
  expect(statusText({ phase: 'setrest', set: 2, rep: 5 }, 3, 5)).toBe('SET 2 OF 3 · REST BEFORE SET 3');
});

test('statusText for done', () => {
  expect(statusText({ phase: 'done', set: 3, rep: 5 }, 3, 5)).toBe('DONE — ALL 3 SETS');
});

// __tests__/engine-parity.test.ts
import { createEngine, SESSION_ORDER } from '../src/engine';
const PROGRAMS = require('../src/engine/programs.js');

/** Oscar's real logged history, 7–28 Aug 2026, fetched from Supabase.
    Used because its expected outputs were independently verified against
    the live JS engine while building the calendar. */
const HISTORY: Record<string, { t: string }> = {
  '2026-08-07': { t: 'maxFingers' }, '2026-08-08': { t: 'climbHard' },
  '2026-08-09': { t: 'outdoorHard' }, '2026-08-10': { t: 'rest' },
  '2026-08-11': { t: 'hangboard' },  '2026-08-12': { t: 'pull' },
  '2026-08-13': { t: 'rest' },       '2026-08-14': { t: 'rest' },
  '2026-08-15': { t: 'maxFingers' }, '2026-08-16': { t: 'rest' },
  '2026-08-17': { t: 'hangboard' },  '2026-08-18': { t: 'pull' },
  '2026-08-19': { t: 'maxFingers' }, '2026-08-20': { t: 'rest' },
  '2026-08-21': { t: 'outdoorHard' },'2026-08-22': { t: 'pull' },
  '2026-08-23': { t: 'maxFingers' }, '2026-08-24': { t: 'climbHard' },
  '2026-08-25': { t: 'rest' },       '2026-08-26': { t: 'maxFingers' },
  '2026-08-27': { t: 'pull' },       '2026-08-28': { t: 'rest' },
};

const engine = () =>
  createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: HISTORY, loadLog: {} });

test('session order matches EngineBridge.order exactly', () => {
  expect(SESSION_ORDER).toEqual([
    'maxFingers', 'hangboard', 'pull', 'climbHard', 'outdoorHard', 'climbEasy', 'rest',
  ]);
});

test('block() on 2026-08-29 matches the verified Swift output', () => {
  expect(engine().block('2026-08-29')).toMatchObject({ b: 1, w: 4, per: 4, total: 12 });
});

test('isDeload agrees with block().w === 4', () => {
  expect(engine().isDeload('2026-08-29')).toBe(true);
});

test('phaseNameAt returns the real phase', () => {
  expect(engine().phaseNameAt('2026-08-29')).toBe('Base');
});

test('decide() reproduces the deload hard-day cap verbatim', () => {
  // Verified live: 4 hard days in the trailing window, cap is 3 in a deload week.
  const d = engine().decide('2026-08-29');
  expect(d.k).toBe('rest');
  expect(d.why).toContain('deload week');
});

test('a gap on a real rest day still recommends rest (streak logic depends on this)', () => {
  const withGap = { ...HISTORY };
  delete withGap['2026-08-20'];
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: withGap, loadLog: {} });
  expect(e.decide('2026-08-20').k).toBe('rest');
});

test('a gap on a real workout day does NOT recommend rest', () => {
  const withGap = { ...HISTORY };
  delete withGap['2026-08-19'];
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: withGap, loadLog: {} });
  expect(e.decide('2026-08-19').k).toBe('maxFingers');
});

test('decide() does not crash on a foreign (non-climbing) session type in history', () => {
  // Real bug, live: any screen not yet routed through isaacEngine.ts (see
  // its own doc comment) that constructs a plain climbing engine with a
  // built-in non-climbing account's real sessionLog — e.g. Isaac's
  // 'pushHeavy' — crashed the whole screen the moment decide() looked back
  // and found that entry within its own 7-day history window, because
  // `T[type]` was assumed to always exist once `type` was truthy. Session
  // key doesn't matter here beyond "not one of PROGRAMS.default's own" —
  // this guards the shared engine itself, not any one account's data.
  const withForeignType = { ...HISTORY, '2026-08-28': { t: 'pushHeavy' } };
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: withForeignType, loadLog: {} });
  expect(() => e.decide('2026-08-29')).not.toThrow();
});

test('programStartDate is the program anchor, not the earliest log', () => {
  // Deliberately differs: earliest log is 07 Aug, program starts 10 Aug.
  expect(engine().programStartDate()).toBe('2026-08-10');
});

test('resolveExercises: maxFingers on a brand-new account (no loadLog history)', () => {
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: HISTORY, loadLog: {} });
  const rows = e.resolveExercises('maxFingers', '2026-08-29', 'Base');
  expect(rows).toHaveLength(5);

  // Not weight-tracked (no `id` on the base exercise) and its prescription
  // is deload/phase-exempt, so it's unchanged from base.
  expect(rows.find(r => r.title === 'Warm up')).toMatchObject({
    id: 'Warm up',
    hasWeightTracking: false,
    phaseAdjusted: false,
  });

  // hasWeightTracking must be "the exercise has an id", not "it has a
  // weight" — with an empty loadLog there's no target() result yet, so
  // weightKg is undefined even though hasWeightTracking is true. Base phase
  // overrides this exercise's prescription, so phaseAdjusted is true.
  const pickupHalf = rows.find(r => r.id === 'osc-pickup-half');
  expect(pickupHalf).toBeDefined();
  expect(pickupHalf!.hasWeightTracking).toBe(true);
  expect(pickupHalf!.weightKg).toBeUndefined();
  expect(pickupHalf!.phaseAdjusted).toBe(true);
});

test('resolveExercises: hangboard drops a ^skip-ruled exercise for this phase', () => {
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: HISTORY, loadLog: {} });
  const rows = e.resolveExercises('hangboard', '2026-08-29', 'Base');

  expect(rows.map(r => r.title)).not.toContain('Weighted hangs');

  expect(rows.find(r => r.id === 'osc-rep20')).toMatchObject({
    interval: { on: 7, off: 3, reps: 6 },
  });
});

test('resolveExercises: rest sessions have no exercises', () => {
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: HISTORY, loadLog: {} });
  expect(e.resolveExercises('rest', '2026-08-29', 'Base')).toEqual([]);
});

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
  // Real bug, live: a foreign session key ('pushHeavy', from a non-climbing
  // built-in account resolved through a different engine) crashed the
  // whole screen the moment decide() looked back and found that entry
  // within its own 7-day history window, because `T[type]` was assumed to
  // always exist once `type` was truthy. Session key doesn't matter here
  // beyond "not one of PROGRAMS.default's own" — this guards the shared
  // engine itself, not any one account's data.
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

test('the plan cycles Max Strength <-> Power forever instead of plateauing at Performance', () => {
  // A long, unbroken run of training days from Oscar's real start date —
  // far more than the one-time 24-week structured plan needs, so this
  // genuinely exercises wrapping more than once, not just the first time.
  const longRun: Record<string, { t: string }> = {};
  let d = new Date('2026-08-10T12:00:00');
  for (let i = 0; i < 240; i++) {
    longRun[d.toISOString().slice(0, 10)] = { t: 'maxFingers' };
    d.setDate(d.getDate() + 1);
  }
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: longRun, loadLog: {} });
  const dateAt = (wIdxTarget: number) => {
    const nd = new Date('2026-08-10T12:00:00');
    nd.setDate(nd.getDate() + (wIdxTarget * 4)); // n trained days = wIdx*4, one trained day per calendar day here
    return nd.toISOString().slice(0, 10);
  };

  // The exact crux of the fix: the week Power's own deload finishes is
  // still 'Power' — the very next tracked week must NOT hold at
  // 'Performance' the way it used to, it must fall back to 'Max Strength'.
  expect(e.phaseNameAt(dateAt(19))).toBe('Power');
  expect(e.phaseNameAt(dateAt(20))).toBe('Max Strength');

  // Swept across many blocks (well past a second and third lap), the
  // automatic cycle must never once select Performance, and the block
  // number must stay within the repeating [2,5] range once Base is done.
  for (let wIdx = 4; wIdx <= 59; wIdx++) {
    const date = dateAt(wIdx);
    expect(e.phaseNameAt(date)).not.toBe('Performance');
    const b = e.block(date).b;
    expect(b).toBeGreaterThanOrEqual(2);
    expect(b).toBeLessThanOrEqual(5);
  }

  // And it really does keep cycling, not just wrap once and get stuck:
  // Power (block 5) must recur more than once across that sweep.
  const phaseNames = Array.from({ length: 56 }, (_, i) => e.phaseNameAt(dateAt(i + 4)));
  const powerCount = phaseNames.filter((n) => n === 'Power').length;
  expect(powerCount).toBeGreaterThan(1);
});

test('resolveExercises: rest sessions have no exercises', () => {
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: HISTORY, loadLog: {} });
  expect(e.resolveExercises('rest', '2026-08-29', 'Base')).toEqual([]);
});

test('resolveExercises: pull day Antagonists carries a 3-item weightGroup, each independently tracked', () => {
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: HISTORY, loadLog: {} });
  const rows = e.resolveExercises('pull', '2026-08-29', 'Base');
  const antagonists = rows.find(r => r.title === 'Antagonists');
  expect(antagonists).toBeDefined();
  expect(antagonists!.weightGroup).toEqual([
    { id: 'osc-antag-wristcurl', title: 'Reverse wrist curls', step: 1.25, weightKg: undefined, weightIsBump: false },
    { id: 'osc-antag-extrot', title: 'External rotation', step: 1.25, weightKg: undefined, weightIsBump: false },
    { id: 'osc-antag-dip', title: 'Dips', step: 1.25, weightKg: undefined, weightIsBump: false },
  ]);

  // Each group item resolves through the same target()/loadLog path a
  // normal single-weight exercise does — not a separate mechanism.
  const withLoads = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], {
    sessionLog: HISTORY,
    loadLog: { 'osc-antag-dip': [{ date: '2026-08-27', kg: 20 }] },
  });
  const dip = withLoads.resolveExercises('pull', '2026-08-29', 'Base')
    .find(r => r.title === 'Antagonists')!.weightGroup!.find(i => i.id === 'osc-antag-dip');
  expect(dip?.weightKg).toBe(20);
});

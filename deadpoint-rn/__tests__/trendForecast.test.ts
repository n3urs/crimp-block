import { computeTrendForecast, type TrendForecastEngine } from '../src/screens/calendar/trendForecast';
import type { Days } from '../src/data/useStore';

/** A minimal fake satisfying TrendForecastEngine — addDays does real
    calendar-day arithmetic (ISO strings, no Date-object dependency,
    since the tests need to reason about exact offsets), block() and
    isTraining() are configurable per test. */
function fakeAddDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function makeEngine(block: TrendForecastEngine['block']): TrendForecastEngine {
  return { addDays: fakeAddDays, block, isTraining: (t) => t !== 'rest' };
}

test('weeklyRate reflects real training frequency in the window', () => {
  const history: Days = {
    '2026-08-01': { t: 'pull', l: null, sub: null },
    '2026-08-08': { t: 'pull', l: null, sub: null },
    '2026-08-15': { t: 'pull', l: null, sub: null },
  };
  // 3 training days over a 15-day window (Aug 1 -> Aug 15) = 1/5 per day = 1.4/week
  const engine = makeEngine(() => ({ b: 1, w: 1, done: 0, per: 3, total: 3, wIdx: 0, over: false }));
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.weeklyRate).toBeCloseTo(1.4, 1);
  expect(result.windowDays).toBe(15);
});

test('weeklyRate window is bounded by the earliest real entry, not the full 56 days, on a new account', () => {
  const history: Days = { '2026-08-10': { t: 'pull', l: null, sub: null } };
  const engine = makeEngine(() => ({ b: 1, w: 1, done: 0, per: 3, total: 1, wIdx: 0, over: false }));
  const result = computeTrendForecast(engine, history, '2026-08-15');
  // window is Aug 10 -> Aug 15 (6 days), not 56 - the account didn't exist before Aug 10
  expect(result.windowDays).toBe(6);
});

test('weeklyRate floors at a nonzero minimum, never divides by a true zero rate', () => {
  const engine = makeEngine(() => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }));
  const result = computeTrendForecast(engine, {}, '2026-08-15');
  expect(result.weeklyRate).toBeGreaterThan(0);
  expect(Number.isFinite(result.weeklyRate)).toBe(true);
});

test('mid-deload week (w===4) projects the REMAINING days of THIS week, not a full window three weeks out', () => {
  // per=3, done=1 -> 2 remaining training days this deload week
  const engine = makeEngine(() => ({ b: 2, w: 4, done: 1, per: 3, total: 22, wIdx: 3, over: false }));
  const history: Days = { '2026-08-01': { t: 'pull', l: null, sub: null } };
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.deload).not.toBeNull();
  expect(result.deload!.start).toBe('2026-08-15'); // starts today, not in the future
});

test('non-deload week projects a future deload window, offset ahead of today', () => {
  // per=3, total=5 (3*3 - 5 = 4 training days still needed to reach the next deload)
  const engine = makeEngine(() => ({ b: 1, w: 2, done: 2, per: 3, total: 5, wIdx: 1, over: false }));
  const history: Days = { '2026-08-01': { t: 'pull', l: null, sub: null } };
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.deload).not.toBeNull();
  expect(result.deload!.start > '2026-08-15').toBe(true); // strictly in the future
});

test('a deload projected to already be under way (offset <= 0) is not shown', () => {
  // per=3, total already at/past 3*3=9 -> trainingDaysToDeload floors at 0 -> offset 0, not shown
  const engine = makeEngine(() => ({ b: 1, w: 2, done: 2, per: 3, total: 12, wIdx: 1, over: false }));
  const history: Days = { '2026-08-01': { t: 'pull', l: null, sub: null } };
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.deload).toBeNull();
});

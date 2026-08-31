import { computeAllTimeStats, type AllTimeStatsEngine } from '../src/screens/calendar/allTimeStats';
import type { Days } from '../src/data/useStore';

function fakeAddDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function makeEngine(overrides: Partial<AllTimeStatsEngine> = {}): AllTimeStatsEngine {
  return {
    addDays: fakeAddDays,
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }),
    decide: () => ({ k: 'pull' }),
    programStartDate: () => undefined,
    sessionColourVarName: (key) => `--${key}`,
    sessionInfo: (key) => ({ n: key.toUpperCase() }),
    ...overrides,
  };
}
const colour = (v: string) => v; // identity resolver, real one is src/design/colours.ts's resolveColour
const ORDER = ['pull', 'push', 'climbHard'] as const; // real one is SESSION_ORDER from src/engine

test('loggedCount counts every non-rest entry up to and including today, ignores future entries', () => {
  const history: Days = {
    '2026-08-01': { t: 'pull', l: null, sub: null },
    '2026-08-02': { t: 'rest', l: null, sub: null },
    '2026-08-03': { t: 'push', l: null, sub: null },
    '2026-09-01': { t: 'pull', l: null, sub: null }, // future - not counted
  };
  const stats = computeAllTimeStats(makeEngine(), history, '2026-08-15', colour, ORDER);
  expect(stats.loggedCount).toBe(2); // pull + push, not rest, not the future entry
});

test('climbHard becomes a single "Board" breakdown row, counting only board-tagged entries', () => {
  const history: Days = {
    '2026-08-01': { t: 'climbHard', l: null, sub: 'board' },
    '2026-08-02': { t: 'climbHard', l: null, sub: 'climb' }, // not board - doesn't count toward Board
  };
  const stats = computeAllTimeStats(makeEngine(), history, '2026-08-15', colour, ORDER);
  const board = stats.breakdown.find((r) => r.key === 'climbHard-board');
  expect(board).toEqual({ key: 'climbHard-board', name: 'Board', colour: '--climbHard', count: 1 });
});

test('Board always appears even at zero count, unlike every other breakdown row', () => {
  const stats = computeAllTimeStats(makeEngine(), {}, '2026-08-15', colour, ORDER);
  const board = stats.breakdown.find((r) => r.key === 'climbHard-board');
  expect(board?.count).toBe(0);
});

test('a session type with zero logged entries is omitted from the breakdown (except Board)', () => {
  const stats = computeAllTimeStats(makeEngine(), {}, '2026-08-15', colour, ORDER);
  expect(stats.breakdown.some((r) => r.key === 'pull')).toBe(false);
});

test('consistency percent and fraction are computed from block().total against a time-scaled expectation', () => {
  const engine = makeEngine({
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 3, wIdx: 0, over: false }),
    programStartDate: () => '2026-08-01',
  });
  // daysElapsed = Aug1 -> Aug8 inclusive = 8 days; expected = round(3 * 8 / 7) = 3
  const stats = computeAllTimeStats(engine, {}, '2026-08-08', colour, ORDER);
  expect(stats.consistencyFraction).toBe('3/3');
  expect(stats.consistencyPercent).toBe(100);
});

test('consistency is null with no programStartDate', () => {
  const stats = computeAllTimeStats(makeEngine({ programStartDate: () => undefined }), {}, '2026-08-08', colour, ORDER);
  expect(stats.consistencyPercent).toBeNull();
  expect(stats.consistencyFraction).toBeNull();
});

test('streak counts back from today, today gets a pass if nothing is logged yet', () => {
  const history: Days = {
    '2026-08-14': { t: 'pull', l: null, sub: null },
    '2026-08-13': { t: 'push', l: null, sub: null },
  };
  // today (15th) has nothing logged yet - gets a pass, doesn't break the streak
  const stats = computeAllTimeStats(makeEngine(), history, '2026-08-15', colour, ORDER);
  expect(stats.streak).toBe(2);
});

test('streak breaks on a real missed training day, but a rest day (decide()==="rest") does not break it', () => {
  const engine = makeEngine({ decide: (d) => ({ k: d === '2026-08-13' ? 'rest' : 'pull' }) });
  const history: Days = { '2026-08-14': { t: 'pull', l: null, sub: null } };
  // 13th: nothing logged, but decide() says it was a rest day -> streak continues
  // 12th: nothing logged, decide() says pull was due -> streak breaks here
  const stats = computeAllTimeStats(engine, history, '2026-08-15', colour, ORDER);
  expect(stats.streak).toBe(2); // today (pass) + the 14th; the 13th's rest pass extends it to include the 14th already counted, 12th breaks it
});

test('streak is bounded at programStartDate, never counts pre-account history', () => {
  const engine = makeEngine({ programStartDate: () => '2026-08-14' });
  const history: Days = {
    '2026-08-14': { t: 'pull', l: null, sub: null },
    '2026-08-13': { t: 'push', l: null, sub: null }, // before program start - must not count
  };
  const stats = computeAllTimeStats(engine, history, '2026-08-15', colour, ORDER);
  expect(stats.streak).toBe(1); // just the 14th; the 13th is before startDate, stops there regardless of its own logged entry
});

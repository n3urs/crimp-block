import { computePlanProgress, type PlanProgressEngine } from '../src/screens/calendar/planProgress';

test('null with no Performance phase', () => {
  const engine: PlanProgressEngine = { phases: [], block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }) };
  expect(computePlanProgress(engine, '2026-08-15')).toBeNull();
});

test('null when Performance is the first phase (from <= 1, nothing to progress toward)', () => {
  const engine: PlanProgressEngine = {
    phases: [{ n: 'Performance', from: 1, c: '--gorse', d: '' }],
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }),
  };
  expect(computePlanProgress(engine, '2026-08-15')).toBeNull();
});

test('computes percent/current/total from banked training days against blocks-before-Performance', () => {
  const engine: PlanProgressEngine = {
    phases: [
      { n: 'Base', from: 1, c: '--gorse', d: '' },
      { n: 'Performance', from: 3, c: '--go', d: '' },
    ],
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 12, wIdx: 0, over: false }),
  };
  // totalNeeded = (3-1) * 3 * 4 = 24
  const result = computePlanProgress(engine, '2026-08-15');
  expect(result).toEqual({ percent: 50, current: 12, total: 24 });
});

test('percent is capped at 100 for an account already past Performance', () => {
  const engine: PlanProgressEngine = {
    phases: [
      { n: 'Base', from: 1, c: '--gorse', d: '' },
      { n: 'Performance', from: 3, c: '--go', d: '' },
    ],
    block: () => ({ b: 5, w: 1, done: 0, per: 3, total: 999, wIdx: 0, over: false }),
  };
  expect(computePlanProgress(engine, '2026-08-15')!.percent).toBe(100);
});

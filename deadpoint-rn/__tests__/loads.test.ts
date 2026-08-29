// __tests__/loads.test.ts
import { applyOptimisticLoad, rollbackLoad } from '../src/data/useLoads';

test('a new date for an exercise is appended and kept newest-first', () => {
  const before = { 'osc-pinch': [{ date: '2026-08-20', kg: 20 }] };
  const next = applyOptimisticLoad(before, 'osc-pinch', '2026-08-27', 22.5);
  expect(next['osc-pinch']).toEqual([{ date: '2026-08-27', kg: 22.5 }, { date: '2026-08-20', kg: 20 }]);
});

test('re-logging the same date updates that entry in place, not a duplicate', () => {
  const before = { 'osc-pinch': [{ date: '2026-08-27', kg: 22.5 }, { date: '2026-08-20', kg: 20 }] };
  const next = applyOptimisticLoad(before, 'osc-pinch', '2026-08-27', 25);
  expect(next['osc-pinch']).toEqual([{ date: '2026-08-27', kg: 25 }, { date: '2026-08-20', kg: 20 }]);
});

test('a failed write rolls back to the previous array for that exercise only', () => {
  const before = { 'osc-pinch': [{ date: '2026-08-20', kg: 20 }], 'osc-pickup-half': [{ date: '2026-08-19', kg: 15 }] };
  const optimistic = applyOptimisticLoad(before, 'osc-pinch', '2026-08-27', 22.5);
  expect(rollbackLoad(optimistic, 'osc-pinch', before['osc-pinch'])).toEqual(before);
});

// __tests__/store.test.ts
import { applyOptimisticSet, rollback } from '../src/data/useStore';

test('an optimistic set writes locally before the network call', () => {
  const days = {};
  const next = applyOptimisticSet(days, '2026-08-29', 'pull', null);
  expect(next['2026-08-29']).toEqual({ t: 'pull', l: null, sub: null });
});

test('a failed write rolls back to the previous entry, not to empty', () => {
  const before = { '2026-08-29': { t: 'rest', l: null, sub: null } };
  const optimistic = applyOptimisticSet(before, '2026-08-29', 'pull', null);
  expect(rollback(optimistic, '2026-08-29', before['2026-08-29'])).toEqual(before);
});

test('climbHard carries its board/climb sub-type', () => {
  const next = applyOptimisticSet({}, '2026-08-29', 'climbHard', 'board');
  expect(next['2026-08-29'].sub).toBe('board');
});

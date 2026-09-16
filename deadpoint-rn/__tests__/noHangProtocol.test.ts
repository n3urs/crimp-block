import { advancePhase, type PhaseState } from '../src/components/timers/intervalTimerLogic';
import { BOARDS, TIMER_CONFIG, TOTAL_REPS, displayedGrip, gripForRep, parseBoardId, skipTarget } from '../src/noHang/protocol';

test('the routine is 20 reps', () => {
  expect(TOTAL_REPS).toBe(20);
  expect(TIMER_CONFIG.sets).toBe(20);
});

test.each([
  [1, 'Half crimp'], [6, 'Half crimp'],
  [7, 'Three-finger drag'], [12, 'Three-finger drag'],
  [13, 'Front two-finger drag'], [14, 'Front two-finger drag'],
  [15, 'Middle two-finger drag'], [16, 'Middle two-finger drag'],
  [17, 'Front two-finger half crimp'], [18, 'Front two-finger half crimp'],
  [19, 'Middle two-finger half crimp'], [20, 'Middle two-finger half crimp'],
])('rep %i is %s', (rep, name) => {
  expect(gripForRep(rep).name).toBe(name);
});

test('get ready previews the first grip', () => {
  expect(displayedGrip('ready', 1)).toMatchObject({ rep: 1, isNext: true, isChange: true, grip: { name: 'Half crimp' } });
});

test('get ready after skipping previews the grip it skipped to', () => {
  expect(displayedGrip('ready', 13)).toMatchObject({ rep: 13, isNext: true, isChange: true, grip: { name: 'Front two-finger drag' } });
});

test.each([
  [1, 1, 7], [3, 1, 7], [9, 1, 13], [13, 1, 15], [18, 1, 19], [19, 1, null], [20, 1, null],
  [1, -1, null], [6, -1, null], [7, -1, 1], [9, -1, 1], [13, -1, 7], [20, -1, 17],
] as const)('skipping from rep %i by %i lands on %s', (rep, direction, target) => {
  expect(skipTarget(rep, direction)).toBe(target);
});

test('a load shows the current grip', () => {
  expect(displayedGrip('on', 9)).toMatchObject({ rep: 9, isNext: false, isChange: false, grip: { name: 'Three-finger drag' } });
});

test('the rest after rep 6 previews the grip change', () => {
  expect(displayedGrip('setrest', 6)).toMatchObject({ rep: 7, isNext: true, isChange: true, grip: { name: 'Three-finger drag' } });
});

test('a rest inside a block previews the same grip without flagging a change', () => {
  expect(displayedGrip('setrest', 2)).toMatchObject({ rep: 3, isNext: true, isChange: false });
});

test('the timer config runs exactly 20 loads and finishes straight after the last', () => {
  let state: PhaseState = { phase: 'ready', set: 1, rep: 1 };
  const phases: string[] = [];
  for (let i = 0; i < 100; i++) {
    const next = advancePhase(state, TIMER_CONFIG.sets, TIMER_CONFIG.interval.reps);
    if (next === 'finish') break;
    phases.push(next.phase);
    state = next;
  }
  expect(phases.filter((p) => p === 'on')).toHaveLength(20);
  expect(phases.filter((p) => p === 'setrest')).toHaveLength(19);
  expect(phases[phases.length - 1]).toBe('off');
  expect(TIMER_CONFIG.interval.off).toBe(0);
});

test.each(['bm1000', 'bm2000'] as const)('%s lights exactly one mirrored pair, all holds on the board', (id) => {
  const used = BOARDS[id].holds.filter((h) => h.used);
  expect(used).toHaveLength(2);
  expect(used[0].x + used[0].w / 2 + used[1].x + used[1].w / 2).toBeCloseTo(1, 5);
  for (const h of BOARDS[id].holds) {
    expect(h.x).toBeGreaterThanOrEqual(0);
    expect(h.x + h.w).toBeLessThanOrEqual(1);
    expect(h.y + h.h).toBeLessThanOrEqual(1);
  }
});

test('an unknown saved board falls back to the 1000', () => {
  expect(parseBoardId('bm2000')).toBe('bm2000');
  expect(parseBoardId(null)).toBe('bm1000');
  expect(parseBoardId('junk')).toBe('bm1000');
});

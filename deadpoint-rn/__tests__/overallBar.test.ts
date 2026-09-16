import { computeCycleBar } from '../src/screens/plan/overallBar';
import type { Phase } from '../src/engine/types';

// Oscar's real shape: Base(1), Max Strength(2), Power(5), Performance(6, loopBlock 2)
// -> a 4-block repeating cycle (Max Strength x3 + Power x1).
const REAL_PHASES: Phase[] = [
  { n: 'Base', from: 1, c: '--tidepool', d: '' },
  { n: 'Max Strength', from: 2, c: '--gorse', d: '' },
  { n: 'Power', from: 5, c: '--heather', d: '' },
  { n: 'Performance', from: 6, c: '--slate', d: '', loopBlock: 2 },
];

test('returns null when the program defines no loopBlock (nothing repeats)', () => {
  const noLoop: Phase[] = [{ n: 'Max Strength', from: 1, c: '--gorse', d: '' }];
  expect(computeCycleBar(noLoop, 10)).toBeNull();
});

test('still in Base: cycle 1, shown prospectively, every segment empty', () => {
  const bar = computeCycleBar(REAL_PHASES, 2); // wIdx 2 -> still block 1 (Base)
  expect(bar!.cycleNumber).toBe(1);
  expect(bar!.segments).toHaveLength(4); // Max Strength x3 + Power x1
  expect(bar!.segments.every((s) => s.frac === 0)).toBe(true);
  expect(bar!.segments.map((s) => s.varName)).toEqual(['--gorse', '--gorse', '--gorse', '--heather']);
});

test('first lap, mid Max Strength: matching segment half-filled, later ones empty', () => {
  const bar = computeCycleBar(REAL_PHASES, 6); // wIdx4-7 = block2 (Max Strength), 6 is 2 into it
  expect(bar!.cycleNumber).toBe(1);
  expect(bar!.segments[0].frac).toBe(0.5);
  expect(bar!.segments[1].frac).toBe(0);
});

test('first lap, mid deload week of Power: first 3 segments full, Power segment partway', () => {
  const bar = computeCycleBar(REAL_PHASES, 19); // 19 weeks banked -> into block5's (Power) 4th/deload week
  expect(bar!.cycleNumber).toBe(1);
  expect(bar!.segments.slice(0, 3).every((s) => s.frac === 1)).toBe(true);
  expect(bar!.segments[3].frac).toBe(0.75);
});

test('wraps into a second lap the moment Performance would have started', () => {
  const bar = computeCycleBar(REAL_PHASES, 20); // wIdx20 = wrapped back to the start of block2
  expect(bar!.cycleNumber).toBe(2);
  expect(bar!.segments.every((s) => s.frac === 0)).toBe(true);
});

test('one week into the second lap: only the first segment has moved', () => {
  const bar = computeCycleBar(REAL_PHASES, 21);
  expect(bar!.cycleNumber).toBe(2);
  expect(bar!.segments[0].frac).toBe(0.25);
  expect(bar!.segments.slice(1).every((s) => s.frac === 0)).toBe(true);
});

test('a program with no Base (loopBlock 1) starts lap 1 immediately, no prospective gap', () => {
  const noBase: Phase[] = [
    { n: 'Max Strength', from: 1, c: '--gorse', d: '' },
    { n: 'Power', from: 5, c: '--heather', d: '' },
    { n: 'Performance', from: 6, c: '--slate', d: '', loopBlock: 1 },
  ];
  const bar = computeCycleBar(noBase, 0);
  expect(bar!.cycleNumber).toBe(1);
  expect(bar!.segments[0].frac).toBe(0);
});

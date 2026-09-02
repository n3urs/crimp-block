import { computeOverallBar } from '../src/screens/plan/overallBar';
import type { Phase } from '../src/engine/types';

const REAL_PHASES: Phase[] = [
  { n: 'Base', from: 1, c: '--tidepool', d: '' },
  { n: 'Max Strength', from: 2, c: '--gorse', d: '' },
  { n: 'Power', from: 5, c: '--heather', d: '' },
  { n: 'Performance', from: 6, c: '--slate', d: '' },
];

test('block 1 is fully filled once wIdx reaches 4, half filled at wIdx 2', () => {
  const segs = computeOverallBar(REAL_PHASES, 2);
  expect(segs[0].frac).toBe(0.5);
  expect(segs[1].frac).toBe(0);
});

test('fraction clamps to [0,1] past the segment and before it', () => {
  const segs = computeOverallBar(REAL_PHASES, 100);
  expect(segs[0].frac).toBe(1);
  expect(segs[5].frac).toBe(1);
  const early = computeOverallBar(REAL_PHASES, 0);
  expect(early.every((s) => s.frac === 0)).toBe(true);
});

test('picks the LAST phase (array order) whose from <= b, matching Swift phases.last(where:)', () => {
  const segs = computeOverallBar(REAL_PHASES, 0);
  expect(segs[0].varName).toBe('--tidepool'); // b=1 -> Base
  expect(segs[1].varName).toBe('--gorse'); // b=2 -> Max Strength (Base also matches but is earlier)
  expect(segs[2].varName).toBe('--gorse'); // b=3 -> still Max Strength
});

test('falls back to --gorse when no phase has from <= b, but b is within phases.length', () => {
  const shifted: Phase[] = [{ n: 'Later', from: 3, c: '--slate', d: '' }];
  const segs = computeOverallBar(shifted, 0);
  expect(segs[0].varName).toBe('--gorse'); // b=1, no phase.from<=1, but 1<=phases.length(1)
});

test('blocks beyond phases.length use null (Colours.s3), even when a phase.from would otherwise cover them', () => {
  // Real 4-phase program: Power(from 5)/Performance(from 6) DO cover
  // blocks 5/6 by `from`, but phases.length is only 4, so Swift's
  // `b <= phases.count` check fails first and forces s3 regardless.
  const segs = computeOverallBar(REAL_PHASES, 0);
  expect(segs[4].varName).toBeNull(); // b=5
  expect(segs[5].varName).toBeNull(); // b=6
});

import { totalSetsFor } from '../src/components/daily-card/SetsTally';

test('detects "N ×" as a set count', () => {
  expect(totalSetsFor({ prescription: '3 × 8', interval: null })).toBe(3);
});

test('detects bare "N sets" and "N supersets"', () => {
  expect(totalSetsFor({ prescription: '3 sets', interval: null })).toBe(3);
  expect(totalSetsFor({ prescription: '3 supersets', interval: null })).toBe(3);
});

test('does NOT treat "15 min" as 15 sets', () => {
  // A live bug this exact guard was added to fix: a 15-minute warm-up
  // rendered a 15-pip tally.
  expect(totalSetsFor({ prescription: '15 min', interval: null })).toBeNull();
});

test('does NOT tally a range like "4–5 sets"', () => {
  expect(totalSetsFor({ prescription: '4–5 sets', interval: null })).toBeNull();
});

test('never tallies an interval exercise', () => {
  expect(totalSetsFor({ prescription: '3 × 8', interval: { on: 7, off: 3, reps: 6 } })).toBeNull();
});

test('does not tally a single set', () => {
  expect(totalSetsFor({ prescription: '1 × 8', interval: null })).toBeNull();
});

import { clarifySets } from '../src/components/daily-card/clarifySets';

test('labels an unambiguous leading set count', () => {
  expect(clarifySets('3 × 8')).toBe('3 sets × 8');
});

test('leaves a duration-first prescription alone', () => {
  // "10s × 5" is a hold duration first — labelling it "10 sets" would be wrong.
  expect(clarifySets('10s × 5')).toBe('10s × 5');
});

test('leaves a cycle description alone', () => {
  expect(clarifySets('5 min on / 5 min off × 3')).toBe('5 min on / 5 min off × 3');
});

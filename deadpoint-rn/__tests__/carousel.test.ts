import { nextIndex } from '../src/components/daily-card/useSwipeCarousel';

test('stepping forward from the last session wraps to the first', () => {
  // rest (6) -> maxFingers (0)
  expect(nextIndex(6, -1, 7)).toBe(0);
});

test('stepping back from the first session wraps to the last', () => {
  // maxFingers (0) -> rest (6). Swift's % returns -1 here, so the raw
  // index must be pushed positive before the modulo.
  expect(nextIndex(0, 1, 7)).toBe(6);
});

test('ordinary steps are unaffected', () => {
  expect(nextIndex(2, -1, 7)).toBe(3);
  expect(nextIndex(2, 1, 7)).toBe(1);
});

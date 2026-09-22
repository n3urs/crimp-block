/** The line under LOGGED (src/data/quotes.ts). The one rule that matters
    is no repeat back to back: logging two sessions in a row and being
    handed the same quote twice reads as broken, not as a coincidence. */
import { QUOTES, pickQuoteIndex } from '../src/data/quotes';

test('every quote has text and a named person', () => {
  expect(QUOTES.length).toBeGreaterThan(1);
  for (const q of QUOTES) {
    expect(q.text.trim().length).toBeGreaterThan(0);
    expect(q.who.trim().length).toBeGreaterThan(0);
  }
});

test('quotes stay short enough for a 300pt card', () => {
  for (const q of QUOTES) expect(q.text.length).toBeLessThanOrEqual(130);
});

test('never returns the index it was just given, anywhere in the range', () => {
  for (let previous = 0; previous < QUOTES.length; previous++) {
    // Sweep the whole random range, including both ends.
    for (let r = 0; r < 100; r++) {
      const picked = pickQuoteIndex(previous, () => r / 100);
      expect(picked).not.toBe(previous);
      expect(picked).toBeGreaterThanOrEqual(0);
      expect(picked).toBeLessThan(QUOTES.length);
    }
  }
});

test('random() returning exactly 1 still lands in range', () => {
  // Math.random() never returns 1, but a caller-supplied stub might, and
  // an out-of-range index would render an undefined quote.
  expect(pickQuoteIndex(0, () => 1)).toBeLessThan(QUOTES.length);
});

test('reaches every other quote, so none is unreachable', () => {
  const previous = 3;
  const seen = new Set<number>();
  for (let r = 0; r < 1000; r++) seen.add(pickQuoteIndex(previous, () => r / 1000));
  expect(seen.size).toBe(QUOTES.length - 1);
  expect(seen.has(previous)).toBe(false);
});

test('a first pick (no previous) is valid', () => {
  expect(pickQuoteIndex(-1, () => 0)).toBeGreaterThanOrEqual(0);
  expect(pickQuoteIndex(-1, () => 0.999)).toBeLessThan(QUOTES.length);
});

/** Press-and-hold stepping for the two weight editors (see
    src/components/stepper/holdRepeat.ts). The manual step dropped to
    1.25 kg so half a plate pair is reachable, which is only usable
    because holding the button runs — 20 to 40 kg is sixteen taps
    otherwise. These pin the two halves of that bargain. */
import { HOLD_START_MS, WEIGHT_STEP_KG, repeatIntervalMs } from '../src/components/stepper/holdRepeat';

test('the manual step is half a 2.5 kg plate pair', () => {
  expect(WEIGHT_STEP_KG).toBe(1.25);
});

test('a normal tap never repeats — the hold threshold is well past one', () => {
  // Typical tap is ~100ms down; 400 leaves room for a deliberate press.
  expect(HOLD_START_MS).toBeGreaterThanOrEqual(300);
});

test('speeds up in stages while held, and never runs backwards', () => {
  const first = repeatIntervalMs(HOLD_START_MS);
  const middle = repeatIntervalMs(HOLD_START_MS + 1200);
  const fastest = repeatIntervalMs(HOLD_START_MS + 3000);

  expect(first).toBeGreaterThan(middle);
  expect(middle).toBeGreaterThan(fastest);
  // Monotonic across the whole range, so a longer hold is never slower.
  let previous = Infinity;
  for (let held = 0; held <= 6000; held += 50) {
    const interval = repeatIntervalMs(held);
    expect(interval).toBeLessThanOrEqual(previous);
    previous = interval;
  }
});

test('flat out, 20 -> 40 kg takes about a second rather than sixteen taps', () => {
  const stepsNeeded = (40 - 20) / WEIGHT_STEP_KG;
  expect(stepsNeeded).toBe(16);
  // Time to cover them, holding from cold: the threshold, then each
  // step's own gap at whatever speed the hold has reached by then.
  let elapsed = HOLD_START_MS;
  for (let i = 0; i < stepsNeeded; i++) elapsed += repeatIntervalMs(elapsed);
  expect(elapsed).toBeLessThan(3000);
});

test('the fastest rate stays readable rather than a blur', () => {
  // 40ms is 25 steps a second. Faster than this and the digits are
  // unreadable, so overshooting becomes likelier than tapping.
  expect(repeatIntervalMs(60_000)).toBeGreaterThanOrEqual(40);
});

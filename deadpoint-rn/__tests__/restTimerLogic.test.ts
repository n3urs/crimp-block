import { fraction, formatCountdown } from '../src/components/timers/restTimerLogic';

test('fraction is remaining over total', () => {
  expect(fraction(30, 120)).toBe(0.25);
});

test('fraction is 0 when total is 0 (never divides by zero)', () => {
  expect(fraction(0, 0)).toBe(0);
});

test('formatCountdown pads seconds under 10', () => {
  expect(formatCountdown(65)).toBe('1:05');
});

test('formatCountdown handles a whole number of minutes', () => {
  expect(formatCountdown(120)).toBe('2:00');
});

test('formatCountdown handles under a minute', () => {
  expect(formatCountdown(9)).toBe('0:09');
});

test('formatCountdown rounds to the nearest second', () => {
  expect(formatCountdown(59.6)).toBe('1:00');
});

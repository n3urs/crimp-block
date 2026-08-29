import { formatHeaderDate } from '../src/components/daily-card/CardHeader';

test('formats a date as "EEE, d MMM" en-GB, comma included', () => {
  expect(formatHeaderDate('2026-08-29')).toBe('Sat, 29 Aug');
});

test('single-digit days are not zero-padded', () => {
  expect(formatHeaderDate('2026-01-05')).toBe('Mon, 5 Jan');
});

test('does not shift a day at a year boundary', () => {
  expect(formatHeaderDate('2026-12-31')).toBe('Thu, 31 Dec');
});

import { daysInMonthGrid, startOfMonth, shiftMonth, monthTitle } from '../src/screens/calendar/calendarMath';

test('August 2026 has 5 leading blanks (1st is a Saturday) and 31 real days', () => {
  const days = daysInMonthGrid('2026-08-01');
  expect(days.slice(0, 5)).toEqual([null, null, null, null, null]);
  expect(days[5]).toBe('2026-08-01');
  expect(days.filter((d) => d != null)).toHaveLength(31);
  expect(days.length % 7).toBe(0);
});

test('February 2026 has 6 leading blanks (1st is a Sunday) and 28 real days', () => {
  const days = daysInMonthGrid('2026-02-01');
  expect(days.slice(0, 6)).toEqual([null, null, null, null, null, null]);
  expect(days[6]).toBe('2026-02-01');
  expect(days.filter((d) => d != null)).toHaveLength(28);
});

test('December 2026 has 1 leading blank (1st is a Tuesday) and 31 real days', () => {
  const days = daysInMonthGrid('2026-12-01');
  expect(days[0]).toBeNull();
  expect(days[1]).toBe('2026-12-01');
  expect(days.filter((d) => d != null)).toHaveLength(31);
});

test('daysInMonthGrid pads the trailing end to a multiple of 7', () => {
  const days = daysInMonthGrid('2026-08-01');
  // 5 leading blanks + 31 days = 36; next multiple of 7 is 42, so 6 trailing blanks
  expect(days).toHaveLength(42);
  expect(days.slice(36)).toEqual([null, null, null, null, null, null]);
});

test('startOfMonth normalizes any date in the month to its 1st', () => {
  expect(startOfMonth('2026-08-17')).toBe('2026-08-01');
});

test('shiftMonth moves forward within a year', () => {
  expect(shiftMonth('2026-08-01', 1)).toBe('2026-09-01');
});

test('shiftMonth rolls over into the next year', () => {
  expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
});

test('shiftMonth moves backward across a year boundary', () => {
  expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
});

test('monthTitle formats and uppercases, matching Swift\'s "MMMM yyyy" en_GB', () => {
  expect(monthTitle('2026-08-01')).toBe('AUGUST 2026');
});

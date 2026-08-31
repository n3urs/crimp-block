/** Direct port of CalendarView.swift's "MARK: - Month math" section. Uses
    plain local-time Date arithmetic at noon (same convention as
    engine-core.js's own addDays/iso — noon avoids any date shifting from
    a DST transition landing at midnight), not Swift's Calendar object.
    Swift's Calendar.firstWeekday = 2 (Monday) is the one piece of that
    object's behaviour this still has to replicate exactly — see
    daysInMonthGrid's own comment for the leading-blanks formula. */

/** Mirrors engine-core.js's own iso(d) formatting exactly (local getters,
    zero-padded) — not exported from that file's own public facade, so
    duplicated here rather than reached into engine-core.js's internals. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseMonth(monthISO: string): { y: number; m: number } {
  const [y, m] = monthISO.split('-').map(Number);
  return { y, m };
}

export function startOfMonth(dateISO: string): string {
  const { y, m } = parseMonth(dateISO);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function shiftMonth(monthISO: string, delta: number): string {
  const { y, m } = parseMonth(monthISO);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function monthTitle(monthISO: string): string {
  const { y, m } = parseMonth(monthISO);
  const date = new Date(y, m - 1, 1, 12);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date).toUpperCase();
}

/** Mirrors CalendarView.swift's daysInVisibleMonth() exactly — a flat,
    7-per-row array (null = a leading/trailing blank cell), grouped into
    weeks by the caller (MonthGrid.tsx), not here.

    Leading-blanks formula: JS's Date.getDay() is already 0=Sun..6=Sat,
    the same numbering as Swift's own `weekday - 1` (Swift's Calendar
    weekday is 1=Sun..7=Sat). Swift's
    `(firstWeekday - cal.firstWeekday + 7) % 7` with cal.firstWeekday = 2
    (Monday) becomes, substituting firstWeekday = jsWeekday + 1:
    `(jsWeekday + 1 - 2 + 7) % 7` = `(jsWeekday - 1 + 7) % 7`. Verified
    against real ground truth (macOS `cal`, not re-derived from this same
    Date object) in this task's own test file: Aug 2026 (Sat 1st) → 5,
    Feb 2026 (Sun 1st) → 6, Dec 2026 (Tue 1st) → 1. */
export function daysInMonthGrid(monthISO: string): (string | null)[] {
  const { y, m } = parseMonth(monthISO);
  const firstOfMonth = new Date(y, m - 1, 1, 12);
  const daysInMonth = new Date(y, m, 0, 12).getDate(); // day 0 of next month = last day of this one
  const leadingBlanks = (firstOfMonth.getDay() - 1 + 7) % 7;

  const days: (string | null)[] = new Array(leadingBlanks).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(iso(new Date(y, m - 1, d, 12)));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

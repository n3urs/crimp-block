/** Direct port of CalendarView.swift's private static computeAllTimeStats.
    Every number here is genuinely all-time, none of it scoped to whatever
    month the calendar is currently showing - see the Swift source's own
    doc comment for the direct feedback that shaped this ("i want all the
    stats to be all time stats... so when u go to other months it shows
    how many climbs and stuff ever"). */
import type { BlockInfo } from '../../engine/types';
import type { Days } from '../../data/useStore';

export interface StatsBreakdownRow {
  key: string;
  name: string;
  colour: string;
  count: number;
}

export interface AllTimeStats {
  loggedCount: number;
  consistencyPercent: number | null;
  consistencyFraction: string | null;
  streak: number;
  breakdown: StatsBreakdownRow[];
}

export interface AllTimeStatsEngine {
  addDays(date: string, n: number): string;
  block(date: string): BlockInfo;
  decide(date: string): { k: string };
  programStartDate(): string | undefined;
  sessionColourVarName(key: string): string;
  sessionInfo(key: string): { n?: string } | undefined;
}

/** SESSION_ORDER is the app's fixed session order (swipe order, week
    dots) - imported by the caller from src/engine/index.ts and passed in
    here, so this file has no dependency on the engine facade's module
    shape beyond the narrow AllTimeStatsEngine interface above.

    `monthPrefix` ('2026-09') scopes every number to that one month, for
    the panel's MONTH / ALL TIME switch. All-time is still the default and
    still what the switch opens on - the original all-time-only behaviour
    came from direct feedback ("i want all the stats to be all time
    stats... so when u go to other months it shows how many climbs and
    stuff ever") and that reading of the DEFAULT has not changed; the
    switch only adds the other answer for anyone who wants it. */
export function computeAllTimeStats(
  engine: AllTimeStatsEngine,
  history: Days,
  today: string,
  resolveColour: (varName: string) => string,
  sessionOrder: readonly string[],
  monthPrefix?: string
): AllTimeStats {
  const inScope = (date: string) => date <= today && (monthPrefix == null || date.startsWith(monthPrefix));
  let loggedCount = 0;
  const counts: Record<string, number> = {};
  // Board gets its own count rather than joining `counts`' single-key-
  // per-type shape - climbHard becomes one "Board" row below, direct
  // feedback: it should mean board sessions specifically. A climbHard day
  // not tagged as board still counts toward loggedCount and still colours
  // its day on the grid, it just isn't a board session.
  let boardCount = 0;
  for (const [date, entry] of Object.entries(history)) {
    if (!inScope(date)) continue;
    counts[entry.t] = (counts[entry.t] ?? 0) + 1;
    if (entry.t !== 'rest') loggedCount += 1;
    if (entry.t === 'climbHard' && entry.sub === 'board') boardCount += 1;
  }

  const breakdown: StatsBreakdownRow[] = [];
  for (const key of sessionOrder) {
    if (key === 'rest') continue;
    if (key === 'climbHard') {
      breakdown.push({ key: 'climbHard-board', name: 'Board', colour: resolveColour(engine.sessionColourVarName(key)), count: boardCount });
      continue;
    }
    const n = counts[key];
    if (!n) continue;
    breakdown.push({ key, name: engine.sessionInfo(key)?.n ?? key, colour: resolveColour(engine.sessionColourVarName(key)), count: n });
  }

  // Consistency: Actual = block(today).total (the exact same training-
  // days-banked count block() itself already uses for phase/deload
  // progression - can never drift from what the rest of the app
  // considers "trained"). Expected = the program's per-week target
  // scaled by calendar days elapsed since programStartDate (NOT the
  // earliest logged entry - block().total is already counted from the
  // real start date, so the denominator has to match that same window).
  let consistencyPercent: number | null = null;
  let consistencyFraction: string | null = null;
  const startDate = engine.programStartDate();
  const b = engine.block(today);
  if (b.per > 0 && startDate) {
    // Month scope can't use block().total (all-time by definition), so it
    // counts the month's own logged sessions against what the program asks
    // for over the part of that month which has actually happened. A month
    // entirely in the future has no elapsed days and no expectation.
    const window = monthPrefix == null
      ? { from: startDate, to: today }
      : { from: laterOf(`${monthPrefix}-01`, startDate), to: earlierOf(lastDayOfMonth(monthPrefix), today) };
    const daysElapsed = daysBetween(window.from, window.to) + 1;
    if (daysElapsed > 0) {
      const expected = Math.max(1, Math.round((b.per * daysElapsed) / 7));
      const actual = monthPrefix == null ? b.total : loggedCount;
      consistencyPercent = Math.round((actual / expected) * 100);
      consistencyFraction = `${actual}/${expected}`;
    }
  }

  // Streak: consecutive days with something logged, walking back from
  // today - rest counts (logging rest still shows up). Today gets a pass
  // regardless of what's recommended (the day isn't over yet). Every
  // earlier day follows the real rule: a missing day only breaks the
  // streak if something was actually due (decide(date).k !== 'rest').
  // Bounded at programStartDate so this can't wander into pre-account
  // history and count a run of correctly-skipped-but-not-really-rest
  // days as an unbroken streak.
  let streak = 0;
  if (monthPrefix == null) {
    let d = today;
    if (!history[d]) d = engine.addDays(d, -1);
    for (let i = 0; i < 3650; i++) {
      if (startDate && d < startDate) break;
      if (history[d]) {
        streak += 1;
      } else if (engine.decide(d).k === 'rest') {
        streak += 1;
      } else {
        break;
      }
      d = engine.addDays(d, -1);
    }
  } else {
    // In month scope the tile reads BEST STREAK instead: a *current*
    // streak is a fact about today, and reporting today's run while
    // looking at last March would be nonsense. Same day-by-day rule as
    // above (logged, or correctly skipped because rest was due), walked
    // forwards over the elapsed part of the month, keeping the longest run.
    let run = 0;
    const last = earlierOf(lastDayOfMonth(monthPrefix), today);
    for (let d = `${monthPrefix}-01`; d <= last; d = engine.addDays(d, 1)) {
      if (startDate && d < startDate) continue;
      if (history[d] || engine.decide(d).k === 'rest') {
        run += 1;
        if (run > streak) streak = run;
      } else {
        run = 0;
      }
    }
  }

  return { loggedCount, consistencyPercent, consistencyFraction, streak, breakdown };
}

/** Whole-day difference between two ISO date strings, via UTC epoch ms —
    safe here specifically because both inputs are already pure Y-M-D
    with no time-of-day, so there's no local-timezone/DST ambiguity to
    introduce (unlike calendarMath.ts's date construction, which builds
    real calendar dates from parts and needs local noon for that reason). */
function daysBetween(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

function laterOf(a: string, b: string): string { return a > b ? a : b; }
function earlierOf(a: string, b: string): string { return a < b ? a : b; }

/** '2026-09' -> '2026-09-30'. Day 0 of the NEXT month is the last day of
    this one, which avoids a leap-year table. Local-time Date parts, same
    reasoning as calendarMath.ts. */
function lastDayOfMonth(monthPrefix: string): string {
  const [y, m] = monthPrefix.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    shape beyond the narrow AllTimeStatsEngine interface above. */
export function computeAllTimeStats(
  engine: AllTimeStatsEngine,
  history: Days,
  today: string,
  resolveColour: (varName: string) => string,
  sessionOrder: readonly string[]
): AllTimeStats {
  let loggedCount = 0;
  const counts: Record<string, number> = {};
  // Board gets its own count rather than joining `counts`' single-key-
  // per-type shape - climbHard becomes one "Board" row below, direct
  // feedback: it should mean board sessions specifically. A climbHard day
  // not tagged as board still counts toward loggedCount and still colours
  // its day on the grid, it just isn't a board session.
  let boardCount = 0;
  for (const [date, entry] of Object.entries(history)) {
    if (date > today) continue;
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
    const daysElapsed = daysBetween(startDate, today) + 1;
    const expected = Math.max(1, Math.round((b.per * daysElapsed) / 7));
    consistencyPercent = Math.round((b.total / expected) * 100);
    consistencyFraction = `${b.total}/${expected}`;
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

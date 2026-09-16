/** Direct port of CalendarView.swift's TrendForecast struct — a rate-
    based projection ("at the rate you've actually been training, when
    will the next deload/phase change really land"), distinct from the
    engine's own forecast(days) ("what would happen if every recommended
    day gets trained" - a different question, used elsewhere in the app,
    not reused here). See the Swift source's own doc comment on the
    struct for the full framing. */
import type { BlockInfo } from '../../engine/types';
import type { Days } from '../../data/useStore';

export interface Deload {
  start: string;
  end: string;
}

export interface TrendForecastResult {
  weeklyRate: number;
  windowDays: number;
  deload: Deload | null;
}

export interface TrendForecastEngine {
  addDays(date: string, n: number): string;
  block(date: string): BlockInfo;
  isTraining(type: string): boolean;
}

/** Training days per calendar day over the last `windowDays` (or however
    much real history exists, if less) - recency-weighted on purpose, see
    Swift's own extensive doc comment on weeklyRate(bridge:history:today:
    windowDays:) for why: a rolling window reflects how someone is
    training NOW, and is bounded by the earliest real history entry so a
    brand-new account's pre-existing silence isn't counted as a training
    gap. */
function weeklyRate(
  engine: TrendForecastEngine,
  history: Days,
  today: string,
  windowDays: number
): { rate: number; actualDays: number } {
  const keys = Object.keys(history);
  const earliest = keys.length > 0 ? keys.reduce((a, b) => (a < b ? a : b)) : today;
  const requestedStart = engine.addDays(today, -windowDays);
  const start = requestedStart > earliest ? requestedStart : earliest; // ISO strings sort chronologically

  let trainingCount = 0;
  let calendarCount = 0;
  let d = start;
  while (d <= today) {
    calendarCount += 1;
    const entry = history[d];
    if (entry && engine.isTraining(entry.t)) trainingCount += 1;
    d = engine.addDays(d, 1);
  }

  if (calendarCount === 0) return { rate: 4, actualDays: 0 };
  // Floored, not left at zero — a genuine 0/window would otherwise divide
  // the projection by zero and produce a nonsense date, not just a
  // distant one.
  const daily = Math.max(trainingCount / calendarCount, 1 / 30);
  return { rate: daily * 7, actualDays: calendarCount };
}

/** Whether a given future date (as `daysAhead` from today) falls inside a
    projected deload week, at the CURRENT trained-pace. Unlike
    `computeTrendForecast`'s own `deload` field (only the single NEXT
    upcoming window, for the one-line legend caption), this answers the
    question for ANY date — however many months ahead the calendar is
    scrolled — so every future deload shows, not just the first. Real bug
    reported live: only ever seeing one predicted deload on the calendar,
    every later month blank.

    Deliberately independent of phase/block wrapping (engine-core.js's
    `wrapBlock`): a deload is week 4 of every 4-week block, which recurs
    on its own 4-week rhythm forever regardless of which phase a block
    belongs to — the same reason `isDeload()` never needed the block
    number capped in the first place. Continuous training-week math
    mirrors `projectedPhaseName` (CalendarScreen.tsx) so the two stay
    consistent, but works in WEEKS directly rather than blocks — no need
    to route through phaseIndexAt() at all. */
export function isProjectedDeload(
  engine: TrendForecastEngine,
  today: string,
  weeklyRate: number,
  daysAhead: number
): boolean {
  const b = engine.block(today);
  if (weeklyRate <= 0) return b.w === 4;
  const calendarDaysPerTrainingDay = 7 / weeklyRate;
  const trainingDaysAhead = daysAhead / calendarDaysPerTrainingDay;
  // Block-local, deliberately not b.total/b.wIdx (same reasoning as the
  // deload calc below this function, and the actual bug fixed earlier
  // today: b.total is cumulative since START_DATE and never resets per
  // block, so using it here would silently break every deload after the
  // first, exactly like before). `w` is already `(realWIdx % 4) + 1`, so
  // `w - 1` IS `realWIdx % 4` — no need for the real unbounded wIdx at
  // all to get the right 4-week-cycle phase.
  const weeksAheadContinuous = trainingDaysAhead / b.per;
  const currentWeekProgress = b.done / b.per;
  const projectedWeekSlot = Math.floor((b.w - 1) + currentWeekProgress + weeksAheadContinuous) % 4;
  return projectedWeekSlot === 3;
}

export function computeTrendForecast(
  engine: TrendForecastEngine,
  history: Days,
  today: string
): TrendForecastResult {
  const { rate: weekly, actualDays: windowDays } = weeklyRate(engine, history, today, 56);
  const calendarDaysPerTrainingDay = 7 / weekly;
  const b = engine.block(today);

  let deload: Deload | null;
  if (b.w === 4) {
    // Mid-deload right now: the days LEFT in THIS week, not a full window
    // three weeks out — block() freezes at today's real progress for any
    // future date, so reusing isDeload() past today would ring forever.
    const remainingTrainingDays = Math.max(0, b.per - b.done);
    const endOffset = Math.max(1, Math.round(remainingTrainingDays * calendarDaysPerTrainingDay));
    deload = { start: today, end: engine.addDays(today, endOffset) };
  } else {
    // Block-local, not b.total: total is cumulative training days since
    // START_DATE (never resets per block, despite its doc comment on
    // BlockInfo), so `b.per*3 - b.total` only ever came out right for
    // block 1 — every later block's total already exceeds per*3, clamping
    // this to 0 and silently hiding every deload after the first. w/done
    // are already block-local (engine-core.js's block()), so (4-b.w)
    // full weeks plus the sessions already banked this week (b.done) gets
    // the same number without needing b.total at all.
    const trainingDaysToDeload = Math.max(0, (4 - b.w) * b.per - b.done);
    const deloadStartOffset = Math.round(trainingDaysToDeload * calendarDaysPerTrainingDay);
    const deloadLengthOffset = Math.max(1, Math.round(b.per * calendarDaysPerTrainingDay));
    const deloadStart = engine.addDays(today, deloadStartOffset);
    const deloadEnd = engine.addDays(deloadStart, deloadLengthOffset);
    // Only worth showing once genuinely ahead of today, not one that (per
    // this projection) should already be under way.
    deload = deloadStartOffset > 0 ? { start: deloadStart, end: deloadEnd } : null;
  }

  return { weeklyRate: weekly, windowDays, deload };
}

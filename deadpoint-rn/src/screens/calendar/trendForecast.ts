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
    const trainingDaysToDeload = Math.max(0, b.per * 3 - b.total);
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

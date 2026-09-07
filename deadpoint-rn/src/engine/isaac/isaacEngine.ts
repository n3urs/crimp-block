/** Isaac's own engine — deliberately NOT a wrapper around engine-core.js.
    Three real reasons it had to be separate rather than reusing the shared
    climbing engine every paying customer depends on:

    1. Different fatigue model. engine-core.js tracks two climbing-specific
       load pools (fingers vs. pulling) and biases recommendations toward
       "your weakness" — Isaac's program has no such concept; it's a fixed
       6-day rotation (see isaacProgram.ts's ISAAC_SESSION_ORDER) with its
       own autoregulation rules (RPE deviation, Push-day spacing) that have
       nothing to do with climbing fatigue.
    2. Different phase shape. engine-core.js's block()/phase system is
       block-based (4-week blocks, deload every 4th week, repeating
       indefinitely — a climbing training cycle never "ends"). Isaac's is a
       linear 10-week arc, numbered by calendar week from his own start
       date, ending in a one-off scripted Test Day. Bending block() to also
       support a linear finite arc risks the shared engine for one person's
       program.
    3. Different autoregulation entirely. RPE-based live weight adjustment
       and hours-since-last-Push-day spacing don't exist anywhere in
       engine-core.js and don't belong there — they're specific to this one
       program.

    What IS reused: the RenderedExercise/Decision/BlockInfo *shapes* (so
    DailyCard/ExerciseRow/CardHeader render Isaac's card with zero changes),
    the same exercise_loads-backed weight tracking every other tracked
    exercise in this app uses, and the same StepScaffold-free "just render
    what resolveExercises gives you" contract card.tsx already has. */
import type { BlockInfo, Decision, RenderedExercise } from '../types';
import {
  ISAAC_SESSION_ORDER, ISAAC_SESSIONS, ISAAC_TEST_DAY_EXERCISES, ISAAC_BASELINE,
  isPushSession, phaseForWeek, type IsaacSessionKey, type IsaacExercise,
} from './isaacProgram';

export const ISAAC_EMAIL = 'phillipsisaac14@gmail.com';

export function isIsaac(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase() === ISAAC_EMAIL;
}

// ---- pure date helpers (same local-noon-safe parsing convention used
// throughout this codebase — see CardHeader.tsx's formatHeaderDate for the
// same reasoning: `new Date(dateStr)` parses as UTC and can shift a day in
// negative-UTC-offset timezones once reformatted in local time). ----
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function isaacAddDays(dateStr: string, n: number): string {
  const d = parseLocal(dateStr);
  d.setDate(d.getDate() + n);
  return toIso(d);
}
function daysBetween(fromIso: string, toIso_: string): number {
  return Math.round((parseLocal(toIso_).getTime() - parseLocal(fromIso).getTime()) / 86400000);
}

/** Week number since program start, 1-indexed — Isaac's own "block", not
    engine-core.js's 4-week one. Week 1 covers days 0-6 since start. */
export function weekNumberSince(startDate: string, date: string): number {
  return Math.max(1, Math.floor(daysBetween(startDate, date) / 7) + 1);
}

type SessionLog = Record<string, { t: string }>;

/** Most recent LOGGED session strictly before `date`, scanning back at most
    a year — mirrors engine-core.js's own "look back through history"
    pattern (see its history()/upNext()) rather than assuming a specific
    log shape beyond the same {date: {t: key}} map every screen already
    passes in as sessionLog. */
function lastLoggedBefore(sessionLog: SessionLog, date: string): { date: string; key: string } | null {
  for (let i = 1; i <= 366; i++) {
    const d = isaacAddDays(date, -i);
    const entry = sessionLog[d];
    if (entry) return { date: d, key: entry.t };
  }
  return null;
}

function lastLoggedPushBefore(sessionLog: SessionLog, date: string): string | null {
  for (let i = 1; i <= 366; i++) {
    const d = isaacAddDays(date, -i);
    const entry = sessionLog[d];
    if (entry && isPushSession(entry.t as IsaacSessionKey)) return d;
  }
  return null;
}

/** Section 3A. The doc gives a RANGE ("2.5kg - 5kg") for how much to drop,
    not an exact formula — this scales linearly with how far over target the
    logged RPE is (1 point over -> 2.5kg, 2+ points over -> capped at the
    range's own 5kg ceiling) rather than picking one fixed number
    arbitrarily. Returns shouldReduce:false (0kg, no message) for anything
    under the +1.0 deviation the doc's own rule is keyed on. */
export interface RpeCheckResult { shouldReduce: boolean; reduceByKg: number; message: string; }
export function checkRpeDeviation(loggedRpe: number, targetRpe: number): RpeCheckResult {
  const over = loggedRpe - targetRpe;
  if (over < 1) return { shouldReduce: false, reduceByKg: 0, message: '' };
  const reduceByKg = Math.min(5, 2.5 * over);
  return {
    shouldReduce: true,
    reduceByKg,
    message: `Fatigue detected. Drop working weight by ${reduceByKg}kg for remaining sets to preserve RPE ${targetRpe} target.`,
  };
}

/** Section 3C. Calendar-day-based (the app only ever logs a date, never a
    time-of-day), so "48 hours" is read as "2 full calendar days apart" —
    the doc's own trigger case (three Push days inside a 4-day window) is
    exactly what this catches. Only fires between two Push-type sessions
    (pushHeavy/pushSecondary/pushSpeed); Pull/Legs/Rest days never count
    against it, matching the doc's own "register Legs as an upper-body rest
    day" framing generalized to the other two non-Push types too. */
export interface PushSpacingResult { warn: boolean; message: string; }
export function checkPushSpacing(lastPushDate: string | null, date: string): PushSpacingResult {
  if (!lastPushDate) return { warn: false, message: '' };
  if (daysBetween(lastPushDate, date) * 24 < 48) {
    return { warn: true, message: 'CNS Warning: Insufficient rest since last Push session. Cap intensity at RPE 7.5 today.' };
  }
  return { warn: false, message: '' };
}

/** Fixed rotation, not a fatigue-scored pick — the whole 6-day split is
    already ordered for sane recovery (see isPushSession's own doc comment
    on why the spacing check is a safety net for deviations, not something
    that fires under normal on-schedule adherence). Brand new account (no
    log yet) starts at the top of the rotation. */
export function nextInRotation(sessionLog: SessionLog, date: string): IsaacSessionKey {
  const last = lastLoggedBefore(sessionLog, date);
  if (!last) return ISAAC_SESSION_ORDER[0];
  const idx = ISAAC_SESSION_ORDER.indexOf(last.key as IsaacSessionKey);
  if (idx === -1) return ISAAC_SESSION_ORDER[0];
  return ISAAC_SESSION_ORDER[(idx + 1) % ISAAC_SESSION_ORDER.length];
}

/** The spacing check for WHATEVER session key is actually about to be
    trained today — not necessarily decide()'s own suggestion. This
    distinction is load-bearing, not pedantic: decide() only ever suggests
    the next slot in the fixed rotation, and the rotation already
    interposes a non-Push slot between every pair of Push slots — so under
    strict day-by-day adherence, decide()'s OWN suggestion can never itself
    land a Push within 48h of the last one (proved out in
    __tests__/isaacEngine.test.ts). The doc's actual trigger case (three
    Push days compounding in a 4-day window, section 3C's own worked
    example) only happens when Isaac free-browses to a Push session the
    app didn't just recommend — e.g. skipping Legs to repeat a Push day.
    card.tsx's own displayKey (browsedKey ?? decision.k) is exactly "what's
    actually about to be trained", which is why this takes an explicit
    `key` rather than recomputing decide()'s own suggestion internally. */
export function checkPushSpacingForKey(sessionLog: SessionLog, key: IsaacSessionKey, date: string): PushSpacingResult {
  if (!isPushSession(key)) return { warn: false, message: '' };
  return checkPushSpacing(lastLoggedPushBefore(sessionLog, date), date);
}

export function isaacDecide(sessionLog: SessionLog, date: string): Decision {
  const k = nextInRotation(sessionLog, date);
  const spacing = checkPushSpacingForKey(sessionLog, k, date);
  return {
    k,
    why: spacing.warn
      ? `Next in your rotation: ${ISAAC_SESSIONS[k].n}. ${spacing.message}`
      : `Next in your rotation: ${ISAAC_SESSIONS[k].n}.`,
  };
}

function mostRecentWeight(loadLog: Record<string, { date: string; kg: number }[]> | undefined, id: string | undefined): number | null {
  if (!id || !loadLog?.[id]?.length) return null;
  const entries = loadLog[id];
  return entries.reduce((latest, e) => (e.date > latest.date ? e : latest), entries[0]).kg;
}

const BASELINE_BY_ID: Record<string, number> = {
  'isaac-bench-1rm': ISAAC_BASELINE.benchOneRepMax,
  'isaac-dip': ISAAC_BASELINE.weightedDipPR,
  'isaac-pullup': 0, // no baseline given in the doc for pull-up added weight beyond bodyweight
};

export function resolveIsaacExercises(
  key: IsaacSessionKey,
  phaseName: string,
  loadLog: Record<string, { date: string; kg: number }[]> | undefined,
  useTestDay: boolean
): RenderedExercise[] {
  const raw: IsaacExercise[] = useTestDay && key === 'pushHeavy' ? ISAAC_TEST_DAY_EXERCISES : ISAAC_SESSIONS[key].x;
  const bench1RM = mostRecentWeight(loadLog, 'isaac-bench-1rm') ?? BASELINE_BY_ID['isaac-bench-1rm'];

  return raw.map((ex) => {
    // neverBump exercises (Explosive Pull-Ups) are shown as a fixed
    // prescription value, not a tappable/editable tracked weight at all —
    // the doc's rule is "the app must never PROMPT an increase", and the
    // simplest way to guarantee that is to not make it editable through
    // the normal weight-badge flow in the first place, rather than making
    // it editable and trusting every future code path to remember not to
    // suggest a bump on it.
    const hasWeightTracking = ex.id != null && !ex.neverBump;
    const loggedKg = mostRecentWeight(loadLog, ex.id);
    const seedKg = ex.id ? BASELINE_BY_ID[ex.id] : undefined;
    const weightKg = ex.neverBump
      ? ISAAC_BASELINE.explosivePullupBaselineKg
      : (loggedKg ?? (ex.id ? seedKg : undefined));

    let prescription = ex.ph?.[phaseName] ?? ex.m;
    if (ex.pctOf1RM != null) {
      const target = Math.round(bench1RM * ex.pctOf1RM);
      prescription = `${prescription} (${target}kg)`;
    }

    return {
      id: ex.id ?? ex.t,
      title: ex.t,
      prescription,
      phaseAdjusted: ex.ph?.[phaseName] != null,
      description: ex.d,
      restSeconds: ex.r,
      weightKg,
      weightIsBump: false, // Isaac's doc never asks for climbing's "held weight 2x -> bump" cue
      weightIsCarriedOver: false,
      hasWeightTracking,
      step: ex.pctOf1RM != null ? 0 : 2.5,
      interval: undefined,
      rpeTarget: ex.rpeTarget,
    };
  });
}

/** Matches only the subset of createEngine()'s (engine-core.js) interface
    that app/(main)/card.tsx actually calls (confirmed by grep, not
    assumed) — isDeload/isReturning/etc. that card.tsx doesn't read aren't
    reimplemented here. If a later screen (calendar.tsx, plan.tsx, ...)
    needs Isaac's engine too, it needs the same "which methods does this
    screen actually call" check before adding to this interface, not a
    blind full reimplementation of engine-core.js's entire surface. */
export function createIsaacEngine(startDate: string, data: { sessionLog: SessionLog; loadLog?: Record<string, { date: string; kg: number }[]> }) {
  const sessionLog = data.sessionLog;
  return {
    today: (): string => toIso(new Date()),
    addDays: isaacAddDays,
    isReturning: (_date: string): boolean => false, // no layoff/return concept in this program
    block: (date: string): BlockInfo => {
      const week = weekNumberSince(startDate, date);
      const phase = phaseForWeek(week);
      const isTestDeloadWeek = phase.n === 'Peak & Test';
      return {
        b: week, w: isTestDeloadWeek ? 4 : (week % 4 === 0 ? 3 : week % 4), // w:4 only during the real deload (Week 10) — see isaacProgram's own ISAAC_PHASES doc comment
        done: 0, per: 6, total: 6, wIdx: 0, over: false,
      };
    },
    phaseNameAt: (date: string): string => phaseForWeek(weekNumberSince(startDate, date)).n,
    decide: (date: string): Decision => isaacDecide(sessionLog, date),
    upNext: () => {
      const k = ISAAC_SESSION_ORDER[0];
      return { key: k, name: ISAAC_SESSIONS[k].n, colour: ISAAC_SESSIONS[k].c };
    },
    sessionInfo: (key: string) => ISAAC_SESSIONS[key as IsaacSessionKey],
    sessionColourVarName: (key: string): string => ISAAC_SESSIONS[key as IsaacSessionKey]?.c ?? '--gorse',
    resolveExercises: (key: string, date: string, phaseName: string): RenderedExercise[] => {
      const week = weekNumberSince(startDate, date);
      const isPeakWeek = phaseForWeek(week).n === 'Peak & Test';
      // Test Day content only once the deload portion of Week 10 has
      // passed — first pushHeavy slot from day 4 of week 10 onward, a
      // reasonable placeholder for "early week deload, then Friday test"
      // given the engine is rotation-position-based, not calendar-weekday-
      // based (see isaacProgram.ts's ISAAC_TEST_DAY_EXERCISES doc comment
      // for why keying off phase+slot instead of a specific weekday is the
      // more robust choice here).
      const daysIntoWeek10 = isPeakWeek ? daysBetween(isaacAddDays(startDate, (week - 1) * 7), date) : 0;
      const useTestDay = isPeakWeek && daysIntoWeek10 >= 3;
      return resolveIsaacExercises(key as IsaacSessionKey, phaseName, data.loadLog, useTestDay);
    },
  };
}

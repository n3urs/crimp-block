/** Replaces ios/Shared/EngineBridge.swift entirely. That file existed only
    to marshal values across JavaScriptCore; in React Native the engine IS
    native, so this is a thin typed wrapper over the same calls rather than
    a bridge. Method names deliberately match EngineBridge's so the Swift
    source stays a readable reference during the port. */
import type { BlockInfo, Decision, Phase, IntervalConfig, RenderedExercise, ReturnInfo, PhaseChange } from './types';

const core = require('./engine-core.js');

export const SESSION_ORDER = Object.freeze([...core.ORDER]) as readonly string[];

export type { BlockInfo, Decision, Phase, IntervalConfig, RenderedExercise, ReturnInfo, PhaseChange };

export function createEngine(program: any, data: { sessionLog: any; loadLog: any }) {
  const e = core.createEngine(program, data);
  return {
    today: (): string => core.today(),
    addDays: (date: string, n: number): string => core.addDays(date, n),
    decide: (date: string): Decision => e.decide(date),
    block: (date: string): BlockInfo => e.block(date),
    phaseNameAt: (date: string): string => e.phaseNameAt(date),
    isDeload: (date: string): boolean => e.isDeload(date),
    isReturning: (date: string): boolean => e.isReturning(date),
    isTraining: (type: string): boolean => e.isTraining(type),
    upNext: () => e.upNext(),
    forecast: (days: number) => e.forecast(days),
    phaseIndexAt: (b: number): number => e.phaseIndexAt(b),
    returnInfo: (date: string): ReturnInfo | null => e.returnInfo(date),
    phaseRange: (index: number): string => e.phaseRange(index),
    phaseChanges: (phaseName: string): PhaseChange[] => phaseChanges(program, phaseName),
    get phases(): Phase[] { return program.phases ?? []; },
    programStartDate: (): string | undefined => program.startDate,
    sessionColourVarName: (key: string): string => program.sessions?.[key]?.c ?? '--gorse',
    sessionInfo: (key: string) => program.sessions?.[key],
    resolveExercises: (key: string, date: string, phaseName: string): RenderedExercise[] =>
      resolveExercises(e, program, key, date, phaseName),
  };
}

/** Faithful port of EngineBridge.resolveExercises(for:date:phaseName:).
    Note how much of the Swift version was pure JSValue marshalling — here
    it is ordinary property access, which is the whole point of the move.
    Two behaviours are easy to lose and both matter:
      · `phaseAdjusted` compares the BASE prescription against the resolved
        one, and is what tints a phase-overridden prescription in the accent
        colour instead of grey.
      · `hasWeightTracking` is "the exercise has an id", NOT "it has a
        weight" — an exercise with no history yet has no target() result but
        must still show the dashed "SET kg" badge, or a brand-new account
        can never record a first weight. */
function resolveExercises(e: any, program: any, key: string, date: string, phaseName: string): RenderedExercise[] {
  const raw = program.sessions?.[key]?.x;
  if (!Array.isArray(raw)) return [];

  const out: RenderedExercise[] = [];
  for (const base of raw) {
    const resolved = e.resolveEx(base, key, date, phaseName);
    if (resolved == null) continue;

    const ex = resolved.e;
    const m: string = resolved.m ?? '';
    const title: string = ex?.t ?? '?';
    const hasWeightTracking = ex?.id != null;

    let weightKg: number | undefined;
    let weightIsBump = false;
    let step = 2.5;
    if (hasWeightTracking) {
      if (ex.step != null) step = ex.step;
      const tg = e.target(ex, date);
      if (tg != null) { weightKg = tg.kg; weightIsBump = tg.bump ?? false; }
    }

    const iv = ex?.interval;
    const interval: IntervalConfig | undefined =
      iv?.on != null && iv?.off != null && iv?.reps != null
        ? { on: iv.on, off: iv.off, reps: iv.reps }
        : undefined;

    out.push({
      id: hasWeightTracking ? String(ex.id) : title,
      title,
      prescription: m,
      phaseAdjusted: base.m != null && base.m !== m,
      description: ex?.d ?? undefined,
      restSeconds: ex?.r ?? undefined,
      weightKg, weightIsBump, hasWeightTracking, step, interval,
    });
  }
  return out;
}

/** Faithful port of EngineBridge.phaseChanges(_:) — every exercise, across
    every session, that carries a `ph` override for this specific phase
    name, derived from the data rather than written out by hand so it can
    never drift from what resolveEx()/resolveExercises() actually applies. */
function phaseChanges(program: any, phaseName: string): PhaseChange[] {
  const out: PhaseChange[] = [];
  const sessions = program.sessions;
  if (!sessions) return out;
  for (const key of SESSION_ORDER) {
    const session = sessions[key];
    const list = session?.x;
    if (!session || !Array.isArray(list)) continue;
    const sessionName: string = session.n ?? '?';
    for (const ex of list) {
      const override = ex?.ph?.[phaseName];
      if (override == null) continue;
      out.push({ sessionName, title: ex.t ?? '?', prescription: String(override) });
    }
  }
  return out;
}

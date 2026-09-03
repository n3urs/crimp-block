/** Shared shapes for the engine facade in `index.ts`. Split out into its
    own file to match this codebase's existing pattern of small,
    single-responsibility modules (see src/design/colours.ts vs
    src/design/motion.ts) rather than one large index.ts. */

export interface BlockInfo {
  b: number;
  w: number;
  done: number;
  per: number;
  total: number;
  wIdx: number;
  over: boolean;
}

export interface Decision {
  k: string;
  why: string;
}

export interface Phase {
  n: string;
  from: number;
  c: string;
  d: string;
  cue?: string;
}

export interface IntervalConfig {
  on: number;
  off: number;
  reps: number;
}

export interface RenderedExercise {
  id: string;
  title: string;
  prescription: string;
  phaseAdjusted: boolean;
  description?: string;
  restSeconds?: number;
  weightKg?: number;
  weightIsBump: boolean;
  /** True when weightKg is a suggestion carried forward from the most
      recent weight logged under a DIFFERENT (earlier) phase, not one
      confirmed within the current phase — see engine-core.js's target()
      for why that distinction exists. Deliberately kept separate from
      weightIsBump (a real, same-phase progression) rather than folded
      into it — the two mean different things even though the UI
      highlights both the same way. */
  weightIsCarriedOver: boolean;
  hasWeightTracking: boolean;
  step: number;
  interval?: IntervalConfig;
}

export interface ReturnInfo {
  gap: number;
  resumed: string;
  session: number;
}

export interface PhaseChange {
  sessionName: string;
  title: string;
  prescription: string;
}

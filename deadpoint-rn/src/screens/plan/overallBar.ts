/** Direct port of PlanSheetView.swift's `overallBar` (:64-79) — one
    fill-fraction + accent-colour lookup per each of the 6 fixed block
    segments. Pulled out of plan.tsx's JSX into its own pure function
    (no React/RN import) purely so its two fiddly bits have a single place
    to get right and a test that pins them down:
      · the fraction clamp: (wIdx - (b-1)*4) / 4, clamped to [0,1] — a
        segment b is 0% filled until wIdx reaches (b-1)*4, 100% once it
        reaches b*4.
      · the *last* phase (in array order, not by highest `from`) whose
        `from` is <= b — Swift's `phases.last(where:)` — INCLUDING its
        "colour is s3 (not any phase accent), once b exceeds phases.length"
        quirk, which for a real 4-phase program (Base/Max Strength/Power/
        Performance, `from` 1/2/5/6) means blocks 5 and 6 render s3 even
        though Power/Performance's own `from` covers them — ported
        verbatim per the task brief, not "fixed". */
import type { Phase } from '../../engine/types';

export interface OverallBarSegment {
  /** 0..1 filled fraction of this segment's width. */
  frac: number;
  /** Phase colour variable name to resolve (e.g. "--gorse"), or null
      meaning "use Colours.s3 literal" (Swift's beyond-phases.count case). */
  varName: string | null;
}

export function computeOverallBar(phases: Phase[], wIdx: number): OverallBarSegment[] {
  const segments: OverallBarSegment[] = [];
  for (let b = 1; b <= 6; b++) {
    const frac = Math.max(0, Math.min(1, (wIdx - (b - 1) * 4) / 4));
    const varName = b <= phases.length ? phases.findLast((p) => p.from <= b)?.c ?? '--gorse' : null;
    segments.push({ frac, varName });
  }
  return segments;
}

/** One fill-fraction + accent-colour segment per block of the REPEATING
    cycle (e.g. Oscar's Max Strength x3 + Power x1), plus which numbered
    lap of that cycle you're currently on. Replaces the old fixed
    "6 segments, the whole plan, done" bar — training doesn't finish once
    it reaches Performance any more (see engine-core.js's `wrapBlock`),
    it keeps repeating the same wave, so "progress through the whole
    plan" no longer means anything. This shows progress through the
    CURRENT lap instead, resetting every time the cycle repeats.

    Pulled out of plan.tsx's JSX into its own pure function (no React/RN
    import) for the same reason the old computeOverallBar was: the
    fiddly wIdx-to-fraction math belongs somewhere it can be pinned down
    by a test on its own. */
import type { Phase } from '../../engine/types';

export interface CycleBarSegment {
  /** 0..1 filled fraction of this segment's width. */
  frac: number;
  /** Phase colour variable name to resolve (e.g. "--gorse"). */
  varName: string;
}

export interface CycleBar {
  /** Which numbered lap of the repeating cycle you're on — 1 for the
      first time through (including while still in a one-time phase like
      Base, before the cycle has even started: shown prospectively, all
      segments empty). */
  cycleNumber: number;
  segments: CycleBarSegment[];
}

/** `phases` must end with the phase carrying `loopBlock` (Performance, by
    convention — see engine-core.js's `wrapBlock`). Returns null if the
    program doesn't define one, since there's nothing repeating to show a
    lap of. */
export function computeCycleBar(phases: Phase[], wIdx: number): CycleBar | null {
  const last = phases[phases.length - 1];
  const loopBlock = last.loopBlock;
  if (loopBlock == null) return null;

  const cycleLen = last.from - loopBlock;
  const rawB = Math.floor(wIdx / 4) + 1;
  const cycleNumber = rawB < loopBlock ? 1 : Math.floor((rawB - loopBlock) / cycleLen) + 1;
  const cycleStartWIdx = (loopBlock - 1) * 4 + (cycleNumber - 1) * cycleLen * 4;

  const segments: CycleBarSegment[] = [];
  for (let i = 0; i < cycleLen; i++) {
    const b = loopBlock + i;
    const segStartWIdx = cycleStartWIdx + i * 4;
    const frac = Math.max(0, Math.min(1, (wIdx - segStartWIdx) / 4));
    const varName = phases.findLast((p) => p.from <= b)?.c ?? last.c;
    segments.push({ frac, varName });
  }
  return { cycleNumber, segments };
}

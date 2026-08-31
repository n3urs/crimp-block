/** Direct port of CalendarView.swift's `planProgress` computed property —
    progress through the STRUCTURED plan (Base, Max Strength, Power),
    ending at the block Performance starts, not the plan's nominal last
    block. See Swift's own doc comment: Performance is open-ended
    "climb and maintain", not a phase with a further endpoint. */
import type { Phase, BlockInfo } from '../../engine/types';

export interface PlanProgress {
  percent: number;
  current: number;
  total: number;
}

export interface PlanProgressEngine {
  phases: Phase[];
  block(date: string): BlockInfo;
}

export function computePlanProgress(engine: PlanProgressEngine, today: string): PlanProgress | null {
  const performance = engine.phases.find((p) => p.n === 'Performance');
  if (!performance || performance.from <= 1) return null;
  const b = engine.block(today);
  const totalNeeded = (performance.from - 1) * b.per * 4;
  if (totalNeeded <= 0) return null;
  const percent = Math.min(100, Math.round((b.total / totalNeeded) * 100));
  return { percent, current: b.total, total: totalNeeded };
}

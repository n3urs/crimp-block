/** Direct port of TutorialSpotlight.swift's TutorialStep/TutorialController.
    Pure advance/handleTap logic, same directly-testable contract as
    useDoneFlow.ts's computeDoneTap — useTutorialController wraps this in
    useState. */
import { useCallback, useState } from 'react';

export interface TutorialStep {
  targetID: string;
  title: string;
  body: string;
  /** Small bouncing "‹ SWIPE ›" badge above the spotlighted target — for
      a step whose real control is a gesture rather than a tap target. */
  showsSwipeHint?: boolean;
  /** The whole screen dims (nothing masked out, the real content stays
      swipeable underneath) while a large sweeping arrow animates across
      it — for the one step whose real control is a whole-card gesture,
      not a single tappable spot. */
  fullScreenSwipeDemo?: boolean;
}

export interface AdvanceResult { stepIndex: number; finished: boolean; }

export function computeAdvance(stepIndex: number, steps: TutorialStep[]): AdvanceResult {
  return stepIndex < steps.length - 1 ? { stepIndex: stepIndex + 1, finished: false } : { stepIndex, finished: true };
}

/** Null means "ignore" — a control that fires early (or a stray tap)
    can't skip a step out of order, matching Swift's own
    `guard currentStep?.targetID == targetID else { return }`. */
export function computeHandleTap(targetID: string, stepIndex: number, steps: TutorialStep[]): AdvanceResult | null {
  if (steps[stepIndex]?.targetID !== targetID) return null;
  return computeAdvance(stepIndex, steps);
}

export function useTutorialController(steps: TutorialStep[]) {
  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const currentStep = finished ? null : (steps[stepIndex] ?? null);

  const advance = useCallback(() => {
    const result = computeAdvance(stepIndex, steps);
    setStepIndex(result.stepIndex);
    setFinished(result.finished);
  }, [stepIndex, steps]);

  const handleTap = useCallback((targetID: string) => {
    const result = computeHandleTap(targetID, stepIndex, steps);
    if (!result) return;
    setStepIndex(result.stepIndex);
    setFinished(result.finished);
  }, [stepIndex, steps]);

  const skip = useCallback(() => setFinished(true), []);

  return { steps, stepIndex, currentStep, finished, advance, handleTap, skip };
}

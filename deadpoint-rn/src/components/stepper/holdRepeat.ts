/** The pure half of press-and-hold stepping, shared by weight-edit.tsx and
    weights-edit.tsx (StepperButton.tsx is the component that uses it).

    Why it exists: the steppers used to move by the exercise's own
    progression step, usually 2.5 kg, one tap at a time. That is too coarse
    for a 5 kg plate split in half, and 1.25 kg on its own would mean
    sixteen taps to get from 20 to 40 — Oscar's exact words were "you just
    have to spam the button loads of times". A finer step is only usable
    alongside a hold that runs, so the two changes are one change. */

/** The step both weight editors move by, replacing the exercise's own
    progression step for MANUAL adjustment. The engine's `step` still
    drives what it suggests next session — this is only the granularity a
    person can dial in by hand, and 1.25 is half a 2.5 kg plate pair. */
export const WEIGHT_STEP_KG = 1.25;

/** How long a press has to be held before it starts repeating at all. Below
    this a press is exactly one step, as it has always been; a normal tap is
    well under it, so nothing changes for anyone tapping. */
export const HOLD_START_MS = 400;

/** Gap between repeats, given how long the button has been held. Three
    speeds rather than a smooth ramp: the jumps are what tells you, by feel,
    that holding longer is doing something, and the numbers land on round
    rates (about 6, 12 and 24 steps a second — 7.5, 15 and 30 kg/s at
    1.25 kg a step). Held flat out, 20 -> 40 kg takes under a second. */
export function repeatIntervalMs(heldMs: number): number {
  if (heldMs < HOLD_START_MS + 1000) return 160;
  if (heldMs < HOLD_START_MS + 2000) return 80;
  return 40;
}

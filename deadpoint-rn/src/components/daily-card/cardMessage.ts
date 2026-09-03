/** Port of DailyCardView.swift's cardMessage(for:isLogged:) (lines
    324-353) — the text block between the session title and the exercise
    list.

    This was NEVER ported during the RN rewrite: card.tsx carried a
    placeholder (`info?.note ?? ''`) with its own comment admitting as
    much ("This is a placeholder, not the real thing... A future task must
    port DailyCardView.swift:315-354 faithfully to replace this"). Caught
    in a full parity audit. The gap was live and user-affecting, not
    cosmetic: during a deload week the card silently showed the session's
    ordinary note instead of the deload guidance explaining that the
    prescriptions below have ALREADY been cut — exactly the week where
    misreading the numbers as "normal" means training through a week
    meant for recovery.

    Priority order is Swift's own, and deliberately so: the deload /
    easing-back guidance OUTRANKS the session note, because it explains
    something about the numbers on screen right now that the note cannot.
    "LOGGED" is the small permanent done-signal left behind once the big
    celebratory stamp auto-dismisses (card.tsx already wires
    `messageEmphasis={isLogged}` for its styling — this supplies the text
    that styling was always meant to carry). */

export interface CardMessageInputs {
  /** Session key currently displayed, e.g. 'maxFingers' — 'rest' suppresses
      both guidance messages (there is nothing to cut on a rest day). */
  sessionKey: string;
  /** block().w === 4 */
  isDeload: boolean;
  /** engine.isReturning(today). Swift computes this as `!isDeload &&
      bridge.isReturning(today)`; the deload branch below returns first, so
      passing the raw value is equivalent — no need to pre-combine it. */
  isReturning: boolean;
  /** True for climbHard/outdoorHard/climbEasy — sessions measured in
      attempts rather than sets, so the deload wording differs. Mirrors
      `s.climb` in app.js / `isClimb` in EngineBridge.swift. */
  isClimb: boolean;
  isLogged: boolean;
  /** The session's own note, when it has one. */
  note: string | null;
}

export function cardMessage(i: CardMessageInputs): string {
  if (i.isDeload && i.sessionKey !== 'rest') {
    return 'Deload week — ' + (i.isClimb
      ? 'fewer hard attempts, and stop well short of failure. Times below are already cut.'
      : 'same weights as usual, fewer sets. The numbers below are already cut.');
  }
  if (i.isReturning && i.sessionKey !== 'rest') {
    return 'Easing back in after a break — weights are cut, not just sets. Go by feel: back off further if anything below feels off, this is not the week to chase the number.';
  }
  if (i.isLogged) return 'LOGGED';
  return i.note ?? '';
}

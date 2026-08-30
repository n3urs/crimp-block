/** Pure port of IntervalTimerController.swift's advance()/statusText/
    leadingInt (that last one actually lives on DailyCardView.swift, but
    belongs here — it exists purely to feed this state machine's `sets`
    parameter). No timers, no RN, no class — same directly-testable
    contract as useDoneFlow.ts's computeDoneTap. useIntervalTimer.ts wraps
    this in the actual ticking. */

export type Phase = 'ready' | 'on' | 'off' | 'setrest' | 'done';

export interface PhaseState {
  phase: Phase;
  set: number;
  rep: number;
}

/** One transition of IntervalTimerController.swift's advance() switch.
    `state.phase` is never null here (unlike Swift's Optional Phase) —
    the calling hook only invokes this while a timer is actually running,
    same as Swift's own `guard let phase else { return }` at the top of
    advance() just returning early for that case. */
export function advancePhase(state: PhaseState, sets: number, reps: number): PhaseState | 'finish' {
  const { phase, set, rep } = state;
  switch (phase) {
    case 'ready':
      return { phase: 'on', set, rep };
    case 'on':
      // A normal rep with more to come, or the very last rep of the very
      // last set — both still take the ordinary short rest before
      // whatever comes next (another rep, or finish via the next off->?
      // transition).
      if (rep < reps || set >= sets) return { phase: 'off', set, rep };
      // Last rep of a set that has another one after it: skip the short
      // between-rep rest entirely and go straight into the real
      // set-rest — reported directly against the original app as "it
      // goes from rest into rest" otherwise.
      return { phase: 'setrest', set, rep };
    case 'off':
      if (rep < reps) return { phase: 'on', set, rep: rep + 1 };
      // Not normally reached — the 'on' branch above already redirects
      // here — kept as a safe fallback, matching Swift's own comment.
      if (set < sets) return { phase: 'setrest', set, rep };
      return 'finish';
    case 'setrest':
      return { phase: 'on', set: set + 1, rep: 1 };
    case 'done':
      return state;
  }
}

/** Mirrors parseInt(string, 10) — the leading run of digits, stopping at
    the first non-digit character. Ported from DailyCardView.swift's
    private leadingInt(_:), used to read the set count straight from the
    currently-resolved prescription text (e.g.
    "5 × (10s on / 5s off × 5)" -> 5), so a deload week's already-cut set
    count is picked up for free with no extra logic here. */
export function leadingInt(s: string): number | undefined {
  const match = s.trimStart().match(/^\d+/);
  return match ? parseInt(match[0], 10) : undefined;
}

/** Mirrors IntervalTimerController.statusText exactly, including its
    em-dash (ready/done) and middle-dot (on/off/setrest) punctuation. */
export function statusText(state: PhaseState, sets: number, reps: number): string {
  const { phase, set, rep } = state;
  switch (phase) {
    case 'ready': return `GET READY — SET ${set} OF ${sets}`;
    case 'setrest': return `SET ${set} OF ${sets} · REST BEFORE SET ${set + 1}`;
    case 'on': return `SET ${set} OF ${sets} · REP ${rep} OF ${reps} · HANG`;
    case 'off': return `SET ${set} OF ${sets} · REP ${rep} OF ${reps} · REST`;
    case 'done': return `DONE — ALL ${sets} SETS`;
  }
}

/** Which tone plays on arriving at a phase via advancePhase — mirrors
    advance()'s own `playTone(next == .on ? .go : .stop)` (both 'off' and
    'setrest' play .stop; only 'on' plays .go). 'ready' isn't reachable via
    advancePhase (it's only ever the starting phase) so it isn't listed —
    useIntervalTimer.ts plays .ready directly from start(), matching
    Swift's own start() calling playTone(.ready) itself, not via advance(). */
export function toneForPhase(phase: Phase): 'go' | 'stop' | null {
  if (phase === 'on') return 'go';
  if (phase === 'off' || phase === 'setrest') return 'stop';
  return null; // 'done' plays .done from finish(), not from a phase arrival
}

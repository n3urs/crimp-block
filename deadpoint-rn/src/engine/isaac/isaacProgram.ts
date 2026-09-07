/** Isaac's 10-week powerbuilding block — a single hand-authored program for
    one specific person (phillipsisaac14@gmail.com), transcribed from his own
    spec doc (Google Doc "App Implementation Guide: 10-Week Powerbuilding
    Roadmap to 140kg", read in full 2026-09-07). Nothing here is climbing
    content and nothing here is shared with any other account.

    THIS FILE CONTAINS A FIRST DRAFT, DELIBERATELY. The source doc specifies
    some things exactly (the 6-day split's headline lifts, the RPE/spacing
    algorithms, the exact Test Day attempt weights) and leaves others as
    intent without exact numbers (accessory set/rep schemes for rowing, OHP,
    traps). Where the doc gives an exact number, it's used verbatim. Where it
    doesn't, a reasonable placeholder is used and marked `// GUESS:` — Isaac
    should confirm or correct these before he actually trains from them, the
    same way Oscar's own programs.js started as drafts and got corrected on
    real feedback.

    Session keys are named for what they are (pushHeavy, pullHeavy, etc.),
    not reused from the climbing engine's maxFingers/hangboard/pull/... —
    this is a genuinely different vocabulary for a genuinely different
    engine (isaacEngine.ts), not the shared climbing one in engine-core.js.
    See isaacEngine.ts's own doc comment for why this had to be a separate
    engine rather than a relabeled climbing program. */

export type IsaacSessionKey =
  | 'pushHeavy' | 'pullHeavy' | 'pushSecondary' | 'legs' | 'pushSpeed' | 'pullSpeed' | 'rest';

/** Fixed rotation order, exactly matching the doc's table row order and
    Oscar's confirmed Monday-start mapping (Mon=Push1 ... Sun=Rest). Isaac's
    program is a strict sequence, not an adaptive best-session-today pick
    the way climbing's is — see isaacEngine.ts's decide(). */
export const ISAAC_SESSION_ORDER: IsaacSessionKey[] = [
  'pushHeavy', 'pullHeavy', 'pushSecondary', 'legs', 'pushSpeed', 'pullSpeed', 'rest',
];

/** True for pushHeavy/pushSecondary/pushSpeed — the three session types the
    doc's 48-hour spacing rule (section 3C) applies between. */
export function isPushSession(key: IsaacSessionKey): boolean {
  return key === 'pushHeavy' || key === 'pushSecondary' || key === 'pushSpeed';
}

export interface IsaacExercise {
  t: string;
  /** Prescription shown to Isaac — sets x reps, or a description of the
      protocol for exercises that aren't simple sets x reps (e.g. the Test
      Day's three named attempts). Per-phase overrides use the same `ph`
      convention as every other program in this codebase (see
      template-resolver.js's own use of it) rather than inventing a new one. */
  m: string;
  ph?: Record<string, string>;
  /** Coaching cue, verbatim from the doc's section 4 where the doc gives
      one. Reused as RenderedExercise.description — no new field needed. */
  d?: string;
  r?: number;
  /** Tracked via the SAME exercise_loads mechanism every other tracked
      exercise in this app uses (a real id -> real weight history) — not a
      new table, not new persistence. */
  id?: string;
  step?: number;
  /** Target RPE for this exercise's working sets, where the doc specifies
      one — read by isaacEngine.ts's checkRpeDeviation(), and shown to Isaac
      alongside the prescription. Undefined for exercises the doc doesn't
      give a target for (e.g. Legs, which the doc treats as an "upper-body
      rest day" with no RPE-based autoregulation mentioned at all). */
  rpeTarget?: number;
  /** Explosive Pull-Ups' own rule (doc section 3B): progress is speed/
      height, never load — the app must NEVER suggest a weight increase
      here, however many sessions it's held. Checked by isaacEngine.ts's
      resolveExercises() to suppress the bump logic every other tracked
      exercise gets by default. */
  neverBump?: boolean;
  /** For Close-Grip Bench: computed as this fraction of Isaac's current
      Bench 1RM (the most recent weight logged against 'isaac-bench-1rm'),
      not independently tracked — matches the doc's own "~73% of 1RM, e.g.
      95kg" framing, scaling automatically as his 1RM moves rather than
      staying pinned to the example number the doc happened to give at
      130kg. */
  pctOf1RM?: number;
}

export interface IsaacSession {
  n: string;
  w: string;
  c: string;
  note?: string;
  x: IsaacExercise[];
}

export interface IsaacPhase {
  n: string;
  /** Week number (1-indexed from Isaac's program start date) this phase
      starts on — NOT a climbing "block" number. isaacEngine.ts's own
      phaseForWeek() is the only thing that reads this. */
  fromWeek: number;
  c: string;
  d: string;
  cue?: string;
}

/** Baseline metrics from the doc's section 1 — used to seed the very first
    displayed 1RM-relative weights before Isaac has logged anything of his
    own under 'isaac-bench-1rm'/'isaac-dip'/'isaac-pullup'. Once he logs a
    real weight, the real log takes over — same "log wins over seed"
    precedent as every other tracked exercise in this app. */
/** Isaac has no profile row (built-in accounts skip the quiz entirely, so
    nothing ever creates one) — this is his equivalent of
    profile.programStartDate, hardcoded because there's nowhere else for it
    to live. Set 2026-09-07 (the day this program was wired up) so "today"
    lands in Week 5, matching what Oscar reported was actually true at the
    time ("just did Tuesday for week 5") — not a guess, a real fact about
    where he already was in the program before the app existed for him. */
export const ISAAC_START_DATE = '2026-08-08';

export const ISAAC_BASELINE = {
  benchOneRepMax: 130,
  benchTarget: 140,
  weightedDipPR: 70,
  explosivePullupBaselineKg: 20,
};

export const ISAAC_PHASES: IsaacPhase[] = [
  {
    n: 'Re-entry', fromWeek: 1, c: '--tidepool',
    cue: 'Submaximal — ease back in',
    d: 'RPE capped at 6.5-7.5 across the board. This week is about waking the pattern back up, not pushing it.',
  },
  {
    n: 'Mass Construction', fromWeek: 2, c: '--gorse',
    cue: 'High volume — this is where the block earns its keep',
    d: 'Weeks 2-6. Working sets in the 100-110kg range on the main lift, RPE allowed up to 8.5. Heaviest accumulated fatigue of the block.',
  },
  {
    n: 'Intensification', fromWeek: 7, c: '--heather',
    cue: 'Heavier, less volume — doubles and triples',
    d: 'Weeks 7-9. Every accessory (bodybuilding-style) exercise drops to half its usual sets/reps — the focus moves entirely to the main lift, now in the 115-125kg range as doubles/triples. Spoto Press replaces Speed Bench on Push 3 from here.',
  },
  {
    n: 'Peak & Test', fromWeek: 10, c: '--slate',
    cue: 'Deload, then test',
    d: 'Week 10. Early-week deload, then Friday’s Test Day: a scripted warm-up and three named attempts, working up to the 140kg target.',
  },
];

/** Resolves which phase a given week number falls in — weeks beyond 10
    hold at 'Peak & Test' rather than throwing, since what happens after
    the block is genuinely undecided (Oscar's own call, 2026-09-07) — see
    isaacEngine.ts's own doc comment on why holding, not erroring or
    silently repeating week 1, is the safe default for an unresolved
    question. */
export function phaseForWeek(week: number): IsaacPhase {
  let current = ISAAC_PHASES[0];
  for (const phase of ISAAC_PHASES) {
    if (week >= phase.fromWeek) current = phase;
  }
  return current;
}

const PUSH1_CUE = 'Wedge upper back into the pad. Tuck shoulder blades DOWN into back pockets to engage lats and stop scapular slipping.';
const CLOSE_GRIP_CUE = 'Stack wrists directly over elbows. Tuck elbows to 30-45 degrees. Touch lower on the sternum.';
const SKULL_CRUSHER_CUE = 'Angle arms 10-15 degrees back past vertical to remove shear force from elbow tendons.';
const LOCKOFF_CUE = 'Keep shoulder packed down; do not hang passively on the capsule.';

export const ISAAC_SESSIONS: Record<IsaacSessionKey, IsaacSession> = {
  pushHeavy: {
    n: 'Push 1 — Heavy Bench', w: 'Gym', c: '--gorse',
    note: 'Competition Paused Bench. Core strength indicator — the app tracks your 1RM percentages from this session.',
    x: [
      { t: 'Warm up', m: '10 min' },
      {
        t: 'Competition Paused Bench', id: 'isaac-bench-1rm', rpeTarget: 8, r: 180,
        m: '5 x 5 @ RPE 8', d: PUSH1_CUE,
        ph: {
          'Re-entry': '5 x 5 @ RPE 6.5-7.5, submaximal',
          'Mass Construction': '5 x 5, 100-110kg working sets, RPE up to 8.5',
          'Intensification': '5 x 2-3 @ 115-125kg, RPE 8.5 — doubles/triples, not sets of 5',
          'Peak & Test': 'Deload early week — see the Friday Test Day protocol below',
        },
      },
      // GUESS: the doc doesn't give an exact accessory scheme for Push 1
      // beyond the main lift — this is a reasonable, common pairing, not
      // sourced from the doc itself.
      { t: 'Close-Grip Dumbbell Press', m: '3 x 8', r: 90 },
    ],
  },

  pullHeavy: {
    n: 'Pull 1 — Heavy Vertical Pull', w: 'Gym', c: '--tidepool',
    note: 'Weighted pull-ups and heavy rowing.',
    x: [
      { t: 'Warm up', m: '8 min' },
      { t: 'Weighted Pull-Ups', id: 'isaac-pullup', m: '5 x 5', rpeTarget: 8, r: 150 },
      // GUESS: "heavy rowing" named but no exact scheme given.
      { t: 'Heavy Barbell Row', m: '4 x 6', rpeTarget: 8, r: 120 },
      { t: 'Biceps — Barbell Curl', m: '3 x 10', r: 60 },
    ],
  },

  pushSecondary: {
    n: 'Push 2 — Secondary Pressing', w: 'Gym', c: '--gorse',
    note: 'Submaximal volume — this session builds pressing capacity, it does not test it.',
    x: [
      { t: 'Warm up', m: '8 min' },
      {
        t: 'Close-Grip Bench', pctOf1RM: 0.73, m: '4 x 6 @ ~73% of your Bench 1RM', d: CLOSE_GRIP_CUE, r: 120,
      },
      // GUESS: OHP set/rep scheme not given exactly.
      { t: 'Standing Overhead Press', m: '4 x 6', r: 120 },
      { t: 'Skull Crushers', m: '3 x 10', d: SKULL_CRUSHER_CUE, r: 75 },
    ],
  },

  legs: {
    n: 'Legs', w: 'Gym', c: '--slate',
    note: 'The doc treats this as an upper-body rest day — it never counts against the Push/Pull fatigue rules.',
    x: [
      { t: 'Leg Extension', m: '3 x 10', r: 60 },
      { t: 'Leg Curl', m: '3 x 10', r: 60 },
      { t: 'Calf Raise', m: '3 x 10', r: 45 },
      { t: 'Romanian Deadlift', m: '2 x 8', r: 90 },
      { t: 'DB Split Squat', m: '3 x 10', r: 75 },
    ],
  },

  pushSpeed: {
    n: 'Push 3 — Speed / Volume', w: 'Gym', c: '--gorse',
    note: 'No barbell grinding allowed on this session — every set stays fast and clean.',
    x: [
      { t: 'Warm up', m: '8 min' },
      {
        t: 'Speed Bench', m: '8 x 3, fast', r: 60,
        ph: { 'Intensification': 'skip — Spoto Press replaces this from here', 'Peak & Test': 'skip — Spoto Press replaces this from here' },
      },
      {
        t: 'Spoto Press', m: 'skip until Intensification', r: 90,
        ph: { 'Intensification': '5 x 3 — pause an inch off the chest, eliminates the bounce', 'Peak & Test': '5 x 3 — pause an inch off the chest, eliminates the bounce' },
      },
      { t: 'Heavy Dips', id: 'isaac-dip', m: '4 x 6', rpeTarget: 8, r: 120 },
      { t: 'V-Bar Pushdowns', m: '3 x 12', r: 60 },
    ],
  },

  pullSpeed: {
    n: 'Pull 2 — Speed & Lock-off Skill', w: 'Gym', c: '--tidepool',
    note: null as unknown as string,
    x: [
      { t: 'Warm up', m: '8 min' },
      {
        t: 'Explosive Pull-Ups', m: '4 x 4 @ +20kg', neverBump: true, r: 120,
        d: 'Progress is speed and height, not load — this weight never goes up. If bar speed drops more than 10% mid-set, stop the set there.',
      },
      { t: 'One-Arm Lock-Offs', m: '3 x 5s hold, neutral grip', d: LOCKOFF_CUE, r: 90 },
      // GUESS: "high-rep traps" named but no exact scheme given.
      { t: 'Barbell Shrugs', m: '3 x 15', r: 60 },
    ],
  },

  rest: {
    n: 'Rest', w: '', c: '--grey',
    note: 'Mandatory CNS reset — no Push volume today, whatever else feels tempting.',
    x: [],
  },
};

/** Friday of Week 10 only — a scripted sequence, not a normal session.
    isaacEngine.ts's resolveExercises() swaps this in for pushHeavy
    specifically once the date falls in the Peak & Test phase and enough
    of the week has passed for the deload to be over (see that file). */
export const ISAAC_TEST_DAY_EXERCISES: IsaacExercise[] = [
  { t: 'Warm up to 100kg', m: 'Standard warm-up ramp' },
  { t: 'Attempt 1 — Opener', id: 'isaac-bench-1rm', m: '120kg x 1' },
  { t: 'Attempt 2 — Confidence PR', id: 'isaac-bench-1rm', m: '132.5kg x 1' },
  { t: 'Attempt 3 — Milestone', id: 'isaac-bench-1rm', m: '140kg x 1' },
];

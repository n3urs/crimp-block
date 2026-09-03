// __tests__/weightCarryover.test.ts
/** Oscar's report: entering a new phase for the first time shows a blank
    "SET kg" placeholder for an exercise he's already been lifting for
    weeks, just under a different (differently-NAMED) phase — forcing a
    from-scratch re-type on every phase change even though the exercise
    (same id, same movement) hasn't changed. Root cause: engine-core.js's
    loadHistory() deliberately scopes history to loads logged under the
    SAME phase NAME as `date` (see its own doc comment on why that's
    correct for a phase that recurs later in the plan) — but target()
    treated "nothing in THIS phase" as "nothing at all" and gave up,
    rather than falling back to the most recent weight from a DIFFERENT
    phase as a starting point.

    A minimal synthetic two-phase program is used here rather than a real
    PROGRAMS entry, specifically so reaching the second phase doesn't
    need a long fabricated session log: perWeek:1 means block() advances
    one training week per single logged day, so 4 logged days reaches
    block 2 (see engine-core.js's block(): b = min(6, floor(wIdx/4)+1),
    wIdx = floor(n/per)). */
import { createEngine } from '../src/engine';

const PROGRAM = {
  startDate: '2026-01-01',
  perWeek: 1,
  phases: [
    { n: 'Base', from: 1, c: '--x', cue: '', d: '' },
    { n: 'Max Strength', from: 2, c: '--y', cue: '', d: '' },
  ],
  sessions: {
    lift: {
      n: 'Lift', w: 'Home', c: '--x', finger: 1, pull: 1,
      x: [{ t: 'Bench', id: 'bench', m: '3 x 5' }],
    },
    rest: { n: 'Rest', w: '—', c: '--grey', finger: 0, pull: 0, x: [] },
  },
};

// Four banked training days reaches block 2 (Max Strength) by 2026-01-04;
// checking on 2026-01-05 keeps the same block (no fifth day logged) and
// lands outside any deload week (w = (4%4)+1 = 1).
const FOUR_LIFTS = {
  '2026-01-01': { t: 'lift' }, '2026-01-02': { t: 'lift' },
  '2026-01-03': { t: 'lift' }, '2026-01-04': { t: 'lift' },
};

test('a weight logged only in an earlier, differently-named phase is carried forward, not blanked', () => {
  const e = createEngine(PROGRAM, {
    sessionLog: FOUR_LIFTS,
    loadLog: { bench: [{ date: '2026-01-01', kg: 40 }] }, // logged during Base
  });

  expect(e.phaseNameAt('2026-01-05')).toBe('Max Strength'); // sanity: we really did cross the phase boundary
  const rows = e.resolveExercises('lift', '2026-01-05', 'Max Strength');
  const bench = rows.find(r => r.id === 'bench');

  expect(bench).toMatchObject({ weightKg: 40, weightIsBump: false, weightIsCarriedOver: true });
});

test('a genuinely new exercise with no history in ANY phase still shows nothing to carry over', () => {
  const e = createEngine(PROGRAM, { sessionLog: FOUR_LIFTS, loadLog: {} });
  const rows = e.resolveExercises('lift', '2026-01-05', 'Max Strength');
  const bench = rows.find(r => r.id === 'bench');

  expect(bench).toMatchObject({ weightKg: undefined, weightIsCarriedOver: false });
});

test('same-phase history still wins over an older, different-phase entry — carryover is a fallback, not a preference', () => {
  const e = createEngine(PROGRAM, {
    sessionLog: FOUR_LIFTS,
    loadLog: { bench: [
      { date: '2026-01-04', kg: 45 }, // logged AFTER crossing into Max Strength
      { date: '2026-01-01', kg: 40 }, // older, still Base
    ] },
  });

  const rows = e.resolveExercises('lift', '2026-01-05', 'Max Strength');
  const bench = rows.find(r => r.id === 'bench');

  // Two same-phase entries at different weights is neither a fresh log
  // for today nor a two-in-a-row hold, so this is the ordinary
  // "just use the last one" path — same behaviour target() already had,
  // unrelated to carryover.
  expect(bench).toMatchObject({ weightKg: 45, weightIsBump: false, weightIsCarriedOver: false });
});

test('carrying a weight forward across phases never bumps it, even if two same-phase sessions would have', () => {
  // Two Base-phase entries at the SAME weight would normally trigger a
  // bump (engine-core.js target()'s "held" rule) — but they're in a
  // different phase from where we're asking, so this must land as a
  // plain carryover, not a bump the lifter never actually confirmed in
  // the new phase.
  const e = createEngine(PROGRAM, {
    sessionLog: FOUR_LIFTS,
    loadLog: { bench: [
      { date: '2026-01-02', kg: 40 },
      { date: '2026-01-01', kg: 40 },
    ] },
  });

  const rows = e.resolveExercises('lift', '2026-01-05', 'Max Strength');
  const bench = rows.find(r => r.id === 'bench');

  expect(bench).toMatchObject({ weightKg: 40, weightIsBump: false, weightIsCarriedOver: true });
});

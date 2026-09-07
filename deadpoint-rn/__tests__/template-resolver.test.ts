// __tests__/template-resolver.test.ts
// Direct unit tests for src/engine/template-resolver.js — previously
// only exercised indirectly through resolveUserProgram.test.ts.
const { resolveTemplate } = require('../src/engine/template-resolver.js');

// A synthetic template, not templates.js's real content — deliberately:
// no real exercise is tagged `equip: 'pullBar'` today (see
// resolveUserProgram's polish-todo history; deciding WHICH exercises
// actually require a pull-up bar is Oscar's coaching-content call, not
// made here). This tests the RESOLVER'S gym/pullBar equivalence
// mechanism in isolation, so it stays correct and green regardless of
// when/whether that content decision happens.
function templateWithPullBarExercise() {
  return {
    perWeek: 4,
    phases: [{ n: 'Base', from: 1, c: '--tidepool', cue: '', d: '' }],
    sessions: {
      maxFingers: { n: 'Max Fingers', w: '', c: '--gorse', x: [] },
      hangboard: { n: 'Hangboard', w: '', c: '--slate', x: [] },
      pull: { n: 'Pull', w: '', c: '--tidepool', x: [{ t: 'Pull-ups', m: '4 x 6', equip: 'pullBar' }] },
      climbHard: { n: 'Limit', w: '', c: '--heather', x: [] },
      outdoorHard: { n: 'Outdoor', w: '', c: '--heather', x: [] },
      climbEasy: { n: 'Easy', w: '', c: '--tidepool', x: [] },
      rest: { n: 'Rest', w: '', c: '--grey', x: [] },
    },
  };
}

function pullSessionTitles(program: any): string[] {
  return (program.sessions.pull.x || []).map((ex: any) => ex.t);
}

// Oscar's own real-world call: virtually every climbing gym has a
// pull-up bar, so someone who ticks "full gym access" but doesn't
// separately tick "pull-up bar" must not be treated as lacking one.
test('gym implies pullBar — a pullBar-tagged exercise is kept when only gym is selected', () => {
  const withGymOnly = resolveTemplate(templateWithPullBarExercise(), {
    startDate: '2026-09-01',
    modifiers: { equipment: ['gym'] },
  });
  expect(pullSessionTitles(withGymOnly)).toEqual(['Pull-ups']);
});

test('gym implication is one-directional — pullBar alone does not grant gym-only exercises', () => {
  // Same synthetic shape, but the tag is 'gym' this time, not 'pullBar'.
  const template = templateWithPullBarExercise();
  template.sessions.pull.x[0].equip = 'gym';
  const withPullBarOnly = resolveTemplate(template, {
    startDate: '2026-09-01',
    modifiers: { equipment: ['pullBar'] },
  });
  expect(pullSessionTitles(withPullBarOnly)).toEqual([]);
});

test('without gym or pullBar, a pullBar-tagged exercise is dropped', () => {
  const withNeither = resolveTemplate(templateWithPullBarExercise(), {
    startDate: '2026-09-01',
    modifiers: { equipment: [] },
  });
  expect(pullSessionTitles(withNeither)).toEqual([]);
});

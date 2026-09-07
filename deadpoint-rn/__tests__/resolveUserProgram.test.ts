// __tests__/resolveUserProgram.test.ts
// Root-cause test for a real, live bug: every screen that needed "this
// user's actual program" independently computed
// `PROGRAMS[email] ?? PROGRAMS.default`, so a real customer's quiz
// answers (template + modifiers) were saved but never read back — see
// resolveUserProgram.ts's own doc comment for the full story.
import { resolveUserProgram } from '../src/engine/resolveUserProgram';
const PROGRAMS = require('../src/engine/programs.js');
const TEMPLATES = require('../src/engine/templates.js');

test('a built-in account (Oscar) gets his own hand-authored program, profile ignored', () => {
  const result = resolveUserProgram('oscar@sullivanltd.co.uk', {
    assignedTemplateId: 'boulderingIntermediate', // deliberately wrong/irrelevant — must be ignored
    programStartDate: '2020-01-01',
    modifiers: {},
  });
  expect(result).toBe(PROGRAMS['oscar@sullivanltd.co.uk']);
});

test('a built-in account is matched case-insensitively, same as isBuiltInProgram', () => {
  const result = resolveUserProgram('OSCAR@sullivanltd.co.uk', null);
  expect(result).toBe(PROGRAMS['oscar@sullivanltd.co.uk']);
});

test('a real customer with a completed quiz gets their actual assigned template, not the generic default', () => {
  const result = resolveUserProgram('real.customer@example.com', {
    assignedTemplateId: 'sportAdvanced',
    programStartDate: '2026-09-01',
    modifiers: {},
  });
  expect(result).not.toBe(PROGRAMS.default);
  expect(result.startDate).toBe('2026-09-01');
  // Same session keys as the raw template — confirms this is really
  // sportAdvanced content, not something that happens to look similar.
  expect(Object.keys(result.sessions)).toEqual(Object.keys(TEMPLATES.sportAdvanced.sessions));
});

test('modifiers actually apply — daysPerWeek overrides the template default', () => {
  const base = TEMPLATES.boulderingIntermediate.perWeek;
  const result = resolveUserProgram('real.customer@example.com', {
    assignedTemplateId: 'boulderingIntermediate',
    programStartDate: '2026-09-01',
    modifiers: { daysPerWeek: base + 1 },
  });
  expect(result.perWeek).toBe(base + 1);
});

test('modifiers actually apply — equipment filtering removes gated exercises', () => {
  const withoutEquipment = resolveUserProgram('real.customer@example.com', {
    assignedTemplateId: 'boulderingIntermediate',
    programStartDate: '2026-09-01',
    modifiers: { equipment: [] },
  });
  const withEquipment = resolveUserProgram('real.customer@example.com', {
    assignedTemplateId: 'boulderingIntermediate',
    programStartDate: '2026-09-01',
    modifiers: { equipment: ['hangboard', 'pullBar', 'gym', 'pickupRig'] },
  });
  const countAllEquipTagged = (program: any) =>
    Object.values(program.sessions).reduce(
      (n: number, s: any) => n + (s.x ?? []).filter((ex: any) => ex.equip != null).length,
      0
    );
  // Some equipment-tagged exercise exists in this template and is
  // dropped when nothing is selected but kept when everything is —
  // proof the resolver's filter is genuinely wired in, not a no-op.
  expect(countAllEquipTagged(withEquipment)).toBeGreaterThan(0);
  expect(countAllEquipTagged(withoutEquipment)).toBe(0);
});

// Oscar's own call: with neither a gym nor a pull-up bar, there's
// realistically nothing to substitute real pulling work with — no
// fabricated bodyweight-only exercise was invented for this case.
test('with no pull-up bar and no gym, every real template still leaves Warm up and Antagonists in Pull', () => {
  for (const templateId of ['boulderingIntermediate', 'boulderingAdvanced', 'sportIntermediate', 'sportAdvanced']) {
    const result = resolveUserProgram('real.customer@example.com', {
      assignedTemplateId: templateId,
      programStartDate: '2026-09-01',
      modifiers: { equipment: [] },
    });
    const titles = result.sessions.pull.x.map((ex: any) => ex.t);
    expect(titles).toEqual(['Warm up', 'Antagonists']);
  }
});

test('profile not loaded yet (still fetching) falls back to PROGRAMS.default rather than crashing', () => {
  expect(resolveUserProgram('real.customer@example.com', null)).toBe(PROGRAMS.default);
});

test('a rehab-only account (no standard template ever assigned) falls back to PROGRAMS.default', () => {
  const result = resolveUserProgram('rehab.customer@example.com', {
    assignedTemplateId: null,
    programStartDate: '2026-09-01',
    modifiers: {},
  });
  expect(result).toBe(PROGRAMS.default);
});

test('an assignedTemplateId that does not exist in TEMPLATES falls back to PROGRAMS.default, not a crash', () => {
  const result = resolveUserProgram('real.customer@example.com', {
    assignedTemplateId: 'somethingThatDoesNotExist',
    programStartDate: '2026-09-01',
    modifiers: {},
  });
  expect(result).toBe(PROGRAMS.default);
});

test('a real assignedTemplateId with no programStartDate falls back rather than letting resolveTemplate throw', () => {
  const result = resolveUserProgram('real.customer@example.com', {
    assignedTemplateId: 'boulderingIntermediate',
    programStartDate: '' as any,
    modifiers: {},
  });
  expect(result).toBe(PROGRAMS.default);
});

test('no email and no profile (e.g. session not resolved yet) is a safe default, not a crash', () => {
  expect(resolveUserProgram(null, null)).toBe(PROGRAMS.default);
});

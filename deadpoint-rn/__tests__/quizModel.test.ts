import { templateId, modifiersPayload, gradeRange, TEMPLATE_META, type QuizAnswers } from '../src/screens/quiz/quizModel';

const TEMPLATES = require('../src/engine/templates.js');

// TEMPLATE_META is hand-mirrored from templates.js per its own doc
// comment ("KEEP IN SYNC with templates.js if either changes") — this
// pins that the two never drift, which is exactly the kind of thing
// that would otherwise only surface as a summary screen quietly
// showing the wrong name/description, or a stray key nobody noticed
// (e.g. a beginner tier removed from one file but not the other).
test('TEMPLATE_META has exactly one entry per real template in templates.js, no more, no fewer', () => {
  expect(Object.keys(TEMPLATE_META).sort()).toEqual(Object.keys(TEMPLATES).sort());
});

test('templateId composes discipline + capitalized experience level', () => {
  expect(templateId('bouldering', 'intermediate')).toBe('boulderingIntermediate');
  expect(templateId('sport', 'advanced')).toBe('sportAdvanced');
});

// No 'beginner' case: removed from ExperienceLevel entirely (Oscar's
// call — a true beginner shouldn't be following a structured strength
// program, they should be climbing a lot first). Intermediate is the floor.
test('gradeRange gives bouldering V-scale bands', () => {
  expect(gradeRange('bouldering', 'intermediate')).toBe('Roughly V3–V6');
  expect(gradeRange('bouldering', 'advanced')).toBe('V7 and above');
});

test('gradeRange gives sport French-grade bands', () => {
  expect(gradeRange('sport', 'intermediate')).toBe('Roughly French 6a–6c');
});

const baseAnswers: QuizAnswers = {
  discipline: 'bouldering', experienceLevel: 'intermediate',
  weaknesses: [], equipment: [], injuryFlags: [], daysPerWeek: 3, tripDate: null,
  maxFingersMethod: null,
};

test('modifiersPayload always includes equipment/injuryFlags/weaknesses/daysPerWeek', () => {
  const payload = modifiersPayload(baseAnswers);
  expect(payload).toEqual({ equipment: [], injuryFlags: [], weaknesses: [], daysPerWeek: 3 });
});

test('modifiersPayload includes tripDate only when set', () => {
  const payload = modifiersPayload({ ...baseAnswers, tripDate: '2026-10-15' });
  expect(payload.tripDate).toBe('2026-10-15');
});

test('modifiersPayload carries real selections through unchanged', () => {
  const payload = modifiersPayload({
    ...baseAnswers,
    weaknesses: ['slopers'], equipment: ['hangboard', 'gym'], injuryFlags: ['elbow'],
  });
  expect(payload.weaknesses).toEqual(['slopers']);
  expect(payload.equipment).toEqual(['hangboard', 'gym']);
  expect(payload.injuryFlags).toEqual(['elbow']);
});

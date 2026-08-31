import { templateId, modifiersPayload, gradeRange, type QuizAnswers } from '../src/screens/quiz/quizModel';

test('templateId composes discipline + capitalized experience level', () => {
  expect(templateId('bouldering', 'beginner')).toBe('boulderingBeginner');
  expect(templateId('sport', 'advanced')).toBe('sportAdvanced');
  expect(templateId('bouldering', 'intermediate')).toBe('boulderingIntermediate');
});

test('gradeRange gives bouldering V-scale bands', () => {
  expect(gradeRange('bouldering', 'beginner')).toBe('Roughly V0–V2');
  expect(gradeRange('bouldering', 'advanced')).toBe('V7 and above');
});

test('gradeRange gives sport French-grade bands', () => {
  expect(gradeRange('sport', 'intermediate')).toBe('Roughly French 6a–6c');
});

const baseAnswers: QuizAnswers = {
  discipline: 'bouldering', experienceLevel: 'beginner',
  weaknesses: [], equipment: [], injuryFlags: [], daysPerWeek: 3, tripDate: null,
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

// __tests__/engineFacadePlan.test.ts
import { createEngine } from '../src/engine';
const PROGRAMS = require('../src/engine/programs.js');

const engine = () =>
  createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: {}, loadLog: {} });

test('phaseChanges returns every real ph override for a phase that has one', () => {
  const changes = engine().phaseChanges('Base');
  expect(changes.length).toBeGreaterThan(0);
  expect(changes).toContainEqual({
    sessionName: 'Max Fingers',
    title: 'Pickups — half crimp',
    prescription: '4 × 8s / hand — lighter',
  });
});

test('phaseChanges returns [] for a phase name no exercise overrides', () => {
  expect(engine().phaseChanges('Max Strength')).toEqual([]);
});

test('phaseRange is callable and returns a string', () => {
  expect(typeof engine().phaseRange(0)).toBe('string');
});

test('returnInfo is callable and returns null with no logged history', () => {
  expect(engine().returnInfo('2026-08-29')).toBeNull();
});

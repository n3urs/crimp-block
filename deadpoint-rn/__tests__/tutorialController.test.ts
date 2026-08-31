import { computeAdvance, computeHandleTap, type TutorialStep } from '../src/components/tutorial/TutorialController';

const steps: TutorialStep[] = [
  { targetID: 'a', title: 'A', body: 'a' },
  { targetID: 'b', title: 'B', body: 'b' },
  { targetID: 'c', title: 'C', body: 'c' },
];

test('advancing from a non-final step increments the index', () => {
  expect(computeAdvance(0, steps)).toEqual({ stepIndex: 1, finished: false });
});

test('advancing from the final step finishes instead of overflowing', () => {
  expect(computeAdvance(2, steps)).toEqual({ stepIndex: 2, finished: true });
});

test('a tap on the current step\'s own target advances', () => {
  expect(computeHandleTap('a', 0, steps)).toEqual({ stepIndex: 1, finished: false });
});

test('a tap on a DIFFERENT target than the current step does nothing', () => {
  expect(computeHandleTap('c', 0, steps)).toBeNull();
});

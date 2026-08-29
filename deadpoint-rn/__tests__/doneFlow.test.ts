import { computeDoneTap, computeConfirmSwap, computeConfirmClimbType } from '../src/components/daily-card/useDoneFlow';

test('UNDO (isLogged true) logs directly, no dialogs', () => {
  expect(computeDoneTap({ isLogged: true, loggedSessionKey: 'pull', displayKey: 'pull' }))
    .toEqual({ state: { showSwapConfirm: false, showClimbTypeConfirm: false }, log: true });
});

test('something else logged today shows the swap confirm first', () => {
  expect(computeDoneTap({ isLogged: false, loggedSessionKey: 'pull', displayKey: 'climbHard' }))
    .toEqual({ state: { showSwapConfirm: true, showClimbTypeConfirm: false } });
});

test('confirming a swap onto climbHard chains into the climb-type prompt, not a log', () => {
  expect(computeConfirmSwap('climbHard'))
    .toEqual({ state: { showSwapConfirm: false, showClimbTypeConfirm: true } });
});

test('a fresh log on a non-climbHard session with nothing else logged today needs no dialog', () => {
  expect(computeDoneTap({ isLogged: false, loggedSessionKey: null, displayKey: 'pull' }))
    .toEqual({ state: { showSwapConfirm: false, showClimbTypeConfirm: false }, log: true });
});

test('a fresh climbHard log with nothing else logged today asks board-vs-climb directly, no swap', () => {
  expect(computeDoneTap({ isLogged: false, loggedSessionKey: null, displayKey: 'climbHard' }))
    .toEqual({ state: { showSwapConfirm: false, showClimbTypeConfirm: true } });
});

test('confirming the climb-type prompt logs with the chosen sub', () => {
  expect(computeConfirmClimbType('board'))
    .toEqual({ state: { showSwapConfirm: false, showClimbTypeConfirm: false }, log: 'board' });
});

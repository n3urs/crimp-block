/** Port of `handleDoneTap`/`proceedToClimbTypeIfNeeded` in
    DailyCardView.swift:246-282. A direct port of that small state machine
    as its own hook, not inline code on DailyCardView.tsx — that file
    doesn't exist yet (Task 12 creates it; see the task brief's opening
    note). Task 12 imports this hook, renders the actual Done button and
    the two confirmation dialogs' UI, and supplies `onLog` as the real
    `useStore.set(...)` call from Task 6.

    The decision logic below is written as plain functions — no test-
    renderer library exists in this project (`@testing-library/react`
    needs `react-dom`, which doesn't belong in an RN project and isn't
    installed) — so it's testable directly with no React involved at all;
    `useDoneFlow` just wraps it in useState/useCallback. */
import { useCallback, useState } from 'react';

export interface DoneFlowState {
  showSwapConfirm: boolean;
  showClimbTypeConfirm: boolean;
}

/** `log`: `true` = call onLog() with no argument (a plain first log, or
    UNDO); a `'board'`/`'climb'` string = call onLog(sub); `undefined` =
    no log yet, just a dialog-visibility change. */
export interface DoneFlowResult {
  state: DoneFlowState;
  log?: true | 'board' | 'climb';
}

const NO_DIALOGS: DoneFlowState = { showSwapConfirm: false, showClimbTypeConfirm: false };

function computeProceedToClimbTypeIfNeeded(displayKey: string): DoneFlowResult {
  if (displayKey === 'climbHard') {
    return { state: { showSwapConfirm: false, showClimbTypeConfirm: true } };
  }
  return { state: NO_DIALOGS, log: true };
}

export function computeDoneTap(params: { isLogged: boolean; loggedSessionKey: string | null; displayKey: string }): DoneFlowResult {
  const { isLogged, loggedSessionKey, displayKey } = params;
  if (isLogged) return { state: NO_DIALOGS, log: true }; // UNDO — clearing today's log needs no confirmation
  if (loggedSessionKey != null && loggedSessionKey !== displayKey) {
    return { state: { showSwapConfirm: true, showClimbTypeConfirm: false } }; // something else is logged today, and this isn't it
  }
  return computeProceedToClimbTypeIfNeeded(displayKey);
}

export function computeConfirmSwap(displayKey: string): DoneFlowResult {
  return computeProceedToClimbTypeIfNeeded(displayKey); // a swap onto climbHard still asks board-vs-climb afterward
}

export function computeConfirmClimbType(sub: 'board' | 'climb'): DoneFlowResult {
  return { state: NO_DIALOGS, log: sub };
}

interface UseDoneFlowParams {
  /** is TODAY's logged session the one currently on screen */
  isLogged: boolean;
  /** whatever IS logged today, regardless of what's on screen — null if
      nothing is */
  loggedSessionKey: string | null;
  displayKey: string;
  /** the actual toggleDone/useStore.set call, invoked once every
      applicable confirmation has resolved */
  onLog: (sub?: 'board' | 'climb') => void | Promise<void>;
}

export function useDoneFlow({ isLogged, loggedSessionKey, displayKey, onLog }: UseDoneFlowParams) {
  const [state, setState] = useState<DoneFlowState>(NO_DIALOGS);

  // Same uncaught-promise-rejection bug class fixed in useStore.ts/
  // useLoads.ts/useProfile.ts/useSession.ts, but from a button tap instead
  // of a useEffect: onLog is async (card.tsx's real onLog awaits
  // store.set/loads.set), and this call site never awaited or caught it —
  // confirmed live, tapping Done while signed out (no sign-in screen
  // exists yet — see useStore.ts's set() doc comment) threw a real
  // "invalid input syntax for type uuid" error that reached the UI as an
  // uncaught-promise-rejection toast. `.catch` doesn't hide a real
  // failure (still logged), it just stops it from crashing/toasting as
  // unhandled — same contract as every other fix of this bug class.
  const applyResult = useCallback((result: DoneFlowResult) => {
    setState(result.state);
    if (result.log === true) Promise.resolve(onLog()).catch((e) => console.error('useDoneFlow.onLog failed:', e));
    else if (result.log) Promise.resolve(onLog(result.log)).catch((e) => console.error('useDoneFlow.onLog failed:', e));
  }, [onLog]);

  const handleDoneTap = useCallback(() => {
    applyResult(computeDoneTap({ isLogged, loggedSessionKey, displayKey }));
  }, [isLogged, loggedSessionKey, displayKey, applyResult]);

  const confirmSwap = useCallback(() => applyResult(computeConfirmSwap(displayKey)), [displayKey, applyResult]);
  const cancelSwap = useCallback(() => setState((s) => ({ ...s, showSwapConfirm: false })), []);
  const confirmClimbType = useCallback((sub: 'board' | 'climb') => applyResult(computeConfirmClimbType(sub)), [applyResult]);
  const cancelClimbType = useCallback(() => setState((s) => ({ ...s, showClimbTypeConfirm: false })), []);

  return { ...state, handleDoneTap, confirmSwap, cancelSwap, confirmClimbType, cancelClimbType };
}

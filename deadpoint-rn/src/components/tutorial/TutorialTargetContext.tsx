/** A measured-ref registry standing in for SwiftUI's anchorPreference/
    overlayPreferenceValue system, which has no RN equivalent — see the
    Phase 5 design spec's Decision 3. Each spotlightable element calls
    useTutorialTarget(id) and attaches the returned ref to its own
    outermost native element; the tutorial host reads the registry by id
    and calls .measureInWindow() on whichever ref is currently active.

    The no-op default context value is what lets every spotlightable
    component call this hook UNCONDITIONALLY, whether or not a tutorial
    is actually running — normal (non-tutorial) rendering of
    ExerciseRow/DailyCard/etc. never sits inside a TutorialTargetProvider,
    so register/unregister are harmless no-ops there. */
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { View } from 'react-native';

// NOTE: `View | null` (not bare `View`) because React 19's `useRef<T>(null)`
// overload resolves to `RefObject<T | null>` — the initial ref value really
// is null until the native element mounts, so this reflects actual runtime
// behavior rather than widening it artificially. Every consumer already
// optional-chains through `.current` (see TutorialOverlay.tsx's measure
// effect, around lines 30-31), so this doesn't change how the registry is
// used.
export type TutorialTargetMap = Map<string, React.RefObject<View | null>>;

interface TutorialTargetContextValue {
  register: (id: string, ref: React.RefObject<View | null>) => void;
  unregister: (id: string) => void;
}

const NOOP: TutorialTargetContextValue = { register: () => {}, unregister: () => {} };
const TutorialTargetContext = createContext<TutorialTargetContextValue>(NOOP);

export function TutorialTargetProvider({ children, targetsRef }: { children: React.ReactNode; targetsRef: React.RefObject<TutorialTargetMap> }) {
  const register = useCallback((id: string, ref: React.RefObject<View | null>) => {
    targetsRef.current?.set(id, ref);
  }, [targetsRef]);
  const unregister = useCallback((id: string) => {
    targetsRef.current?.delete(id);
  }, [targetsRef]);
  return <TutorialTargetContext.Provider value={{ register, unregister }}>{children}</TutorialTargetContext.Provider>;
}

export function useTutorialTarget(id: string | null | undefined): React.RefObject<View | null> {
  const ref = useRef<View>(null);
  const { register, unregister } = useContext(TutorialTargetContext);
  useEffect(() => {
    if (!id) return;
    register(id, ref);
    return () => unregister(id);
  }, [id, register, unregister]);
  return ref;
}

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SESSION_ORDER } from '../../engine';
import { Motion } from '../../design/motion';

/** dx < 0 (swiping left) advances; dx > 0 goes back. Wraps at both ends
    rather than clamping — an earlier version stopped dead at either end
    and was reverted on explicit feedback: a carousel that keeps going is
    what was wanted. `+ count` before the modulo is required because
    JS (like Swift) returns a negative result for a negative operand.

    Marked as a worklet: it's called synchronously from inside the pan
    gesture's `.onUpdate` handler below, which itself runs on the UI
    thread. Without this directive, Reanimated's worklets runtime
    correctly refuses the call — confirmed live, on a real device, this
    exact function crashing with "[Worklets] Tried to synchronously call
    a Remote Function. Called 'nextIndex' on the UI Runtime." the moment
    a real swipe gesture actually ran (Jest never exercises this path —
    it only ever calls `nextIndex` directly as a plain function, never
    from within a real worklet, so this was invisible to every test in
    this branch until a real device build hit it). The directive doesn't
    change this function's own behaviour or its plain-JS callers (this
    file's own `animateTo`, and `__tests__/carousel.test.ts`) — it only
    tells the worklets babel plugin to also compile a UI-thread-callable
    copy. */
export function nextIndex(from: number, direction: -1 | 1, count: number): number {
  'worklet';
  return ((direction === -1 ? from + 1 : from - 1) + count) % count;
}

interface UseSwipeCarouselParams {
  /** The caller's real, authoritative current session key — Swift's
      `effectiveDisplayKey`. This hook never mutates it directly; it only
      reads it and calls `onBrowse` to ask the caller to change it. */
  displayKey: string;
  containerWidth: number;
  /** Swift's `onBrowse` callback prop — actually performs the session
      switch on whatever owns real app state. */
  onBrowse: (key: string) => void;
  /** The inner exercise-list scroll view, so the pan gesture never
      competes with it (Swift's reason for `.simultaneousGesture`).
      Optional because this hook can be built and unit-tested (Steps 1-4)
      before Task 12 has a real scroll view to pass in. */
  scrollRef?: RefObject<React.Component | null>;
}

export function useSwipeCarousel({ displayKey, containerWidth, onBrowse, scrollRef }: UseSwipeCarouselParams) {
  const translateX = useSharedValue(0);
  const [peekKey, setPeekKeyState] = useState<string | null>(null);

  // Shared-value mirror of peekKey, readable synchronously from worklets.
  // React state set via setState during a gesture is NOT safe to read
  // back from the same gesture's worklet: the closure a gesture callback
  // runs with is captured when the gesture object was (re)created on the
  // JS thread, and does not see a same-gesture state update — only a
  // FUTURE gesture (after the next render) would. Shared values are the
  // correct cross-thread-synchronized primitive for exactly this.
  const peekTargetKey = useSharedValue<string | null>(null);
  const horizontalClaimed = useSharedValue(false);

  // The key a completed swipe/animateTo actually committed to, kept until
  // `displayKey` (the caller's real state) catches up to it. Swift's
  // `effectiveDisplayKey` (DailyCardView.swift:171-173) is `pendingCommitKey
  // ?? state.displayKey` — this is that same concept, and it must be a
  // shared value (not a plain ref) because the swipe gesture's `.onUpdate`
  // worklet needs to read it synchronously off the UI thread: a second
  // swipe/tap started in the narrow window between commit and the caller's
  // re-render must still peek from the session already committed to, not
  // the stale `displayKey` prop.
  const pendingKeyShared = useSharedValue<string | null>(null);

  const setPeek = useCallback((key: string | null) => setPeekKeyState(key), []);

  const clearPeek = useCallback(() => {
    setPeekKeyState(null);
    pendingKeyShared.value = null;
  }, [pendingKeyShared]);

  const commit = useCallback((key: string) => {
    pendingKeyShared.value = key;
    onBrowse(key);
    // Swift's own safety net (DailyCardView.swift:244-250): if `displayKey`
    // never ends up matching what we committed to (onBrowse silently
    // failed, or the caller's own reload rejected it), the card must not be
    // left stuck mid-swipe forever.
    setTimeout(() => {
      if (pendingKeyShared.value === key) {
        translateX.value = 0;
        pendingKeyShared.value = null;
        clearPeek();
      }
    }, 1000);
  }, [onBrowse, clearPeek, translateX, pendingKeyShared]);

  // Mirrors Swift's settleOnRealUpdate(): the peek is only cleared once
  // the caller's own displayKey has genuinely caught up to what was
  // committed — clearing it any earlier causes a one-frame flash back to
  // the old session (see DailyCardView.swift's commit() doc comment,
  // which this bug and fix are ported directly from).
  useEffect(() => {
    if (pendingKeyShared.value !== null && displayKey === pendingKeyShared.value) {
      translateX.value = 0;
      peekTargetKey.value = null;
      clearPeek();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- translateX/peekTargetKey/pendingKeyShared are stable shared-value refs, not reactive deps
  }, [displayKey, clearPeek]);

  const panGesture = Gesture.Pan()
    .minDistance(Motion.swipe.minimumDistance)
    // activeOffsetX/failOffsetY are react-native-gesture-handler's own
    // purpose-built mechanism for exactly this "horizontal swipe vs.
    // vertical scroll" ambiguity — this gesture only ever ACTIVATES once
    // horizontal movement exceeds the claim threshold, and explicitly
    // FAILS (ceding the touch to the sibling ScrollView) the moment
    // vertical movement exceeds the same threshold first. This replaces
    // an earlier version's manual ratio-check inside onUpdate, which
    // only runs AFTER this gesture has already been recognized as
    // active by the native responder system — too late to cleanly hand
    // off to a ScrollView on Android specifically. Confirmed live: on a
    // real Android device, the manual-check version blocked vertical
    // scrolling of the exercise list entirely; activeOffsetX/failOffsetY
    // is the library's own documented fix for this exact class of bug.
    .activeOffsetX([-Motion.swipe.horizontalClaimDx, Motion.swipe.horizontalClaimDx])
    .failOffsetY([-Motion.swipe.horizontalClaimDx, Motion.swipe.horizontalClaimDx])
    // react-native-gesture-handler@2.32.0's own .d.ts types this method's
    // ref parameter as RefObject<React.ComponentType | undefined | null>
    // (a component CLASS/function), not RefObject<React.Component | null>
    // (a component INSTANCE) — the type this hook's own scrollRef param
    // uses, matching what every real caller (a `ref` on a ScrollView
    // instance) actually produces. Verified directly against the
    // installed package's shipped type declarations, not assumed. This
    // cast is type-only — it changes nothing about what's passed to the
    // gesture at runtime, it only bridges a library type declaration that
    // doesn't match its own documented usage.
    .simultaneousWithExternalGesture(
      ...(scrollRef ? [scrollRef as unknown as RefObject<React.ComponentType | undefined | null>] : [])
    )
    .onUpdate((e) => {
      if (!horizontalClaimed.value) {
        // activeOffsetX above already guarantees this callback only ever
        // starts firing once real horizontal intent is established, so
        // this first-update branch no longer needs its own claim check —
        // it only needs to run once, to compute which session is being
        // peeked at.
        horizontalClaimed.value = true;
        // Swift's `effectiveDisplayKey` (DailyCardView.swift:171-173): peek
        // from whatever session is already committed to, if one is in
        // flight, not the stale `displayKey` prop.
        const effectiveDisplayKey = pendingKeyShared.value ?? displayKey;
        const from = SESSION_ORDER.indexOf(effectiveDisplayKey);
        if (from !== -1) {
          const toIndex = nextIndex(from, e.translationX < 0 ? -1 : 1, SESSION_ORDER.length);
          const key = SESSION_ORDER[toIndex];
          peekTargetKey.value = key;
          runOnJS(setPeek)(key);
        }
      }
      // Follows the finger 1:1, no animation — this is the fix for "a
      // delay between swiping and it moving".
      translateX.value = e.translationX;
    })
    .onEnd(() => {
      if (!horizontalClaimed.value) return;
      horizontalClaimed.value = false;
      const key = peekTargetKey.value;
      const pastThreshold = key !== null && Math.abs(translateX.value) > containerWidth * Motion.swipe.commitFraction;
      if (pastThreshold && key !== null) {
        const goingNext = translateX.value < 0;
        translateX.value = withTiming(
          goingNext ? -containerWidth : containerWidth,
          { duration: Motion.swipe.completeDurationMs, easing: Easing.out(Easing.ease) },
          (finished) => {
            if (finished) runOnJS(commit)(key);
          }
        );
      } else {
        // Spring-back constants are SwiftUI's `response`/`dampingFraction`
        // names, not Reanimated's own `duration`/`dampingRatio` — the two
        // physics models are not numerically identical (SwiftUI's
        // `response` is a specific-fraction-of-motion time constant;
        // Reanimated's `duration` is a perceptual-duration heuristic on a
        // differently-parameterized spring), so this is a considered
        // starting approximation, not a byte-exact port — real feel
        // parity is part of Step 8's device verification, not
        // guaranteed by this formula alone.
        const startedWithKey = key;
        translateX.value = withSpring(
          0,
          {
            duration: Motion.swipe.springBack.response * 1000,
            dampingRatio: Motion.swipe.springBack.dampingFraction,
          },
          (finished) => {
            // Guards against a new swipe already having started before
            // this spring-back settles — mirrors Swift's own
            // capturedKey/peekKey equality check in the same spot.
            if (finished && peekTargetKey.value === startedWithKey) {
              peekTargetKey.value = null;
              runOnJS(clearPeek)();
            }
          }
        );
      }
    });

  /** Mirror of dragOffset for the INCOMING session's stamp: one full
      Tap-driven browsing (a WeekStrip dot, NEXT) — plays the exact same
      slide-and-settle the swipe gesture does, just driven programmatically
      instead of by a live touch, so the two ways of changing session never
      look or feel like two different features. Ported from
      `animatedBrowse(to:)`. */
  const animateTo = useCallback(
    (key: string) => {
      // Swift's `effectiveDisplayKey` (DailyCardView.swift:171-173): animate
      // from whatever session is already committed to, if one is in
      // flight, not the stale `displayKey` prop. This runs on the JS
      // thread (not a worklet), so reading `.value` here is just a normal
      // property read.
      const effectiveDisplayKey = pendingKeyShared.value ?? displayKey;
      if (key === effectiveDisplayKey) return;
      const from = SESSION_ORDER.indexOf(effectiveDisplayKey);
      const to = SESSION_ORDER.indexOf(key);
      if (from === -1 || to === -1) return;
      const goingNext = to >= from; // matches Swift exactly — NOT the same sign rule the live swipe gesture uses
      peekTargetKey.value = key;
      setPeek(key);
      translateX.value = withTiming(
        goingNext ? -containerWidth : containerWidth,
        { duration: Motion.swipe.animatedBrowseDurationMs, easing: Easing.inOut(Easing.ease) },
        (finished) => {
          if (finished) runOnJS(commit)(key);
        }
      );
    },
    [displayKey, containerWidth, commit, setPeek, translateX, peekTargetKey, pendingKeyShared]
  );

  return { panGesture, translateX, peekKey, animateTo };
}

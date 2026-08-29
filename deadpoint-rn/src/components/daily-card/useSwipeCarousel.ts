import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SESSION_ORDER } from '../../engine';
import { Motion } from '../../design/motion';

/** dx < 0 (swiping left) advances; dx > 0 goes back. Wraps at both ends
    rather than clamping — an earlier version stopped dead at either end
    and was reverted on explicit feedback: a carousel that keeps going is
    what was wanted. `+ count` before the modulo is required because
    JS (like Swift) returns a negative result for a negative operand. */
export function nextIndex(from: number, direction: -1 | 1, count: number): number {
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
  // `displayKey` (the caller's real state) catches up to it.
  const pendingKey = useRef<string | null>(null);

  const setPeek = useCallback((key: string | null) => setPeekKeyState(key), []);

  const clearPeek = useCallback(() => {
    setPeekKeyState(null);
    pendingKey.current = null;
  }, []);

  const commit = useCallback((key: string) => {
    pendingKey.current = key;
    onBrowse(key);
  }, [onBrowse]);

  // Mirrors Swift's settleOnRealUpdate(): the peek is only cleared once
  // the caller's own displayKey has genuinely caught up to what was
  // committed — clearing it any earlier causes a one-frame flash back to
  // the old session (see DailyCardView.swift's commit() doc comment,
  // which this bug and fix are ported directly from).
  useEffect(() => {
    if (pendingKey.current !== null && displayKey === pendingKey.current) {
      translateX.value = 0;
      peekTargetKey.value = null;
      clearPeek();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- translateX/peekTargetKey are stable shared-value refs, not reactive deps
  }, [displayKey, clearPeek]);

  const panGesture = Gesture.Pan()
    .minDistance(Motion.swipe.minimumDistance)
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
        // Ambiguous small movements are left alone (no offset applied
        // yet) so an ordinary vertical scroll attempt never gets grabbed
        // as a swipe partway through it.
        const claims =
          Math.abs(e.translationX) > Motion.swipe.horizontalClaimDx &&
          Math.abs(e.translationX) > Math.abs(e.translationY) * Motion.swipe.horizontalClaimRatio;
        if (!claims) return;
        horizontalClaimed.value = true;
        const from = SESSION_ORDER.indexOf(displayKey);
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
      if (key === displayKey) return;
      const from = SESSION_ORDER.indexOf(displayKey);
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
    [displayKey, containerWidth, commit, setPeek, translateX, peekTargetKey]
  );

  return { panGesture, translateX, peekKey, animateTo };
}

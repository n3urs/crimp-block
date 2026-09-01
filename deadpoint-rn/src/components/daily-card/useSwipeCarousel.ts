import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { SESSION_ORDER } from '../../engine';
import { Motion } from '../../design/motion';

/** dx < 0 (swiping left) advances; dx > 0 goes back. Wraps at both ends
    rather than clamping — an earlier version stopped dead at either end
    and was reverted on explicit feedback: a carousel that keeps going is
    what was wanted. `+ count` before the modulo is required because
    JS (like Swift) returns a negative result for a negative operand.

    NOT marked 'worklet' anymore. It was previously, because the
    drag-follow version called it synchronously from inside `.onUpdate`'s
    UI-thread worklet — and dropping the directive there once crashed a
    real device: "[Worklets] Tried to synchronously call a Remote
    Function. Called 'nextIndex' on the UI Runtime." (Jest never caught
    it, because it only ever calls this as a plain function, never from a
    real worklet.) That risk doesn't apply to this file's shape anymore:
    the fade redesign has no `.onUpdate` at all, and the ONE place this is
    called from a gesture callback (`advance`, below) is itself only ever
    invoked via `runOnJS` from `.onEnd`'s worklet body — so by the time
    `nextIndex` runs, execution is already back on the JS thread. If a
    future change ever calls this directly from inside a worklet body
    again (not via runOnJS), it needs 'worklet' back — that's exactly the
    mistake that crashed before. */
export function nextIndex(from: number, direction: -1 | 1, count: number): number {
  return ((direction === -1 ? from + 1 : from - 1) + count) % count;
}

interface UseSwipeCarouselParams {
  /** The caller's real, authoritative current session key — this hook
      never mutates it directly; it only reads it and calls `onBrowse` to
      ask the caller to change it. */
  displayKey: string;
  /** Still supplied by both real call sites (`app/(main)/card.tsx`,
      `app/tutorial.tsx`) via `useWindowDimensions()` — kept as a required
      param and genuinely used (not dead): the swipe-commit distance
      threshold below is unchanged from the previous drag-based version's
      own formula (`Motion.swipe.commitFraction * containerWidth`), just
      no longer also used to drive a visual slide length, since nothing
      slides anymore. Dropping this param would require touching both
      call sites' object-literal call to `useSwipeCarousel(...)`, which is
      Task 2's job, not this task's. */
  containerWidth: number;
  /** Swift's `onBrowse` callback prop — actually performs the session
      switch on whatever owns real app state. */
  onBrowse: (key: string) => void;
  /** The inner exercise-list scroll view, so the pan gesture never
      competes with it. */
  scrollRef?: RefObject<React.Component | null>;
}

export function useSwipeCarousel({ displayKey, containerWidth, onBrowse, scrollRef }: UseSwipeCarouselParams) {
  const contentOpacity = useSharedValue(1);

  // The key a completed swipe/animateTo actually committed to, kept until
  // `displayKey` (the caller's real state) catches up to it — same
  // concept as the previous drag-based version's `pendingKeyShared`, but
  // a plain ref here rather than a shared value: nothing reads this from
  // inside a worklet anymore (there's no `.onUpdate` peeking mid-drag to
  // read it synchronously off the UI thread), so a ref is the right,
  // simpler primitive for a value only ever read/written from the JS
  // thread (the gesture's `.onEnd` reads it indirectly, but only via
  // `advance`, which itself only runs after crossing back to the JS
  // thread through `runOnJS`).
  const pendingKeyRef = useRef<string | null>(null);

  const commit = useCallback((key: string) => {
    pendingKeyRef.current = key;
    onBrowse(key);
    // Same safety net as the previous drag-based version (itself ported
    // from DailyCardView.swift:244-250): if `displayKey` never ends up
    // matching what was committed to (onBrowse silently failed, or the
    // caller's own reload rejected it), the card must not be left stuck
    // faded-out forever.
    setTimeout(() => {
      if (pendingKeyRef.current === key) {
        pendingKeyRef.current = null;
        contentOpacity.value = withTiming(1, { duration: Motion.swipe.fadeInMs });
      }
    }, 1000);
  }, [onBrowse, contentOpacity]);

  // Settle once the caller's own displayKey has genuinely caught up to
  // what was committed — fading back in any earlier would risk a flash
  // of the OLD session's content if the caller's own state update is
  // still in flight (e.g. an in-progress re-render), the same class of
  // bug the prior drag-based version's own "settle on real update"
  // comment already documented.
  useEffect(() => {
    if (pendingKeyRef.current !== null && displayKey === pendingKeyRef.current) {
      pendingKeyRef.current = null;
      contentOpacity.value = withTiming(1, { duration: Motion.swipe.fadeInMs });
    }
  }, [displayKey, contentOpacity]);

  /** Runs on the JS thread (called via `runOnJS` from the gesture's
      `.onEnd`, and directly from `animateTo` below, which itself is
      always called from a plain event handler, never a worklet). Fades
      the current content out, commits the real session change once
      fully transparent, and lets the `displayKey`-settle effect above
      fade it back in once the caller's real state has caught up. */
  const triggerFade = useCallback((key: string) => {
    contentOpacity.value = withTiming(
      0,
      { duration: Motion.swipe.fadeOutMs, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(commit)(key);
      }
    );
  }, [contentOpacity, commit]);

  /** Runs on the JS thread — the ONLY caller is `panGesture.onEnd` below,
      always via `runOnJS`. Declared BEFORE `panGesture` (unlike this
      task's own draft brief, which flagged this exact ordering as
      illustrative-not-literal) so `panGesture`'s `.onEnd` can reference it
      directly. Ordering alone isn't what makes this correct, though —
      see `panGesture`'s own comment below for why this closes over the
      CURRENT `displayKey`/`pendingKeyRef` on every render regardless of
      useCallback's own memoization. */
  const advance = useCallback((direction: -1 | 1) => {
    const effectiveDisplayKey = pendingKeyRef.current ?? displayKey;
    const from = SESSION_ORDER.indexOf(effectiveDisplayKey);
    if (from === -1) return;
    const to = nextIndex(from, direction, SESSION_ORDER.length);
    triggerFade(SESSION_ORDER[to]);
  }, [displayKey, triggerFade]);

  // `panGesture` is built fresh in the hook body on every render — NOT
  // wrapped in useMemo/useCallback. That's deliberate, not an oversight:
  // GestureDetector re-runs `updateAttachedGestures()` in a `useEffect`
  // keyed on its own `props` object on every render of the CALLER (its
  // effect dependency is `[props]`, and JSX always produces a fresh props
  // object, so this fires every render — confirmed by reading
  // react-native-gesture-handler's own GestureDetector/index.tsx), which
  // re-applies whatever callbacks are on the gesture object it was just
  // given. So every render of THIS hook produces a new `panGesture`
  // object whose `.onEnd` closure captures THIS render's `advance` (and
  // thus, transitively, this render's `displayKey`/`pendingKeyRef`) —
  // there is no stale-closure window, because there is no memoization
  // boundary here for a stale closure to hide behind. This is the same
  // rebuild-per-render behaviour the ORIGINAL drag-based gesture already
  // relied on for its own `displayKey`/`pendingKeyShared` reads; the fade
  // redesign doesn't change that mechanism, only what's inside `.onEnd`.
  const panGesture = Gesture.Pan()
    .minDistance(Motion.swipe.minimumDistance)
    // Same activeOffsetX/failOffsetY directional lock the drag-based
    // version used, and for the same reason — confirmed real against a
    // vertical-scroll-vs-horizontal-swipe bug hit live on Android: this
    // gesture only ACTIVATES once horizontal movement passes the claim
    // threshold, and FAILS (ceding to the sibling ScrollView) the moment
    // vertical movement passes it first. Still needed even though nothing
    // visually tracks the finger anymore — this is what decides whether a
    // touch is a horizontal swipe attempt AT ALL, before `.onEnd` ever
    // gets a chance to run. `.onEnd`'s own doc comment ("It will be called
    // only if the handler was previously in the ACTIVE state") is why
    // there's no separate "was this actually a horizontal gesture" guard
    // inside `.onEnd` below — activeOffsetX/failOffsetY already decided
    // that before `.onEnd` can fire at all.
    .activeOffsetX([-Motion.swipe.horizontalClaimDx, Motion.swipe.horizontalClaimDx])
    .failOffsetY([-Motion.swipe.horizontalClaimDx, Motion.swipe.horizontalClaimDx])
    // react-native-gesture-handler@2.32.0's own .d.ts types this method's
    // ref parameter as RefObject<React.ComponentType | undefined | null>
    // (a component CLASS/function), not RefObject<React.Component | null>
    // (a component INSTANCE) — the type this hook's own scrollRef param
    // uses, matching what every real caller (a `ref` on a ScrollView
    // instance) actually produces. Re-verified directly against the
    // installed package's shipped type declarations for this task. This
    // cast is type-only — it changes nothing about what's passed to the
    // gesture at runtime.
    .simultaneousWithExternalGesture(
      ...(scrollRef ? [scrollRef as unknown as RefObject<React.ComponentType | undefined | null>] : [])
    )
    // No `.onUpdate` at all — the whole point of this redesign is that
    // nothing visually tracks the finger during the drag itself; the only
    // decision made is here, once the gesture completes: was this a real
    // swipe (past the same distance-based commit threshold the drag-based
    // version used), and which direction. `success` is checked so a
    // gesture that got INTERRUPTED (cancelled by the OS, or pre-empted by
    // another gesture) after activating never fires a phantom advance off
    // a partial/stale translation — the drag-based version didn't need
    // this check because it had no equivalent "commit based on final
    // event value alone" decision point; this one does, so it's worth the
    // extra guard.
    //
    // Everything read here — `e.translationX`, the closed-over
    // `containerWidth` param, and `Motion.swipe.commitFraction` (a plain
    // number off a plain imported object) — is data, not a function call,
    // so none of it needs a 'worklet' directive to be safe to read from
    // this UI-thread callback (this inline arrow is auto-workletized by
    // Reanimated's babel plugin, the same as the previous version's
    // `.onUpdate`/`.onEnd` were). The ONE thing that crosses back to the
    // JS thread — calling `advance`, a plain (non-worklet) function — goes
    // through `runOnJS`, exactly the boundary this file's `nextIndex`
    // comment above exists to explain.
    .onEnd((e, success) => {
      if (!success) return;
      const pastThreshold = Math.abs(e.translationX) > Motion.swipe.commitFraction * containerWidth;
      if (!pastThreshold) return;
      const direction = e.translationX < 0 ? -1 : 1;
      runOnJS(advance)(direction);
    });

  /** Mirror of the drag-based version's `animateTo` (Swift's
      `animatedBrowse(to:)`): one full programmatic session change — a
      WeekStrip dot tap, a SessionDots tap — plays the exact same fade the
      swipe gesture does, just driven directly instead of by a completed
      touch, so the two ways of changing session never look or feel like
      two different features. */
  const animateTo = useCallback((key: string) => {
    // Animate from whatever session is already committed to, if one is in
    // flight, not the stale `displayKey` prop — same reasoning as
    // `advance` above. This runs on the JS thread (never a worklet), so
    // reading `pendingKeyRef.current` here is just a normal property
    // read, not a cross-thread concern.
    const effectiveDisplayKey = pendingKeyRef.current ?? displayKey;
    if (key === effectiveDisplayKey) return;
    // The drag-based version also required `key` to resolve to a real
    // SESSION_ORDER index (it needed one to compute slide direction);
    // this redesign doesn't need a direction for a fade, but keeps the
    // same validity guard — every real caller (SessionDots' own dot taps
    // and its next-up chip) only ever passes a key that's already a
    // SESSION_ORDER member, so this is defensive, not currently reachable
    // with an invalid key, but it's cheap and preserves the original's
    // discipline of never committing to an unknown session.
    if (!SESSION_ORDER.includes(key)) return;
    triggerFade(key);
  }, [displayKey, triggerFade]);

  return { panGesture, contentOpacity, animateTo };
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  // `advance` closes over `displayKey`/`pendingKeyRef` and so gets a new
  // identity on basically every render — but `panGesture` below must NOT
  // be rebuilt every render (see its own comment), so `.onEnd` calls
  // through this ref instead of closing over `advance` directly. Kept
  // current with a plain assignment in the render body (not an effect):
  // effects run after paint, and a real touch's `.onEnd` firing in that
  // gap would read one render stale, which a same-tick assignment avoids.
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // Stable wrapper `advance` itself isn't (its identity changes with
  // `displayKey` above) — this is what `.onEnd` actually calls via
  // `runOnJS`, exactly the same shape as the original `runOnJS(advance)`
  // call it replaces. Deliberately NOT an inline arrow written directly
  // inside `.onEnd`'s worklet body: that arrow would close over
  // `advanceRef` from UI-thread code, and Reanimated's babel plugin
  // workletizes inline functions it finds inside a worklet, which would
  // make `advanceRef.current` an unsafe cross-thread ref read — the exact
  // "[Worklets] Tried to synchronously call a Remote Function" class of
  // crash `nextIndex`'s own comment above describes. A real
  // `useCallback`, defined here on the JS thread and only ever passed BY
  // REFERENCE into `runOnJS(...)`, is the same safe shape `runOnJS(advance)`
  // already was.
  const advanceViaRef = useCallback((direction: -1 | 1) => {
    advanceRef.current(direction);
  }, []);

  // `panGesture` IS memoized (built once, stable identity for the life of
  // this hook instance) — this used to be deliberately rebuilt fresh every
  // render instead, to keep `.onEnd` closing over the current `advance`
  // without a stale-closure window. That traded one bug for a worse one:
  // `Card()` also owns `useRestTimer`/`useIntervalTimer`, both of which
  // tick their own state every 200ms (`Motion.restOverlayTickMs` /
  // `Motion.intervalControllerTickMs`) while a rest countdown or a
  // repeater set is running — re-rendering `Card()`, and with it every
  // hook inside it, five times a second. Rebuilding `panGesture` on each
  // of those ticks gives `GestureDetector` a new `gesture` prop five times
  // a second; `GestureDetector`'s own `useEffect(() => {...
  // updateAttachedGestures() }, [props])` reruns on every one of those
  // renders regardless (its dependency is the WHOLE `props` object, which
  // JSX always makes fresh — confirmed against the installed
  // react-native-gesture-handler's own GestureDetector/index.tsx, not
  // assumed), and — because it's the same single Pan handler each time,
  // so `needsToReattach()` says no reattach is needed — takes the
  // "update the handler's callbacks in place" path
  // (useDetectorUpdater.ts's `updateHandlers()`), which swaps the native
  // handler's registered `.onEnd` callback to that render's fresh closure
  // on every one of those five-times-a-second ticks. If a real touch is
  // in flight on the native side at that moment (scrolling the exercise
  // list while a rep timer counts down is completely normal usage), that
  // is a live gesture handler having its callback wiring reassigned out
  // from under it repeatedly while it's tracking a touch — exactly the
  // class of Android-specific gesture-timing fragility this same gesture
  // already needed a real fix for once before (see the
  // activeOffsetX/failOffsetY comment below, and commit 5c35ba6). Traced
  // live from a tester's report of the home screen "rapidly flicking
  // between workouts, four or five times a second" — 4-5Hz matching the
  // timer tick rate exactly, and SESSION_ORDER having 7 entries matching
  // what "flicking through workouts" at that rate would look like.
  // Memoizing `panGesture` makes `gestureConfig` (and so
  // `gesturesToAttach`, itself `useMemo`'d on `gestureConfig` inside
  // GestureDetector) referentially stable across those ticks, so
  // `updateHandlers()` still runs every tick but reassigns the SAME
  // object to itself — a true no-op, not a live callback swap — while
  // `advanceRef` above keeps the direction handler correct regardless.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
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
        // Everything read here — `e.translationX` and `Motion.swipe.commitFraction`
        // (a plain number off a plain imported object) — is data, not a
        // function call, so none of it needs a 'worklet' directive to be safe
        // to read from this UI-thread callback (this inline arrow is
        // auto-workletized by Reanimated's babel plugin). `containerWidth` is
        // read as a plain closed-over number, same as before — it's a layout
        // measurement, not per-render app state, so this gesture being built
        // once does not go stale against it in practice (a container resize
        // mid-drag was never handled by the per-render rebuild either). The
        // ONE thing that crosses back to the JS thread — calling
        // `advanceViaRef`, a plain (non-worklet) function — goes through
        // `runOnJS`, exactly the boundary this file's `nextIndex` comment
        // above exists to explain, and exactly the same shape as the
        // original `runOnJS(advance)(direction)` call this replaces.
        .onEnd((e, success) => {
          if (!success) return;
          const pastThreshold = Math.abs(e.translationX) > Motion.swipe.commitFraction * containerWidth;
          if (!pastThreshold) return;
          const direction = e.translationX < 0 ? -1 : 1;
          runOnJS(advanceViaRef)(direction);
        }),
    // Deliberately NOT depending on `displayKey`/`advance`/`triggerFade` —
    // that's the entire point (see comment above). `containerWidth` and
    // `scrollRef` are included because they're real configuration, not
    // per-render app state; both are stable across a screen's lifetime in
    // every real caller today, so this still only ever builds once in
    // practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerWidth, scrollRef]
  );

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

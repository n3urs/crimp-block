# Swipe-to-Fade Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the daily card's swipe-between-sessions interaction — currently a physical drag where the content visually slides with the finger — with a simpler model: detect a completed swipe gesture, then fade the current session out and the new one in. Explicit, direct request from Oscar (the app's owner): "I think having it... actually physically slide with your fingers... buggy looking. I'm not a big fan." This is a deliberate departure from both the original Swift app's own slide-based interaction and this rebuild's own prior fidelity-first approach — Oscar's own preference for the rebuild governs here, not fidelity to the Swift source.

**Architecture:** `useSwipeCarousel.ts`'s pan gesture stops tracking `translationX` into a live-following `translateX` value entirely. Instead, `.onEnd()` alone decides whether a real swipe happened (distance/velocity threshold) and which direction, then hands off to a new `triggerFade(key)` function that animates a single `contentOpacity` shared value: fade out → commit the session change (reusing the existing `commit()`/pending-key/settle-on-real-update machinery, which stays correct and untouched) → fade in. `animateTo()` (used by WeekStrip taps, session-dot taps, the NEXT chip) is updated to use the same fade, so drag-swipe and tap-to-jump look and feel identical, matching this file's own pre-existing design goal. `DailyCard.tsx`'s rendering simplifies accordingly: no more `peek` content layer or `translateX`-driven slide transform — one content view, animated by opacity alone.

**Tech Stack:** No new dependencies. Same `react-native-reanimated` (`useSharedValue`, `withTiming`) and `react-native-gesture-handler` (`Gesture.Pan`) already in use.

## Global Constraints

- Design tokens (`Colours`, `Fonts`) via those modules only.
- `npx jest` and `npx tsc --noEmit` clean after every task.
- Flat `test(...)` calls, no `describe` blocks.
- The existing correctness discipline around session-commit must be fully preserved: a swipe/tap only visually settles once the caller's real `displayKey` has genuinely caught up (never clear the fade-hold early — the exact bug class the current code's own comments already warn about, "clearing the peek any earlier causes a one-frame flash back to the old session"), and the existing 1-second stuck-card safety net (if `onBrowse` silently fails to update `displayKey`) must survive the rewrite.
- No worklet-thread reads of React state — any value read inside a gesture callback that runs on the UI thread must be a shared value, matching this file's own established discipline (and the real crash this exact file hit earlier in the project when that rule was violated: `"[Worklets] Tried to synchronously call a Remote Function"`).
- Every gesture-handler API used must be verified against the actually-installed package's own type declarations before being trusted (`node_modules/react-native-gesture-handler`), not assumed — this project has hit real API-shape surprises in gesture/animation code before.

---

## Task 1: Rewrite `useSwipeCarousel.ts` for fade instead of drag-follow

**Files:**
- Modify: `deadpoint-rn/src/components/daily-card/useSwipeCarousel.ts`
- Modify: `deadpoint-rn/__tests__/carousel.test.ts` (or wherever `nextIndex`'s existing tests live — confirm the real filename first)

**Interfaces:**
- Consumes: `SESSION_ORDER` (`src/engine`), `Motion` (`src/design/motion`) — unchanged.
- Produces (CHANGED from current): `useSwipeCarousel({ displayKey, containerWidth, onBrowse, scrollRef })` now returns `{ panGesture, contentOpacity, animateTo }` — **`translateX` and `peekKey` are REMOVED** (no longer meaningful once there's no slide/peek rendering); `contentOpacity` is a new `SharedValue<number>` (starts at `1`) for `DailyCard.tsx` to apply to its single content view. `containerWidth` is now unused by this hook's own logic (kept as a parameter only if `DailyCard.tsx`'s call site still needs to pass something for signature stability — check Task 2 first and remove it entirely from both sides if nothing needs it anymore, don't leave a dead parameter).

- [ ] **Step 1: Read the current file in full**, plus `DailyCard.tsx`'s actual current usage of `translateX`/`peekKey`/`panGesture`/`animateTo` (grep for each), so Task 2's removal work is planned against real, current call sites, not assumed ones.

- [ ] **Step 2: Write the new hook**

```typescript
// src/components/daily-card/useSwipeCarousel.ts
import { useCallback, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { SESSION_ORDER } from '../../engine';
import { Motion } from '../../design/motion';

/** dx < 0 (swiping left) advances; dx > 0 goes back. Wraps at both ends
    rather than clamping — explicit prior feedback: a carousel that keeps
    going is what was wanted. `+ count` before the modulo is required
    because JS (like Swift) returns a negative result for a negative
    operand. Not a worklet anymore — nothing calls this from inside a
    live-tracked gesture callback now that the drag no longer follows the
    finger frame-by-frame; `.onEnd()` (a JS-thread callback via
    `runOnJS`, see below) is the only caller. */
export function nextIndex(from: number, direction: -1 | 1, count: number): number {
  return ((direction === -1 ? from + 1 : from - 1) + count) % count;
}

interface UseSwipeCarouselParams {
  /** The caller's real, authoritative current session key — this hook
      never mutates it directly; it only reads it and calls `onBrowse` to
      ask the caller to change it. */
  displayKey: string;
  /** Swift's `onBrowse` callback prop — actually performs the session
      switch on whatever owns real app state. */
  onBrowse: (key: string) => void;
  /** The inner exercise-list scroll view, so the pan gesture never
      competes with it. */
  scrollRef?: React.RefObject<React.Component | null>;
}

export function useSwipeCarousel({ displayKey, onBrowse, scrollRef }: UseSwipeCarouselParams) {
  const contentOpacity = useSharedValue(1);
  const [busy, setBusy] = useState(false);

  // The key a completed swipe/animateTo actually committed to, kept until
  // `displayKey` (the caller's real state) catches up to it — same
  // concept and same reason this needed to be a ref (not React state)
  // in the previous drag-based version: the commit-safety-net timeout
  // below needs to read the CURRENT value at fire time, not a value
  // captured in a stale closure.
  const pendingKeyRef = React.useRef<string | null>(null);

  const commit = useCallback((key: string) => {
    pendingKeyRef.current = key;
    onBrowse(key);
    // Same safety net as the previous version (DailyCardView.swift:244-250
    // via the prior drag-based port): if `displayKey` never ends up
    // matching what was committed to (onBrowse silently failed, or the
    // caller's own reload rejected it), the card must not be left stuck
    // faded-out forever.
    setTimeout(() => {
      if (pendingKeyRef.current === key) {
        pendingKeyRef.current = null;
        contentOpacity.value = withTiming(1, { duration: Motion.swipe.fadeInMs });
        setBusy(false);
      }
    }, 1000);
  }, [onBrowse, contentOpacity]);

  // Settle once the caller's own displayKey has genuinely caught up to
  // what was committed — fading back in any earlier would risk a flash
  // of the OLD session's content if the caller's own state update is
  // still in flight (e.g. an in-progress re-render), the same class of
  // bug the prior drag-based version's own "settle on real update"
  // comment already documented.
  React.useEffect(() => {
    if (pendingKeyRef.current !== null && displayKey === pendingKeyRef.current) {
      pendingKeyRef.current = null;
      contentOpacity.value = withTiming(1, { duration: Motion.swipe.fadeInMs });
      setBusy(false);
    }
  }, [displayKey, contentOpacity]);

  /** Runs on the JS thread (called via `runOnJS` from the gesture's
      `.onEnd()`, and directly from `animateTo` below, which itself is
      always called from a plain event handler, never a worklet). Fades
      the current content out, commits the real session change once
      fully transparent, and lets the `displayKey`-settle effect above
      fade it back in once the caller's real state has caught up. */
  const triggerFade = useCallback((key: string) => {
    setBusy(true);
    contentOpacity.value = withTiming(0, { duration: Motion.swipe.fadeOutMs, easing: Easing.out(Easing.ease) }, (finished) => {
      if (finished) runOnJS(commit)(key);
    });
  }, [contentOpacity, commit]);

  const panGesture = Gesture.Pan()
    .minDistance(Motion.swipe.minimumDistance)
    // Same activeOffsetX/failOffsetY directional lock the drag-based
    // version used — still needed even without a live-following
    // translateX, so a vertical scroll attempt is never mistaken for a
    // horizontal swipe attempt in the first place. Confirmed real
    // against the installed react-native-gesture-handler's own .d.ts.
    .activeOffsetX([-Motion.swipe.horizontalClaimDx, Motion.swipe.horizontalClaimDx])
    .failOffsetY([-Motion.swipe.horizontalClaimDx, Motion.swipe.horizontalClaimDx])
    .simultaneousWithExternalGesture(
      ...(scrollRef ? [scrollRef as unknown as React.RefObject<React.ComponentType | undefined | null>] : [])
    )
    .onEnd((e) => {
      // No onUpdate at all — the whole point of this redesign is that
      // nothing visually tracks the finger during the drag itself; the
      // only decision made is here, once the gesture completes: was this
      // a real swipe (past the same distance-based commit threshold the
      // drag-based version used), and which direction.
      const pastThreshold = Math.abs(e.translationX) > Motion.swipe.commitFraction * 200;
      // 200 is a fixed reference width, not the real container width —
      // see this task's own Step 3 note on why containerWidth was
      // dropped, and confirm this literal against Motion.swipe's real
      // values before trusting it (Step 4 below).
      if (!pastThreshold) return;
      const direction = e.translationX < 0 ? -1 : 1;
      runOnJS(advance)(direction);
    });

  // advance() must be declared with useCallback OUTSIDE the gesture
  // definition if it closes over `displayKey`/`pendingKeyRef` — Reanimated
  // gesture objects are rebuilt on every render where their dependencies
  // change, so a plain function reference captured directly inside
  // `.onEnd()`'s closure would go stale between renders. Confirm this
  // ordering/dependency concern is handled correctly when implementing —
  // this draft's ordering (advance referenced before its own declaration)
  // is illustrative, not literal; restructure as needed so `panGesture`
  // is rebuilt whenever `advance`'s own captured values change.
  const advance = useCallback((direction: -1 | 1) => {
    const effectiveDisplayKey = pendingKeyRef.current ?? displayKey;
    const from = SESSION_ORDER.indexOf(effectiveDisplayKey);
    if (from === -1) return;
    const to = nextIndex(from, direction, SESSION_ORDER.length);
    triggerFade(SESSION_ORDER[to]);
  }, [displayKey, triggerFade]);

  const animateTo = useCallback((key: string) => {
    const effectiveDisplayKey = pendingKeyRef.current ?? displayKey;
    if (key === effectiveDisplayKey) return;
    triggerFade(key);
  }, [displayKey, triggerFade]);

  return { panGesture, contentOpacity, animateTo, busy };
}
```

**IMPORTANT — this draft has a known ordering problem, flagged explicitly, fix it while implementing:** `panGesture`'s `.onEnd()` calls `runOnJS(advance)`, but `advance` is declared with `useCallback` AFTER `panGesture` in the draft above — this won't compile/won't close over the right value as written. The implementer must restructure this (e.g. declare `advance` before `panGesture`, and ensure `panGesture` is rebuilt — via being redefined inside the component/hook body so its closure captures the current `advance` — whenever `displayKey` changes, the same re-creation-per-render behavior the ORIGINAL drag-based gesture already relied on for its own `displayKey`/`pendingKeyShared` reads). This is exactly the kind of subtlety this project's own established practice is to verify against the real gesture-handler/reanimated behavior before shipping, not assume from a draft — treat this plan's code as a strong starting point, not verbatim-correct.

- [ ] **Step 3: Resolve the `containerWidth` question.**

The draft above hardcodes `200` as a placeholder reference width for the commit-threshold distance check, flagged explicitly as wrong. Read how `DailyCard.tsx` currently computes and passes `containerWidth` to this hook (it comes from `useWindowDimensions()` in `app/(main)/card.tsx` and `app/tutorial.tsx`, passed down through `DailyCard.tsx`'s own props). Since the fade redesign no longer needs `containerWidth` for a slide-distance animation, decide: (a) keep accepting `containerWidth` as a parameter and use the REAL value instead of the placeholder `200` for the commit-threshold calculation (`Motion.swipe.commitFraction * containerWidth`, matching the ORIGINAL drag-based version's own threshold formula exactly, just without ever using it for a visual slide-length), or (b) drop `containerWidth` as a parameter entirely and use a fixed-in-points distance threshold (e.g. a new `Motion.swipe` constant, in points, not a fraction of screen width) if a simpler absolute threshold reads better without a slide happening at all. Prefer (a) — reusing the exact same proportional-of-screen-width threshold formula as before is a smaller behavior change and keeps `Motion.swipe.commitFraction` meaningful — unless there's a concrete reason (b) is cleaner once you're looking at the real code; if you choose (b), remove `commitFraction`'s now-dead usage cleanly and add a new named constant to `Motion.swipe` with a clear comment, don't leave a magic number.

- [ ] **Step 4: Add the two new `Motion.swipe` timing constants this redesign needs**

In `src/design/motion.ts`, inside the `swipe` block, add `fadeOutMs` and `fadeInMs` (suggested starting values: `120` for fade-out, `150` for fade-in — quick, matching Oscar's own "just like quickly" description — but this is exactly the kind of subjective feel value this plan's own Task 3 live-verification step should confirm/tune against the real device, not treat as final on first guess). Remove `horizontalClaimRatio` if Step 2's rewrite genuinely has no remaining use for it (confirm via grep across the whole `src/` tree before deleting — Task 1 of an earlier plan this session already removed ITS only use inside `useSwipeCarousel.ts`'s own `onUpdate`, so if nothing else references it, it's dead and should be deleted, not left as an unused, confusing leftover). `completeDurationMs`, `animatedBrowseDurationMs`, and `springBack` are now also dead (the drag-based slide/spring-back animations they drove no longer exist) — confirm via the same grep-before-delete discipline and remove whichever are genuinely unused.

- [ ] **Step 5: Write/update tests for `nextIndex` and `advance`'s direction/wrap logic**

`nextIndex` itself is unchanged in behavior (just no longer a worklet) — its existing tests should still pass verbatim; confirm by running them, don't rewrite them speculatively. If this hook's own commit-threshold decision (`pastThreshold`) has any pure, extractable logic worth a direct test (e.g. a small pure function like `shouldCommitSwipe(translationX: number, threshold: number): boolean`), consider extracting and testing it the same way this project's other gesture-adjacent logic (`computeAdvance`, `computeHandleTap` in the tutorial system) already separates pure decision logic from the gesture wiring itself — but don't force an extraction that doesn't read naturally; use judgment.

- [ ] **Step 6: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean, test count should not have decreased (only grown, if Step 5 added anything).

- [ ] **Step 7: Commit**

```bash
cd deadpoint-rn && git add src/components/daily-card/useSwipeCarousel.ts src/design/motion.ts __tests__/carousel.test.ts
git commit -m "feat(daily-card): redesign session-swipe as fade instead of drag-follow"
```

---

## Task 2: Update `DailyCard.tsx`'s rendering to match

**Files:**
- Modify: `deadpoint-rn/src/components/daily-card/DailyCard.tsx`

**Interfaces:**
- Consumes: Task 1's new `useSwipeCarousel()` return shape (`{ panGesture, contentOpacity, animateTo, busy }` — no more `translateX`/`peekKey`).

- [ ] **Step 1: Read the current file in full**, specifically every place it currently reads `translateX`/`peek`/`peekKey` (props it receives, or the hook's own return value — confirm which; `app/(main)/card.tsx` and `app/tutorial.tsx` both currently call `useSwipeCarousel` themselves and pass `translateX`/`peek` down to `<DailyCard>` as props, per this project's established pattern of the swipe state living one level above `DailyCard` itself, matching Swift's own state ownership — confirm this is still true and adjust the SAME way in both call sites, not just inside `DailyCard.tsx`).

- [ ] **Step 2: Remove the peek-content rendering path entirely.**

`DailyCard.tsx` currently renders TWO content layers during a drag (the current session's content, translated by `translateX`, plus a "peek" of the incoming session sliding in from the appropriate side) — this whole dual-layer structure is no longer needed. Replace it with a SINGLE content view (the real, current session's exercises — driven by `displayKey`, unchanged) wrapped in an `Animated.View` whose `style` includes `opacity: contentOpacity` (via `useAnimatedStyle`), with no transform/translateX at all.

- [ ] **Step 3: Update the `<GestureDetector>` wiring** to use the new `panGesture` (same prop, new gesture object from Task 1) — this should be a mechanical swap, the `GestureDetector` itself doesn't change.

- [ ] **Step 4: Update `app/(main)/card.tsx` and `app/tutorial.tsx`** — both currently call `useSwipeCarousel(...)` and pass its return values down to `<DailyCard>`; update both call sites to match the new return shape (no `translateX`/`peekKey` props to pass anymore; `containerWidth` may no longer need computing/passing depending on Task 1 Step 3's resolution — remove `useWindowDimensions()` usage in both files if nothing else in them needs it once this dependency is gone, don't leave a dead import/hook call).

- [ ] **Step 5: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add src/components/daily-card/DailyCard.tsx "app/(main)/card.tsx" app/tutorial.tsx
git commit -m "feat(daily-card): render the fade-based session transition, drop the peek/slide layer"
```

---

## Task 3: Live device verification

- [ ] **Step 1:** Fresh build (iOS simulator first, since it's faster to iterate on — then a real Android rebuild, since this whole redesign was prompted by a real Android device issue and must be confirmed fixed there specifically, not just assumed from the iOS pass).
- [ ] **Step 2:** Confirm a real swipe left/right on the daily card genuinely triggers a quick fade-out-then-fade-in to the correct next/previous session, with NO visible sliding/dragging motion during the gesture itself.
- [ ] **Step 3:** Confirm vertical scrolling of a long exercise list (e.g. Max Fingers) now works cleanly on the SAME real Android device this bug was originally found on — this was the concrete, reported-live bug motivating this whole redesign; do not consider this task done without re-confirming it specifically, not just assuming the activeOffsetX/failOffsetY fix from the prior commit is still sufflicient after this rewrite.
- [ ] **Step 4:** Confirm the existing tap-to-jump paths (a WeekStrip session dot, a session-dot tap, the NEXT chip) all now use the SAME fade transition, not a leftover slide — these all go through `animateTo()`.
- [ ] **Step 5:** Confirm the 1-second stuck-card safety net still works: if `onBrowse` can be made to silently fail (or just reason through the code path since forcing a real failure live may not be practical), confirm the card doesn't get stuck faded-out forever.
- [ ] **Step 6:** Tune `Motion.swipe.fadeOutMs`/`fadeInMs` against how it actually feels on a real device — Oscar's own "just like quickly" is a feel judgment, not a fixed number; adjust if the initial guess (120ms/150ms) feels too slow or too abrupt.

## Self-Review

**Spec coverage:** the core ask (stop the physical drag-follow, replace with a quick fade) is fully addressed by Task 1-2's redesign; the concrete bug that prompted it (vertical scroll blocked on Android) gets an explicit, dedicated re-verification step rather than being assumed fixed as a side effect.

**Placeholder scan:** the draft code in Task 1 has two explicitly-flagged, intentionally-incomplete spots (the `advance`/`panGesture` ordering problem, the `containerWidth`/`200` placeholder) — both are named directly with the exact real fix path to follow, not silently shipped.

**Type consistency:** `useSwipeCarousel`'s new return shape (`{ panGesture, contentOpacity, animateTo, busy }`) is defined once in Task 1 and consumed identically by both `DailyCard.tsx` and its two real callers (`card.tsx`, `tutorial.tsx`) in Task 2 — no task assumes a different shape than Task 1 actually produces.

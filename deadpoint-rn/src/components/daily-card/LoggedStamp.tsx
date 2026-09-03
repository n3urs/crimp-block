/** Port of `loggedStamp(accent:)` and its timing chain in DailyCardView.swift
    (lines 807-836 for the card, 684-718 for the timing). Per the task brief
    (Task 11), browsing onto or reopening an already-logged day never shows
    this — `commit()`'s own comment at DailyCardView.swift:220-242 is
    explicit: "Browsing never shows the big card now, full stop — only a
    fresh DONE (via celebrationTrigger) does." So this component has a
    single trigger signal, not a separately-controlled visibility flag: bump
    `trigger` once per fresh DONE and the whole reveal/hold/dismiss chain
    runs on its own from there.

    This file does NOT position itself over the rest of the card (Swift's
    `.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)`,
    `.offset(x: dragOffset)`, `.allowsHitTesting(false)` at DailyCardView.swift
    :557-570) — that's Task 12's job once DailyCard.tsx exists to host it in.
    `loggedStamp(accent:)` itself has no such positioning either; it's
    applied by its caller, which this component mirrors. */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { Motion } from '../../design/motion';

const easeInOut = Easing.inOut(Easing.ease);

/** Framework-free timing state machine for the celebratory card's reveal/
    hold/dismiss chain (DailyCardView.swift:684-718). Takes a plain
    callback rather than managing React state directly so it's testable
    without a component-rendering harness — LoggedStamp itself wraps this
    in useState/useRef/useEffect. */
export function createLoggedStampTimer(onVisibilityChange: (visible: boolean) => void) {
  let revealTimer: ReturnType<typeof setTimeout> | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function clearAll() {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  }

  function trigger() {
    clearAll(); // cancels BOTH a still-pending reveal and an in-progress hold — the undo-then-relog case this whole timer exists for
    onVisibilityChange(false);
    revealTimer = setTimeout(() => {
      onVisibilityChange(true);
      dismissTimer = setTimeout(() => {
        onVisibilityChange(false);
      }, Motion.loggedStamp.holdMs);
    }, Motion.loggedStamp.delayBeforeShowMs);
  }

  function dispose() {
    clearAll();
  }

  return { trigger, dispose };
}

/** Appends an alpha channel to a 6-digit hex colour string (RN's style
    parser accepts 8-digit #RRGGBBAA hex on both platforms), e.g.
    withAlpha('#F2B134', 0.45) -> '#F2B13473'. No colour library exists in
    this codebase (checked: no tinycolor2/polished/etc in package.json) and
    this is the only place that needs one, so a tiny local helper beats a
    new dependency for a single call site. */
function withAlpha(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const alphaHex = Math.round(clamped * 255).toString(16).padStart(2, '0');
  return `${hex}${alphaHex}`;
}

export interface LoggedStampProps {
  /** Increment (or otherwise change) this once per fresh DONE — mirrors
      Swift's `celebrationTrigger`. Each change restarts the full timing
      chain from the top, cancelling whatever chain was already running. */
  trigger: number;
  accent: string;
  /** null = the TOMORROW section is omitted entirely, not shown empty —
      confirmed: DailyCardView.swift:815 wraps the whole divider/label/name
      block in `if let nextUp`. */
  nextUp: { name: string; colour: string } | null;
}

/** Every dismissal fades — no instant/no-animation case, per Oscar's
    explicit request (this deliberately DIVERGES from the original Swift
    source: DailyCardView.swift:686 resets `showLoggedStamp = false` with
    no `withAnimation` wrapper for the undo-then-relog reset, only
    animating the natural hold-expiry dismiss at :716 — an earlier version
    of this file faithfully ported that same two-speed behaviour via a
    second `instant` flag alongside `visible`. Oscar found the resulting
    hard snap (reachable by undoing, or swapping sessions, while the card
    is still showing) looked broken, so this hook now reports a single
    `visible` boolean and LoggedStamp's own effect always animates the
    `true -> false` transition, whatever caused it. */
function useLoggedStampVisible(trigger: number): boolean {
  const [visible, setVisible] = useState(false);
  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof createLoggedStampTimer> | null>(null);
  if (timerRef.current == null) {
    timerRef.current = createLoggedStampTimer(setVisible);
  }

  useEffect(() => {
    // Swift's own default-false-on-mount, no-celebration-on-initial-render
    // behaviour: the chain only ever restarts on a CHANGE to trigger, never
    // just because the component mounted with whatever trigger happened to
    // start at.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    timerRef.current!.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerRef is a stable ref, not a reactive dep
  }, [trigger]);

  useEffect(() => {
    const timer = timerRef.current!;
    return () => timer.dispose();
  }, []);

  return visible;
}

export function LoggedStamp({ trigger, accent, nextUp }: LoggedStampProps) {
  const visible = useLoggedStampVisible(trigger);
  // Kept mounted for the duration of the fade-out so it can actually
  // animate away instead of vanishing instantly — Swift's conditional `if
  // showLoggedStamp { loggedStamp(...) }` (DailyCardView.swift:557) gets
  // its fade purely from SwiftUI's default-opacity insertion/removal
  // transition on that same insert/remove; unmounting an RN component
  // can't animate its own removal, so this component stays mounted through
  // the fade and only unmounts once it's actually reached opacity 0.
  const [mounted, setMounted] = useState(false);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.value = withTiming(1, { duration: Motion.loggedStamp.fadeInMs, easing: easeInOut });
    } else {
      // Every dismissal fades, including a reset fired mid-hold (undo, or
      // swapping to a different session) — see useLoggedStampVisible's own
      // doc comment for why this used to short-circuit to an instant snap
      // and no longer does.
      opacity.value = withTiming(
        0,
        { duration: Motion.loggedStamp.fadeOutMs, easing: easeInOut },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opacity is a stable shared-value ref, not a reactive dep
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!mounted) return null;

  return (
    <Animated.View
      style={[styles.card, { borderColor: withAlpha(accent, 0.45) }, animatedStyle]}
    >
      <Text style={styles.logged}>LOGGED</Text>
      <Text style={styles.subtitle}>Nice work today.</Text>
      {nextUp != null && (
        <>
          <View style={styles.divider} />
          <Text style={styles.tomorrowLabel}>TOMORROW</Text>
          <Text style={[styles.tomorrowName, { color: nextUp.colour }]}>
            {nextUp.name.toUpperCase()}
          </Text>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 300,
    paddingHorizontal: 28,
    paddingVertical: 24,
    backgroundColor: Colours.s1,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    // Android has no offset/opacity-controlled shadow API to match against
    // 1:1 — elevation is a coarse stand-in for the same visual weight as
    // the iOS spec numbers above. Real cross-platform parity is part of
    // the device verification this file defers to Task 12.
    elevation: 12,
  },
  logged: {
    ...Fonts.heading(38),
    // No design-system token exists for pure white (Colours.fg is an
    // off-white, #EDEBE5) — Swift uses the literal `.white` here too, same
    // as ExerciseRow's title.
    color: '#FFFFFF',
  },
  subtitle: {
    // Swift uses `.system(size: 14)` plain here, not AppFonts — matching
    // SessionDots' nextUpName precedent of a bare fontSize when the Swift
    // source itself skips AppFonts.
    fontSize: 14,
    color: Colours.dim,
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: Colours.s3,
    marginVertical: 6,
  },
  tomorrowLabel: {
    ...Fonts.mono(10, 'bold'),
    color: Colours.faint,
    letterSpacing: 1.2,
  },
  tomorrowName: {
    // Swift uses `.system(size: 17, weight: .bold)` plain here, not
    // AppFonts — same precedent as `subtitle` above.
    fontSize: 17,
    fontWeight: '700',
  },
});

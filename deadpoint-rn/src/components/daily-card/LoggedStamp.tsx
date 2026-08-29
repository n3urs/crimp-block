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
      }, 2500);
    }, 1000);
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

/** { visible, instant } rather than a bare boolean: `instant` tells
    LoggedStamp whether the CURRENT false is the chain's step-1 reset
    (Swift's plain `showLoggedStamp = false`, not wrapped in
    `withAnimation` — DailyCardView.swift:686) or the natural hold-expiry
    dismiss (Swift's `withAnimation(.easeInOut(duration: 0.4)) {
    showLoggedStamp = false }` — DailyCardView.swift:716). Both call the
    exact same `onVisibilityChange(false)` inside createLoggedStampTimer,
    so the two are told apart here, not there: `isRetriggering` is true only
    while this hook's own effect is synchronously inside its `.trigger()`
    call (the reset always fires synchronously, right there), and false for
    the dismissTimer's callback, which always fires later from its own
    setTimeout, well outside that effect. Getting this right matters
    because the brief's "hide immediately (no animation)" for step 1 is
    exactly the undo-then-relog case Test 3 (loggedStamp.test.ts) exists
    for — an animated fade there would leave the outgoing card visibly
    lingering under the new one's own 1000ms pre-reveal delay. */
function useLoggedStampTiming(trigger: number): { visible: boolean; instant: boolean } {
  const [state, setState] = useState<{ visible: boolean; instant: boolean }>({
    visible: false,
    instant: true,
  });
  const isRetriggering = useRef(false);
  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof createLoggedStampTimer> | null>(null);
  if (timerRef.current == null) {
    timerRef.current = createLoggedStampTimer((visible) => {
      setState({ visible, instant: !visible && isRetriggering.current });
    });
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
    isRetriggering.current = true;
    timerRef.current!.trigger();
    isRetriggering.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerRef is a stable ref, not a reactive dep
  }, [trigger]);

  useEffect(() => {
    const timer = timerRef.current!;
    return () => timer.dispose();
  }, []);

  return state;
}

export function LoggedStamp({ trigger, accent, nextUp }: LoggedStampProps) {
  const { visible, instant } = useLoggedStampTiming(trigger);
  // Kept mounted for the duration of the 400ms fade-out so it can actually
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
    } else if (instant) {
      opacity.value = 0;
      setMounted(false);
    } else {
      opacity.value = withTiming(
        0,
        { duration: Motion.loggedStamp.fadeOutMs, easing: easeInOut },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opacity is a stable shared-value ref, not a reactive dep
  }, [visible, instant]);

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

/** Port of `sessionDots`/`nextUp` in DailyCardView.swift (lines 733-796).
    In Swift this is a single computed `View` with two collaborating
    pieces (the per-session dot row and the "up next" chip); this file
    keeps them together the same way rather than splitting into two
    exported components, since neither one is meaningfully reusable on
    its own and the brief's Interfaces section describes a single
    `SessionDots` component.

    This component does NOT resolve colours, does NOT know which session
    is "current" vs "recommended" (the caller passes already-resolved
    `currentKey`/`recommendedKey`/`nextUp`), and does NOT own browsing —
    tapping a dot or the next-up chip both just call `onTapSession`, which
    the caller wires to Task 9's `useSwipeCarousel().animateTo` (Swift's
    `animatedBrowse(to:)`, called from both tap sites identically at
    DailyCardView.swift:741 and :775). Wiring that real hook up is Task
    12's job, not this one — see the task brief. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { SESSION_ORDER } from '../../engine';

export interface SessionDotsProps {
  /** Swift's `effectiveDisplayKey`. */
  currentKey: string;
  /** Swift's `state.decision.k`, but only when `!todayIsLogged` — the
      caller resolves that condition; this prop is just the
      already-resolved key, or null. */
  recommendedKey: string | null;
  /** Resolves a session key's accent colour, e.g. via
      `resolveColour(bridge.sessionColourVarName(key))`. */
  sessionColour: (key: string) => string;
  /** Swift's `nextUp` computed property (`state.bridge.upNext()` +
      `sessionInfo()`) — the caller resolves this, not the component. */
  nextUp: { key: string; name: string; colour: string } | null;
  /** = Task 9's `useSwipeCarousel().animateTo`. Called for both a dot tap
      and the next-up chip tap, exactly as Swift's single
      `animatedBrowse(to:)` call site is shared by both. */
  onTapSession: (key: string) => void;
}

const DOT_TAP_SIZE = 22;
const INNER_SIZE = 14;
const DOT_BORDER_WIDTH = 1.5;
const NEXT_UP_DOT_SIZE = 7;

/** SessionDots only ever receives raw session keys ("maxFingers",
    "climbHard"), never the human-readable names `engine.sessionInfo()`
    resolves elsewhere (see this file's own top comment: it deliberately
    doesn't know session names) — this is a screen-reader-only label, not
    a change to anything visible, so a plain camelCase splitter is enough
    to make each dot announce something a VoiceOver/TalkBack user can act
    on ("maxFingers" -> "Max Fingers") without threading a new name prop
    through every caller. */
function humanizeSessionKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function SessionDots({
  currentKey,
  recommendedKey,
  sessionColour,
  nextUp,
  onTapSession,
}: SessionDotsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.dotsGroup}>
        {SESSION_ORDER.map((key) => {
          const colour = sessionColour(key);
          const isCurrent = key === currentKey;
          const isRecommended = key === recommendedKey;
          return (
            <Pressable
              key={key}
              onPress={() => onTapSession(key)}
              hitSlop={4}
              style={styles.dotTapTarget}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent }}
              accessibilityLabel={`${humanizeSessionKey(key)} session${isRecommended ? ', recommended today' : ''}`}
            >
              {/* Recommendation ring: a separate, wider circle rendered
                  BEHIND the inner circle — declared first so the inner
                  circle (declared second) paints on top of it. */}
              {isRecommended && (
                <View style={[styles.recRing, { borderColor: colour }]} />
              )}
              <View
                style={[
                  styles.innerCircle,
                  {
                    borderColor: isCurrent ? colour : Colours.s4,
                    backgroundColor: isCurrent ? colour : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Swift's `Spacer(minLength: 0)` between the dot group and the
          next-up chip — always present, pushes the chip to the far
          right whether or not the chip itself is rendered. */}
      <View style={styles.spacer} />

      {nextUp != null && (
        <Pressable
          onPress={() => onTapSession(nextUp.key)}
          style={styles.nextUp}
          accessibilityRole="button"
          accessibilityLabel={`Next up: ${nextUp.name}`}
        >
          <View style={styles.nextUpTopRow}>
            <Text style={styles.nextUpLabel}>NEXT</Text>
            <View style={[styles.nextUpDot, { backgroundColor: nextUp.colour }]} />
          </View>
          <Text style={styles.nextUpName} numberOfLines={2}>
            {nextUp.name.toUpperCase()}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  spacer: {
    flex: 1,
  },
  dotTapTarget: {
    width: DOT_TAP_SIZE,
    height: DOT_TAP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recRing: {
    position: 'absolute',
    width: DOT_TAP_SIZE,
    height: DOT_TAP_SIZE,
    borderRadius: DOT_TAP_SIZE / 2,
    borderWidth: DOT_BORDER_WIDTH,
  },
  innerCircle: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    borderWidth: DOT_BORDER_WIDTH,
  },
  nextUp: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  nextUpTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextUpLabel: {
    ...Fonts.mono(9, 'medium'),
    color: Colours.faint,
  },
  nextUpDot: {
    width: NEXT_UP_DOT_SIZE,
    height: NEXT_UP_DOT_SIZE,
    borderRadius: NEXT_UP_DOT_SIZE / 2,
  },
  nextUpName: {
    // Swift uses `.system(size: 13.5, weight: .bold)` here, NOT
    // AppFonts.mono — matching ExerciseRow's precedent of a plain
    // fontSize/fontWeight pair (not a Fonts.* token) whenever the Swift
    // source itself skips AppFonts.
    fontSize: 13.5,
    fontWeight: '700',
    color: Colours.dim,
    textAlign: 'right',
  },
});

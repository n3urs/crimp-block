// src/components/timers/RestTimerOverlay.tsx
/** Direct port of ios/CrimpBlock/RestTimerOverlay.swift — a full-width bar
    fixed to the bottom: a 3px progress strip flush with the top edge,
    then a big countdown number and a text "Stop" button. No exercise
    name label between them (dropped in the Swift original per feedback —
    the number and Stop are all that's needed, the exercise is still
    right there on the card underneath).

    Plain conditional mount/unmount — no slide animation. This used to
    animate in/out with react-native-reanimated's entering/exiting props
    (SlideInDown/SlideOutDown), but a real Android tester got stuck mid-
    tutorial: the tap that starts the timer genuinely ran (confirmed by
    the tutorial step itself advancing to "tap STOP", which only happens
    from the same code path as starting the timer), yet this overlay
    never became visible, leaving no STOP button and the DONE button as
    the only thing left to tap. This is the only place in the app that
    used entering/exiting — every other conditional overlay (see
    IntervalTimerView's own doc comment) already snaps in/out with a bare
    conditional render, which is the fallback this file's own comment
    already described before this fix. Losing a 200ms slide is a much
    smaller cost than a tester getting stuck with no way to proceed. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { fraction, formatCountdown } from './restTimerLogic';
import type { RestTimerState } from './useRestTimer';
import { useTutorialTarget } from '../tutorial/TutorialTargetContext';

export interface RestTimerOverlayProps {
  state: RestTimerState;
  onStop: () => void;
}

export function RestTimerOverlay({ state, onStop }: RestTimerOverlayProps) {
  const frac = fraction(state.remainingSeconds, state.totalSeconds);
  const stopRef = useTutorialTarget('restTimerStop');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${frac * 100}%`, backgroundColor: state.accent }]} />
      </View>
      <View style={[styles.row, { paddingBottom: 16 + insets.bottom }]}>
        <Text style={styles.restLabel}>REST</Text>
        <View style={styles.spacer} />
        <Text style={[styles.countdown, { color: state.accent }]}>{formatCountdown(state.remainingSeconds)}</Text>
        <View style={styles.spacer} />
        <Pressable ref={stopRef} onPress={onStop} style={styles.stopButton} accessibilityRole="button" accessibilityLabel="Stop rest timer">
          <Text style={styles.stopButtonText}>STOP</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colours.s1,
    borderTopWidth: 1, borderTopColor: Colours.s3,
  },
  progressTrack: { height: 3, width: '100%', backgroundColor: 'transparent' },
  progressFill: { height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  spacer: { flex: 1 },
  restLabel: {
    ...Fonts.mono(11, 'bold'),
    color: Colours.faint,
    letterSpacing: 1.5,
  },
  countdown: { ...Fonts.timerDigits(44) },
  stopButton: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 3,
    borderWidth: 1, borderColor: Colours.s3,
  },
  stopButtonText: { ...Fonts.mono(13, 'semibold'), color: Colours.dim },
});

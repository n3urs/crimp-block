// src/components/timers/RestTimerOverlay.tsx
/** Direct port of ios/CrimpBlock/RestTimerOverlay.swift — a full-width bar
    fixed to the bottom: a 3px progress strip flush with the top edge,
    then a big countdown number and a text "Stop" button. No exercise
    name label between them (dropped in the Swift original per feedback —
    the number and Stop are all that's needed, the exercise is still
    right there on the card underneath).

    Slide-up/down on mount/unmount uses react-native-reanimated's
    entering/exiting props — the RN equivalent of Swift's
    `.transition(.move(edge: .bottom))` + `.animation(.easeInOut(duration: 0.2))`
    around the conditional `if restTimer.endDate != nil`. A bare
    conditional render with no entering/exiting animation snaps instantly
    either way, same as Swift's own comment about a bare `if` with no
    transition. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { Motion } from '../../design/motion';
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

  return (
    <Animated.View
      entering={SlideInDown.duration(Motion.restOverlaySlideMs)}
      exiting={SlideOutDown.duration(Motion.restOverlaySlideMs)}
      style={styles.root}
    >
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${frac * 100}%`, backgroundColor: state.accent }]} />
      </View>
      <View style={styles.row}>
        <Text style={styles.restLabel}>REST</Text>
        <View style={styles.spacer} />
        <Text style={[styles.countdown, { color: state.accent }]}>{formatCountdown(state.remainingSeconds)}</Text>
        <View style={styles.spacer} />
        <Pressable ref={stopRef} onPress={onStop} style={styles.stopButton} accessibilityRole="button" accessibilityLabel="Stop rest timer">
          <Text style={styles.stopButtonText}>STOP</Text>
        </Pressable>
      </View>
    </Animated.View>
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

// src/components/timers/IntervalTimerView.tsx
/** Direct port of ios/CrimpBlock/IntervalTimerView.swift — full-screen
    traffic-light timer (ready=amber, hang/on=green, rest/off=red), huge
    countdown, status line, pause/stop/mute. Presented full-screen since
    this is meant to run unattended while hanging off a board looking at
    your hand, not glancing at a small in-card widget — same reasoning as
    the Swift source's own doc comment.

    No onDismiss prop, unlike Swift's IntervalTimerView (which needs one
    because SwiftUI's .fullScreenCover is driven by a separate boolean
    that has to be told to flip back false). Here, this component only
    ever renders while `state` is non-null, and useIntervalTimer.ts's own
    stop()/finish()-then-auto-clear already null the state out — the
    parent unmounting this component on the next render IS the dismissal,
    no separate signal needed.

    No icon library exists in this project (confirmed: no
    @expo/vector-icons anywhere under src/) — same "dependency-free
    stand-in" precedent as ExerciseRow's InfoIcon/DailyCard's BookIcon.
    The done checkmark reuses ExerciseRow's own plain "✓" glyph technique
    (a real U+2713 character, not emoji-presentation, so `color` styling
    actually applies to it). The mute toggle and pause/stop controls are
    plain text buttons, matching this screen's own existing button
    language (PAUSE/STOP are already text, not icons, in the Swift
    original) rather than inventing new bespoke speaker-icon glyphs. */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { Motion } from '../../design/motion';
import type { IntervalTimerState } from './useIntervalTimer';

export interface IntervalTimerViewProps {
  state: IntervalTimerState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

function phaseColour(phase: IntervalTimerState['phase']): string {
  switch (phase) {
    case 'ready': return Colours.readyC;
    case 'on': return Colours.go;
    case 'off':
    case 'setrest':
      return Colours.restC;
    case 'done': return Colours.go;
  }
}

function fmt(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export function IntervalTimerView({ state, onPause, onResume, onStop, onToggleMute }: IntervalTimerViewProps) {
  // View-only smoothing ticker, separate from useIntervalTimer's own
  // 200ms phase-advance ticker (Motion.intervalControllerTickMs) — exact
  // same split as IntervalTimerView.swift's own `tick` (every: 0.05)
  // vs. IntervalTimerController's `Timer.scheduledTimer(withTimeInterval: 0.2...)`.
  // remainingSeconds only changes once a whole second, which would make
  // the progress bar visibly step rather than drain continuously; this
  // recomputes sub-second precision from phaseEndMs instead.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), Motion.intervalTickMs);
    return () => clearInterval(id);
  }, []);

  const smoothFraction = (() => {
    if (state.totalSeconds <= 0) return 0;
    if (state.isPaused || state.phaseEndMs == null) {
      return state.remainingSeconds / state.totalSeconds;
    }
    const remaining = Math.max(0, (state.phaseEndMs - now) / 1000);
    return Math.min(1, remaining / state.totalSeconds);
  })();

  const bg = phaseColour(state.phase);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={styles.content}>
        {state.phase === 'done' ? (
          <View style={styles.doneCircle}>
            <Text style={styles.doneCheck}>✓</Text>
          </View>
        ) : (
          <Text style={styles.countdown} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {fmt(state.remainingSeconds)}
          </Text>
        )}

        <Text style={styles.status}>{state.isPaused ? 'PAUSED' : state.statusText}</Text>
        <Text style={styles.label}>{state.label}</Text>

        {state.phase !== 'done' && (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${smoothFraction * 100}%` }]} />
            </View>
            <View style={styles.buttonRow}>
              <Pressable
                onPress={state.isPaused ? onResume : onPause}
                style={styles.pillButton}
                accessibilityRole="button"
                accessibilityLabel={state.isPaused ? 'Resume interval timer' : 'Pause interval timer'}
              >
                <Text style={styles.pillButtonText}>{state.isPaused ? 'RESUME' : 'PAUSE'}</Text>
              </Pressable>
              <Pressable
                onPress={onStop}
                style={styles.pillButton}
                accessibilityRole="button"
                accessibilityLabel="Stop interval timer"
              >
                <Text style={styles.pillButtonText}>STOP</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {state.phase !== 'done' && (
        <Pressable
          onPress={onToggleMute}
          style={styles.muteButton}
          accessibilityRole="button"
          accessibilityLabel={state.isMuted ? 'Unmute timer cues' : 'Mute timer cues'}
        >
          <Text style={styles.muteButtonText}>{state.isMuted ? 'UNMUTE' : 'MUTE'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', alignItems: 'center', gap: 18, paddingHorizontal: 24 },
  countdown: { ...Fonts.timerDigits(168), color: '#FFFFFF' },
  doneCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  doneCheck: { fontSize: 56, fontWeight: '700', color: '#FFFFFF' },
  status: {
    ...Fonts.mono(15, 'bold'),
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  label: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  progressTrack: {
    width: '100%', height: 5, borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 8,
  },
  progressFill: { height: '100%', backgroundColor: '#FFFFFF' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  pillButton: {
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pillButtonText: { ...Fonts.mono(13, 'bold'), color: '#FFFFFF' },
  muteButton: {
    position: 'absolute', top: 16, right: 16,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  muteButtonText: { ...Fonts.mono(11, 'bold'), color: '#FFFFFF' },
});

/** A +/- stepper button that keeps going while it is held down. Used by
    both weight editors (weight-edit.tsx, weights-edit.tsx) so the two
    cannot drift apart in feel. See holdRepeat.ts for the timings and why
    holding exists at all.

    Deliberately NOT using setInterval: the gap between repeats changes as
    the hold goes on, so each repeat schedules the next one with its own
    delay, read from repeatIntervalMs(). One timer is live at a time, and
    releasing (or the component unmounting mid-hold) clears it. */
import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colours } from '../../design/colours';
import { HAPTIC_MIN_GAP_MS, HOLD_START_MS, repeatIntervalMs } from './holdRepeat';

export function StepperButton({
  glyph,
  onStep,
  accessibilityLabel,
  size = 56,
}: {
  /** '+' or '−' (U+2212, not a hyphen — it matches the digits' width). */
  glyph: string;
  /** Called once per step: on press, then repeatedly while held. */
  onStep: () => void;
  accessibilityLabel: string;
  /** weights-edit.tsx stacks one of these per item and uses 48; the
      single-weight screen has the room for the default. Never below 44. */
  size?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const lastHapticRef = useRef(0);
  // The latest onStep, read at fire time. Without this the timer chain
  // would keep calling the closure it was created with, whose captured
  // setState updater is fine, but whose `item`/`index` bindings in
  // weights-edit.tsx would go stale across a re-render mid-hold.
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  /** A tick per step, but not at the top speed's 24 a second — that is a
      buzz, not a count. Throttled to HAPTIC_MIN_GAP_MS so the feel stays a
      run of distinct taps however fast the number is moving. Fire and
      forget: the engine is unavailable on a simulator and on some Android
      hardware, and a missing tick must never interrupt the count. */
  const step = useCallback(() => {
    onStepRef.current();
    const now = Date.now();
    if (now - lastHapticRef.current >= HAPTIC_MIN_GAP_MS) {
      lastHapticRef.current = now;
      Haptics.selectionAsync().catch(() => {});
    }
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // A hold that outlives its screen (closing the modal mid-press) would
  // otherwise keep firing into an unmounted component's setState.
  useEffect(() => clear, [clear]);

  const scheduleNext = useCallback(() => {
    const held = Date.now() - startedAtRef.current;
    timerRef.current = setTimeout(() => {
      step();
      scheduleNext();
    }, repeatIntervalMs(held));
  }, [step]);

  const onPressIn = useCallback(() => {
    clear();
    startedAtRef.current = Date.now();
    // The first step lands immediately, so a tap still feels like a tap.
    // Its tick is unconditional — a deliberate press always answers, even
    // if the last one was moments ago.
    lastHapticRef.current = 0;
    step();
    timerRef.current = setTimeout(() => {
      step();
      scheduleNext();
    }, HOLD_START_MS);
  }, [clear, scheduleNext, step]);

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={clear}
      // Cancels the run when a drag leaves the button, which otherwise
      // fires onPressOut late or not at all on Android.
      onTouchCancel={clear}
      style={({ pressed }) => [styles.button, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.buttonPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.glyph, { fontSize: size * 0.5 }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colours.s2,
    alignItems: 'center', justifyContent: 'center',
  },
  // Held buttons stay visibly lit for the whole run, so it is obvious
  // which direction is currently counting.
  buttonPressed: { backgroundColor: Colours.s3 },
  glyph: { fontWeight: '700', color: Colours.fg },
});

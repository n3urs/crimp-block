/** Direct port of ExerciseRowView in DailyCardView.swift (lines 1100-1434).
    Every size/colour/spacing value below is taken from that source and is
    load-bearing — see the Task 7 spec table. Three things are deliberately
    NOT here (see the task brief's "Explicitly out of scope" section):
      · the sets tally (Task 8's SetsTally)
      · real rest/interval timer behaviour (a later, not-yet-written phase —
        onTapRest/onStartInterval are safe no-op callbacks until then)
      · tutorial-target signalling (not yet built) */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { Motion } from '../../design/motion';
import type { IntervalConfig, RenderedExercise } from '../../engine/types';
import { clarifySets } from './clarifySets';

export interface ExerciseRowProps {
  ex: RenderedExercise;
  /** Resolved session accent colour (already run through resolveColour). */
  accent: string;
  /** The raw `--name` accent variable. Not consumed by this component today
      — Swift's sibling uses it to resolve a hex string for the real rest
      timer's UI (`SessionColours.hex(accentVarName)`), which doesn't exist
      yet here (see onTapRest below). Kept on the props contract so a future
      timers task can wire it through without changing this component's
      interface. */
  accentVarName: string;
  isTicked: boolean;
  onToggleTick?: (id: string) => void;
  onTapWeight?: (ex: RenderedExercise) => void;
  /** Called with ex.restSeconds when the Rest button is pressed. No real
      timer controller exists yet — an absent callback is a normal no-op,
      not a reason to hide or disable the button. */
  onTapRest?: (seconds: number) => void;
  /** Called with ex.interval when START is pressed. Same no-op contract as
      onTapRest above. */
  onStartInterval?: (interval: IntervalConfig) => void;
}

const easeInOut = Easing.inOut(Easing.ease);

function formatWeightKg(kg: number): string {
  // 0-2 decimal places, trailing zeros trimmed. Rounding to 2dp and letting
  // JS's own number->string coercion drop insignificant trailing zeros
  // mirrors Swift's `.formatted(.number.precision(.fractionLength(0...2)))`
  // exactly: 22.5 -> "22.5", 20 -> "20", 20.004 -> "20" (rounds first).
  const rounded = Math.round(kg * 100) / 100;
  return `${rounded}kg`;
}

function formatRestLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `Rest ${mins}:${String(secs).padStart(2, '0')}`;
}

/** Dependency-free stand-in for SF Symbols' "info.circle" — no icon font is
    part of this codebase yet (checked: no @expo/vector-icons, no other icon
    usage anywhere under src/). A bordered circle with a lowercase "i" reads
    the same at this size without introducing a new dependency mid-port. */
function InfoIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.75, lineHeight: size * 0.85, color, fontWeight: '700' }}>
        i
      </Text>
    </View>
  );
}

export function ExerciseRow({
  ex,
  accent,
  accentVarName: _accentVarName,
  isTicked,
  onToggleTick,
  onTapWeight,
  onTapRest,
  onStartInterval,
}: ExerciseRowProps) {
  const [showDetail, setShowDetail] = useState(false);

  // Row padding: 16 unticked -> 11 ticked, animated easeInOut 200ms
  // (Motion.tickCollapseMs), matching Swift's
  // `.animation(.easeInOut(duration: 0.2), value: isTicked)`.
  const paddingV = useSharedValue(isTicked ? 11 : 16);
  useEffect(() => {
    paddingV.value = withTiming(isTicked ? 11 : 16, {
      duration: Motion.tickCollapseMs,
      easing: easeInOut,
    });
  }, [isTicked, paddingV]);
  const rowAnimatedStyle = useAnimatedStyle(() => ({
    paddingVertical: paddingV.value,
  }));

  // Description fade on info-toggle: easeInOut 150ms (Motion.infoToggleMs),
  // matching Swift's `withAnimation(.easeInOut(duration: 0.15))` around
  // `showDetail.toggle()` plus its `.transition(.opacity)`. The description
  // is only mounted while showDetail is true (see the JSX below), so this
  // animates the fade-IN; hiding it is an instant unmount rather than a
  // fade-out. Judgment call: an always-mounted, opacity-only fade would
  // leave dead reserved space under the title while collapsed (SwiftUI's
  // .transition(.opacity) collapses layout on exit too, which a bare
  // opacity animation on an always-mounted RN View does not), and that
  // visible gap seemed the worse trade-off of the two.
  const descOpacity = useSharedValue(0);
  useEffect(() => {
    if (showDetail) {
      descOpacity.value = 0;
      descOpacity.value = withTiming(1, {
        duration: Motion.infoToggleMs,
        easing: easeInOut,
      });
    }
  }, [showDetail, descOpacity]);
  const descAnimatedStyle = useAnimatedStyle(() => ({ opacity: descOpacity.value }));

  const showRight = !isTicked;

  return (
    <Animated.View style={[styles.row, rowAnimatedStyle]}>
      {onToggleTick && (
        <Pressable
          onPress={() => onToggleTick(ex.id)}
          hitSlop={8}
          style={styles.checkboxPressable}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isTicked }}
          accessibilityLabel={isTicked ? `Mark ${ex.title} as not done` : `Mark ${ex.title} as done`}
        >
          <View style={[styles.checkbox, isTicked && { backgroundColor: accent, borderColor: 'transparent' }]}>
            {isTicked && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </Pressable>
      )}

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleGroup}>
            <Text
              style={[styles.title, isTicked && styles.titleTicked]}
              numberOfLines={3}
            >
              {ex.title.toUpperCase()}
            </Text>
            {showRight && ex.description != null && (
              <Pressable
                onPress={() => setShowDetail((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ expanded: showDetail }}
                accessibilityLabel={showDetail ? `Hide description for ${ex.title}` : `Show description for ${ex.title}`}
              >
                <InfoIcon color={Colours.faint} />
              </Pressable>
            )}
          </View>

          {showRight && (
            <View style={styles.rightGroup}>
              <Text
                style={[
                  styles.prescription,
                  { color: ex.phaseAdjusted ? accent : Colours.faint },
                ]}
                numberOfLines={2}
              >
                {clarifySets(ex.prescription)}
              </Text>
              {ex.weightKg != null ? (
                <WeightBadge
                  label={formatWeightKg(ex.weightKg)}
                  colour={ex.weightIsBump ? accent : Colours.dim}
                  onPress={onTapWeight ? () => onTapWeight(ex) : undefined}
                  accessibilityLabel={`Edit recorded weight for ${ex.title}, currently ${formatWeightKg(ex.weightKg)}`}
                />
              ) : ex.hasWeightTracking ? (
                <SetWeightBadge
                  onPress={onTapWeight ? () => onTapWeight(ex) : undefined}
                  accessibilityLabel={`Set weight for ${ex.title}`}
                />
              ) : null}
            </View>
          )}
        </View>

        {showRight && ex.description != null && showDetail && (
          <Animated.View style={descAnimatedStyle}>
            <Text style={styles.description}>{ex.description}</Text>
          </Animated.View>
        )}

        {showRight && ex.interval != null ? (
          <Pressable
            onPress={() => onStartInterval?.(ex.interval as IntervalConfig)}
            style={[styles.startButton, { backgroundColor: accent }]}
            accessibilityRole="button"
            accessibilityLabel={`Start interval timer for ${ex.title}`}
          >
            <Text style={styles.startButtonText}>START</Text>
          </Pressable>
        ) : showRight && ex.restSeconds != null ? (
          <Pressable
            onPress={() => onTapRest?.(ex.restSeconds as number)}
            style={styles.restButton}
            accessibilityRole="button"
            accessibilityLabel={`Start rest timer for ${ex.title}`}
          >
            <Text style={styles.restButtonText}>{formatRestLabel(ex.restSeconds)}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

function WeightBadge({
  label,
  colour,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  colour: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <View style={styles.weightBadge}>
      <Text style={[styles.weightBadgeText, { color: colour }]}>{label}</Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {content}
    </Pressable>
  ) : content;
}

function SetWeightBadge({ onPress, accessibilityLabel }: { onPress?: () => void; accessibilityLabel?: string }) {
  const content = (
    <View style={styles.setWeightBadge}>
      <Text style={[styles.weightBadgeText, { color: Colours.faint }]}>SET kg</Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {content}
    </Pressable>
  ) : content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    width: '100%',
  },
  checkboxPressable: {
    paddingTop: 1,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: Colours.s4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 13,
    fontWeight: '700',
    color: Colours.bg,
  },
  content: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '700',
    // No design-system token exists for pure white (Colours.fg is an
    // off-white, #EDEBE5) — Swift uses the literal `.white` here too.
    color: '#FFFFFF',
  },
  titleTicked: {
    color: Colours.faint,
    textDecorationLine: 'line-through',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  prescription: {
    ...Fonts.mono(12, 'medium'),
    textAlign: 'right',
  },
  weightBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colours.s3,
  },
  setWeightBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colours.s4,
    borderStyle: 'dashed',
  },
  weightBadgeText: {
    ...Fonts.mono(12, 'bold'),
  },
  description: {
    fontSize: 12.5,
    color: Colours.dim,
  },
  restButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colours.s3,
  },
  restButtonText: {
    ...Fonts.mono(10.5, 'medium'),
    color: Colours.dim,
  },
  startButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
  },
  startButtonText: {
    ...Fonts.mono(10.5, 'semibold'),
    color: Colours.bg,
  },
});

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
import type { RenderedExercise } from '../../engine/types';
import { clarifySets } from './clarifySets';
import { useTutorialTarget } from '../tutorial/TutorialTargetContext';
import { usePrefs } from '../../data/prefs';
import { SetsTally, totalSetsFor } from './SetsTally';

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
  /** Called with the whole exercise when the Rest button is pressed —
      starting a real timer needs ex.title and ex.restSeconds, not just
      the raw seconds this used to pass (matches onTapWeight's own
      whole-exercise shape above). An absent callback is a normal no-op,
      not a reason to hide or disable the button. */
  onTapRest?: (ex: RenderedExercise) => void;
  /** Called with the whole exercise when START is pressed — starting the
      interval timer needs ex.title, ex.restSeconds (used as setRestSecs),
      and ex.prescription (to derive the set count), not just ex.interval
      alone. Same no-op contract as onTapRest above. */
  onStartInterval?: (ex: RenderedExercise) => void;
  /** Called with the whole exercise whenever the info icon is tapped, IN
      ADDITION TO this component's own internal show/hide-description
      toggle below — purely additive, so an absent callback (the case for
      every caller today except the tutorial host) leaves behavior 100%
      unchanged. Exists so a parent can observe a genuine tap on the real
      info icon without this component faking or skipping that tap. */
  onTapInfo?: (ex: RenderedExercise) => void;
  /** Only `app/tutorial.tsx` sets this — see DailyCardProps' own doc
      comment on the same-named prop for the full reasoning. When set,
      ONLY the row whose `ex.id` matches registers 'weightBadge'/
      'restTimerButton' with the tutorial's shared target registry; every
      other row passes `null` (a genuine no-op — TutorialTargetContext's
      own hook already treats a null id that way) instead of the fixed
      literal id it used to always pass. Left undefined (every real
      caller) this changes nothing: registration outside a
      TutorialTargetProvider is already a no-op regardless of which id is
      passed. */
  tutorialSpotlightExerciseId?: string | null;
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
  onTapInfo,
  tutorialSpotlightExerciseId,
}: ExerciseRowProps) {
  const [showDetail, setShowDetail] = useState(false);
  const infoRef = useTutorialTarget('exerciseInfo');
  const tickRef = useTutorialTarget('exerciseTick');
  // weightBadge/restTimerButton are gated on tutorialSpotlightExerciseId
  // (see ExerciseRowProps' own doc comment) — exerciseInfo/exerciseTick
  // above are NOT, because every real exercise in the tutorial's demo
  // session has a description and a checkbox, so "whichever row mounts
  // last wins" was never actually wrong for those two: the tutorial's own
  // copy for those steps ("every exercise...", "check exercises off...")
  // never claimed a SPECIFIC exercise the way steps 5/6's "it"/"here" do.
  const isTutorialSpotlight = tutorialSpotlightExerciseId != null && ex.id === tutorialSpotlightExerciseId;
  const weightRef = useTutorialTarget(isTutorialSpotlight ? 'weightBadge' : null);
  const restTimerButtonRef = useTutorialTarget(isTutorialSpotlight ? 'restTimerButton' : null);

  const { setsCounterEnabled, autoStartRestOnTally } = usePrefs();
  // totalSetsFor's own parameter type requires `interval` present (typed
  // `unknown`, not `unknown | undefined`) — RenderedExercise.interval is
  // optional (`interval?: IntervalConfig`), so passing `ex` directly fails
  // tsc (a real mismatch between the brief's example call and the actual
  // current RenderedExercise type, confirmed by running tsc, not assumed).
  // A small object literal always has the key present, satisfying the
  // required-property check without changing SetsTally.tsx (out of scope
  // for this task) or widening its exported signature.
  const totalSets = totalSetsFor({ prescription: ex.prescription, interval: ex.interval });
  const [completedSets, setCompletedSets] = useState(0);

  // Mirrors Swift's `.onChange(of: isTicked) { completedSets = newValue ? totalSets : 0 }`
  // (DailyCardView.swift:1307-1310) — keeps the tally in sync with whichever
  // side actually changed isTicked: filling every pip auto-ticks (see
  // handleTallyTap below), but the checkbox itself is still tappable
  // directly too, bypassing the tally entirely, and an external Undo can
  // flip isTicked back to false. Either direction, the tally must reflect
  // reality: full when done, reset to zero the moment it isn't.
  useEffect(() => {
    if (totalSets == null) return;
    setCompletedSets(isTicked ? totalSets : 0);
  }, [isTicked, totalSets]);

  // Mirrors Swift's tapTally(totalSets:) (DailyCardView.swift:1373-1386).
  // Reuses onTapRest — the SAME callback the row's own Rest button already
  // calls — rather than duplicating rest-timer-start logic here; confirmed
  // real at the real call site: app/(main)/card.tsx's handleTapRest does
  // exactly `restTimer.start(ex.restSeconds, ex.title, accent)`, guarded on
  // ex.restSeconds != null, matching Swift's own restTimer.start(...) call
  // inside tapTally exactly.
  const handleTallyTap = () => {
    if (totalSets == null) return;
    if (completedSets >= totalSets) return; // already full — row will have collapsed via the tick below anyway
    const next = completedSets + 1;
    setCompletedSets(next);
    if (autoStartRestOnTally && ex.restSeconds != null) {
      onTapRest?.(ex);
    }
    if (next >= totalSets && !isTicked) {
      onToggleTick?.(ex.id);
    }
  };

  // Mirrors Swift's undoLastSet() (DailyCardView.swift:1393-1398). No return
  // value needed here (unlike Swift's `-> Bool`) — SetsTallyProps.onLongPressUndo
  // is typed `() => void`, and SetsTally.tsx's OWN internal suppressNextTap
  // handling already fully owns the "don't let the long-press's release also
  // fire a tap" concern (see that file's own doc comment) — this callback's
  // only job is the state change itself.
  const handleTallyUndo = () => {
    setCompletedSets((c) => Math.max(0, c - 1));
  };

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
          ref={tickRef}
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
                ref={infoRef}
                onPress={() => {
                  setShowDetail((v) => !v);
                  onTapInfo?.(ex);
                }}
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
                  ref={weightRef}
                  label={formatWeightKg(ex.weightKg)}
                  // Both a real progression bump and a weight carried over
                  // from an earlier phase (see RenderedExercise.weightIsCarriedOver's
                  // own doc comment) get the same accent highlight — the
                  // point of the colour is "look at this number," which is
                  // true either way, even though the two mean different
                  // things underneath.
                  colour={ex.weightIsBump || ex.weightIsCarriedOver ? accent : Colours.dim}
                  onPress={onTapWeight ? () => onTapWeight(ex) : undefined}
                  accessibilityLabel={`Edit recorded weight for ${ex.title}, currently ${formatWeightKg(ex.weightKg)}`}
                />
              ) : ex.hasWeightTracking ? (
                <SetWeightBadge
                  ref={weightRef}
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

        {showRight && setsCounterEnabled && totalSets != null && (
          <SetsTally
            totalSets={totalSets}
            completedSets={completedSets}
            accent={accent}
            onTap={handleTallyTap}
            onLongPressUndo={handleTallyUndo}
          />
        )}

        {showRight && ex.interval != null ? (
          <Pressable
            onPress={() => onStartInterval?.(ex)}
            style={[styles.startButton, { backgroundColor: accent }]}
            accessibilityRole="button"
            accessibilityLabel={`Start interval timer for ${ex.title}`}
          >
            <Text style={styles.startButtonText}>START</Text>
          </Pressable>
        ) : showRight && ex.restSeconds != null ? (
          <Pressable
            ref={restTimerButtonRef}
            onPress={() => onTapRest?.(ex)}
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
  ref,
  label,
  colour,
  onPress,
  accessibilityLabel,
}: {
  ref?: React.RefObject<View | null>;
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
    <Pressable ref={ref} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {content}
    </Pressable>
  ) : content;
}

function SetWeightBadge({
  ref,
  onPress,
  accessibilityLabel,
}: {
  ref?: React.RefObject<View | null>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <View style={styles.setWeightBadge}>
      <Text style={[styles.weightBadgeText, { color: Colours.faint }]}>SET kg</Text>
    </View>
  );
  return onPress ? (
    <Pressable ref={ref} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
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
    // flexGrow deliberately omitted (default 0) - Swift's own layout
    // (DailyCardView.swift) never stretches this group either; a Spacer()
    // absorbs the gap to rightGroup instead of the title growing into it.
    // Letting RN's Yoga stretch this group via flex:1 was what caused the
    // info icon to float away from the title's actual last line: a
    // wrapping multi-line RN Text reports its OWN measured width as
    // "however much space I was allowed to fill," not the tighter
    // bounding box of its rendered glyphs, so stretching the parent wider
    // dragged that reported width - and the icon sitting right after it -
    // along with it.
    flexShrink: 1,
    // minWidth: 0 is still load-bearing on its own, separate from the
    // flexGrow question above - without it, a flex child only shrinks to
    // its content's natural width (a well-known Yoga/CSS gap), so the
    // Text inside gets measured against a width wider than what it's
    // actually laid out into once a long sibling (rightGroup, e.g. a
    // phase-adjusted prescription like "4 × 8s / hand — lighter" during a
    // deload week) claims more space. That mismatch is what made RN fall
    // back to breaking words mid-character ("PICKU"/"PS —") instead of
    // wrapping at spaces - confirmed live: only rows with an unusually
    // long prescription hit this, never the ones with short prescriptions.
    minWidth: 0,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '700',
    // No design-system token exists for pure white (Colours.fg is an
    // off-white, #EDEBE5) — Swift uses the literal `.white` here too.
    color: '#FFFFFF',
    // flexShrink: 1 here (not just on the parent titleGroup) is the real
    // fix for a separate, second bug: a wrapping multi-line RN Text
    // inside a flex:1 parent reports its OWN measured width as "however
    // much space I was allowed to wrap into," not the tighter bounding
    // box of its actual rendered lines - so the info icon (its flex
    // sibling) was landing well to the right of the visibly-shorter
    // last line ("CRIMP"), floating in the middle of the row instead of
    // sitting right after the title. Forcing the Text itself to shrink-
    // wrap to its content (rather than stretch to fill titleGroup's
    // allocation) fixes the icon's position without touching the
    // wrapping/mid-word fix above it.
    flexShrink: 1,
  },
  titleTicked: {
    color: Colours.faint,
    textDecorationLine: 'line-through',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    // A verbose phase-adjusted prescription (e.g. "3 sets — lighter,
    // higher volume" during a deload week) has no bounded natural width
    // of its own, so without this cap it would claim however much
    // single-line space it wants and starve titleGroup down to less
    // than a single word's width - the exact chain that produced the
    // mid-character break above, on a row whose prescription is even
    // longer than the one that first surfaced it live. Capping rightGroup
    // forces its own prescription Text (flexShrink below) to wrap onto
    // its permitted 2 lines instead, so titleGroup always keeps a
    // reasonable floor of the row's width.
    maxWidth: '52%',
  },
  prescription: {
    ...Fonts.mono(12, 'medium'),
    textAlign: 'right',
    flexShrink: 1,
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

/** Port of the pip-tally piece of ExerciseRowView in DailyCardView.swift
    (lines 1316-1400: `setsTally(_:)`, `tapTally(totalSets:)`,
    `undoLastSet()`). In Swift there is no separate view for this — it's a
    private method on ExerciseRowView that also owns `completedSets` state,
    the "filling the last pip auto-ticks the row" rule, and the
    `autoStartRestOnTally` behaviour. This RN port deliberately narrows
    `SetsTally` to a fully controlled, presentational component: it renders
    `completedSets`-of-`totalSets` pips and reports raw gesture intent via
    `onTap`/`onLongPressUndo`. It does NOT own `completedSets` state, does
    NOT know about `onToggleTick`, and does NOT know about rest timers or
    the `autoStartRestOnTally` setting — see Task 8's brief for why that
    business logic has to live in whichever future component actually
    renders `<SetsTally>` (most likely Task 12's `DailyCard` assembly, or a
    dedicated settings task if `src/data/prefs.ts` gets built first — that
    file is named in the plan's target structure but no task 1-12 creates
    it, a real gap worth flagging rather than quietly patching here). */
import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colours } from '../../design/colours';
import { Motion } from '../../design/motion';

/** Port of ExerciseRowView.totalSets in DailyCardView.swift. Only two
    leading-number phrasings in the template library are unambiguously a
    set count: "N × ..." and bare "N sets"/"N supersets". A range ("4–5
    sets") deliberately does not match — there is no single right pip
    count for a range. Interval exercises are excluded because they get
    their own full-screen set tracking. */
export function totalSetsFor(ex: { prescription: string; interval: unknown }): number | null {
  if (ex.interval) return null;
  if (!/^\d+\s*(?:×|(?:super)?sets?\b)/.test(ex.prescription)) return null;
  const n = parseInt(ex.prescription.match(/^\d+/)![0], 10);
  return n > 1 ? n : null;
}

export interface SetsTallyProps {
  totalSets: number;
  completedSets: number;
  /** Resolved session accent colour (already run through resolveColour) —
      used as the lit-pip fill, matching Swift's `accent` reference. */
  accent: string;
  /** Raw gesture intent only — no argument, no return value. The caller
      decides whether this should actually increment anything, whether it
      fills the tally, and whether to auto-start a rest timer. */
  onTap: () => void;
  /** Raw gesture intent for "remove the last completed set". Same
      no-business-logic contract as onTap above. */
  onLongPressUndo: () => void;
}

const PIP_SIZE = 20;
const PIP_SPACING = 7;
const PIP_BORDER_WIDTH = 1.5;

/** One tap zone for the whole row, not one per pip — an earlier per-pip
    version was reverted per direct feedback: "just one box, tap anywhere,
    count goes up" (see the Swift source comment this is ported from). */
export function SetsTally({ totalSets, completedSets, accent, onTap, onLongPressUndo }: SetsTallyProps) {
  // Guards the tap gesture against the release that ends a successful
  // long-press. Swift's sibling needs an identical flag (`suppressNextTap`)
  // because it wires the long-press and tap recognizers independently via
  // two separate `.simultaneousGesture`/Button pairings rather than one
  // priority-ordered gesture. Gesture.Exclusive below already gives the
  // long-press priority over the tap on the same touch, but this guard is
  // reproduced here too (per the brief) so the component stays correct
  // even if that exclusivity behaviour ever changes — it is pure
  // gesture-recognizer coordination local to this component, not business
  // logic. A genuine follow-up tap after the flag is consumed calls
  // onTap() normally.
  const suppressNextTap = useRef(false);

  // runOnJS(true) on both: onTap/onLongPressUndo are arbitrary JS closures
  // supplied by the (not-yet-built) caller, not worklets — with Reanimated
  // installed, Gesture Handler callbacks otherwise default to running on
  // the UI thread, where calling a plain JS closure directly is invalid.
  const longPress = Gesture.LongPress()
    .minDuration(Motion.setsTallyLongPressMs)
    .runOnJS(true)
    .onStart(() => {
      suppressNextTap.current = true;
      onLongPressUndo();
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (!success) return;
      if (suppressNextTap.current) {
        suppressNextTap.current = false; // the release from a long-press undo, not a real add
        return;
      }
      onTap();
    });

  // Long-press listed first: per Gesture.Exclusive's own doc comment "the
  // first gesture has higher priority", so an activated long-press wins
  // over the tap racing it on the same touch — matching Swift's
  // simultaneously-recognized-but-resolved-via-guard-flag behaviour in
  // spirit.
  const gesture = Gesture.Exclusive(longPress, tap);

  const pips = Array.from({ length: totalSets }, (_, i) => i < completedSets);

  return (
    <View style={styles.outer}>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.row}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${completedSets} of ${totalSets} sets completed`}
          accessibilityHint="Double tap to log a set. Double tap and hold to undo the last one."
        >
          {pips.map((lit, i) => (
            <View
              key={i}
              style={[
                styles.pip,
                lit ? styles.pipLit : styles.pipUnlit,
                lit && { backgroundColor: accent },
              ]}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outside the gesture's own tap zone — matches Swift's outer
  // `.padding(.top, 2)`/`.padding(.bottom, 6)` applied to the Button
  // itself (pure layout spacing, not part of its content shape). The
  // bottom gap was widened specifically to stop mis-taps landing on the
  // Rest/START button below.
  outer: {
    paddingTop: 2,
    paddingBottom: 6,
  },
  // The tap zone: a single row box (RN hit-tests the whole box, matching
  // Swift's `.contentShape(Rectangle())`) so the gaps between/around pips
  // are tappable too, not just the circles themselves.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PIP_SPACING,
    paddingVertical: 4,
  },
  pip: {
    width: PIP_SIZE,
    height: PIP_SIZE,
    borderRadius: PIP_SIZE / 2,
    borderWidth: PIP_BORDER_WIDTH,
  },
  pipUnlit: {
    borderColor: Colours.s4,
    backgroundColor: 'transparent',
  },
  pipLit: {
    borderColor: 'transparent',
  },
});

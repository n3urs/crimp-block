/** Assembles Tasks 4 and 6-11 into the real daily card — port of
    DailyCardView.swift's `body` (lines 355-492), `peekContent` (856-902),
    and `exerciseRow`/`footer` (1050-1066). `ticks` is deliberately NOT
    owned here — it's a prop, owned by the caller (`app/(main)/card.tsx`),
    mirroring where it actually lives in the Swift source: one level up,
    in NativeAppView.swift (`@State private var ticks`, reset whenever
    `today`/`displayKey` changes or on sign-out — see that file's
    `finishLoad`/`browse(to:)`/`signOut()`).

    Three props on `DailyCardProps` are NOT in the task brief's literal
    interface listing — added here because the already-built components
    this task assembles require them and the brief's own interface omitted
    them (see the Task 12 report's "Deviations from the brief" section for
    the full reasoning on each):
      - `sessionColour: (key: string) => string` — SessionDots (Task 10)
        has always required this to colour each of the 7 dots by ITS OWN
        session, not the current one. `accent` alone can't do that job.
      - `displayKey: string` — SessionDots' `currentKey` (which dot is
        filled) is a session key like "maxFingers", not the same thing as
        `accentVarName` (a colour variable name) or anything else already
        on this interface.
      - `scrollRef?: RefObject<React.Component | null>` — Task 9's
        `useSwipeCarousel` takes an optional `scrollRef` specifically "so
        the pan gesture never competes with [the real scroll view's] own
        vertical pan", and its own doc comment names this exact task as
        the one that closes that loop ("before Task 12 has a real scroll
        view to pass in"). The caller constructs the ref (it also owns
        `useSwipeCarousel`) and this component attaches it to the actual
        ScrollView living in the shared render body below. */
import React, { useEffect } from 'react';
import type { RefObject } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { CardHeader } from './CardHeader';
import { SessionDots } from './SessionDots';
import { WeekStrip } from './WeekStrip';
import type { WeekDay } from './WeekStrip';
import { ExerciseRow } from './ExerciseRow';
import { LoggedStamp } from './LoggedStamp';
import type { useDoneFlow } from './useDoneFlow';
import type { useSwipeCarousel } from './useSwipeCarousel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { RenderedExercise } from '../../engine/types';
import { useRestTimer } from '../timers/useRestTimer';
import { useIntervalTimer } from '../timers/useIntervalTimer';
import { RestTimerOverlay } from '../timers/RestTimerOverlay';
import { IntervalTimerView } from '../timers/IntervalTimerView';

export interface DailyCardPeek {
  session: { name: string; where: string };
  accent: string;
  exercises: RenderedExercise[];
  isLogged: boolean;
  message: string;
}

export interface DailyCardProps {
  session: { name: string; where: string; guide: { title: string } | null };
  accent: string;
  accentVarName: string;
  exercises: RenderedExercise[];
  /** OWNED BY THE CALLER — see this file's top doc comment. */
  ticks: Set<string>;
  onToggleTick: (id: string) => void;
  onTapWeight?: (ex: RenderedExercise) => void;
  onTapRest?: (ex: RenderedExercise) => void;
  onStartInterval?: (ex: RenderedExercise) => void;
  /** is TODAY's logged session the one currently on screen */
  isLogged: boolean;
  /** caller-computed (deload/easing-back guidance or the session's own
      note, in priority order) — rendered here, not computed here; see the
      brief's "Explicitly out of scope" list. */
  cardMessage: string;
  weekDays: WeekDay[];
  onTapDay?: (date: string) => void;
  onTapCalendar?: () => void;
  onTapSettings: () => void;
  onTapPhaseBadge: () => void;
  /** Optional no-op escape hatch for the Guide pill's tap — the brief
      explicitly allows this ("or an optional onTapGuide?: () => void prop
      you may add if it's cheap"). No screen it would open exists yet. */
  onTapGuide?: () => void;
  phaseName: string;
  weekNumber: number;
  today: string;
  recommendedKey: string | null;
  nextUp: { key: string; name: string; colour: string } | null;
  /** passed straight through to LoggedStamp */
  celebrationTrigger: number;
  /** dev-diagnostic text, same role as NativeEngineDemoView.swift's own
      footerNote */
  footerNote?: string;
  doneFlow: ReturnType<typeof useDoneFlow>;
  panGesture: ReturnType<typeof useSwipeCarousel>['panGesture'];
  translateX: ReturnType<typeof useSwipeCarousel>['translateX'];
  peek: DailyCardPeek | null;
  onTapSession: (key: string) => void;
  /** NOT in the brief's literal interface — see this file's top doc
      comment for why SessionDots needs it and the brief's listing didn't
      supply it. */
  sessionColour: (key: string) => string;
  /** NOT in the brief's literal interface — see this file's top doc
      comment. Swift's `effectiveDisplayKey`: which session key is
      actually on screen right now (SessionDots' `currentKey`). */
  displayKey: string;
  /** NOT in the brief's literal interface — see this file's top doc
      comment. Forwarded to the real content's ScrollView so
      useSwipeCarousel's pan gesture can register
      `.simultaneousWithExternalGesture` against it. */
  scrollRef?: RefObject<React.Component | null>;
  /** Own hook-return-object shape, same precedent as doneFlow above.
      DailyCard renders RestTimerOverlay/IntervalTimerView directly off
      these — it doesn't need to know how onTapRest/onStartInterval are
      implemented (card.tsx owns that), only that these two objects exist
      to drive the two overlays. */
  restTimer: ReturnType<typeof useRestTimer>;
  intervalTimer: ReturnType<typeof useIntervalTimer>;
}

/** Dependency-free stand-in for SF Symbol "book.closed" — same precedent
    as ExerciseRow's InfoIcon / CardHeader's CalendarIcon (no icon font in
    this codebase). Unlike a chevron or gear there's no plain-presentation
    Unicode "book" glyph to reach for (the natural candidates are all
    emoji-presentation and ignore `color`), so this is built from Views
    like CalendarIcon: a bordered square (the cover) with a vertical
    spine line down the middle. */
function BookIcon({ color, size = 8 }: { color: string; size?: number }) {
  const stroke = Math.max(1, size * 0.16);
  return (
    <View style={{ width: size, height: size, borderWidth: stroke, borderColor: color, borderRadius: size * 0.15 }}>
      <View
        style={{
          position: 'absolute', top: 0, bottom: 0, left: size / 2 - stroke / 2,
          width: stroke, backgroundColor: color,
        }}
      />
    </View>
  );
}

interface CardBodyProps {
  session: { name: string; where: string };
  /** null/undefined = no pill at all — the peek never shows one (Swift's
      `peekContent` doesn't reference `guide` at all, only `real content`
      does). */
  guide?: { title: string } | null;
  onTapGuide?: () => void;
  accent: string;
  accentVarName: string;
  exercises: RenderedExercise[];
  ticks: Set<string>;
  onToggleTick?: (id: string) => void;
  onTapWeight?: (ex: RenderedExercise) => void;
  onTapRest?: (ex: RenderedExercise) => void;
  onStartInterval?: (ex: RenderedExercise) => void;
  message: string;
  /** true -> 14px semibold+accent; false -> 14px regular+dim. Real
      content passes `isLogged`, the peek passes its own `peekLogged`. */
  messageEmphasis: boolean;
  footerNote: string;
  /** false disables (pointerEvents 'none') just the exercise list, NOT
      the whole body — matches Swift's `.allowsHitTesting(!isLogged)`
      scope exactly: title/message/footer/Done stay reachable even once
      today is logged, only the rows themselves lock. */
  exercisesInteractive: boolean;
  /** 1 normally; 0.35 for a peek onto an already-logged session (Swift's
      `.opacity(peekLogged ? 0.35 : 1)`, applied to the exercise list only,
      not the whole card). */
  exercisesOpacity: number;
  scrollEnabled: boolean;
  scrollRef?: RefObject<React.Component | null>;
}

/** The shared title-block-plus-scrolling-list render path used for BOTH
    the real content and the swipe peek — Swift's own comment at
    `peekContent` is explicit about why this must be one shared path, not
    two independently written blocks: "same spacings, same message slot,
    same ScrollView wrapper, same footer... anything present there but
    missing here shifts everything below it, and that shift is visible as
    a jump."

    Deliberately has NO hooks of its own (no useState/useEffect) — every
    bit of variability comes in via props. That keeps it safely callable
    directly as a plain function outside of a real React render pass
    (no hook dispatcher required), which is what
    `__tests__/dailyCard.test.ts` relies on for its shared-render-path
    smoke test. */
export function CardBody({
  session, guide, onTapGuide, accent, accentVarName, exercises, ticks,
  onToggleTick, onTapWeight, onTapRest, onStartInterval,
  message, messageEmphasis, footerNote, exercisesInteractive, exercisesOpacity,
  scrollEnabled, scrollRef,
}: CardBodyProps) {
  return (
    <View style={styles.contentColumn}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{session.name.toUpperCase()}</Text>
        <Text style={[styles.where, { color: accent }]}>{session.where}</Text>
        {guide != null && (
          <Pressable
            onPress={onTapGuide}
            style={styles.guidePill}
            accessibilityRole="button"
            accessibilityLabel={`View training guide: ${guide.title}`}
          >
            <BookIcon color={accent} />
            <Text style={[styles.guideText, { color: accent }]}>{guide.title.toUpperCase()}</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        // react-native's own ScrollView is a class component wrapping a
        // native view; useSwipeCarousel's scrollRef param is typed
        // RefObject<React.Component | null> (the broadest shape that
        // covers whatever real ref a caller passes) rather than
        // RefObject<ScrollView>, so this cast is type-only — same
        // precedent as useSwipeCarousel.ts's own documented cast for the
        // same class of ref-type mismatch.
        ref={scrollRef as unknown as React.Ref<ScrollView>}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        {message.length > 0 && (
          <Text
            style={[
              styles.message,
              { color: messageEmphasis ? accent : Colours.dim, fontWeight: messageEmphasis ? '600' : '400' },
            ]}
          >
            {message}
          </Text>
        )}
        <View style={{ opacity: exercisesOpacity }} pointerEvents={exercisesInteractive ? 'auto' : 'none'}>
          {exercises.map((ex, i) => (
            <React.Fragment key={ex.id}>
              <ExerciseRow
                ex={ex}
                accent={accent}
                accentVarName={accentVarName}
                isTicked={ticks.has(ex.id)}
                onToggleTick={onToggleTick}
                onTapWeight={onTapWeight}
                onTapRest={onTapRest}
                onStartInterval={onStartInterval}
              />
              {i < exercises.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.footer}>{footerNote}</Text>
        {/* Room for the floating Done button — doneFlow is a required
            prop on DailyCard (never absent here), so unlike Swift's
            `if onTapDone != nil` this spacer is unconditional. */}
        <View style={styles.doneSpacer} />
      </ScrollView>
    </View>
  );
}

export function DailyCard(props: DailyCardProps) {
  const {
    session, accent, accentVarName, exercises, ticks, onToggleTick,
    onTapWeight, onTapRest, onStartInterval, isLogged, cardMessage,
    weekDays, onTapDay, onTapCalendar, onTapSettings, onTapPhaseBadge,
    onTapGuide, phaseName, weekNumber, today, recommendedKey, nextUp,
    celebrationTrigger, footerNote, doneFlow, panGesture, translateX,
    peek, onTapSession, sessionColour, displayKey, scrollRef,
    restTimer, intervalTimer,
  } = props;

  // The two confirmation dialogs' CHROME is explicitly out of scope (the
  // brief: use RN's built-in Alert.alert, no new dependency) — this is
  // that wiring. Each effect fires exactly once per false->true flip of
  // its own flag, not on every render while the flag stays true, which is
  // why the dependency array is deliberately narrowed to just that one
  // boolean rather than every value the alert's copy reads.
  useEffect(() => {
    if (!doneFlow.showSwapConfirm) return;
    Alert.alert(
      `Log ${session.name} instead?`,
      // Swift's own copy names the ALREADY-logged session too ("You
      // already logged X today"); that name isn't available on this
      // interface (useDoneFlow's returned state is just the two booleans
      // + callbacks, no loggedSessionKey) — see the Task 12 report for
      // why this stays generic rather than inventing a new prop for it.
      'Something else is already logged today — this will replace it.',
      [
        { text: 'Cancel', style: 'cancel', onPress: doneFlow.cancelSwap },
        { text: `Log ${session.name.toUpperCase()}`, onPress: doneFlow.confirmSwap },
      ],
      { cancelable: true, onDismiss: doneFlow.cancelSwap }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per flip to true, not on every render while true (same pattern as LoggedStamp.tsx's own trigger effect)
  }, [doneFlow.showSwapConfirm]);

  useEffect(() => {
    if (!doneFlow.showClimbTypeConfirm) return;
    Alert.alert(
      'Board session, or just a hard climb?',
      undefined,
      [
        { text: 'BOARD SESSION', onPress: () => doneFlow.confirmClimbType('board') },
        { text: 'JUST A HARD CLIMB', onPress: () => doneFlow.confirmClimbType('climb') },
        { text: 'Cancel', style: 'cancel', onPress: doneFlow.cancelClimbType },
      ],
      { cancelable: true, onDismiss: doneFlow.cancelClimbType }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per flip to true, not on every render while true
  }, [doneFlow.showClimbTypeConfirm]);

  // Drives BOTH the current content's slide and the LOGGED stamp's own
  // offset — Swift applies the exact same `dragOffset` to both
  // (`.offset(x: dragOffset)` on the swiping VStack at :479, and again on
  // `loggedStamp` itself at :562), so the celebratory card visibly rides
  // along with a swipe instead of sitting still while the card slides
  // out from under it.
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  // Confirmed live on device, real bug Oscar caught: the week strip
  // rendered starting at y=0, sitting behind the Dynamic Island/status
  // bar/time. Matches Swift's own split exactly — DailyCardView.swift
  // never opts out of the safe area (only its background does, via
  // NativeAppView.swift:148's `.ignoresSafeArea()`), so SwiftUI's default
  // safe-area-respecting layout already kept it clear; RN has no such
  // default and needs the inset added explicitly. `styles.root`'s
  // background still bleeds edge-to-edge (unaffected) — only the padded
  // content's top gets pushed down, and only by the ADDITIONAL device
  // inset on top of the existing 20pt padding, not instead of it.
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <GestureDetector gesture={panGesture}>
        <View style={[styles.padded, { paddingTop: 20 + insets.top }]}>
          {onTapDay != null && weekDays.length > 0 && (
            <View style={styles.weekStripSpacing}>
              <WeekStrip days={weekDays} onTapDay={onTapDay} />
            </View>
          )}
          <CardHeader
            phaseName={phaseName}
            weekNumber={weekNumber}
            accent={accent}
            today={today}
            onTapPhaseBadge={onTapPhaseBadge}
            onTapSettings={onTapSettings}
            onTapCalendar={onTapCalendar}
          />
          {/* onTapSession is required on DailyCard (browsing is this
              plan's whole point per the brief), so Swift's `if onBrowse
              != nil` guard is trivially always satisfied here. */}
          <SessionDots
            currentKey={displayKey}
            recommendedKey={recommendedKey}
            sessionColour={sessionColour}
            nextUp={nextUp}
            onTapSession={onTapSession}
          />
          <View style={styles.stack}>
            {peek != null && (
              // Sits behind, at rest, no offset of its own — the current
              // layer sliding via translateX is what reveals it, like
              // lifting a card off a stack.
              <View style={styles.layer} pointerEvents="none">
                <CardBody
                  session={peek.session}
                  guide={null}
                  accent={peek.accent}
                  // ExerciseRow doesn't consume accentVarName today (see
                  // its own doc comment — reserved for a future timer
                  // task); the peek shape has no variable-name field, so
                  // this inert placeholder costs nothing.
                  accentVarName={peek.accent}
                  exercises={peek.exercises}
                  ticks={ticks}
                  onToggleTick={onToggleTick}
                  onTapWeight={onTapWeight}
                  onTapRest={onTapRest}
                  onStartInterval={onStartInterval}
                  message={peek.message}
                  messageEmphasis={peek.isLogged}
                  footerNote={footerNote ?? ''}
                  exercisesInteractive={false}
                  exercisesOpacity={peek.isLogged ? 0.35 : 1}
                  scrollEnabled={false}
                />
              </View>
            )}
            <Animated.View style={[styles.layer, slideStyle]}>
              <CardBody
                session={session}
                guide={session.guide}
                onTapGuide={onTapGuide}
                accent={accent}
                accentVarName={accentVarName}
                exercises={exercises}
                ticks={ticks}
                onToggleTick={onToggleTick}
                onTapWeight={onTapWeight}
                onTapRest={onTapRest}
                onStartInterval={onStartInterval}
                message={cardMessage}
                messageEmphasis={isLogged}
                footerNote={footerNote ?? ''}
                exercisesInteractive={!isLogged}
                exercisesOpacity={1}
                scrollEnabled
                scrollRef={scrollRef}
              />
            </Animated.View>
          </View>
        </View>
      </GestureDetector>

      <Pressable
        onPress={doneFlow.handleDoneTap}
        style={[styles.doneButton, { backgroundColor: isLogged ? Colours.s2 : accent }]}
        accessibilityRole="button"
        accessibilityLabel={isLogged ? 'Undo logged workout' : 'Mark workout as done'}
      >
        <Text style={[styles.doneButtonText, { color: isLogged ? Colours.dim : Colours.bg }]}>
          {isLogged ? 'UNDO' : 'DONE THIS WORKOUT'}
        </Text>
      </Pressable>

      <Animated.View style={[styles.loggedStampLayer, slideStyle]} pointerEvents="none">
        <LoggedStamp trigger={celebrationTrigger} accent={accent} nextUp={nextUp} />
      </Animated.View>

      {restTimer.state != null && (
        <RestTimerOverlay state={restTimer.state} onStop={restTimer.stop} />
      )}

      {intervalTimer.state != null && (
        <IntervalTimerView
          state={intervalTimer.state}
          onPause={intervalTimer.pause}
          onResume={intervalTimer.resume}
          onStop={intervalTimer.stop}
          onToggleMute={intervalTimer.toggleMute}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  padded: { flex: 1, padding: 20, gap: 18 },
  weekStripSpacing: { marginBottom: 10 },
  stack: { flex: 1, position: 'relative' },
  layer: { ...StyleSheet.absoluteFill },
  contentColumn: { flex: 1, gap: 18, backgroundColor: Colours.bg },
  titleBlock: { alignItems: 'flex-start', gap: 4 },
  title: { ...Fonts.heading(32), color: '#FFFFFF' },
  where: { ...Fonts.mono(13, 'medium') },
  guidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colours.s1,
    borderWidth: 1,
    borderColor: Colours.s3,
  },
  guideText: { ...Fonts.mono(11, 'bold') },
  scroll: { flex: 1 },
  scrollContent: { gap: 18 },
  message: { fontSize: 14 },
  divider: { height: 1, backgroundColor: Colours.s2 },
  footer: {
    ...Fonts.mono(10, 'medium'),
    color: Colours.faint,
    textAlign: 'center',
    marginTop: 12,
  },
  doneSpacer: { height: 64 },
  doneButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneButtonText: { ...Fonts.mono(14, 'bold') },
  loggedStampLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

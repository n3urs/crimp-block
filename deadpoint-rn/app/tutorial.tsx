/** Task 9: the real post-quiz tutorial host — a staged `DailyCard` (the
    exact same component real users see, Tasks 6-11) fed FAKE local state
    instead of `useStore`/`useLoads`/`useSession`, wrapped in Tasks 6-8's
    `TutorialTargetProvider`/`TutorialOverlay`/`useTutorialController`
    system. Wiring mirrors `app/(main)/card.tsx` (the real screen) closely
    — same hooks, same prop list — just with local `useState` standing in
    for the real data hooks, since nothing here should ever hit Supabase.

    Direct port of `TutorialDemoCardView.swift`'s 10-step walkthrough.

    Deviation from the plan's draft: the draft ran this against a
    `PROGRAMS.boulderingAdvanced` template. No such template exists —
    confirmed directly against `src/engine/programs.js`, whose only keys
    are real account emails plus `'default'` (see `app/(main)/card.tsx`'s
    own doc comment: no template-resolver task has been built in this plan
    at all). `PROGRAMS.default` is used instead, matching that file's own
    documented fallback-for-no-match precedent, and it happens to satisfy
    every property the brief actually wanted from "boulderingAdvanced":
    with `sessionLog` always empty here, the engine's block/week counter
    (which only advances on logged training days, never on elapsed
    calendar time — see `engine-core.js`'s own `loadHistory` doc comment)
    never leaves block 1 week 1, so this is ALWAYS "Base phase, day one",
    on every real device on every real day, not just today. `decide()`
    also always recommends `maxFingers` under those same empty-log
    conditions, matching the brief's hard-coded `displayKey`. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { createEngine } from '../src/engine';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSwipeCarousel } from '../src/components/daily-card/useSwipeCarousel';
import { useDoneFlow } from '../src/components/daily-card/useDoneFlow';
import { DailyCard } from '../src/components/daily-card/DailyCard';
import { useRestTimer } from '../src/components/timers/useRestTimer';
import { useIntervalTimer } from '../src/components/timers/useIntervalTimer';
import { leadingInt } from '../src/components/timers/intervalTimerLogic';
import { TutorialTargetProvider, type TutorialTargetMap } from '../src/components/tutorial/TutorialTargetContext';
import { TutorialOverlay } from '../src/components/tutorial/TutorialOverlay';
import { useTutorialController, type TutorialStep } from '../src/components/tutorial/TutorialController';
import type { RenderedExercise } from '../src/engine/types';
import type { WeekDay } from '../src/components/daily-card/WeekStrip';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { markBuiltInTutorialSeen } from '../src/data/deviceFlags';
import { isBuiltInProgram } from '../src/routing/computeRoute';

// programs.js is plain JS (no .d.ts) — same require-not-import pattern
// app/(main)/card.tsx and the engine facade itself already use.
const PROGRAMS = require('../src/engine/programs.js');

// Verbatim from TutorialDemoCardView.swift — copy, order, and targetIDs
// are the spec, not a judgment call.
const STEPS: TutorialStep[] = [
  { targetID: 'weekStrip', title: 'Your last seven days', body: 'Each bar is one day, coloured by what you logged. Tap any of them to fill in a session you forgot — or to fix one you got wrong.' },
  { targetID: 'phaseBadge', title: 'The bigger picture', body: "This badge shows where you are in your training block. Tap it any time to see the full plan — phases, deload weeks, and what changes when. Close it with the button in the top left to carry on." },
  { targetID: 'exerciseInfo', title: 'Detail, out of the way', body: "Every exercise keeps the essentials up front. Tap the info icon to see the full reasoning behind it. And when an exercise's sets and reps are written in gold, it means those numbers have been tuned for the phase you're in right now — they'll change as you move through the plan." },
  { targetID: 'exerciseTick', title: 'Tick them off', body: "Check exercises off as you finish them. Ticked ones collapse out of the way, so what's left is always what's in front of you." },
  { targetID: 'weightBadge', title: 'Track your numbers', body: "Tap a weight to log what you actually lifted today. When that number turns gold, it means you've held the same weight two sessions running — the app is telling you it's time to go up." },
  { targetID: 'restTimerButton', title: 'Built-in timers', body: 'Every timed exercise has a rest timer wired in — tap to start it, right from here. It keeps running while you rest, so you can put the phone down.' },
  { targetID: 'restTimerStop', title: 'Stop anytime', body: "Rest timers count down on their own, but you're never stuck waiting — tap STOP whenever you're ready to move on." },
  { targetID: 'sessionDots', title: 'Reading the dots', body: 'One dot per session type. The filled one is what you’re looking at right now — not what you’ve done. The dot with a ring around it is what the app reckons you should do today, and it stays put even while you look around. Swipe left or right anywhere on the card to move between sessions, or tap a dot to jump straight to one.', fullScreenSwipeDemo: true },
  { targetID: 'doneButton', title: 'Then log the session', body: "When you're finished, mark the whole session done with the big button at the bottom. This is the bit that actually matters — logging is what the app reads to decide what you do next." },
  { targetID: 'settingsGear', title: 'Your settings', body: 'A sets counter that lets you tap through sets one at a time, an auto-start rest timer, and your account, all behind this gear icon.' },
];

// Derived, not a hardcoded literal — Fix 3 (step 4's tick must not collapse
// the controls steps 5-6 need) gates on "has the tutorial moved past this
// step" and needs the real index rather than an assumed one.
const REST_TIMER_BUTTON_STEP_INDEX = STEPS.findIndex((s) => s.targetID === 'restTimerButton');

// Keyed to "Open-hand hangs" (`def-hang-open`, in PROGRAMS.default's
// maxFingers session) — the exercise withSpotlightableExerciseLast()
// above moves to the end of the rendered list, so the weightBadge target
// actually lands on an exercise carrying this seeded load. Module scope
// (not per-render component state): it's a true constant, and keeping it
// here means the effect below that reads it doesn't need to list it as a
// dependency (react-hooks/exhaustive-deps is satisfied for free).
const SEEDED_EXERCISE_ID = 'def-hang-open';

type Stage = 'intro' | 'walkthrough' | 'outro';

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A plausible-looking week for the strip — deliberately leaves a couple
    of days blank, matching Swift's own reasoning: a strip where every
    day is filled would quietly imply daily training is required, which
    isn't how the engine actually works. */
function demoWeekDays(program: any, today: string): WeekDay[] {
  const types: (string | null)[] = ['pull', 'rest', 'maxFingers', null, 'climbHard', 'rest', null];
  const engine = createEngine(program, { sessionLog: {}, loadLog: {} });
  const out: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = engine.addDays(today, -i);
    const type = types[6 - i];
    out.push({
      id: date,
      dayLetter: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(date + 'T12:00:00')).slice(0, 1),
      colourVarName: type ? engine.sessionColourVarName(type) : null,
      isToday: i === 0,
    });
  }
  return out;
}

/** Task 8's shared tutorial-target registry (`TutorialTargetContext.tsx`)
    keys `exerciseTick`/`exerciseInfo`/`weightBadge`/`restTimerButton` by a
    FIXED string id, not one id per exercise — every mounted `ExerciseRow`
    calls `useTutorialTarget` with that same literal id (see
    `ExerciseRow.tsx`), so whichever row mounts LAST silently wins that
    id's registration, even when that particular row never renders the
    control at all (its own ref then just stays unattached forever, and
    `TutorialOverlay`'s later `measureInWindow` call fails, falling back to
    its generic "tap anywhere to continue" overlay instead of a real
    spotlight — see that file's `measureFailed` branch).

    `PROGRAMS.default`'s `maxFingers` session naturally ends on
    "Antagonists" (no `id`, no rest timer), which would silently break the
    weightBadge and restTimerButton steps' spotlighting — confirmed
    directly against `programs.js`, not assumed. This reorders only the
    RENDERED array (never the underlying program data), moving the last
    exercise that genuinely has both a tracked weight and a rest timer to
    the true end, so those two steps spotlight something real — matching
    this task's own explicit brief: "a weight badge is genuinely on screen
    to spotlight". */
function withSpotlightableExerciseLast(exercises: RenderedExercise[]): RenderedExercise[] {
  let idx = -1;
  for (let i = exercises.length - 1; i >= 0; i--) {
    const ex = exercises[i];
    if (ex.hasWeightTracking && ex.restSeconds != null && ex.interval == null) {
      idx = i;
      break;
    }
  }
  if (idx === -1 || idx === exercises.length - 1) return exercises;
  const reordered = exercises.slice();
  const [spotlight] = reordered.splice(idx, 1);
  reordered.push(spotlight);
  return reordered;
}

export default function Tutorial() {
  // expo-router screens take no props from their caller — there is no
  // parent component to pass `onDone` in, unlike the plan's draft
  // signature (`{ onDone }: { onDone: () => void }`).
  //
  // Task 11: real completion persistence, before the redirect —
  // `profile.markTutorialCompleted()` for a quiz-built (non-built-in)
  // account, or `markBuiltInTutorialSeen(email)` for a built-in one
  // (this screen is only ever reached signed-in, so `email` is real by
  // the time `onDone` can fire; the `!email` branch below is defensive
  // hardening only — confirmed practically unreachable, since session/
  // email resolves long before a user finishes the whole tutorial).
  // `isBuiltInProgram` is the same shared function
  // app/index.tsx's own gating imports from `src/routing/computeRoute.ts`
  // — this task's design cleanup, so it's defined exactly once rather
  // than duplicated in both call sites, as the plan's own draft did.
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);
  const onDone = async () => {
    try {
      // Fix 5: `isBuiltInProgram(null)` returns `false` (see
      // computeRoute.ts), so an earlier version of this check that only
      // branched on `isBuiltInProgram(email)` silently fell into the
      // "normal account" `else` branch whenever `email` was falsy — the
      // wrong-silent direction, since a null email can't sensibly own a
      // real profile completion either. Handle `!email` explicitly first
      // instead, matching this codebase's established "log and continue"
      // pattern for unexpected states: skip BOTH writes (there is no
      // clear owner for either one) and still redirect.
      if (!email) {
        console.error('tutorial onDone: email is null at completion time — skipping both markBuiltInTutorialSeen and profile.markTutorialCompleted (no clear owner for the write).');
      } else if (isBuiltInProgram(email)) {
        await markBuiltInTutorialSeen(email);
      } else {
        await profile.markTutorialCompleted();
      }
    } catch (e) {
      console.error('tutorial onDone failed:', e);
    }
    router.replace('/');
  };

  const [stage, setStage] = useState<Stage>('intro');
  const today = useMemo(() => isoToday(), []);
  const program = PROGRAMS.default;

  const [loggedKey, setLoggedKey] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const [loadKg, setLoadKg] = useState<number | null>(20); // seeded — a real number on screen, not the dashed "SET kg" placeholder
  const [browsedKey, setBrowsedKey] = useState<string | null>(null);

  const loadLog = useMemo(
    () => (loadKg != null ? { [SEEDED_EXERCISE_ID]: [{ date: today, kg: loadKg }] } : {}),
    [loadKg, today]
  );
  const engine = useMemo(() => createEngine(program, { sessionLog: {}, loadLog }), [program, loadLog]);
  const decision = engine.decide(today);
  const displayKey = browsedKey ?? 'maxFingers';
  const isLogged = loggedKey === displayKey;

  const phaseName = engine.phaseNameAt(today);
  const exercises = useMemo(
    () => withSpotlightableExerciseLast(engine.resolveExercises(displayKey, today, phaseName)),
    [engine, displayKey, today, phaseName]
  );
  const accentVarName = engine.sessionColourVarName(displayKey);
  const accent = resolveColour(accentVarName);
  const info = engine.sessionInfo(displayKey);

  const restTimer = useRestTimer();
  const intervalTimer = useIntervalTimer();
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);
  const scrollRef = useRef<React.Component | null>(null);
  const targetsRef = useRef<TutorialTargetMap>(new Map());
  const controller = useTutorialController(STEPS);

  // Real screen (card.tsx) measures the full outer width via
  // useWindowDimensions rather than a fixed guess — same reasoning here:
  // a hard-coded width would size the swipe-commit threshold wrong on any
  // device that isn't exactly that wide.
  const { width: containerWidth } = useWindowDimensions();

  const swipe = useSwipeCarousel({
    displayKey,
    containerWidth,
    onBrowse: (key) => { setBrowsedKey(key); controller.handleTap('sessionDots'); },
    scrollRef,
  });

  // Fix 3: ticking the seeded exercise's checkbox during step 4 must still
  // ALWAYS call handleTap('exerciseTick') below (that's what lets step 4
  // advance), but actually adding its id to `ticks` collapses its own
  // weight badge/rest button — the very controls steps 5 (weightBadge) and
  // 6 (restTimerButton) need to spotlight. So for the seeded exercise
  // specifically, defer joining `ticks` until the tutorial has moved past
  // the restTimerButton step (the later of the two steps that need those
  // controls visible); track the user's tap intent locally in the
  // meantime and commit it once the gate opens (see the effect below).
  // Any other, non-seeded exercise (this demo seeds only one) ticks
  // normally, immediately, with no deferral.
  const [pendingTickForSeeded, setPendingTickForSeeded] = useState(false);
  const seededTickGateOpen = controller.stepIndex > REST_TIMER_BUTTON_STEP_INDEX;

  const onToggleTick = (id: string) => {
    if (id === SEEDED_EXERCISE_ID && !seededTickGateOpen) {
      // Fix 2: idempotent set, not a toggle — there's no "untick" story for
      // the seeded exercise's deferred tick (the demo never needs to
      // support un-ticking it), so a toggle is unnecessary risk. A fast
      // double-tap inside the overlay's ~150ms stale-hole re-measure window
      // could otherwise flip this back to false and leave the checkbox
      // never catching up once the gate opens.
      setPendingTickForSeeded(true);
    } else {
      setTicks((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
    controller.handleTap('exerciseTick');
  };

  // Once the gate opens, commit any pending seeded-exercise tick into the
  // real `ticks` Set so the checkbox visually "catches up" to the tap the
  // user already made back in step 4.
  useEffect(() => {
    if (!seededTickGateOpen || !pendingTickForSeeded) return;
    setTicks((prev) => {
      if (prev.has(SEEDED_EXERCISE_ID)) return prev;
      const next = new Set(prev);
      next.add(SEEDED_EXERCISE_ID);
      return next;
    });
    setPendingTickForSeeded(false);
  }, [seededTickGateOpen, pendingTickForSeeded]);

  const onTapWeight = (ex: RenderedExercise) => {
    if (ex.id === SEEDED_EXERCISE_ID) setLoadKg((kg) => (kg ?? 0) + 2.5);
    controller.handleTap('weightBadge');
  };

  const onLog = async () => {
    setLoggedKey((k) => (k === displayKey ? null : displayKey));
    setCelebrationTrigger((c) => c + 1);
    controller.handleTap('doneButton');
  };

  const doneFlow = useDoneFlow({ isLogged, loggedSessionKey: loggedKey, displayKey, onLog });

  // Fix 2: `restTimer` (from useRestTimer(), shape { state, start, stop })
  // is called directly by DailyCard/RestTimerOverlay with no interception
  // point of our own — wrap just `.stop` so a real tap on the overlay's
  // STOP button both stops the real timer AND advances the restTimerStop
  // step, while `.state`/`.start` pass through unchanged.
  const wrappedRestTimer = {
    ...restTimer,
    stop: () => {
      restTimer.stop();
      controller.handleTap('restTimerStop');
    },
  };

  // Fix 1: `useRestTimer`'s own interval sets `state` to `null` DIRECTLY on
  // natural countdown-to-zero (see that hook's `start()` — it does not call
  // its own `stop()`), so the wrapper above never sees a timer that simply
  // runs out on its own. Without this, a tutorial user who lets the 120s
  // timer expire naturally (rather than tapping STOP) gets stuck:
  // RestTimerOverlay unmounts once `restTimer.state` goes null, taking the
  // `restTimerStop` target out of the registry with it, and the spotlight
  // is left pointing at nothing with no escape hatch but SKIP.
  //
  // Watch for that same null transition here and advance the tutorial
  // ourselves — but ONLY while `restTimerStop` is genuinely the step in
  // play, so this can't fire at any other point `restTimer.state`
  // legitimately happens to be null (e.g. before the first timer ever
  // starts, or on an unrelated later re-render). `computeHandleTap`
  // (TutorialController.ts) already no-ops a call whose targetID doesn't
  // match the CURRENT step, so even if this effect and a manual STOP tap's
  // synchronous handleTap both end up racing, only one of them can ever
  // actually advance the step — the other lands after `currentStep` has
  // already moved on and is discarded.
  useEffect(() => {
    if (restTimer.state === null && controller.currentStep?.targetID === 'restTimerStop') {
      controller.handleTap('restTimerStop');
    }
  }, [restTimer.state, controller.currentStep, controller.handleTap]);

  const weekDays = useMemo(() => demoWeekDays(program, today), [program, today]);
  const sessionColour = (key: string) => resolveColour(engine.sessionColourVarName(key));

  // Fires the outro card once the walkthrough's own step count runs out —
  // this must be a real effect, not a value computed inline in the JSX
  // below: calling setState directly during render (as an earlier draft of
  // this screen did) is a real React anti-pattern and risks a
  // render-loop/"Cannot update a component while rendering a different
  // component" warning. Narrowed to fire once per false->true flip of
  // `controller.finished`, not on every render while it stays true.
  useEffect(() => {
    if (controller.finished && stage === 'walkthrough') setStage('outro');
  }, [controller.finished, stage]);

  return (
    <View style={styles.root}>
      <TutorialTargetProvider targetsRef={targetsRef}>
        <DailyCard
          session={{ name: info?.n ?? '', where: info?.w ?? '', guide: null }}
          accent={accent}
          accentVarName={accentVarName}
          exercises={exercises}
          ticks={ticks}
          onToggleTick={onToggleTick}
          onTapWeight={onTapWeight}
          onTapRest={(ex) => { if (ex.restSeconds != null) { restTimer.start(ex.restSeconds, ex.title, accent); controller.handleTap('restTimerButton'); } }}
          onStartInterval={(ex) => { if (ex.interval != null) intervalTimer.start(ex.interval, ex.restSeconds ?? 120, Math.max(1, leadingInt(ex.prescription) ?? 1), ex.title); }}
          onTapInfo={() => controller.handleTap('exerciseInfo')}
          restTimer={wrappedRestTimer}
          intervalTimer={intervalTimer}
          isLogged={isLogged}
          cardMessage={info?.note ?? ''}
          weekDays={weekDays}
          onTapDay={() => controller.handleTap('weekStrip')}
          onTapCalendar={() => {}}
          onTapSettings={() => controller.handleTap('settingsGear')}
          onTapPhaseBadge={() => controller.handleTap('phaseBadge')}
          onTapGuide={() => {}}
          phaseName={phaseName}
          weekNumber={engine.block(today).w}
          today={today}
          recommendedKey={loggedKey != null ? null : decision.k}
          nextUp={null}
          celebrationTrigger={celebrationTrigger}
          footerNote={`Tutorial · ${today}`}
          doneFlow={doneFlow}
          panGesture={swipe.panGesture}
          contentOpacity={swipe.contentOpacity}
          onTapSession={swipe.animateTo}
          sessionColour={sessionColour}
          displayKey={displayKey}
          scrollRef={scrollRef}
        />
        <TutorialOverlay controller={controller} targetsRef={targetsRef} isActive={stage === 'walkthrough'} />
      </TutorialTargetProvider>

      {stage === 'intro' && (
        <MessageCard
          title="How this works"
          body="Every day, the app tells you which session to do — worked out from what you've logged and how recovered you are, not a fixed weekly timetable. Rest days get recommended too, and they count. Log what you do and it adapts. Here's a quick look around."
          buttonLabel="START"
          onSkip={onDone}
          onPress={() => setStage('walkthrough')}
        />
      )}
      {stage === 'outro' && (
        <MessageCard title="You're set" body="That's everything. You can always revisit this from settings later." buttonLabel="GET STARTED" onPress={onDone} />
      )}
    </View>
  );
}

function MessageCard({ title, body, buttonLabel, onSkip, onPress }: { title: string; body: string; buttonLabel: string; onSkip?: () => void; onPress: () => void }) {
  return (
    <View style={styles.messageBackdrop}>
      <View style={styles.messageCard}>
        <Text style={styles.messageTitle}>{title}</Text>
        <Text style={styles.messageBody}>{body}</Text>
        <Pressable onPress={onPress} style={styles.messageButton}><Text style={styles.messageButtonText}>{buttonLabel}</Text></Pressable>
        {onSkip != null && <Pressable onPress={onSkip}><Text style={styles.messageSkip}>SKIP</Text></Pressable>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  messageBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  messageCard: { width: '85%', maxWidth: 340, padding: 22, borderRadius: 16, backgroundColor: Colours.s1, gap: 14 },
  messageTitle: { fontSize: 24, fontWeight: '800', color: Colours.fg },
  messageBody: { fontSize: 14, color: Colours.dim },
  messageButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: Colours.fg },
  messageButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
  messageSkip: { ...Fonts.mono(11, 'bold'), color: Colours.faint, textAlign: 'center' },
});

/** Wires DailyCard.tsx to real data — Task 12 Step 2. Resolves to the URL
    `/card` (expo-router strips the parenthesised `(main)` route-group
    segment; see app/index.tsx's redirect comment).

    Owns `ticks` and `browsedKey` itself, exactly where Swift keeps their
    equivalents: NativeAppView.swift's `@State private var ticks`/
    `browsedKey`, one level above DailyCardView, not inside it (see
    NativeAppView.swift:52,406,528,546 and DailyCardView.swift:150-153). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSession } from '../../src/data/useSession';
import { useStore } from '../../src/data/useStore';
import { useLoads } from '../../src/data/useLoads';
import { useProfile } from '../../src/data/useProfile';
import { createEngine } from '../../src/engine';
import { resolveColour } from '../../src/design/colours';
import { useSwipeCarousel } from '../../src/components/daily-card/useSwipeCarousel';
import { useDoneFlow } from '../../src/components/daily-card/useDoneFlow';
import { DailyCard } from '../../src/components/daily-card/DailyCard';
import type { WeekDay } from '../../src/components/daily-card/WeekStrip';
import type { RenderedExercise } from '../../src/engine/types';
import { useRestTimer } from '../../src/components/timers/useRestTimer';
import { useIntervalTimer } from '../../src/components/timers/useIntervalTimer';
import { leadingInt } from '../../src/components/timers/intervalTimerLogic';
import { getStoredTicks, setStoredTicks } from '../../src/data/tickStorage';
import { cardMessage } from '../../src/components/daily-card/cardMessage';
import { syncForecast } from '../../src/widget/syncForecast';

// programs.js is plain JS (no .d.ts), same require-not-import pattern the
// engine facade itself uses internally (src/engine/index.ts:8) and that
// __tests__/engine-parity.test.ts already relies on.
const PROGRAMS = require('../../src/engine/programs.js');

/** Port of NativeAppView.dayLetter(_:) — a single-letter weekday
    abbreviation ("M", "T", "W"...) for WeekStrip's tiles. */
function dayLetter(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(dt).slice(0, 1);
}

export default function Card() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  // Same "not confirmed yet" idiom as `email` above — useStore/useLoads
  // must be called unconditionally (rules of hooks), so before the
  // session resolves this is '', which the real write path (onLog/onLog's
  // loads.set) can only ever reach after a user interaction, by which
  // point the session has long since loaded. Passing the id straight
  // from the already-held session (no network call) is the whole point
  // of this fix — see useStore.ts/useLoads.ts's doc comments.
  const userId = session?.user?.id ?? '';

  // No template-resolver task exists anywhere in Tasks 1-12 (confirmed:
  // src/engine/template-resolver.js exists on disk but nothing in this
  // plan wires it up yet) — programs.js is keyed directly by real account
  // email, exactly as __tests__/engine-parity.test.ts already exercises
  // it, with a 'default' entry in the same file for anyone else. This is
  // a judgment call the brief's Step 2 left open; see the Task 12 report.
  const program = useMemo(() => PROGRAMS[(email ?? '').toLowerCase()] ?? PROGRAMS.default, [email]);

  const profile = useProfile(userId);
  const loads = useLoads(userId);

  // engine.today() is a pure passthrough to engine-core's own today() —
  // it reads neither `program` nor the log data, so this cheap throwaway
  // engine is only ever used for that one static call, computed once per
  // app session (this is a personal daily-training app; the calendar day
  // not updating live across midnight while the app stays open matches
  // every other date-derived value here, e.g. WeekStrip's own window).
  const [today] = useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());

  // program.startDate is available synchronously (no network round trip);
  // profile.row.programStartDate is preferred once it loads, but starting
  // useStore's fetch immediately off the program's own default avoids an
  // initial null-startDate stall while the profile row is still in flight.
  const startDate = profile.row?.programStartDate ?? program.startDate ?? null;
  const store = useStore(startDate, today, userId);

  // Refetch every time this screen regains focus, not just on first mount.
  // day-picker.tsx, weight-edit.tsx, and settings.tsx (RESTORE INSTANTLY)
  // each own an independent instance of useStore/useLoads/useProfile — see
  // day-picker.tsx's own doc comment on why: a second screen reached via
  // router.push must not assume it shares React state with the screen that
  // pushed it. Those screens write through Supabase directly and then call
  // router.back(), which pops them WITHOUT unmounting this screen — so
  // without this, this screen's own copies of store/loads/profile never
  // learn a write happened until something else forces a real remount
  // (e.g. index's own gate replacing this screen entirely). Confirmed live:
  // backdating a day via day-picker looked like "nothing happened" on the
  // WeekStrip until an unrelated full remount (via the tutorial flow)
  // incidentally fixed it. useFocusEffect (not a plain useEffect) is the
  // right primitive — it fires on every focus regain, including a plain
  // router.back() from a pushed modal, which a mount-only effect never
  // would.
  useFocusEffect(
    useCallback(() => {
      store.reload().catch((e) => console.error('card.tsx focus refresh (store) failed:', e));
      loads.reload().catch((e) => console.error('card.tsx focus refresh (loads) failed:', e));
      profile.reload().catch((e) => console.error('card.tsx focus refresh (profile) failed:', e));
    }, [store.reload, loads.reload, profile.reload])
  );

  const engine = useMemo(
    () => createEngine(program, { sessionLog: store.days, loadLog: loads.all() }),
    // loads.all() just returns loads.byExercise (see useLoads.ts) — depending
    // on the underlying value directly avoids recreating the engine on every
    // render for an unstable-but-equal function reference.
    [program, store.days, loads.byExercise]
  );

  // Pushes the freshly-recomputed forecast into the home-screen widget's
  // shared storage — fires on mount and again whenever `engine` changes,
  // i.e. every time store/loads actually finish a reload with new data
  // (see the useFocusEffect above), not just on focus regain itself.
  // syncForecast no-ops on Android internally — no Platform.OS guard here.
  useEffect(() => {
    syncForecast(engine);
  }, [engine]);

  const [browsedKey, setBrowsedKey] = useState<string | null>(null);
  const decision = engine.decide(today);
  const displayKey = browsedKey ?? decision.k;

  const loggedEntry = store.get(today);
  const loggedSessionKey = loggedEntry?.t ?? null;
  const isLogged = loggedSessionKey === displayKey;

  const [ticks, setTicks] = useState<Set<string>>(new Set());
  // Mirrors NativeAppView.swift's own condition (ticks reset on a day OR
  // session change, not on every unrelated re-render) by scoping this
  // effect to just those two values — but unlike the plain in-memory
  // `useState` this used to be, the reset is now a HYDRATE from device
  // storage keyed by (today, displayKey), not always-empty: real bug
  // reported live — ticking exercises off, then swiping the card to
  // browse a different session (or backgrounding/closing the app
  // entirely) and coming back showed everything unticked again, since
  // there was nowhere for a tick to live once this effect's dependencies
  // changed. Clearing synchronously first avoids a one-frame flash of the
  // PREVIOUS session's ticks while the real ones for this (today,
  // displayKey) load; a genuinely fresh combination resolves to an empty
  // Set anyway, so there's no flash the other way either.
  useEffect(() => {
    setTicks(new Set());
    let cancelled = false;
    getStoredTicks(today, displayKey)
      .then((stored) => { if (!cancelled) setTicks(stored); })
      .catch((e) => console.error('card.tsx tick hydrate failed:', e));
    return () => { cancelled = true; };
  }, [today, displayKey]);

  const onToggleTick = useCallback((id: string) => {
    setTicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      setStoredTicks(today, displayKey, next).catch((e) => console.error('card.tsx tick persist failed:', e));
      return next;
    });
  }, [today, displayKey]);

  const [celebrationTrigger, setCelebrationTrigger] = useState(0);

  const restTimer = useRestTimer();
  const intervalTimer = useIntervalTimer();

  const phaseName = engine.phaseNameAt(today);
  const exercises = engine.resolveExercises(displayKey, today, phaseName);
  const block = engine.block(today);
  const accentVarName = engine.sessionColourVarName(displayKey);
  const accent = resolveColour(accentVarName);
  const info = engine.sessionInfo(displayKey);
  const sessionProp = { name: info?.n ?? '', where: info?.w ?? '', guide: info?.guide ?? null };

  const sessionColour = useCallback((key: string) => resolveColour(engine.sessionColourVarName(key)), [engine]);

  const recommendedKey = loggedSessionKey != null ? null : decision.k;

  const up = engine.upNext();
  const nextUp = up
    ? { key: up.key, name: engine.sessionInfo(up.key)?.n ?? '', colour: resolveColour(engine.sessionColourVarName(up.key)) }
    : null;

  const weekDays: WeekDay[] = useMemo(() => {
    const out: WeekDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = engine.addDays(today, -i);
      const entry = store.get(date);
      out.push({
        id: date,
        dayLetter: dayLetter(date),
        colourVarName: entry ? engine.sessionColourVarName(entry.t) : null,
        isToday: i === 0,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store.get is a fresh closure every render; store.days is what it actually reads
  }, [engine, today, store.days]);

  // Real now — see src/components/daily-card/cardMessage.ts. Was a
  // placeholder (`info?.note ?? ''`) through the whole RN port; the deload
  // and easing-back guidance it should have been showing was missing
  // entirely, which matters most in exactly the week it applies to.
  const message = cardMessage({
    sessionKey: displayKey,
    isDeload: block.w === 4,
    isReturning: engine.isReturning(today),
    isClimb: info?.climb != null,
    isLogged,
    note: info?.note ?? null,
  });

  const scrollRef = useRef<React.Component | null>(null);
  const { width: containerWidth } = useWindowDimensions();

  // Swift measures the FULL outer (unpadded) width for exactly this
  // reason — see useSwipeCarousel.ts's own containerWidth doc comment and
  // DailyCardView.swift's GeometryReader comment (measuring the padded
  // content width instead left a permanent slice of the old session on
  // screen after every swipe). useWindowDimensions is the RN equivalent
  // of that outer measurement, and additionally keeps it live across
  // rotation, which Swift's own onAppear/onChange pairing also does.
  const swipe = useSwipeCarousel({
    displayKey,
    containerWidth,
    onBrowse: setBrowsedKey,
    scrollRef,
  });

  // Port of NativeAppView.toggleDone(subType:) (NativeAppView.swift:588-604),
  // minus the explicit `await reload()` at the end — useStore.set/clear and
  // useLoads.set already update their own state optimistically (Task 6),
  // so a follow-up network refetch would be redundant here, unlike
  // Swift's NativeStore which needed that reload to see its own write.
  const onLog = useCallback(async (sub?: 'board' | 'climb') => {
    if (isLogged) {
      await store.clear(today);
    } else {
      // Auto-record weight for ticked, weight-tracked exercises with
      // nothing already recorded today — computed and saved BEFORE the
      // day itself is logged, same ordering as Swift (logging can tip
      // the block into a deload week, which would change what target()
      // reports).
      for (const ex of exercises) {
        if (ticks.has(ex.id) && ex.hasWeightTracking && ex.weightKg != null) {
          if (loads.on(ex.id, today) == null) {
            await loads.set(today, ex.id, ex.weightKg);
          }
        }
      }
      await store.set(today, displayKey, sub ?? null);
      setCelebrationTrigger((t) => t + 1); // fires on logging TODAY, never on undo
    }
    setBrowsedKey(null); // logging/undoing TODAY resets browsing
  }, [isLogged, store, loads, today, displayKey, exercises, ticks]);

  const handleTapRest = useCallback((ex: RenderedExercise) => {
    if (ex.restSeconds == null) return;
    restTimer.start(ex.restSeconds, ex.title, accent);
  }, [restTimer, accent]);

  const handleStartInterval = useCallback((ex: RenderedExercise) => {
    if (ex.interval == null) return;
    const sets = Math.max(1, leadingInt(ex.prescription) ?? 1);
    intervalTimer.start(ex.interval, ex.restSeconds ?? 120, sets, ex.title);
  }, [intervalTimer]);

  // Real now (this plan's Task 1) — pushes the weight-editing modal route
  // at app/weight-edit.tsx, same push-a-real-route pattern as
  // onTapCalendar below. Unlike calendar.tsx, weight-edit.tsx has no
  // engine/program dependency of its own: every value it needs is passed
  // explicitly as a route param here rather than re-derived there.
  const onTapWeight = useCallback((ex: RenderedExercise) => {
    router.push({
      pathname: '/weight-edit',
      params: {
        exerciseId: ex.id,
        title: ex.title,
        step: String(ex.step),
        weightKg: ex.weightKg != null ? String(ex.weightKg) : '',
        date: today,
      },
    });
  }, [router, today]);

  const doneFlow = useDoneFlow({ isLogged, loggedSessionKey, displayKey, onLog });

  const footerNote = `React Native (live data) · ${email ?? ''} · ${today}`;

  return (
    <DailyCard
      session={sessionProp}
      accent={accent}
      accentVarName={accentVarName}
      exercises={exercises}
      ticks={ticks}
      onToggleTick={onToggleTick}
      isLogged={isLogged}
      cardMessage={message}
      weekDays={weekDays}
      // Settings and plan screens still aren't built by any task through
      // Phase 4 — safe no-ops so the strip/icon/badge still render
      // (matching Swift's real signed-in card always supplying all of
      // these), same "no-op until a later phase" precedent already used
      // for ExerciseRow's onTapRest/onStartInterval. NOT hypothetical:
      // oscar@sullivanltd.co.uk's real climbHard session already has a
      // `guide` field (programs.js), so the pill genuinely renders and
      // no-ops on his real account today, not just someday. Task 12's
      // brief explicitly scopes SessionGuideView's real modal as out of
      // this task's scope (no task has ported it yet) — this is a real,
      // live gap worth prioritising in whatever plan covers it next, not
      // a someday nice-to-have.
      //
      // onTapCalendar is real now (Phase 4 Task 6) — pushes the modal
      // route at app/(main)/calendar.tsx, which owns its own independent
      // session/store/program resolution (Decision 2 in the Phase 4
      // design spec) rather than sharing this screen's state.
      //
      // onTapDay is real now (this plan's Task 2) — pushes the modal
      // route at app/day-picker.tsx (backdating/editing a previous,
      // non-today day tapped in WeekStrip), which likewise resolves its
      // own independent session/store/program rather than sharing this
      // screen's state, same pattern as onTapCalendar above.
      //
      // onTapSettings is real now (this plan's Task 2) — pushes the modal
      // route at app/settings.tsx, which resolves its own independent
      // session/profile rather than sharing this screen's state, same
      // pattern as onTapCalendar/onTapDay.
      onTapDay={(date: string) => router.push({ pathname: '/day-picker', params: { date } })}
      onTapCalendar={() => router.push('/calendar')}
      onTapWeight={onTapWeight}
      onTapRest={handleTapRest}
      onStartInterval={handleStartInterval}
      restTimer={restTimer}
      intervalTimer={intervalTimer}
      onTapSettings={() => router.push('/settings')}
      // onTapPhaseBadge is real now (this plan's Task 2) — pushes the
      // modal route at app/plan.tsx (PlanSheetView.swift port), which
      // resolves its own independent session/store/program rather than
      // sharing this screen's state, same pattern as onTapDay/onTapSettings.
      onTapPhaseBadge={() => router.push('/plan')}
      onTapGuide={() => {}}
      phaseName={phaseName}
      weekNumber={block.w}
      today={today}
      recommendedKey={recommendedKey}
      nextUp={nextUp}
      celebrationTrigger={celebrationTrigger}
      footerNote={footerNote}
      doneFlow={doneFlow}
      panGesture={swipe.panGesture}
      contentOpacity={swipe.contentOpacity}
      onTapSession={swipe.animateTo}
      sessionColour={sessionColour}
      displayKey={displayKey}
      scrollRef={scrollRef}
    />
  );
}

/** Wires DailyCard.tsx to real data — Task 12 Step 2. Resolves to the URL
    `/card` (expo-router strips the parenthesised `(main)` route-group
    segment; see app/index.tsx's redirect comment).

    Owns `ticks` and `browsedKey` itself, exactly where Swift keeps their
    equivalents: NativeAppView.swift's `@State private var ticks`/
    `browsedKey`, one level above DailyCardView, not inside it (see
    NativeAppView.swift:52,406,528,546 and DailyCardView.swift:150-153). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSession } from '../../src/data/useSession';
import { useStore } from '../../src/data/useStore';
import { useLoads } from '../../src/data/useLoads';
import { useProfile } from '../../src/data/useProfile';
import { createEngine } from '../../src/engine';
import { resolveColour } from '../../src/design/colours';
import { useSwipeCarousel } from '../../src/components/daily-card/useSwipeCarousel';
import { useDoneFlow } from '../../src/components/daily-card/useDoneFlow';
import { DailyCard, type DailyCardPeek } from '../../src/components/daily-card/DailyCard';
import type { WeekDay } from '../../src/components/daily-card/WeekStrip';

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
  const { session } = useSession();
  const email = session?.user?.email ?? null;

  // No template-resolver task exists anywhere in Tasks 1-12 (confirmed:
  // src/engine/template-resolver.js exists on disk but nothing in this
  // plan wires it up yet) — programs.js is keyed directly by real account
  // email, exactly as __tests__/engine-parity.test.ts already exercises
  // it, with a 'default' entry in the same file for anyone else. This is
  // a judgment call the brief's Step 2 left open; see the Task 12 report.
  const program = useMemo(() => PROGRAMS[email ?? ''] ?? PROGRAMS.default, [email]);

  const profile = useProfile();
  const loads = useLoads();

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
  const store = useStore(startDate, today);

  const engine = useMemo(
    () => createEngine(program, { sessionLog: store.days, loadLog: loads.all() }),
    // loads.all() just returns loads.byExercise (see useLoads.ts) — depending
    // on the underlying value directly avoids recreating the engine on every
    // render for an unstable-but-equal function reference.
    [program, store.days, loads.byExercise]
  );

  const [browsedKey, setBrowsedKey] = useState<string | null>(null);
  const decision = engine.decide(today);
  const displayKey = browsedKey ?? decision.k;

  const loggedEntry = store.get(today);
  const loggedSessionKey = loggedEntry?.t ?? null;
  const isLogged = loggedSessionKey === displayKey;

  const [ticks, setTicks] = useState<Set<string>>(new Set());
  // Mirrors NativeAppView.swift's own condition exactly (ticks reset on a
  // day OR session change, not on every unrelated re-render) by scoping
  // the effect's dependency array to just those two values.
  useEffect(() => {
    setTicks(new Set());
  }, [today, displayKey]);

  const onToggleTick = useCallback((id: string) => {
    setTicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [celebrationTrigger, setCelebrationTrigger] = useState(0);

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

  // cardMessage's real computation (Swift's cardMessage(for:isLogged:):
  // deload/easing-back guidance, else the session's own note, in that
  // priority) is explicitly out of scope for this task per the brief — no
  // task through 12 has ported it. This is a placeholder, not the real
  // thing: just the session's own note, with no deload/isReturning
  // branching. A future task must port DailyCardView.swift:315-354
  // faithfully to replace this.
  const cardMessage: string = info?.note ?? '';

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

  const resolvedPeek: DailyCardPeek | null = useMemo(() => {
    if (swipe.peekKey == null) return null;
    const key = swipe.peekKey;
    const peekInfo = engine.sessionInfo(key);
    if (!peekInfo) return null;
    const peekAccent = resolveColour(engine.sessionColourVarName(key));
    const peekExercises = engine.resolveExercises(key, today, phaseName);
    const peekIsLogged = loggedSessionKey != null && loggedSessionKey === key;
    return {
      session: { name: peekInfo.n ?? '', where: peekInfo.w ?? '' },
      accent: peekAccent,
      exercises: peekExercises,
      isLogged: peekIsLogged,
      message: peekInfo.note ?? '',
    };
  }, [swipe.peekKey, engine, today, phaseName, loggedSessionKey]);

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
      cardMessage={cardMessage}
      weekDays={weekDays}
      // Real day-picker/backdating, calendar, settings, and plan screens
      // aren't built by any task through 12 — safe no-ops so the strip/
      // icon/badge still render (matching Swift's real signed-in card
      // always supplying all of these), same "no-op until a later phase"
      // precedent already used for ExerciseRow's onTapRest/onStartInterval.
      // No session in programs.js has a `guide` field yet, so onTapGuide
      // is never actually reachable today, but it's free to wire for when
      // one does.
      onTapDay={() => {}}
      onTapCalendar={() => {}}
      onTapSettings={() => {}}
      onTapPhaseBadge={() => {}}
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
      translateX={swipe.translateX}
      peek={resolvedPeek}
      onTapSession={swipe.animateTo}
      sessionColour={sessionColour}
      displayKey={displayKey}
      scrollRef={scrollRef}
    />
  );
}

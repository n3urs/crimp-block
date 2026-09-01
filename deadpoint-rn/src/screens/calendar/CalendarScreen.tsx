// src/screens/calendar/CalendarScreen.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { resolveColour } from '../../design/colours';
import type { Phase } from '../../engine/types';
import { SESSION_ORDER } from '../../engine';
import type { Days } from '../../data/useStore';
import { daysInMonthGrid, monthTitle, shiftMonth, startOfMonth } from './calendarMath';
import { computeTrendForecast, type TrendForecastEngine } from './trendForecast';
import { computeAllTimeStats, type AllTimeStatsEngine } from './allTimeStats';
import { computePlanProgress, type PlanProgressEngine } from './planProgress';
import { MonthGrid } from './MonthGrid';
import type { DayCellData } from './DayCell';
import { PlanProgressBar } from './PlanProgressBar';
import { StatsPanel } from './StatsPanel';
import { Legend } from './Legend';

/** The narrow slice of a real engine (createEngine()'s return value) this
    whole screen needs — every sub-computation's own *Engine interface
    (TrendForecastEngine, AllTimeStatsEngine, PlanProgressEngine) is a
    subset of this, so a real engine instance satisfies all of them
    structurally with no adapter.

    `phaseIndexAt` and `isDeload` are declared here directly rather than
    folded into one of the three sub-interfaces above: neither
    TrendForecastEngine, AllTimeStatsEngine, nor PlanProgressEngine needs
    either method for its own computation (confirmed by reading all three
    files — none references them), but this screen's own body does, for
    the future-cell phase projection (`projectedPhaseName` below) and the
    past-cell deload-ring check (the `cells` memo below). Omitting them
    from CalendarEngine — as an earlier draft of this file did, following
    the brief's Step 3 sample literally — compiles the three imported
    *Engine interfaces fine but fails `tsc --noEmit` on this file's own
    `engine.phaseIndexAt(...)` / `engine.isDeload(...)` calls with
    "Property does not exist on type 'CalendarEngine'". Both signatures
    below match src/engine/index.ts's real facade exactly, so a real
    engine instance still satisfies this interface structurally, same as
    the brief's own claim intended. */
export interface CalendarEngine extends TrendForecastEngine, AllTimeStatsEngine, PlanProgressEngine {
  phaseNameAt(date: string): string;
  phaseIndexAt(block: number): number;
  isDeload(date: string): boolean;
}

export interface CalendarScreenProps {
  engine: CalendarEngine;
  history: Days;
  today: string;
  onDismiss: () => void;
}

/** Mirrors CalendarView.swift's projectedPhaseName(daysAhead:) — a FUTURE
    date projects through however many blocks the trend rate implies
    between today and then (continuous block-length maths, not a day-by-
    day walk), not just the next phase transition. Stopping at the first
    transition left every later month stuck on that same "next" phase
    forever — real bug, reported directly ("why does max strength not
    end"). */
function projectedPhaseName(engine: CalendarEngine, today: string, weeklyRate: number, daysAhead: number): string {
  const b = engine.block(today);
  if (weeklyRate <= 0) return engine.phaseNameAt(today);
  const calendarDaysPerTrainingDay = 7 / weeklyRate;
  const trainingDaysAhead = daysAhead / calendarDaysPerTrainingDay;
  const totalProjected = b.total + trainingDaysAhead;
  const blockLength = b.per * 4;
  if (blockLength <= 0) return engine.phaseNameAt(today);
  const blocksAhead = Math.floor(totalProjected / blockLength);
  const projectedBlock = b.b + blocksAhead;
  const idx = engine.phaseIndexAt(projectedBlock);
  const phases = engine.phases;
  if (phases.length === 0) return engine.phaseNameAt(today);
  return phases[Math.min(Math.max(idx, 0), phases.length - 1)].n;
}

function daysBetweenLocal(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function CalendarScreen({ engine, history, today, onDismiss }: CalendarScreenProps) {
  const insets = useSafeAreaInsets();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));

  const forecast = useMemo(() => computeTrendForecast(engine, history, today), [engine, history, today]);
  const allTimeStats = useMemo(
    () => computeAllTimeStats(engine, history, today, resolveColour, SESSION_ORDER),
    [engine, history, today]
  );
  const planProgress = useMemo(() => computePlanProgress(engine, today), [engine, today]);

  const currentBlock = engine.block(today);
  const currentPhaseName = engine.phaseNameAt(today);
  const phaseColourByName: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of engine.phases) out[p.n] = resolveColour(p.c);
    return out;
  }, [engine]);
  const currentPhaseColour = phaseColourByName[currentPhaseName] ?? null;
  const currentPositionLine = `${currentPhaseName.toUpperCase()} · BLOCK ${currentBlock.b} · WK ${currentBlock.w} OF 4${currentBlock.w === 4 ? ' · DELOAD' : ''}`;
  const isDeloadOngoing = currentBlock.w === 4;

  const cells: (DayCellData | null)[] = useMemo(() => {
    const rawDays = daysInMonthGrid(visibleMonth);

    // One flat phase-name array, same index scheme as rawDays — every
    // cell needs its up/down/left/right neighbours' phases, so resolve
    // the whole month up front rather than each cell re-deriving its
    // neighbours independently (matches Swift's own monthGrid comment).
    const phases: (string | null)[] = rawDays.map((date) => {
      if (date == null) return null;
      if (date <= today) return engine.phaseNameAt(date);
      const daysAhead = daysBetweenLocal(today, date);
      return projectedPhaseName(engine, today, forecast.weeklyRate, daysAhead);
    });

    return rawDays.map((date, i) => {
      if (date == null) return null;
      const dayNum = Number(date.split('-')[2]);
      const isToday = date === today;
      const isPast = date <= today;
      const entry = isPast ? history[date] : undefined;
      const loggedColour = entry ? resolveColour(engine.sessionColourVarName(entry.t)) : null;

      const isDeloadWindow = isPast
        ? engine.isDeload(date)
        : forecast.deload != null && date >= forecast.deload.start && date <= forecast.deload.end;

      const myPhase = phases[i];
      const col = i % 7;
      const sameUp = i - 7 >= 0 && phases[i - 7] === myPhase;
      const sameDown = i + 7 < phases.length && phases[i + 7] === myPhase;
      const sameLeft = col > 0 && phases[i - 1] === myPhase;
      const sameRight = col < 6 && phases[i + 1] === myPhase;
      const phaseColour = myPhase != null ? (phaseColourByName[myPhase] ?? null) : null;

      return {
        date, dayNum, isToday, isPast, loggedColour, isDeloadWindow, phaseColour,
        borderTop: !sameUp, borderBottom: !sameDown, borderLeft: !sameLeft, borderRight: !sameRight,
      };
    });
  }, [visibleMonth, today, history, engine, forecast, phaseColourByName]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 20 + insets.top, paddingBottom: 20 + insets.bottom }]}>
        <View style={styles.topBarRow}>
          <Text style={styles.title}>CALENDAR</Text>
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close calendar">
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>
        <Text style={[styles.positionLine, { color: currentPhaseColour ?? Colours.dim }]}>{currentPositionLine}</Text>

        <PlanProgressBar progress={planProgress} accent={currentPhaseColour ?? resolveColour('--gorse')} />

        <View style={styles.monthNavRow}>
          <Pressable onPress={() => setVisibleMonth(shiftMonth(visibleMonth, -1))} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Previous month">
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={styles.monthTitle}>{monthTitle(visibleMonth)}</Text>
            <Text style={styles.rateCaption}>~{forecast.weeklyRate.toFixed(1)} sessions / wk · last {forecast.windowDays}d</Text>
          </View>
          <Pressable onPress={() => setVisibleMonth(shiftMonth(visibleMonth, 1))} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Next month">
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>

        <MonthGrid cells={cells} />

        <Legend phases={engine.phases} deload={forecast.deload} isDeloadOngoing={isDeloadOngoing} resolveColour={resolveColour} />

        <StatsPanel stats={allTimeStats} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  content: { padding: 20, gap: 13 },
  topBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...Fonts.heading(26), color: '#FFFFFF' },
  closeIcon: { fontSize: 15, fontWeight: '600', color: Colours.dim },
  positionLine: { ...Fonts.mono(11, 'bold') },
  monthNavRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colours.s1, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 18, fontWeight: '700', color: Colours.dim },
  monthTitle: { ...Fonts.mono(13, 'bold'), color: '#FFFFFF' },
  rateCaption: { ...Fonts.mono(9.5, 'medium'), color: Colours.faint },
});

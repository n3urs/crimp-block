// app/plan.tsx
/** Direct port of PlanSheetView.swift — tapping the phase/week badge on
    the daily card opens this. Same content, same order: overall block
    progress, the current phase's own progress, the "coming back" taper
    card when returning from a layoff, and a tappable list of every phase.
    Reached via router.push('/plan') from card.tsx's phase badge and
    registered in app/_layout.tsx with `presentation: 'modal'`, the same
    pattern as day-picker.tsx/settings.tsx/calendar.tsx. Like those
    screens, this one resolves its OWN session/profile/store/engine,
    independent of card.tsx's — engine.block(today)'s done/total fields
    need real session-log data (store.days) to mean anything, not a fresh
    empty engine, so this can't skip that resolution the way weight-edit.tsx
    does. Each phase row pushes Task 3's app/plan-phase.tsx with just the
    index into engine.phases (route params must be primitives; that screen
    re-resolves its own engine and re-reads engine.phases[phaseIndex]). */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useStore } from '../src/data/useStore';
import { useProfile } from '../src/data/useProfile';
import { createEngine } from '../src/engine';
import type { Phase, BlockInfo } from '../src/engine/types';
import { computeOverallBar } from '../src/screens/plan/overallBar';

const PROGRAMS = require('../src/engine/programs.js');

export default function Plan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const program = useMemo(() => PROGRAMS[(email ?? '').toLowerCase()] ?? PROGRAMS.default, [email]);
  const profile = useProfile(userId);

  const [today] = useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());
  const startDate = profile.row?.programStartDate ?? program.startDate ?? null;
  const store = useStore(startDate, today, userId);
  const engine = useMemo(() => createEngine(program, { sessionLog: store.days, loadLog: {} }), [program, store.days]);

  const phases = engine.phases;
  const block = engine.block(today);
  const currentIndex = engine.phaseIndexAt(block.b);
  const current = currentIndex >= 0 && currentIndex < phases.length ? phases[currentIndex] : null;
  const returnInfo = engine.returnInfo(today);
  const overallSegments = computeOverallBar(phases, block.wIdx);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <Text style={styles.headerTitle}>THE PLAN</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 20 + insets.bottom }]}>
        <View style={styles.overallBarRow}>
          {overallSegments.map((seg, i) => (
            <View key={i} style={styles.overallSegmentTrack}>
              <View
                style={[
                  styles.overallSegmentFill,
                  { width: `${seg.frac * 100}%`, backgroundColor: seg.varName != null ? resolveColour(seg.varName) : Colours.s3 },
                ]}
              />
            </View>
          ))}
        </View>

        {current != null && (
          <CurrentPhaseCard phase={current} block={block} />
        )}

        <Text style={styles.explainer}>
          {block.over
            ? "You've worked through all six blocks — the structured plan is complete. It doesn't stop or reset: you now hold here indefinitely, still on the same 4-week rhythm with a deload every fourth trained week."
            : `A week advances when you've banked ${block.per} sessions that carried load — not every 7 days. Take a fortnight off and you pick up exactly where you left off. Four weeks make a block, and every fourth week is a deload.`}
        </Text>

        {returnInfo != null && (
          <View style={styles.comingBackCard}>
            <Text style={styles.comingBackLabel}>COMING BACK</Text>
            <Text style={styles.comingBackBody}>
              {`${returnInfo.gap} days off, back since ${returnInfo.resumed} — session ${returnInfo.session} of 2 in the taper. Weights are cut and volume is trimmed. Normal prescriptions from the session after this.`}
            </Text>
          </View>
        )}

        <View style={styles.phaseList}>
          {phases.map((phase, index) => {
            const isCurrent = index === currentIndex;
            const colour = isCurrent ? resolveColour(phase.c) : Colours.dim;
            return (
              <Pressable
                key={phase.n}
                onPress={() => router.push({ pathname: '/plan-phase', params: { phaseIndex: String(index) } })}
                style={[styles.phaseRow, { opacity: isCurrent ? 1 : 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel={`View the ${phase.n} phase`}
              >
                <View style={styles.phaseRowText}>
                  <Text style={[styles.phaseName, { color: colour }]}>{phase.n.toUpperCase()}</Text>
                  <Text style={[styles.phaseRange, { color: colour }]}>
                    {(isCurrent ? 'NOW · ' : '') + engine.phaseRange(index)}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: colour }]}>{'›'}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** Port of PlanSheetView.swift's `currentCard(_:)` (:81-103). Split out as
    its own component only to keep the ternary-heavy title string and the
    progress-bar-fraction/accent pairing readable — no logic lives here
    that isn't a straight line from the Swift source. */
function CurrentPhaseCard({ phase, block }: { phase: Phase; block: BlockInfo }) {
  const accent = resolveColour(phase.c);
  const barFrac = Math.min(1, block.done / Math.max(block.per, 1));
  const title = `${phase.n.toUpperCase()} · ${block.over ? 'ONGOING' : `BLOCK ${block.b}`} · WEEK ${block.w}` + (block.w === 4 ? ' · DELOAD' : '');
  return (
    <View style={[styles.currentCard, { backgroundColor: Colours.s1 }]}>
      <View style={[styles.currentCardAccent, { backgroundColor: accent }]} />
      <View style={styles.currentCardBody}>
        <Text style={[styles.currentCardTitle, { color: accent }]}>{title}</Text>
        <View style={styles.currentCardBarTrack}>
          <View style={[styles.currentCardBarFill, { width: `${barFrac * 100}%`, backgroundColor: accent }]} />
        </View>
        <Text style={styles.currentCardSubtitle}>
          {`${block.done} of ${block.per} sessions into this week · ${block.total} logged since you started`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  list: { padding: 20, paddingTop: 0, gap: 20 },

  overallBarRow: { flexDirection: 'row', gap: 3 },
  overallSegmentTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colours.s2, overflow: 'hidden' },
  overallSegmentFill: { height: '100%', borderRadius: 3 },

  // The 3px left accent stripe is ported as a flex-row sibling (brief's
  // explicitly-sanctioned alternative to Swift's `.overlay(..., alignment:
  // .leading)`) rather than absolute positioning — RN's overflow:'hidden'
  // + borderRadius on the outer row clips both children to the same
  // rounded rect Swift's clipShape produces.
  currentCard: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden' },
  currentCardAccent: { width: 3, alignSelf: 'stretch' },
  currentCardBody: { flex: 1, padding: 14, gap: 8 },
  currentCardTitle: { ...Fonts.mono(12, 'bold') },
  currentCardBarTrack: { height: 8, borderRadius: 4, backgroundColor: Colours.s2, overflow: 'hidden' },
  currentCardBarFill: { height: '100%', borderRadius: 4 },
  currentCardSubtitle: { ...Fonts.mono(12, 'medium'), color: Colours.faint },

  explainer: { fontSize: 13.5, color: Colours.dim },

  comingBackCard: { backgroundColor: Colours.s1, borderRadius: 8, padding: 14, gap: 6 },
  comingBackLabel: { ...Fonts.mono(11, 'bold'), color: Colours.dim },
  comingBackBody: { fontSize: 13.5, color: Colours.dim },

  phaseList: { gap: 8 },
  phaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colours.s1,
    borderRadius: 8,
    padding: 14,
  },
  phaseRowText: { gap: 2 },
  phaseName: { fontSize: 15, fontWeight: '700' },
  phaseRange: { ...Fonts.mono(11, 'medium'), opacity: 0.7 },
  chevron: { fontSize: 12, opacity: 0.4 },
});

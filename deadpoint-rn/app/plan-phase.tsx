// app/plan-phase.tsx
/** Direct port of PlanSheetView.swift's `PhaseDetailView` (:141-200) — the
    drill-down sheet pushed from a phase row on app/plan.tsx. Reached via
    router.push({ pathname: '/plan-phase', params: { phaseIndex } }) with
    just the array index into engine.phases (route params must be
    primitives), so — same as day-picker.tsx/weight-edit.tsx — this screen
    independently resolves its own program/profile/store/engine rather
    than trusting any state from the screen that pushed it, and re-reads
    engine.phases[phaseIndex] itself.

    phaseIndex is always in range in practice (plan.tsx only ever pushes
    an index it just read off engine.phases), but nothing stops a stale
    link or a future caller passing garbage, and no existing screen in
    this codebase had a route-level "bad param" precedent to match (day-
    picker.tsx's `if (!info) return null` is a per-row skip inside a list,
    not a whole-screen bail). So: if the index doesn't resolve, close the
    modal via router.back() rather than leave a blank, unclosable sheet
    on screen.

    isCurrent is compared by array index — index === engine.phaseIndexAt(...)
    — never by phase.n: Task 2 confirmed real program data (Joe's program)
    has multiple phases sharing a name, so name is not a valid identity
    check. Index is even stronger than phase.from for this since it's the
    exact same array both sides are drawn from. isCurrent is computed (per
    the task interface) but, like the Swift source's own `isCurrent: Bool`
    property, unused by the body below — PhaseDetailView never actually
    reads it either. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useStore } from '../src/data/useStore';
import { useProfile } from '../src/data/useProfile';
import { createEngine } from '../src/engine';

const PROGRAMS = require('../src/engine/programs.js');

export default function PlanPhase() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phaseIndex } = useLocalSearchParams<{ phaseIndex: string }>();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const program = useMemo(() => PROGRAMS[(email ?? '').toLowerCase()] ?? PROGRAMS.default, [email]);
  const profile = useProfile(userId);

  const [today] = useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());
  const startDate = profile.row?.programStartDate ?? program.startDate ?? null;
  const store = useStore(startDate, today, userId);
  const engine = useMemo(() => createEngine(program, { sessionLog: store.days, loadLog: {} }), [program, store.days]);

  const phase = engine.phases[Number(phaseIndex)];

  // Bad/out-of-range index (see doc comment above): dismiss rather than
  // strand the user on a blank sheet with no close control.
  useEffect(() => {
    if (!phase) router.back();
  }, [phase, router]);

  if (!phase) return null;

  const currentIndex = engine.phaseIndexAt(engine.block(today).b);
  const isCurrent = Number(phaseIndex) === currentIndex;
  const accent = resolveColour(phase.c);
  const changes = engine.phaseChanges(phase.n);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <Text style={styles.headerTitle}>{phase.n}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 20 + insets.bottom }]}>
        <Text style={styles.description}>{phase.d}</Text>

        <Text style={styles.label}>WHAT CHANGES IN THIS PHASE</Text>

        {changes.length === 0 ? (
          <Text style={styles.empty}>
            Sessions run at their standard prescriptions — this is the phase the others are written against.
          </Text>
        ) : (
          <View style={styles.changeList}>
            {changes.map((c, i) => (
              <View key={i} style={styles.changeCard}>
                <View style={styles.changeRow}>
                  <Text style={styles.changeTitle}>{c.title.toUpperCase()}</Text>
                  <Text style={styles.changeSession}>{c.sessionName}</Text>
                </View>
                <Text style={[styles.changePrescription, { color: accent }]}>{c.prescription}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  list: { padding: 20, paddingTop: 0, gap: 16 },

  description: { fontSize: 14, color: Colours.dim },
  label: { ...Fonts.mono(11, 'bold'), color: Colours.faint },
  empty: { fontSize: 13.5, color: Colours.dim },

  changeList: { gap: 8 },
  changeCard: { backgroundColor: Colours.s1, borderRadius: 8, padding: 12, gap: 3 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeTitle: { fontSize: 13, fontWeight: '600', color: Colours.fg, flexShrink: 1 },
  changeSession: { ...Fonts.mono(10, 'medium'), color: Colours.faint },
  changePrescription: { ...Fonts.mono(12, 'medium') },
});

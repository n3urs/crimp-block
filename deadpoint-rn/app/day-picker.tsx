// app/day-picker.tsx
/** Direct port of DayPickerView.swift — the backdating/editing modal for a
    previous (non-today) day tapped in DailyCard's WeekStrip. Follows the
    exact pattern Phase 4 established for app/(main)/calendar.tsx and this
    plan's own Task 1 (app/weight-edit.tsx): pushed via router.push() and
    registered in app/_layout.tsx with `presentation: 'modal'`. Like
    calendar.tsx (and unlike weight-edit.tsx), this screen has its OWN
    program/profile/store/engine resolution, independent of card.tsx's —
    see calendar.tsx's own doc comment / Decision 2 in the Phase 4 design
    spec for why: a second screen reached via router.push must not assume
    it shares React state with the screen that pushed it. */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useStore } from '../src/data/useStore';
import { useProfile } from '../src/data/useProfile';
import { createEngine, SESSION_ORDER } from '../src/engine';

const PROGRAMS = require('../src/engine/programs.js');

/** Swift's `"EEEE d MMM"` via en_GB (e.g. "Tuesday 1 Sep"). Parsed at LOCAL
    NOON, never `new Date(dateString)` directly — matching this project's
    own established date-parsing convention (see card.tsx's `dayLetter`)
    to avoid a day-backward shift in negative-UTC-offset timezones. */
function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12); // local noon - matches this project's own date-parsing convention
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(dt);
}

export default function DayPicker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const program = useMemo(() => PROGRAMS[(email ?? '').toLowerCase()] ?? PROGRAMS.default, [email]);
  const profile = useProfile(userId);

  const [today] = useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());
  const startDate = profile.row?.programStartDate ?? program.startDate ?? null;
  const store = useStore(startDate, today, userId);
  const engine = useMemo(() => createEngine(program, { sessionLog: store.days, loadLog: {} }), [program, store.days]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingEntry = store.get(date);

  // Board vs. plain hard climb is otherwise indistinguishable in the
  // engine (same session key, same prescription — see NativeStore.Entry.sub's
  // own doc comment) and only matters for the calendar's board-specific
  // count (src/screens/calendar/allTimeStats.ts). The live daily card asks
  // this via useDoneFlow's showClimbTypeConfirm before EVERY fresh climbHard
  // log; this screen is a second, independent place a climbHard day gets
  // logged (backdating a past day) and was missing the same prompt — every
  // day picked here silently saved with sub:null (useStore.set's own
  // default), so a real board session logged through this screen could
  // never count toward the board stat. Same Alert copy as DailyCard.tsx's
  // own dialog, deliberately — one prompt, wherever a climbHard day gets
  // logged, not a second, differently-worded one.
  const commitPick = async (key: string, sub: 'board' | 'climb' | null) => {
    setBusy(true);
    setError(null);
    try {
      await store.set(date, key, sub);
      router.back();
    } catch (e: any) {
      setError(`Couldn't save: ${e?.message ?? 'something went wrong'}`);
      setBusy(false);
    }
  };

  const onPick = (key: string) => {
    if (key === 'climbHard') {
      Alert.alert(
        'Board session, or just a hard climb?',
        undefined,
        [
          { text: 'BOARD SESSION', onPress: () => commitPick(key, 'board') },
          { text: 'JUST A HARD CLIMB', onPress: () => commitPick(key, 'climb') },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
      return;
    }
    commitPick(key, null);
  };

  const onClear = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.clear(date);
      router.back();
    } catch (e: any) {
      setError(`Couldn't clear: ${e?.message ?? 'something went wrong'}`);
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <Text style={styles.headerTitle}>{dateLabel(date)}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 20 + insets.bottom }]}>
        {SESSION_ORDER.map((key) => {
          const info = engine.sessionInfo(key);
          if (!info) return null;
          const colour = resolveColour(engine.sessionColourVarName(key));
          return (
            <Pressable
              key={key}
              onPress={() => onPick(key)}
              disabled={busy}
              style={[styles.row, { backgroundColor: Colours.s1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Log ${info.n} for ${dateLabel(date)}`}
            >
              <Text style={[styles.rowTitle, { color: colour }]}>{(info.n ?? '').toUpperCase()}</Text>
              <Text style={[styles.rowSubtitle, { color: colour }]}>{info.w}</Text>
            </Pressable>
          );
        })}

        {existingEntry != null && (
          <Pressable
            onPress={onClear}
            disabled={busy}
            style={[styles.clearButton, busy && styles.clearButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Clear the logged entry for ${dateLabel(date)}`}
          >
            <Text style={styles.clearButtonText}>CLEAR</Text>
          </Pressable>
        )}

        {error != null && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  list: { padding: 20, paddingTop: 0, gap: 10 },
  row: { padding: 14, borderRadius: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { ...Fonts.mono(11, 'medium'), opacity: 0.7, marginTop: 2 },
  clearButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: Colours.s2 },
  clearButtonDisabled: { opacity: 0.6 },
  clearButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.dim },
  error: { fontSize: 12, color: Colours.restC, textAlign: 'center' },
});

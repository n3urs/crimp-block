// app/weight-edit.tsx
/** Direct port of WeightEditView.swift. Real modal route, following the
    exact pattern Phase 4 established for app/(main)/calendar.tsx: pushed
    via router.push() and registered in app/_layout.tsx with
    `presentation: 'modal'`. Unlike calendar.tsx this screen has no
    engine/program dependency of its own — every value it needs
    (exerciseId, title, step, weightKg, date) is passed explicitly as a
    route param by the caller (card.tsx's onTapWeight), per the task
    brief's interface contract. */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { resolveColour } from '../src/design/colours';
import { useSession } from '../src/data/useSession';
import { useLoads } from '../src/data/useLoads';

/** Matches Swift's `.number.precision(.fractionLength(0...2))` — up to 2
    decimal places, no trailing zeros (20 -> "20", 20.5 -> "20.5",
    20.25 -> "20.25", 20.256 would round to "20.26" but the +/- step
    values in real program data never produce more than 2 real decimal
    places in practice). */
function formatValue(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

export default function WeightEdit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ exerciseId: string; title: string; step: string; weightKg: string; date: string }>();
  const { session } = useSession();
  const userId = session?.user?.id ?? '';
  const loads = useLoads(userId);

  const step = useMemo(() => Number(params.step) || 2.5, [params.step]);
  // No floor at 0: a negative value is a real, meaningful state here —
  // it represents assistance taken OFF the exercise (e.g. a band or
  // pulley), matching WeightEditView.swift's own explicit reasoning, not
  // a bug to be clamped away.
  const [value, setValue] = useState(() => (params.weightKg ? Number(params.weightKg) : 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await loads.set(params.date, params.exerciseId, value);
      router.back();
    } catch (e: any) {
      setError(`Couldn't save: ${e?.message ?? 'something went wrong'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>CANCEL</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{params.title}</Text>

      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => setValue((v) => v - step)}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Decrease by ${step}kg`}
        >
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <Text style={styles.value}>{formatValue(value)}kg</Text>
        <Pressable
          onPress={() => setValue((v) => v + step)}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Increase by ${step}kg`}
        >
          <Text style={styles.stepperGlyph}>+</Text>
        </Pressable>
      </View>

      {error != null && <Text style={styles.error}>{error}</Text>}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={onSave}
        disabled={saving}
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Save"
      >
        <Text style={styles.saveButtonText}>{saving ? 'SAVING…' : 'SAVE'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  cancel: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  title: { fontSize: 22, fontWeight: '800', color: Colours.fg, marginBottom: 20 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  stepperButton: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: Colours.s2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperGlyph: { fontSize: 28, fontWeight: '700', color: Colours.fg },
  value: { ...Fonts.mono(34, 'bold'), color: Colours.fg, minWidth: 140, textAlign: 'center' },
  error: { fontSize: 12, color: Colours.restC, textAlign: 'center', marginTop: 16 },
  saveButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: resolveColour('--gorse') },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});

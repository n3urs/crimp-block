// app/weights-edit.tsx
/** Multi-weight sibling of weight-edit.tsx, for a superset/accessory row
    that tracks several independent weights under one card entry (Oscar's
    Antagonists — reverse wrist curls / external rotation / dips). Same
    modal-route pattern, same loads.set() write path per item, just one
    stepper per item instead of one stepper for the whole screen. Every
    value it needs (groupTitle, items, date) is passed explicitly as a
    route param by the caller (card.tsx's onTapWeightGroup), matching
    weight-edit.tsx's own contract. */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { resolveColour } from '../src/design/colours';
import { useSession } from '../src/data/useSession';
import { useLoads } from '../src/data/useLoads';
import type { WeightGroupItem } from '../src/engine/types';

function formatValue(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

export default function WeightsEdit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ groupTitle: string; items: string; date: string }>();
  const { session } = useSession();
  const userId = session?.user?.id ?? '';
  const loads = useLoads(userId);

  const items = useMemo<WeightGroupItem[]>(() => {
    try {
      return JSON.parse(params.items ?? '[]');
    } catch {
      return [];
    }
  }, [params.items]);

  const [values, setValues] = useState<number[]>(() => items.map((it) => it.weightKg ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bump = (index: number, delta: number) => {
    setValues((prev) => prev.map((v, i) => (i === index ? v + delta : v)));
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(items.map((it, i) => loads.set(params.date, it.id, values[i])));
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

      <Text style={styles.title}>{params.groupTitle}</Text>

      <View style={styles.list}>
        {items.map((item, i) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.weightIsBump && <Text style={styles.increaseArrow}>▲ suggested</Text>}
            </View>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => bump(i, -item.step)}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${item.title} by ${item.step}kg`}
              >
                <Text style={styles.stepperGlyph}>−</Text>
              </Pressable>
              <Text style={styles.value}>{formatValue(values[i])}kg</Text>
              <Pressable
                onPress={() => bump(i, item.step)}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${item.title} by ${item.step}kg`}
              >
                <Text style={styles.stepperGlyph}>+</Text>
              </Pressable>
            </View>
          </View>
        ))}
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
  list: { gap: 22 },
  itemRow: { alignItems: 'center' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: Colours.fg },
  increaseArrow: { ...Fonts.mono(10, 'bold'), color: resolveColour('--gorse') },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  stepperButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colours.s2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperGlyph: { fontSize: 24, fontWeight: '700', color: Colours.fg },
  value: { ...Fonts.mono(26, 'bold'), color: Colours.fg, minWidth: 110, textAlign: 'center' },
  error: { fontSize: 12, color: Colours.restC, textAlign: 'center', marginTop: 16 },
  saveButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: resolveColour('--gorse') },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});

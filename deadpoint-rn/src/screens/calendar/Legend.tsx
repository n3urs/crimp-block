// src/screens/calendar/Legend.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { Phase } from '../../engine/types';
import type { Deload } from './trendForecast';

function displayDate(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

export interface LegendProps {
  phases: Phase[];
  deload: Deload | null;
  isDeloadOngoing: boolean;
  resolveColour: (varName: string) => string;
}

export function Legend({ phases, deload, isDeloadOngoing, resolveColour }: LegendProps) {
  return (
    <View style={{ gap: 8, paddingTop: 4 }}>
      <View style={styles.row}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: Colours.s2 }]} />
          <Text style={styles.legendText}>No session</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.deloadSwatch} />
          <Text style={styles.legendText}>Deload week</Text>
        </View>
      </View>
      {deload != null && (
        <Text style={styles.caption}>
          {isDeloadOngoing
            ? `This deload runs to ${displayDate(deload.end)}, at your pace`
            : `Next deload, at your pace: ${displayDate(deload.start)} – ${displayDate(deload.end)}`}
        </Text>
      )}
      {phases.length > 0 && (
        <>
          <View style={[styles.row, { paddingTop: 2 }]}>
            {phases.map((phase) => (
              <View key={phase.n} style={styles.legendItem}>
                <View style={[styles.phaseSwatch, { borderColor: resolveColour(phase.c) }]} />
                <Text style={styles.legendText}>{phase.n.toUpperCase()}</Text>
              </View>
            ))}
          </View>
          {/* Swift gives this disclaimer its OWN smaller, more muted style
              (mono(9.5) / faint) than the deload caption above
              (mono(10.5) / dim) — deliberately: Swift's own comment calls
              this a de-emphasized footnote, redundant with the box outline
              itself. Reusing styles.caption here would make it render
              LARGER and MORE prominent than the deload line, inverting
              the intended hierarchy. */}
          <Text style={[styles.disclaimer, { paddingTop: 2 }]}>
            Phases past today are projected from your current pace, not confirmed.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  deloadSwatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colours.restC },
  phaseSwatch: { width: 10, height: 10, borderRadius: 2, borderWidth: 2 },
  legendText: { ...Fonts.mono(10, 'medium'), color: Colours.faint },
  caption: { ...Fonts.mono(10.5, 'medium'), color: Colours.dim },
  disclaimer: { ...Fonts.mono(9.5, 'medium'), color: Colours.faint },
});

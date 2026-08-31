// src/screens/calendar/StatsPanel.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { AllTimeStats } from './allTimeStats';

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
}

export function StatsPanel({ stats }: { stats: AllTimeStats | null }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.divider} />
      <Text style={styles.heading}>STATS</Text>
      <View style={styles.tileRow}>
        <StatTile value={stats ? `${stats.loggedCount}` : '—'} label="SESSIONS LOGGED" />
        <StatTile
          value={stats?.consistencyPercent != null ? `${stats.consistencyPercent}%` : '—'}
          label={stats?.consistencyFraction ? `CONSISTENCY · ${stats.consistencyFraction}` : 'CONSISTENCY'}
        />
        <StatTile value={stats ? `${stats.streak}` : '—'} label="DAY STREAK" />
      </View>
      {stats != null && stats.breakdown.length > 0 && (
        <View style={styles.breakdownGrid}>
          {stats.breakdown.map((row) => (
            <View key={row.key} style={styles.breakdownRow}>
              <View style={[styles.breakdownSwatch, { backgroundColor: row.colour }]} />
              <Text style={styles.breakdownText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{row.name.toUpperCase()} · {row.count}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: Colours.s2 },
  heading: { ...Fonts.mono(11, 'bold'), color: Colours.faint },
  tileRow: { flexDirection: 'row' },
  tile: { flex: 1, gap: 2 },
  tileValue: { ...Fonts.heading(22), color: '#FFFFFF' },
  tileLabel: { ...Fonts.mono(8.5, 'medium'), color: Colours.faint },
  // Swift's LazyVGrid uses spacing:12 for the horizontal gap between its 2
  // columns and a separate spacing:6 for the vertical row gap — a single
  // `gap: 6` here would halve the intended horizontal gap.
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 12 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '47%' },
  breakdownSwatch: { width: 8, height: 8, borderRadius: 2 },
  breakdownText: { ...Fonts.mono(10, 'medium'), color: Colours.dim, flexShrink: 1 },
});

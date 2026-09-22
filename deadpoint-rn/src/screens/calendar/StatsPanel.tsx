// src/screens/calendar/StatsPanel.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

export type StatsScope = 'month' | 'allTime';

/** The MONTH / ALL TIME switch. All time is the default and the right-hand
    option, so the panel opens showing what it always showed; MONTH scopes
    everything below to whichever month the grid is on. */
function ScopeSwitch({ scope, monthLabel, onChange }: { scope: StatsScope; monthLabel: string; onChange: (s: StatsScope) => void }) {
  return (
    <View style={styles.switchTrack}>
      {([['month', monthLabel], ['allTime', 'ALL TIME']] as const).map(([value, label]) => {
        const selected = scope === value;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            hitSlop={8}
            style={[styles.switchOption, selected && styles.switchOptionSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={value === 'month' ? `Show stats for ${monthLabel} only` : 'Show all-time stats'}
          >
            <Text style={[styles.switchLabel, selected && styles.switchLabelSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatsPanel({
  stats, scope, monthLabel, onChangeScope,
}: {
  stats: AllTimeStats | null;
  scope: StatsScope;
  /** Short form of the visible month, e.g. 'SEPT' — the switch is narrow. */
  monthLabel: string;
  onChangeScope: (scope: StatsScope) => void;
}) {
  const isMonth = scope === 'month';
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.divider} />
      <View style={styles.headingRow}>
        <Text style={styles.heading}>STATS</Text>
        <ScopeSwitch scope={scope} monthLabel={monthLabel} onChange={onChangeScope} />
      </View>
      <View style={styles.tileRow}>
        <StatTile value={stats ? `${stats.loggedCount}` : '—'} label="SESSIONS LOGGED" />
        <StatTile
          value={stats?.consistencyPercent != null ? `${stats.consistencyPercent}%` : '—'}
          label={stats?.consistencyFraction ? `CONSISTENCY · ${stats.consistencyFraction}` : 'CONSISTENCY'}
        />
        {/* A *current* streak is a fact about today, so browsing to last
            March and reading "6 DAY STREAK" would be nonsense — month
            scope reports that month's longest run instead. */}
        <StatTile value={stats ? `${stats.streak}` : '—'} label={isMonth ? 'BEST STREAK' : 'DAY STREAK'} />
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
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchTrack: { flexDirection: 'row', padding: 2, borderRadius: 999, backgroundColor: Colours.s2 },
  switchOption: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  switchOptionSelected: { backgroundColor: Colours.fg },
  switchLabel: { ...Fonts.mono(9.5, 'bold'), color: Colours.dim, letterSpacing: 0.5 },
  switchLabelSelected: { color: Colours.bg },
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

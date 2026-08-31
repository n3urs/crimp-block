// src/screens/calendar/PlanProgressBar.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { PlanProgress } from './planProgress';

export function PlanProgressBar({ progress, accent }: { progress: PlanProgress | null; accent: string }) {
  if (!progress) return null;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>PLAN PROGRESS</Text>
        <Text style={styles.percent}>{progress.percent}%</Text>
      </View>
      <View style={styles.track}>
        {/* Swift: max(6, trackWidth * percent/100) — a fixed 6-POINT
            minimum fill width, not a percentage of the track. RN's
            minWidth clamps a percentage width to an absolute point value
            exactly the same way, regardless of the track's own actual
            rendered width (a percentage floor like `Math.max(2, percent)%`
            would scale with container width and not match Swift's fixed
            floor on a differently-sized track, e.g. iPad landscape). */}
        <View style={[styles.fill, { width: `${progress.percent}%`, minWidth: 6, backgroundColor: accent }]} />
      </View>
      <Text style={styles.caption}>{progress.current}/{progress.total} training days to Performance</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { ...Fonts.mono(9.5, 'medium'), color: Colours.faint },
  percent: { ...Fonts.mono(13, 'bold'), color: '#FFFFFF' },
  track: { height: 8, borderRadius: 4, backgroundColor: Colours.s2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  caption: { ...Fonts.mono(9, 'medium'), color: Colours.faint },
});

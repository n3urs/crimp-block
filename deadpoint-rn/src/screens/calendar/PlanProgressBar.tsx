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
        <View style={[styles.fill, { width: `${Math.max(2, progress.percent)}%`, backgroundColor: accent }]} />
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

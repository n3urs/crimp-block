// src/components/force-gauge/GaugeLostNotice.tsx
/** The loud "your gauge switched itself off" screen for the gym station:
    readable from across the room, with the exact fix (power-cycle it) in
    big type. Shown by app/gym.tsx while the gauge is gone; it disappears
    on its own the moment the station reconnects. */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Fonts } from '../../design/fonts';
import { Colours } from '../../design/colours';

const ALERT = '#FF8A3D';

function PowerIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.4 6.6a8 8 0 1 0 11.2 0" fill="none" stroke={ALERT} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={12} y1={2.5} x2={12} y2={11} stroke={ALERT} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function GaugeLostNotice({ headline, hint, width }: { headline: string; hint: string; width: number }) {
  const unit = Math.max(280, Math.min(width, 640)) / 640; // 1 at the widest
  return (
    <View style={[styles.card, { padding: 28 * unit + 8, gap: 16 * unit + 4, maxWidth: 640 * unit + 40 }]}>
      <PowerIcon size={96 * unit + 24} />
      <Text style={[styles.headline, { fontSize: 34 * unit + 6, letterSpacing: 2 }]} accessibilityRole="alert">{headline}</Text>
      <Text style={[styles.hint, { fontSize: 22 * unit + 4, lineHeight: 30 * unit + 6 }]}>{hint}</Text>
      <View style={styles.waiting}>
        <ActivityIndicator color={ALERT} />
        <Text style={styles.waitingText}>Waiting for the gauge…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,138,61,0.6)',
    backgroundColor: 'rgba(255,138,61,0.10)',
  },
  headline: { ...Fonts.mono(24, 'bold'), color: ALERT, textAlign: 'center' },
  hint: { color: Colours.fg, textAlign: 'center' },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  waitingText: { ...Fonts.mono(12, 'medium'), color: Colours.dim },
});

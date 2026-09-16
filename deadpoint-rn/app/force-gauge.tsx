// app/force-gauge.tsx
/** Live viewer for Oscar's homemade force gauge (LetticeTindik) — a real
    Tindeq Progressor BLE emulator (see src/data/forceGauge/protocol.ts's
    own doc comment). Layout is modelled directly on the real Tindeq
    app's own "Monitor sessions live" screen: a small stat row up top
    (Current/Peak), the graph filling most of the screen, one action
    button fixed to the bottom. v1 is a pure live viewer — nothing here
    is logged into the app's own data yet, per the approved scope.
    Reached via router.push('/force-gauge') from settings.tsx and
    registered in app/_layout.tsx with `presentation: 'modal'`, the same
    pattern as every other modal screen in this app. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useForceGauge, type GraphPoint } from '../src/data/forceGauge/useForceGauge';

const GRAPH_WINDOW_SEC = 20;
const ACCENT = resolveColour('--gorse');

function formatKg(kg: number): string {
  return (Math.round(kg * 10) / 10).toFixed(1);
}

/** Auto-scales to whatever's actually been pulled so a light warm-up
    doesn't get lost at the bottom of a graph sized for a max hang, and a
    real max effort doesn't clip off the top. Floors at 10 kg of range so
    the line isn't a flat wall of noise before any real pull happens. */
function ForceGraph({ points, width, height }: { points: GraphPoint[]; width: number; height: number }) {
  const maxKg = Math.max(10, ...points.map((p) => p.kg), 0);
  const minKg = Math.min(0, ...points.map((p) => p.kg));
  const range = maxKg - minKg || 1;
  const latestT = points.length > 0 ? points[points.length - 1].tSec : GRAPH_WINDOW_SEC;
  const earliestT = latestT - GRAPH_WINDOW_SEC;

  const x = (t: number) => ((t - earliestT) / GRAPH_WINDOW_SEC) * width;
  const y = (kg: number) => height - ((kg - minKg) / range) * height;
  const zeroY = y(0);

  const d = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.tSec).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ')
    : '';

  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke={Colours.s3} strokeWidth={1} />
      {d !== '' && <Path d={d} stroke={ACCENT} strokeWidth={2} fill="none" />}
    </Svg>
  );
}

export default function ForceGauge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { status, errorMessage, deviceName, current, peak, points, scan, disconnect, reset } = useForceGauge();
  const [graphHeight, setGraphHeight] = useState(0);

  const isLive = status === 'connected';
  const graphWidth = screenWidth - 40; // matches root's horizontal padding

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>FORCE GAUGE</Text>
        <Pressable
          onPress={() => { if (isLive) disconnect(); router.back(); }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      {isLive ? (
        <>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>CURRENT</Text>
              <Text style={[styles.statValue, { color: ACCENT }]}>{formatKg(current)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>PEAK</Text>
              <Text style={[styles.statValue, { color: ACCENT }]}>{formatKg(peak)}</Text>
            </View>
          </View>

          <View style={styles.graphArea} onLayout={(e) => setGraphHeight(e.nativeEvent.layout.height)}>
            {graphHeight > 0 && <ForceGraph points={points} width={graphWidth} height={graphHeight} />}
          </View>

          <Pressable onPress={reset} style={styles.resetButton} accessibilityRole="button" accessibilityLabel="Reset">
            <Text style={styles.resetButtonText}>RESET</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.scanState}>
          <Text style={styles.scanBody}>
            {status === 'error'
              ? errorMessage ?? 'Something went wrong.'
              : deviceName != null
                ? `Connected to ${deviceName}`
                : 'Turn your force gauge on, then scan to connect.'}
          </Text>
          <Pressable
            onPress={scan}
            disabled={status === 'scanning' || status === 'connecting' || status === 'requestingPermission'}
            style={[styles.scanButton, (status === 'scanning' || status === 'connecting') && styles.scanButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Scan for force gauge"
          >
            <Text style={styles.scanButtonText}>
              {status === 'scanning' ? 'SCANNING…' : status === 'connecting' ? 'CONNECTING…' : 'SCAN'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },

  statRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: Colours.s1, borderRadius: 8, padding: 14, alignItems: 'center', gap: 4 },
  statLabel: { ...Fonts.mono(10, 'bold'), color: Colours.faint, letterSpacing: 1 },
  statValue: { ...Fonts.mono(34, 'bold') },

  graphArea: { flex: 1 },

  resetButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: Colours.s2, marginTop: 16 },
  resetButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.fg },

  scanState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 20 },
  scanBody: { fontSize: 14, color: Colours.dim, textAlign: 'center' },
  scanButton: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 8, backgroundColor: ACCENT },
  scanButtonDisabled: { opacity: 0.6 },
  scanButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});

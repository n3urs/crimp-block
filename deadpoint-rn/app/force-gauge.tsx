// app/force-gauge.tsx
/** Live viewer for Oscar's homemade force gauge (LetticeTindik) — a real
    Tindeq Progressor BLE emulator (see src/data/forceGauge/protocol.ts).
    Scan → pick a gauge from the list → live readout: Current/Peak up top,
    the force trace filling the screen, Tare/Reset at the bottom. v1 is a
    pure live viewer — nothing here is logged into the app's own data yet.
    Reached via router.push('/force-gauge') from settings.tsx; registered
    in app/_layout.tsx with `presentation: 'modal'`. */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import {
  GRAPH_WINDOW_SEC,
  useForceGauge,
  type ForceGaugeStatus,
  type GraphPoint,
} from '../src/data/forceGauge/useForceGauge';

const ACCENT = resolveColour('--gorse');
const Y_LABEL_WIDTH = 30;
// Keeps the trace (and its 2.5pt stroke) off the card's top and bottom
// edges even when a reading sits exactly on the scale's limit.
const PLOT_PAD_Y = 10;
// Room for the live-point dot (radius + ring) at the newest sample.
const PLOT_PAD_RIGHT = 7;

function formatKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return (rounded === 0 ? 0 : rounded).toFixed(1); // no "-0.0"
}

function scanStatusText(status: ForceGaugeStatus, errorMessage: string | null, deviceName: string | null, deviceCount: number): string {
  if (status === 'error') return errorMessage ?? 'Something went wrong.';
  if (status === 'connecting') return `Connecting to ${deviceName}…`;
  if (deviceCount > 0) return 'Tap your force gauge to connect.';
  if (status === 'scanning') return 'Looking for force gauges nearby…';
  if (status === 'scanDone') return "No force gauge found. Make sure it's switched on and close to your phone, then scan again.";
  return 'Switch your force gauge on, then scan.';
}

/** Rounds to 1, 2 or 5 × 10ⁿ so gridlines land on numbers you can read
    at a glance mid-hang. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const n = rough / magnitude;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * magnitude;
}

/** Scale covers the visible trace AND the session peak, so the axis doesn't
    collapse the moment a big pull scrolls out of the 20 s window. Never
    narrower than 0–10 kg, so resting noise doesn't fill the card. */
function computeScale(points: GraphPoint[], peak: number) {
  let hi = Math.max(10, peak);
  let lo = 0;
  for (const p of points) {
    if (p.kg > hi) hi = p.kg;
    if (p.kg < lo) lo = p.kg;
  }
  const step = niceStep((hi - lo) / 4);
  const top = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= top + step / 2; v += step) ticks.push(v);
  return { lo, top, ticks };
}

function ForceGraph({ points, peak, width, height }: { points: GraphPoint[]; peak: number; width: number; height: number }) {
  const { lo, top, ticks } = computeScale(points, peak);
  const plotW = width - Y_LABEL_WIDTH - PLOT_PAD_RIGHT;
  const plotH = height - PLOT_PAD_Y * 2;
  const latestT = points.length > 0 ? points[points.length - 1].tSec : GRAPH_WINDOW_SEC;
  const earliestT = latestT - GRAPH_WINDOW_SEC;

  const x = (t: number) => Y_LABEL_WIDTH + ((t - earliestT) / GRAPH_WINDOW_SEC) * plotW;
  const y = (kg: number) => PLOT_PAD_Y + (1 - (kg - lo) / (top - lo)) * plotH;
  const zeroY = y(0);

  const hasTrace = points.length > 1;
  const line = hasTrace
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.tSec).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ')
    : '';
  const area = hasTrace
    ? `${line} L${x(latestT).toFixed(1)} ${zeroY.toFixed(1)} L${x(points[0].tSec).toFixed(1)} ${zeroY.toFixed(1)} Z`
    : '';
  const last = points[points.length - 1];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="traceFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={ACCENT} stopOpacity={0.28} />
          <Stop offset="1" stopColor={ACCENT} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {ticks.map((v) => (
        <React.Fragment key={v}>
          <Line
            x1={Y_LABEL_WIDTH}
            x2={width}
            y1={y(v)}
            y2={y(v)}
            stroke={v === 0 ? Colours.s4 : Colours.s2}
            strokeWidth={1}
          />
          <SvgText
            x={Y_LABEL_WIDTH - 8}
            y={y(v) + 3.5}
            textAnchor="end"
            fontFamily="RobotoMono-Medium"
            fontSize={10}
            fill={Colours.dim}
          >
            {v}
          </SvgText>
        </React.Fragment>
      ))}

      {hasTrace && <Path d={area} fill="url(#traceFill)" />}
      {peak > 0.5 && (
        <Line
          x1={Y_LABEL_WIDTH}
          x2={width}
          y1={y(peak)}
          y2={y(peak)}
          stroke={ACCENT}
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}
      {hasTrace && <Path d={line} stroke={ACCENT} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />}
      {last != null && <Circle cx={x(last.tSec)} cy={y(last.kg)} r={4.5} fill={ACCENT} stroke={Colours.s1} strokeWidth={2} />}
    </Svg>
  );
}

function Stat({ label, kg, colour }: { label: string; kg: number; colour: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${formatKg(kg)} kilograms`}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: colour }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatKg(kg)}
        </Text>
        <Text style={styles.statUnit}>kg</Text>
      </View>
    </View>
  );
}

export default function ForceGauge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, errorMessage, devices, deviceName, current, peak, points, taring, scan, connect, reset, tare } = useForceGauge();
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });

  const isLive = status === 'connected';
  const isBusy = status === 'scanning' || status === 'connecting';

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>FORCE GAUGE</Text>
          {/* Leaving the screen disconnects: the hook tears the connection down on unmount. */}
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>CLOSE</Text>
          </Pressable>
        </View>
        {isLive && (
          <View style={styles.liveRow} accessible accessibilityLabel={`Connected to ${deviceName}`}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText} numberOfLines={1}>{deviceName}</Text>
          </View>
        )}
      </View>

      {isLive ? (
        <>
          <View style={styles.statRow}>
            <Stat label="CURRENT" kg={current} colour={Colours.fg} />
            <Stat label="PEAK" kg={peak} colour={ACCENT} />
          </View>

          <View style={styles.graphCard}>
            <View style={styles.graphCaptionRow}>
              <Text style={styles.graphCaption}>KG</Text>
              <Text style={styles.graphCaption}>LAST {GRAPH_WINDOW_SEC} SEC</Text>
            </View>
            <View
              style={styles.graphArea}
              onLayout={(e) => setGraphSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
              {graphSize.height > 0 && <ForceGraph points={points} peak={peak} width={graphSize.width} height={graphSize.height} />}
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={tare}
              disabled={taring}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Tare"
              accessibilityHint="Zeroes the gauge. Take your hands off it first."
              accessibilityState={{ disabled: taring, busy: taring }}
            >
              <Text style={[styles.actionText, taring && styles.actionTextBusy]}>{taring ? 'ZEROING…' : 'TARE'}</Text>
            </Pressable>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Reset"
              accessibilityHint="Clears the peak and the graph."
            >
              <Text style={styles.actionText}>RESET</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={styles.scanState}>
            {isBusy && <ActivityIndicator color={ACCENT} style={styles.spinner} />}
            <Text style={styles.scanBody}>{scanStatusText(status, errorMessage, deviceName, devices.length)}</Text>
            {devices.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => connect(d)}
                disabled={status === 'connecting'}
                style={({ pressed }) => [styles.deviceRow, pressed && styles.deviceRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${d.name}`}
              >
                <Text style={styles.deviceName}>{d.name}</Text>
                <Text style={[styles.deviceAction, { color: ACCENT }]}>
                  {status === 'connecting' && d.name === deviceName ? 'CONNECTING…' : 'CONNECT'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={scan}
            disabled={isBusy}
            style={[styles.scanButton, isBusy && styles.scanButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Scan for force gauges"
          >
            <Text style={styles.scanButtonText}>
              {status === 'scanning' ? 'SCANNING…' : status === 'idle' ? 'SCAN' : 'SCAN AGAIN'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, paddingHorizontal: 20 },
  header: { gap: 8, marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colours.go },
  liveText: { ...Fonts.mono(11, 'medium'), color: Colours.dim, flexShrink: 1 },

  statRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: Colours.s1, borderRadius: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  statLabel: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  statValue: { ...Fonts.timerDigits(40), flexShrink: 1 },
  statUnit: { ...Fonts.mono(13, 'medium'), color: Colours.dim },

  graphCard: { flex: 1, backgroundColor: Colours.s1, borderRadius: 8, marginTop: 12, paddingTop: 12, paddingBottom: 6, paddingLeft: 6, paddingRight: 14 },
  graphCaptionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 8, marginBottom: 6 },
  graphCaption: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1 },
  graphArea: { flex: 1 },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actionButton: { flex: 1, paddingVertical: 16, borderRadius: 8, alignItems: 'center', backgroundColor: Colours.s2 },
  actionButtonPressed: { backgroundColor: Colours.s3 },
  actionText: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
  actionTextBusy: { color: Colours.dim },

  scanState: { flex: 1, justifyContent: 'center', gap: 10 },
  spinner: { marginBottom: 6 },
  scanBody: { fontSize: 14, color: Colours.dim, textAlign: 'center', marginBottom: 10, paddingHorizontal: 20 },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 8, backgroundColor: Colours.s1 },
  deviceRowPressed: { backgroundColor: Colours.s2 },
  deviceName: { ...Fonts.mono(14, 'bold'), color: Colours.fg },
  deviceAction: { ...Fonts.mono(11, 'bold') },
  scanButton: { paddingVertical: 16, borderRadius: 8, alignItems: 'center', backgroundColor: ACCENT, marginTop: 12 },
  scanButtonDisabled: { opacity: 0.6 },
  scanButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg, letterSpacing: 1 },
});

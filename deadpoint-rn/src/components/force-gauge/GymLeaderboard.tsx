// src/components/force-gauge/GymLeaderboard.tsx
/** The gym station's top-5, drawn big for the idle / game-over screens so
    people walking past can see who's winning and what to beat. Same
    arcade-scoreboard look at any size: `unit` is one row's height in px
    and everything else scales from it, so the caller can render it large
    on the waiting screen and smaller under a game-over score.

    Always five rows: an unclaimed place shows "OPEN" so the board reads as
    a target to fill. Rows drop in one after another each time the board
    mounts (the caller mounts it fresh whenever the screen appears). */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Fonts } from '../../design/fonts';
import { BOARD_SIZE, type BoardEntry } from '../../data/forceGauge/gymBoard';

const GOLD = '#FFD34D';
const SILVER = '#D8DEE6';
const BRONZE = '#E58F4E';
const PLAIN = 'rgba(255,255,255,0.22)';
const MEDAL_INK = '#2A1B05';

const medalColour = (rank: number) => (rank === 0 ? GOLD : rank === 1 ? SILVER : rank === 2 ? BRONZE : PLAIN);

function Crown({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M2 19 L3.5 7 L8.5 12.5 L12 4 L15.5 12.5 L20.5 7 L22 19 Z" fill={GOLD} stroke="#8A5A00" strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  );
}

export function GymLeaderboard({ entries, unit }: { entries: BoardEntry[]; unit: number }) {
  const rows = Array.from({ length: BOARD_SIZE }, (_, i) => entries[i] ?? null);
  return (
    <View style={[styles.card, { borderRadius: unit * 0.35, padding: unit * 0.3, gap: unit * 0.16 }]}>
      <View style={[styles.titleRow, { gap: unit * 0.22, marginBottom: unit * 0.06 }]}>
        <Crown size={unit * 0.62} />
        <Text style={[styles.title, { fontSize: unit * 0.4, letterSpacing: unit * 0.09 }]}>TOP 5 THIS WEEK</Text>
        <Crown size={unit * 0.62} />
      </View>
      {rows.map((entry, i) => {
        const top = i === 0;
        const h = top ? unit * 1.18 : unit;
        return (
          <Animated.View
            key={i}
            entering={FadeInDown.delay(i * 110).springify().damping(14)}
            style={[
              styles.row,
              { height: h, borderRadius: h * 0.3, paddingHorizontal: unit * 0.22, gap: unit * 0.26 },
              top && entry != null && styles.rowTop,
              entry == null && styles.rowOpen,
            ]}
          >
            <View style={[styles.medal, { width: h * 0.7, height: h * 0.7, borderRadius: h * 0.35, backgroundColor: medalColour(i) }]}>
              <Text style={[styles.medalText, { fontSize: h * 0.4, color: i < 3 ? MEDAL_INK : '#FFFFFF' }]}>{i + 1}</Text>
            </View>
            <Text
              style={[styles.name, { fontSize: h * (top ? 0.5 : 0.46) }, top && entry != null && { color: GOLD }, entry == null && styles.dim]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {entry != null ? entry.name : 'OPEN'}
            </Text>
            {entry != null && (
              <Text style={[styles.score, { fontSize: h * (top ? 0.7 : 0.62) }, top && { color: GOLD }]}>{entry.score}</Text>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The gentle pulsing call-to-action under the board. */
export function PullPrompt({ label, size }: { label: string; size: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false);
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 0.72 + (s.value - 1) * 3.5 }));
  return (
    <Animated.Text style={[styles.prompt, { fontSize: size, marginTop: size * 0.9 }, style]}>{label}</Animated.Text>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(10,14,22,0.82)',
    borderWidth: 2,
    borderColor: 'rgba(255,211,77,0.55)',
    shadowColor: GOLD,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    alignSelf: 'stretch',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  title: { ...Fonts.mono(14, 'bold'), color: GOLD, textShadowColor: 'rgba(255,211,77,0.55)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  rowTop: { backgroundColor: 'rgba(255,211,77,0.18)', borderWidth: 2, borderColor: 'rgba(255,211,77,0.75)' },
  rowOpen: { backgroundColor: 'rgba(255,255,255,0.04)' },
  medal: { alignItems: 'center', justifyContent: 'center' },
  medalText: { ...Fonts.mono(14, 'bold') },
  name: { ...Fonts.mono(14, 'bold'), color: '#FFFFFF', flex: 1, letterSpacing: 1 },
  dim: { color: 'rgba(255,255,255,0.28)' },
  score: { ...Fonts.timerDigits(28), color: '#FFFFFF' },
  prompt: { ...Fonts.mono(14, 'bold'), color: '#FFFFFF', letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
});

// src/components/force-gauge/FlappyBirdGame.tsx
/** The force gauge's Flappy Bird mode — pull the gauge to climb, ease off
    to fall, dodge scrolling pipe gaps. Mounted by app/force-gauge.tsx in
    place of the live stat/graph/action rows while a round is in progress.
    Design: docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md.

    Visual style, per Oscar's own follow-up request after trying the first
    build: the classic Flappy Bird palette (sky, green pipes, yellow bird),
    not Deadpoint's own dark/mono look — the play area is deliberately its
    own little world, separate from the rest of the app's chrome. */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colours, resolveColour } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { GraphPoint } from '../../data/forceGauge/useForceGauge';
import { useFlappyBird } from '../../data/forceGauge/useFlappyBird';
import { DEFAULT_CONFIG } from '../../data/forceGauge/flappyPhysics';

const ACCENT = resolveColour('--gorse');

// Classic Flappy Bird palette — a colour-scheme homage (colours aren't
// copyrightable), not a trace of the original's actual sprite art.
const SKY_TOP = '#4EC0CA';
const SKY_BOTTOM = '#8AD9E0';
const CLOUD = '#FFFFFF';
const GRASS = '#6FC344';
const GRASS_EDGE = '#4A9528';
const DIRT = '#DED895';
const PIPE_BODY = '#74BF2E';
const PIPE_CAP = '#8FD84A';
const PIPE_STROKE = '#4F8C1F';
const BIRD_BODY = '#FFDA44';
const BIRD_BELLY = '#FFF3C4';
const BIRD_WING = '#F5A623';
const BIRD_BEAK = '#F2542D';
const BIRD_OUTLINE = '#5B3A1A';

// Ground reserves the bottom slice of the world; collision already
// happens at worldHeight (see flappyPhysics.ts), so this just needs to
// look right under that line, not change it.
const GRASS_TOP = 90;

interface Props {
  points: GraphPoint[];
  highScore: number;
  onNewHighScore: (score: number) => void;
  onExit: () => void;
}

export function FlappyBirdGame({ points, highScore, onNewHighScore, onExit }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // false while 'ready' or 'over', true only while a round is actually
  // in progress — useFlappyBird's RAF loop runs only when this is true.
  const [running, setRunning] = useState(false);
  const { state, start } = useFlappyBird(points, running);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (state.status === 'over' && !reportedRef.current) {
      reportedRef.current = true;
      setRunning(false);
      if (state.score > highScore) onNewHighScore(state.score);
    }
    if (state.status === 'playing') reportedRef.current = false;
  }, [state.status, state.score, highScore, onNewHighScore]);

  const handlePress = () => {
    if (state.status !== 'playing') { start(); setRunning(true); }
  };

  const isNewHighScore = state.status === 'over' && state.score > highScore && state.score > 0;
  const displayHighScore = Math.max(highScore, state.score);

  const overOpacity = useSharedValue(0);
  const overScale = useSharedValue(0.9);
  useEffect(() => {
    if (state.status === 'over') {
      overOpacity.value = withTiming(1, { duration: 200 });
      overScale.value = withSpring(1, { damping: 14 });
    } else {
      overOpacity.value = 0;
      overScale.value = 0.9;
    }
  }, [state.status, overOpacity, overScale]);
  const overStyle = useAnimatedStyle(() => ({
    opacity: overOpacity.value,
    transform: [{ scale: overScale.value }],
  }));

  const readyOpacity = useSharedValue(1);
  useEffect(() => {
    readyOpacity.value = withTiming(state.status === 'ready' ? 1 : 0, { duration: 200 });
  }, [state.status, readyOpacity]);
  const readyStyle = useAnimatedStyle(() => ({ opacity: readyOpacity.value }));

  const scoreScale = useSharedValue(1);
  const lastScoreRef = useRef(0);
  useEffect(() => {
    if (state.score > lastScoreRef.current) {
      lastScoreRef.current = state.score;
      scoreScale.value = withSpring(1.25, { damping: 6 }, () => {
        scoreScale.value = withSpring(1);
      });
    }
    if (state.status === 'ready') lastScoreRef.current = 0;
  }, [state.score, state.status, scoreScale]);
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: scoreScale.value }] }));

  const flashOpacity = useSharedValue(0);
  const flashedRef = useRef(false);
  useEffect(() => {
    if (state.status === 'over' && !flashedRef.current) {
      flashedRef.current = true;
      flashOpacity.value = 0.35;
      flashOpacity.value = withTiming(0, { duration: 350 });
    }
    if (state.status !== 'over') flashedRef.current = false;
  }, [state.status, flashOpacity]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  const { width, height } = size;
  const scaleX = width / DEFAULT_CONFIG.worldWidth;
  const scaleY = height / DEFAULT_CONFIG.worldHeight;
  const px = (x: number) => x * scaleX;
  const py = (y: number) => y * scaleY;

  // Nose up while climbing (vy < 0), nose down while falling — clamped
  // so a hard collision doesn't spin it past a readable angle.
  const tilt = Math.max(-30, Math.min(50, state.bird.vy * 2.2));
  const birdCx = px(DEFAULT_CONFIG.birdX);
  const birdCy = py(state.bird.y);
  const birdR = px(DEFAULT_CONFIG.birdRadius);

  return (
    <Pressable
      style={styles.root}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={state.status === 'playing' ? 'Playing' : 'Tap to start'}
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>BEST {displayHighScore}</Text>
        <Pressable onPress={onExit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Exit game">
          <Text style={styles.exit}>EXIT</Text>
        </Pressable>
      </View>

      <View
        style={styles.playArea}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {width > 0 && height > 0 && (
          <>
            {/* Background layer: sky, clouds, ground — none of it depends
                on game state, so it never needs to re-render per frame. */}
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="flappySky" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={SKY_TOP} />
                  <Stop offset="1" stopColor={SKY_BOTTOM} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={width} height={height} fill="url(#flappySky)" />

              {[[18, 16, 7], [62, 11, 9], [82, 26, 6]].map(([cx, cy, r], i) => (
                <G key={i} opacity={0.9}>
                  <Ellipse cx={px(cx)} cy={py(cy)} rx={px(r)} ry={py(r * 0.6)} fill={CLOUD} />
                  <Ellipse cx={px(cx + r * 0.8)} cy={py(cy + r * 0.15)} rx={px(r * 0.7)} ry={py(r * 0.5)} fill={CLOUD} />
                  <Ellipse cx={px(cx - r * 0.7)} cy={py(cy + r * 0.2)} rx={px(r * 0.6)} ry={py(r * 0.42)} fill={CLOUD} />
                </G>
              ))}

              <Rect x={0} y={py(GRASS_TOP)} width={width} height={height - py(GRASS_TOP)} fill={DIRT} />
              <Rect x={0} y={py(GRASS_TOP)} width={width} height={py(3)} fill={GRASS} />
              <Rect x={0} y={py(GRASS_TOP)} width={width} height={2} fill={GRASS_EDGE} />
            </Svg>

            {/* Score layer: big, bold, behind the pipes and bird — same
                idea as the original's floating background numerals. Its
                own Animated.View so the pop-on-score animation doesn't
                have to touch the sky/ground layer at all. */}
            <Animated.View style={[StyleSheet.absoluteFill, scoreStyle]} pointerEvents="none">
              <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
                <SvgText
                  x={width / 2}
                  y={height * 0.26}
                  textAnchor="middle"
                  fontFamily="SpaceMono-Bold"
                  fontSize={height * 0.2}
                  fill="#FFFFFF"
                  stroke="#4A3B1B"
                  strokeWidth={height * 0.006}
                >
                  {state.score}
                </SvgText>
              </Svg>
            </Animated.View>

            {/* Foreground layer: pipes and the bird, on top of the score. */}
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              {state.pipes.map((pipe, i) => {
                const gapTop = pipe.gapCenterY - DEFAULT_CONFIG.pipeGapHeight / 2;
                const gapBottom = pipe.gapCenterY + DEFAULT_CONFIG.pipeGapHeight / 2;
                const bodyX = px(pipe.x);
                const bodyW = px(DEFAULT_CONFIG.pipeWidth);
                const capOverhang = px(2);
                const capH = py(4);
                return (
                  <G key={i}>
                    {/* Top pipe: body down to the gap, cap lipped at the gap edge. */}
                    <Rect x={bodyX} y={0} width={bodyW} height={py(gapTop)} fill={PIPE_BODY} stroke={PIPE_STROKE} strokeWidth={2} />
                    <Rect x={bodyX - capOverhang} y={py(gapTop) - capH} width={bodyW + capOverhang * 2} height={capH} rx={3} fill={PIPE_CAP} stroke={PIPE_STROKE} strokeWidth={2.5} />
                    {/* Bottom pipe: cap first, then body to the ground. */}
                    <Rect x={bodyX - capOverhang} y={py(gapBottom)} width={bodyW + capOverhang * 2} height={capH} rx={3} fill={PIPE_CAP} stroke={PIPE_STROKE} strokeWidth={2.5} />
                    <Rect x={bodyX} y={py(gapBottom) + capH} width={bodyW} height={height - (py(gapBottom) + capH)} fill={PIPE_BODY} stroke={PIPE_STROKE} strokeWidth={2} />
                  </G>
                );
              })}

              <G transform={`rotate(${tilt} ${birdCx} ${birdCy})`}>
                <Ellipse cx={birdCx - birdR * 0.1} cy={birdCy + birdR * 0.1} rx={birdR * 0.6} ry={birdR * 0.42} fill={BIRD_WING} stroke={BIRD_OUTLINE} strokeWidth={1.5} />
                <Circle cx={birdCx} cy={birdCy} r={birdR} fill={BIRD_BODY} stroke={BIRD_OUTLINE} strokeWidth={2} />
                <Ellipse cx={birdCx + birdR * 0.1} cy={birdCy + birdR * 0.3} rx={birdR * 0.55} ry={birdR * 0.4} fill={BIRD_BELLY} />
                <Circle cx={birdCx + birdR * 0.35} cy={birdCy - birdR * 0.3} r={birdR * 0.3} fill="#FFFFFF" stroke={BIRD_OUTLINE} strokeWidth={1} />
                <Circle cx={birdCx + birdR * 0.45} cy={birdCy - birdR * 0.3} r={birdR * 0.13} fill="#1A1A1A" />
                <Path
                  d={`M ${birdCx + birdR * 0.85} ${birdCy - birdR * 0.05} L ${birdCx + birdR * 1.55} ${birdCy + birdR * 0.12} L ${birdCx + birdR * 0.85} ${birdCy + birdR * 0.32} Z`}
                  fill={BIRD_BEAK}
                  stroke={BIRD_OUTLINE}
                  strokeWidth={1}
                />
              </G>
            </Svg>
          </>
        )}

        <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />

        <Animated.View style={[styles.centerPanel, readyStyle]} pointerEvents="none">
          <Text style={styles.readyText}>PULL TO START</Text>
        </Animated.View>

        <Animated.View style={[styles.centerPanel, overStyle]} pointerEvents="none">
          <Text style={styles.overTitle}>GAME OVER</Text>
          <Text style={styles.overScore}>{state.score}</Text>
          <Text style={[styles.overHighScore, isNewHighScore && { color: Colours.go }]}>
            {isNewHighScore ? 'NEW HIGH SCORE' : `BEST ${displayHighScore}`}
          </Text>
          <Text style={styles.overHint}>TAP TO PLAY AGAIN</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLabel: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1 },
  exit: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  playArea: { flex: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: SKY_TOP },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: Colours.restC },
  // A full-area dim rather than a small card behind the text — the sky/
  // clouds/ground are busy enough now that floating text needs it, and
  // dimming the whole scene while "tap to start"/"game over" is up is a
  // familiar game-UI beat in its own right, not just a legibility fix.
  centerPanel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.4)' },
  readyText: { ...Fonts.mono(13, 'bold'), color: '#FFFFFF', letterSpacing: 1, textShadowColor: '#00000080', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  overTitle: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
  overScore: { ...Fonts.timerDigits(48), color: ACCENT },
  overHighScore: { ...Fonts.mono(12, 'bold'), color: Colours.dim, letterSpacing: 0.6 },
  overHint: { ...Fonts.mono(10, 'medium'), color: Colours.faint, marginTop: 8 },
});

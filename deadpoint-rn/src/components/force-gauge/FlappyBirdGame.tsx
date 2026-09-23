// src/components/force-gauge/FlappyBirdGame.tsx
/** The force gauge's Flappy Bird mode — pull the gauge to climb, ease off
    to fall, dodge scrolling pipe gaps. Mounted by app/force-gauge.tsx in
    place of the live stat/graph/action rows while a round is in progress.
    Design: docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md. */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
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
        <Text style={styles.headerLabel}>SCORE</Text>
        <Pressable onPress={onExit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Exit game">
          <Text style={styles.exit}>EXIT</Text>
        </Pressable>
      </View>

      <View
        style={styles.playArea}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {width > 0 && height > 0 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="flappyBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colours.bg} />
                <Stop offset="1" stopColor={Colours.s1} />
              </LinearGradient>
              <RadialGradient id="flappyBird" cx="35%" cy="35%" r="65%">
                <Stop offset="0" stopColor={ACCENT} stopOpacity={1} />
                <Stop offset="1" stopColor={ACCENT} stopOpacity={0.55} />
              </RadialGradient>
            </Defs>

            <Rect x={0} y={0} width={width} height={height} fill="url(#flappyBg)" />
            <Rect x={0} y={0} width={width} height={2} fill={Colours.s4} />
            <Rect x={0} y={height - 2} width={width} height={2} fill={Colours.s4} />

            {state.pipes.map((pipe, i) => {
              const gapTop = pipe.gapCenterY - DEFAULT_CONFIG.pipeGapHeight / 2;
              const gapBottom = pipe.gapCenterY + DEFAULT_CONFIG.pipeGapHeight / 2;
              return (
                <React.Fragment key={i}>
                  <Rect x={px(pipe.x)} y={0} width={px(DEFAULT_CONFIG.pipeWidth)} height={py(gapTop)} rx={6} fill={Colours.s3} />
                  <Rect x={px(pipe.x)} y={py(gapBottom)} width={px(DEFAULT_CONFIG.pipeWidth)} height={height - py(gapBottom)} rx={6} fill={Colours.s3} />
                </React.Fragment>
              );
            })}

            <G transform={`rotate(${tilt} ${birdCx} ${birdCy})`}>
              <Circle cx={birdCx} cy={birdCy} r={birdR} fill="url(#flappyBird)" />
              <Path
                d={`M ${birdCx + birdR * 0.9} ${birdCy - birdR * 0.35} L ${birdCx + birdR * 1.6} ${birdCy} L ${birdCx + birdR * 0.9} ${birdCy + birdR * 0.35} Z`}
                fill={ACCENT}
              />
            </G>
          </Svg>
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

      <Animated.Text style={[styles.scoreValue, scoreStyle]}>{state.score}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLabel: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1 },
  exit: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  playArea: { flex: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: Colours.bg },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: Colours.restC },
  centerPanel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6 },
  readyText: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
  overTitle: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
  overScore: { ...Fonts.timerDigits(48), color: ACCENT },
  overHighScore: { ...Fonts.mono(12, 'bold'), color: Colours.dim, letterSpacing: 0.6 },
  overHint: { ...Fonts.mono(10, 'medium'), color: Colours.faint, marginTop: 8 },
  scoreValue: { ...Fonts.timerDigits(28), color: Colours.fg, textAlign: 'center', marginTop: 10 },
});

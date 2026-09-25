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
import { setAudioModeAsync } from 'expo-audio';
import { DEFAULT_AUDIO_MODE, GAME_AUDIO_MODE } from '../timers/audioMode';
import { play as playCue } from '../timers/tones';
import { GymLeaderboard, PullPrompt } from './GymLeaderboard';
import type { BoardEntry } from '../../data/forceGauge/gymBoard';

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
// Front wing pale against the yellow body, back wing a deeper orange: the
// first cut used one near-body orange at a fraction of the body's size and
// read as a plain circle ("give the bird some wings. Right now it's just a
// circle" — Oscar). Contrast + size are what make a wing register at ~25px.
const BIRD_WING = '#FFFDF2';
const BIRD_WING_BACK = '#F0961A';
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
  /** Omit to hide the EXIT control (the gym station has its own). */
  onExit?: () => void;
  /** Fires once at the end of every round (the gym station's board needs
      every score, not just personal bests). */
  onGameOver?: (score: number) => void;
  /** The gym station's top-5. When given, the waiting and game-over screens
      show it big (and the game-over screen turns back into the waiting
      screen after a few idle seconds). Omit for the personal game. */
  leaderboard?: BoardEntry[];
  /** Zero the gauge. Shown only between rounds, never mid-run. */
  onTare?: () => void;
  taring?: boolean;
}

/** After a game over, how long until the station goes back to its waiting
    screen (leaderboard + "PULL TO START") for the next person. */
const IDLE_AFTER_OVER_MS = 12000;

export function FlappyBirdGame({ points, highScore, onNewHighScore, onExit, onGameOver, leaderboard, onTare, taring }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Starting (and restarting) is entirely internal to the hook now — a
  // real pull on the gauge, not a tap on the screen (Oscar: hands are
  // already on the gauge, reaching for the phone too is the wrong
  // mechanic) — so there's nothing left for this component to trigger.
  const { state } = useFlappyBird(points);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (state.status === 'over' && !reportedRef.current) {
      reportedRef.current = true;
      if (state.score > highScore) onNewHighScore(state.score);
      onGameOver?.(state.score);
    }
    if (state.status === 'playing') reportedRef.current = false;
  }, [state.status, state.score, highScore, onNewHighScore, onGameOver]);

  const isNewHighScore = state.status === 'over' && state.score > highScore && state.score > 0;
  const displayHighScore = Math.max(highScore, state.score);

  // Station mode only: a few seconds after a game over the last player's
  // score steps aside for the waiting screen, so the next person walking up
  // sees the board and "PULL TO START", not a stranger's result.
  const station = leaderboard != null;
  const [overIdle, setOverIdle] = useState(false);
  useEffect(() => {
    setOverIdle(false);
    if (!station || state.status !== 'over') return;
    const t = setTimeout(() => setOverIdle(true), IDLE_AFTER_OVER_MS);
    return () => clearTimeout(t);
  }, [station, state.status]);
  const showWaiting = state.status === 'ready' || (station && state.status === 'over' && overIdle);
  const showOver = state.status === 'over' && !(station && overIdle);

  const overOpacity = useSharedValue(0);
  const overScale = useSharedValue(0.9);
  useEffect(() => {
    if (showOver) {
      overOpacity.value = withTiming(1, { duration: 200 });
      overScale.value = withSpring(1, { damping: 14 });
    } else {
      overOpacity.value = 0;
      overScale.value = 0.9;
    }
  }, [showOver, overOpacity, overScale]);
  const overStyle = useAnimatedStyle(() => ({
    opacity: overOpacity.value,
    transform: [{ scale: overScale.value }],
  }));

  const readyOpacity = useSharedValue(1);
  useEffect(() => {
    readyOpacity.value = withTiming(showWaiting ? 1 : 0, { duration: 200 });
  }, [showWaiting, readyOpacity]);
  const readyStyle = useAnimatedStyle(() => ({ opacity: readyOpacity.value }));

  const scoreScale = useSharedValue(1);
  const lastScoreRef = useRef(0);
  const dingedRef = useRef(false);
  useEffect(() => {
    // A restart goes 'over' -> 'playing' with the score back at 0 (never via
    // 'ready'), so a score BELOW the last one seen means a new run began.
    // Without this the second run's first points did nothing until they
    // passed the previous run's score.
    if (state.score < lastScoreRef.current) {
      lastScoreRef.current = 0;
      dingedRef.current = false;
    }
    if (state.score > lastScoreRef.current) {
      lastScoreRef.current = state.score;
      scoreScale.value = withSpring(1.25, { damping: 6 }, () => {
        scoreScale.value = withSpring(1);
      });
      // A soft blip per pipe; one "ding" — instead of, not on top of, that
      // pipe's blip — the first time a run passes the player's own best. No
      // ding when there's no best yet (highScore 0): the first run would
      // otherwise ding on its very first pipe.
      if (highScore > 0 && state.score > highScore && !dingedRef.current) {
        dingedRef.current = true;
        playCue('best');
      } else {
        playCue('pipe');
      }
    }
  }, [state.score, highScore, scoreScale]);
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: scoreScale.value }] }));

  const flashOpacity = useSharedValue(0);
  const flashedRef = useRef(false);
  useEffect(() => {
    if (state.status === 'over' && !flashedRef.current) {
      flashedRef.current = true;
      playCue('death');
      flashOpacity.value = 0.35;
      flashOpacity.value = withTiming(0, { duration: 350 });
    }
    if (state.status !== 'over') flashedRef.current = false;
  }, [state.status, flashOpacity]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  // The game's blips mix over whatever the user is playing rather than
  // ducking it on every pipe (see GAME_AUDIO_MODE); put the app's normal
  // mode back on the way out so the timers behave exactly as before.
  useEffect(() => {
    setAudioModeAsync(GAME_AUDIO_MODE).catch((e) => console.error('game audio mode failed:', e));
    return () => {
      setAudioModeAsync(DEFAULT_AUDIO_MODE).catch((e) => console.error('audio mode restore failed:', e));
    };
  }, []);

  const { width, height } = size;
  // Leaderboard sizing (station mode): rows scale with the play area, so it
  // is big on a tablet and still fits a phone.
  const boardWidth = Math.min(width * 0.92, 640);
  const heroUnit = Math.max(30, Math.min(64, height / 11));
  const overUnit = Math.max(24, Math.min(46, height / 16));
  const scaleX = width / DEFAULT_CONFIG.worldWidth;
  const scaleY = height / DEFAULT_CONFIG.worldHeight;
  const px = (x: number) => x * scaleX;
  const py = (y: number) => y * scaleY;

  // Nose up while climbing (vy < 0), nose down while falling — clamped
  // so a hard collision doesn't spin it past a readable angle.
  const tilt = Math.max(-30, Math.min(50, state.bird.vy * 2.2));
  const birdCx = px(DEFAULT_CONFIG.birdX);
  const birdCy = py(state.bird.y);
  // The sprite is drawn ~30% larger than the physics hitbox (the usual
  // forgiving-hitbox convention) so the wings, eye and beak actually read on
  // a phone; collision in flappyPhysics.ts is unchanged.
  const birdR = px(DEFAULT_CONFIG.birdRadius) * 1.3;
  const outlineW = Math.max(1.5, birdR * 0.09);
  // Flap: a steady wing-beat while playing, bigger strokes while the pull is
  // actually lifting the bird, drooped after a crash, relaxed before start.
  const wingAngle = state.status === 'playing'
    ? Math.sin(state.elapsedSec * 2 * Math.PI * 7) * (state.bird.vy < 0 ? 38 : 16)
    : state.status === 'over' ? -32 : -8;
  // A leaf-shaped wing hinged at its shoulder (x0, y0), sweeping back and
  // slightly down; `k` scales it. Rotating the group about the shoulder is
  // what makes it flap.
  const wingPath = (x0: number, y0: number, k: number) =>
    `M ${x0} ${y0} C ${x0 - 0.5 * k} ${y0 - 0.75 * k}, ${x0 - 1.45 * k} ${y0 - 0.55 * k}, ${x0 - 1.6 * k} ${y0 + 0.15 * k} ` +
    `C ${x0 - 1.35 * k} ${y0 + 0.55 * k}, ${x0 - 0.7 * k} ${y0 + 0.7 * k}, ${x0} ${y0 + 0.35 * k} Z`;
  const fwx = birdCx - birdR * 0.05;
  const fwy = birdCy + birdR * 0.1;
  const bwx = birdCx - birdR * 0.15;
  const bwy = birdCy - birdR * 0.2;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>BEST {displayHighScore}</Text>
        <View style={styles.headerActions}>
          {onTare != null && state.status !== 'playing' && (
            <Pressable
              onPress={onTare}
              disabled={taring}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Zero the gauge"
              accessibilityHint="Zeroes the gauge. Take your hands off it first."
              accessibilityState={{ disabled: !!taring, busy: !!taring }}
            >
              <Text style={[styles.zero, taring && styles.zeroBusy]}>{taring ? 'ZEROING…' : 'ZERO'}</Text>
            </Pressable>
          )}
          {onExit != null && (
            <Pressable onPress={onExit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Exit game">
              <Text style={styles.exit}>EXIT</Text>
            </Pressable>
          )}
        </View>
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
                const gapTop = pipe.gapCenterY - pipe.gapHeight / 2;
                const gapBottom = pipe.gapCenterY + pipe.gapHeight / 2;
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
                {/* Back wing: behind the body, peeking out above/behind it. */}
                <G transform={`rotate(${wingAngle * 0.8 + 14} ${bwx} ${bwy})`}>
                  <Path d={wingPath(bwx, bwy, birdR * 0.85)} fill={BIRD_WING_BACK} stroke={BIRD_OUTLINE} strokeWidth={outlineW} strokeLinejoin="round" />
                </G>
                <Circle cx={birdCx} cy={birdCy} r={birdR} fill={BIRD_BODY} stroke={BIRD_OUTLINE} strokeWidth={outlineW * 1.2} />
                <Ellipse cx={birdCx + birdR * 0.1} cy={birdCy + birdR * 0.32} rx={birdR * 0.55} ry={birdR * 0.4} fill={BIRD_BELLY} />
                {/* The eye is deliberately huge — the original's giant eyeball is
                    half its charm — with the pupil pushed to the front edge
                    for a permanent wide-eyed stare, and a tiny glint. */}
                <Circle cx={birdCx + birdR * 0.34} cy={birdCy - birdR * 0.26} r={birdR * 0.52} fill="#FFFFFF" stroke={BIRD_OUTLINE} strokeWidth={outlineW} />
                <Circle cx={birdCx + birdR * 0.5} cy={birdCy - birdR * 0.22} r={birdR * 0.24} fill="#1A1A1A" />
                <Circle cx={birdCx + birdR * 0.57} cy={birdCy - birdR * 0.31} r={birdR * 0.07} fill="#FFFFFF" />
                <Path
                  d={`M ${birdCx + birdR * 0.85} ${birdCy - birdR * 0.05} L ${birdCx + birdR * 1.55} ${birdCy + birdR * 0.12} L ${birdCx + birdR * 0.85} ${birdCy + birdR * 0.32} Z`}
                  fill={BIRD_BEAK}
                  stroke={BIRD_OUTLINE}
                  strokeWidth={outlineW * 0.7}
                  strokeLinejoin="round"
                />
                {/* Front wing: over the body, the one you actually see flap. */}
                <G transform={`rotate(${wingAngle} ${fwx} ${fwy})`}>
                  <Path d={wingPath(fwx, fwy, birdR)} fill={BIRD_WING} stroke={BIRD_OUTLINE} strokeWidth={outlineW} strokeLinejoin="round" />
                  <Path
                    d={`M ${fwx - birdR * 0.45} ${fwy + birdR * 0.12} L ${fwx - birdR * 1.15} ${fwy + birdR * 0.05} M ${fwx - birdR * 0.4} ${fwy + birdR * 0.28} L ${fwx - birdR * 0.95} ${fwy + birdR * 0.3}`}
                    stroke={BIRD_OUTLINE}
                    strokeWidth={outlineW * 0.6}
                    strokeLinecap="round"
                    fill="none"
                    opacity={0.55}
                  />
                </G>
              </G>
            </Svg>
          </>
        )}

        <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />

        <Animated.View style={[styles.centerPanel, readyStyle]} pointerEvents="none">
          {station ? (
            // Mounted only while showing, so the rows drop in afresh each time.
            showWaiting && (
              <View style={{ width: boardWidth, alignItems: 'center' }}>
                <GymLeaderboard entries={leaderboard} unit={heroUnit} />
                <PullPrompt label="PULL TO START" size={heroUnit * 0.5} />
              </View>
            )
          ) : (
            <Text style={styles.readyText}>PULL TO START</Text>
          )}
        </Animated.View>

        <Animated.View style={[styles.centerPanel, overStyle]} pointerEvents="none">
          <Text style={styles.overTitle}>GAME OVER</Text>
          <Text style={styles.overScore}>{state.score}</Text>
          <Text style={[styles.overHighScore, isNewHighScore && { color: Colours.go }]}>
            {isNewHighScore ? (station ? 'NEW WEEK BEST' : 'NEW HIGH SCORE') : `BEST ${displayHighScore}`}
          </Text>
          {station && showOver && (
            <View style={{ width: boardWidth, marginTop: 10 }}>
              <GymLeaderboard entries={leaderboard} unit={overUnit} />
            </View>
          )}
          <Text style={styles.overHint}>PULL TO PLAY AGAIN</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLabel: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  zero: { ...Fonts.mono(12, 'bold'), color: ACCENT },
  zeroBusy: { color: Colours.dim },
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

// src/components/force-gauge/LaunchGame.tsx
/** The Launch game: one max pull (one arm, 20 mm edge) fires the bird
    straight up — over the town, through the clouds, past Everest, into
    space and, for the strongest, out of the solar system. Rules live in
    launchPhysics.ts; the gauge wiring in useLaunchGame.ts; the scenery in
    LaunchScenery.tsx. Spec: docs/superpowers/specs/2026-09-26-launch-game-design.md.

    The flight runs entirely on the UI thread: one `clock` shared value
    (seconds since lift-off) drives the camera, sky colour, stars, speed
    lines, smoke trail, bird pose and landmark dings, so it stays smooth
    however busy JS is. React re-renders only on phase changes, the charge
    readout and the altitude counter. Same props shape as FlappyBirdGame so
    the personal screen and the gym station can host either. */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing, FadeIn, FadeOut, ZoomIn, cancelAnimation, interpolate, interpolateColor, useAnimatedReaction,
  useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { setAudioModeAsync } from 'expo-audio';
import { Colours, resolveColour } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { GraphPoint } from '../../data/forceGauge/useForceGauge';
import { useLaunchGame } from '../../data/forceGauge/useLaunchGame';
import {
  CHARGE_SEC, LANDMARKS, TOP_LEVEL, altitudeForKg, flightDurationSec, flightLevel, formatAltitude, kgFromScore,
  launchScore, reachedPhrase,
} from '../../data/forceGauge/launchPhysics';
import type { BoardEntry } from '../../data/forceGauge/gymBoard';
import { DEFAULT_AUDIO_MODE, GAME_AUDIO_MODE } from '../timers/audioMode';
import { play as playCue } from '../timers/tones';
import { BirdShape } from './BirdSprite';
import { GymLeaderboard, PullPrompt, type ScoreFormat } from './GymLeaderboard';
import { HowToPlay, LAUNCH_HOW_TO_LINES } from './HowToPlay';
import { CloudSeaFront, Scenery, StarField, padHeight } from './LaunchScenery';

const ACCENT = resolveColour('--gorse');
const GOLD = '#FFD34D';

/** How a Launch score reads on the board and the name prompt: the height,
    with the kg under it. */
export const launchScoreFormat: ScoreFormat = (score) => {
  const kg = kgFromScore(score);
  return { main: formatAltitude(altitudeForKg(kg), true), sub: `${kg.toFixed(1)} KG` };
};
const kgText = (kg: number) => `${kg.toFixed(1)} KG`;

// Sky colour by camera level: day blue, deepening through the stratosphere,
// black by the edge of space, a purple tint out past the solar system.
const SKY_LV = [0, 12, 20, 26, 31, 36, 40, 46, 60, 90, 100, 108, 116, 126];
const SKY_COL = ['#4EC0CA', '#48B4D8', '#3A9BD9', '#2F7FCB', '#2560B3', '#1B3F8C', '#122561', '#0B1438', '#070B22', '#070818', '#12092A', '#1C0B36', '#120828', '#0A0620'];
const LANDMARK_KGS = LANDMARKS.map((l) => l.kg);

const TRAIL_N = 16;
const TRAIL_STEP_SEC = 0.05;
const SPEED_LINES = [0.12, 0.2, 0.3, 0.37, 0.63, 0.7, 0.8, 0.88, 0.25, 0.75, 0.42, 0.58];
const DUST = 10;
const CONFETTI = 28;
const IDLE_AFTER_RESULT_MS = 12000;
const RESULT_DELAY_MS = 650;

interface Props {
  points: GraphPoint[];
  /** Best so far as a launch score (kg in tenths): the player's own, or on
      the gym station this week's top score. */
  best: number;
  onNewBest: (score: number) => void;
  /** Omit to hide the EXIT control (the gym station has its own). */
  onExit?: () => void;
  /** Fires once when each flight lands, with its launch score. */
  onGameOver?: (score: number) => void;
  /** The gym station's weekly top 5 for this game. */
  leaderboard?: BoardEntry[];
  onTare?: () => void;
  taring?: boolean;
  /** True while a round is in progress (charging or flying). */
  onPlayingChange?: (playing: boolean) => void;
}

// ---------- the bird --------------------------------------------------------

type BirdMode = 'rest' | 'tense' | 'tuck' | 'flap';

/** The bird's own little SVG. Only the wings animate in JS (a few times a
    second at most); position, tilt and squash are UI-thread transforms. */
const BirdSvg = memo(function BirdSvg({ r, mode }: { r: number; mode: BirdMode }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (mode === 'tuck') return;
    const id = setInterval(() => setT((x) => x + 1), mode === 'flap' ? 45 : 120);
    return () => clearInterval(id);
  }, [mode]);
  const wing = mode === 'tuck' ? 40 : mode === 'tense' ? -36 + Math.sin(t * 1.7) * 7 : mode === 'flap' ? Math.sin(t * 1.25) * 38 : -8 + Math.sin(t * 0.55) * 12;
  const box = r * 4;
  return (
    <Svg width={box} height={box}>
      <BirdShape cx={box / 2} cy={box / 2} r={r} wingAngle={wing} />
    </Svg>
  );
});

// ---------- flight effects ---------------------------------------------------

interface FlightSV {
  clock: SharedValue<number>;
  dur: SharedValue<number>;
  final: SharedValue<number>;
  back: SharedValue<number>;
  cam: SharedValue<number>;
}

/** One smoke puff. Puff k is the one emitted k steps ago: its height is where
    the bird WAS then, so the trail hangs in the air behind him; it swells,
    cools from yellow-hot to white and fades with age. */
function TrailPuff({ k, sv, px, restY, cx, base }: { k: number; sv: FlightSV; px: number; restY: number; cx: number; base: number }) {
  const style = useAnimatedStyle(() => {
    const t = sv.clock.value;
    const dur = sv.dur.value;
    const fin = sv.final.value;
    const slot = Math.floor(t / TRAIL_STEP_SEC) - k;
    const e = slot * TRAIL_STEP_SEC;
    const live = slot >= 0 && e <= dur && sv.back.value >= 1 && fin > 0;
    const age = t - e;
    const lvE = flightLevel(e, fin, dur);
    const spd = (2 * fin) / dur * (1 - e / dur);
    const intensity = Math.min(1, spd / 7);
    const y = restY - (lvE - sv.cam.value) * px + base * 0.7;
    const x = cx + Math.sin(slot * 12.9898) * base * 0.3 * (1 + age * 4);
    return {
      opacity: live ? intensity * Math.max(0, 1 - age / 0.85) : 0,
      backgroundColor: interpolateColor(age, [0, 0.1, 0.32], ['#FFF3B0', '#FF9A3D', '#FFFFFF']),
      transform: [{ translateX: x - base / 2 }, { translateY: y - base / 2 }, { scale: 0.45 + age * 2.6 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: base, height: base, borderRadius: base / 2 }, style]} />;
}

/** Streaks rushing past while he's going fast. */
function SpeedLine({ x, i, sv, level, px, h }: { x: number; i: number; sv: FlightSV; level: SharedValue<number>; px: number; h: number }) {
  const len = h * (0.12 + (i % 3) * 0.06);
  const style = useAnimatedStyle(() => {
    const t = sv.clock.value;
    const dur = sv.dur.value;
    const spd = t < dur && sv.back.value >= 1 ? (2 * sv.final.value) / dur * (1 - t / dur) : 0;
    const travel = level.value * px * 1.7 + i * h * 0.37;
    return {
      opacity: Math.min(1, spd / 10) * 0.5,
      transform: [{ translateY: (travel % (h + len)) - len }],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: 0, width: 2.5, height: len, borderRadius: 2, backgroundColor: '#FFFFFF' }, style]} />;
}

/** Dust kicked out sideways from the pad at lift-off; stays on the ground as the camera leaves. */
function DustPuff({ i, launchT, cam, px, ground, cx, base }: { i: number; launchT: SharedValue<number>; cam: SharedValue<number>; px: number; ground: number; cx: number; base: number }) {
  const dir = i % 2 ? 1 : -1;
  const reach = 0.5 + (i % 5) * 0.28;
  const lift = (i % 3) * 0.18;
  const style = useAnimatedStyle(() => {
    const t = launchT.value;
    const ease = 1 - (1 - t) * (1 - t);
    return {
      opacity: t > 0 && t < 1 ? (1 - t) * 0.9 : 0,
      transform: [
        { translateX: cx - base / 2 + dir * ease * reach * base * 3.2 },
        { translateY: ground - base * 0.7 - ease * lift * px + cam.value * px },
        { scale: 0.6 + ease * 1.6 },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: base, height: base, borderRadius: base / 2, backgroundColor: '#F4E9C8' }, style]} />;
}

/** A burst of confetti for a new best. */
function Confetti({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }); }, [t]);
  const pieces = useRef(Array.from({ length: CONFETTI }, (_, i) => ({
    a: (i / CONFETTI) * Math.PI * 2 + Math.random() * 0.4,
    v: 0.5 + Math.random() * 0.6,
    spin: (Math.random() - 0.5) * 1440,
    col: ['#FFD34D', '#FF5A5F', '#4DA6FF', '#7CE38B', '#C77DFF', '#FFFFFF'][i % 6],
  }))).current;
  return (
    <>
      {pieces.map((p, i) => <ConfettiBit key={i} p={p} t={t} x={x} y={y} w={w} h={h} />)}
    </>
  );
}
function ConfettiBit({ p, t, x, y, w, h }: { p: { a: number; v: number; spin: number; col: string }; t: SharedValue<number>; x: number; y: number; w: number; h: number }) {
  const style = useAnimatedStyle(() => {
    const k = t.value;
    return {
      opacity: 1 - k * k * k,
      transform: [
        { translateX: x + Math.cos(p.a) * p.v * k * w * 0.45 },
        { translateY: y + Math.sin(p.a) * p.v * k * h * 0.35 + k * k * h * 0.35 },
        { rotate: `${p.spin * k}deg` },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -5, top: -3, width: 10, height: 6, borderRadius: 1.5, backgroundColor: p.col }, style]} />;
}

// ---------- HUD pieces -------------------------------------------------------

/** The climbing altitude counter. Its own component so its per-frame text
    updates re-render nothing else. */
function AltitudeHud({ level, kg }: { level: SharedValue<number>; kg: number }) {
  const [lv, setLv] = useState(0);
  useAnimatedReaction(
    () => Math.round(level.value * 20) / 20,
    (v, prev) => { if (v !== prev) scheduleOnRN(setLv, v); },
  );
  return (
    <View style={styles.hud} pointerEvents="none">
      <Text style={styles.hudLabel}>ALTITUDE</Text>
      <Text style={styles.hudValue}>{formatAltitude(altitudeForKg(lv))}</Text>
      <Text style={styles.hudSub}>{kgText(kg)}</Text>
    </View>
  );
}

const METER_MARKS: Array<[number, string]> = [[25, 'EVEREST'], [40, 'SPACE'], [50, 'ISS'], [70, 'MOON'], [80, 'MARS'], [100, 'SOLAR SYSTEM'], [120, 'GALAXY']];
const METER_MAX = 120;

/** The power meter up the right-hand side while charging: live pull as the
    fill, the held peak as a marker, landmarks as targets. */
function PowerMeter({ liveKg, peakKg, height }: { liveKg: number; peakKg: number; height: number }) {
  const fill = useSharedValue(0);
  useEffect(() => { fill.value = withTiming(liveKg, { duration: 90 }); }, [liveKg, fill]);
  const fillStyle = useAnimatedStyle(() => ({
    height: (Math.min(METER_MAX, fill.value) / METER_MAX) * height,
    backgroundColor: interpolateColor(fill.value, [0, 30, 60, 90, 120], ['#7CE38B', '#FFD34D', '#FF8A3D', '#FF4D4D', '#B06CFF']),
  }));
  const y = (kg: number) => height - (Math.min(METER_MAX, kg) / METER_MAX) * height;
  return (
    <View style={[styles.meter, { height }]} pointerEvents="none">
      <View style={[styles.meterTrack, { height }]}>
        <Animated.View style={[styles.meterFill, fillStyle]} />
        {peakKg > 0 && <View style={[styles.peakLine, { bottom: (Math.min(METER_MAX, peakKg) / METER_MAX) * height - 2 }]} />}
      </View>
      {METER_MARKS.map(([kg, label]) => (
        <View key={kg} style={[styles.meterMark, { top: y(kg) - 7 }]}>
          <Text style={[styles.meterLabel, peakKg >= kg && { color: GOLD }]}>{label}</Text>
          <View style={[styles.meterTick, peakKg >= kg && { backgroundColor: GOLD }]} />
        </View>
      ))}
      {peakKg > 0 && <View style={[styles.peakArrow, { top: y(peakKg) - 8 }]} />}
    </View>
  );
}

/** Big peak readout + what it reaches + the 3 s timer, while charging. */
function ChargeReadout({ peakKg, chargeSec, unit }: { peakKg: number; chargeSec: number; unit: number }) {
  const left = Math.max(0, 1 - chargeSec / CHARGE_SEC);
  const lastSecond = chargeSec > CHARGE_SEC - 1;
  return (
    <View style={styles.readout} pointerEvents="none">
      <View style={styles.readoutRow}>
        <Text style={[styles.readoutKg, { fontSize: unit * 2.2 }]}>{peakKg.toFixed(1)}</Text>
        <Text style={[styles.readoutUnit, { fontSize: unit * 0.55 }]}>KG</Text>
      </View>
      <Text style={[styles.readoutReach, { fontSize: unit * 0.5 }]}>{reachedPhrase(peakKg)}</Text>
      <View style={[styles.timerTrack, { width: unit * 7 }]}>
        <View style={[styles.timerFill, { width: `${left * 100}%` }, lastSecond && { backgroundColor: '#FF5A5F' }]} />
      </View>
      <Text style={[styles.readoutHint, { fontSize: unit * 0.42 }, lastSecond && { color: '#FFFFFF' }]}>
        {lastSecond ? 'LAUNCHING!' : 'PULL HARD · LET GO TO LAUNCH'}
      </Text>
    </View>
  );
}

// ---------- the game ---------------------------------------------------------

export function LaunchGame({ points, best, onNewBest, onExit, onGameOver, leaderboard, onTare, taring, onPlayingChange }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { state } = useLaunchGame(points);
  const { phase, round, launchKg, peakKg, liveKg, chargeSec } = state;
  const station = leaderboard != null;

  const W = size.width;
  const H = size.height;
  const px = H / 8;
  const ground = H * 0.84;
  const birdR = Math.max(15, Math.min(30, H * 0.04));
  const restY = ground - padHeight(px) + 2 - birdR;
  const followY = H * 0.5;
  const lag = (restY - followY) / Math.max(1, px);

  // ---- shared animation state
  const clock = useSharedValue(0);
  const dur = useSharedValue(1);
  const final = useSharedValue(0);
  const back = useSharedValue(1);
  const crouch = useSharedValue(0);
  const idle = useSharedValue(0);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const launchT = useSharedValue(0);

  const level = useDerivedValue(() => flightLevel(Math.min(clock.value, dur.value), final.value, dur.value) * back.value);
  const cam = useDerivedValue(() => Math.max(0, level.value - lag));
  const sv: FlightSV = { clock, dur, final, back, cam };

  useEffect(() => {
    idle.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.linear }), -1, false);
  }, [idle]);

  // Game cues mix over the player's own music; restore the app's mode on the way out.
  useEffect(() => {
    setAudioModeAsync(GAME_AUDIO_MODE).catch((e) => console.error('game audio mode failed:', e));
    return () => { setAudioModeAsync(DEFAULT_AUDIO_MODE).catch((e) => console.error('audio mode restore failed:', e)); };
  }, []);

  useEffect(() => { onPlayingChange?.(phase === 'charging' || phase === 'flying'); }, [phase, onPlayingChange]);

  // ---- charging: crouch harder the harder you pull, tick each second
  useEffect(() => {
    crouch.value = withTiming(phase === 'charging' ? Math.min(1, liveKg / 60) : 0, { duration: 90 });
  }, [phase, liveKg, crouch]);
  const tickRef = useRef(-1);
  useEffect(() => {
    if (phase !== 'charging') { tickRef.current = -1; return; }
    const s = Math.floor(chargeSec);
    if (s !== tickRef.current && s < CHARGE_SEC) { tickRef.current = s; playCue('tick'); }
  }, [phase, chargeSec]);

  // A new charge after a flight: the world rewinds to the ground under the bird.
  const rewind = useCallback((ms: number) => {
    if (back.value > 0 && level.value > 0.01) back.value = withTiming(0, { duration: ms, easing: Easing.inOut(Easing.cubic) });
  }, [back, level]);
  useEffect(() => { if (phase === 'charging') rewind(650); }, [phase, rewind]);

  // ---- lift-off
  const bestAtLaunch = useRef(best);
  const passedRef = useRef(-1);
  useEffect(() => {
    if (phase !== 'flying') return;
    bestAtLaunch.current = best;
    passedRef.current = -1;
    const d = flightDurationSec(launchKg);
    cancelAnimation(back);
    back.value = 1;
    final.value = Math.min(TOP_LEVEL, launchKg);
    dur.value = d;
    clock.value = 0;
    clock.value = withTiming(d + 1.4, { duration: (d + 1.4) * 1000, easing: Easing.linear });
    launchT.value = 0;
    launchT.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
    flash.value = 0.45;
    flash.value = withTiming(0, { duration: 380 });
    shake.value = withSequence(
      withTiming(9, { duration: 40 }), withTiming(-8, { duration: 50 }), withTiming(6, { duration: 50 }),
      withTiming(-4, { duration: 50 }), withTiming(2, { duration: 50 }), withTiming(0, { duration: 50 }),
    );
    playCue('launch');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  // ---- landmark dings on the way up
  const [banner, setBanner] = useState<{ idx: number; key: number } | null>(null);
  const lastDingAt = useRef(0);
  const onPass = useCallback((idx: number) => {
    if (idx <= passedRef.current) return;
    passedRef.current = idx;
    setBanner({ idx, key: Date.now() });
    const now = Date.now();
    if (now - lastDingAt.current > 160) { lastDingAt.current = now; playCue('zone'); }
  }, []);
  useAnimatedReaction(
    () => {
      if (back.value < 1 || clock.value <= 0) return -2;
      let n = -1;
      for (let i = 0; i < LANDMARK_KGS.length; i++) if (level.value >= LANDMARK_KGS[i] - 1e-6) n = i;
      return n;
    },
    (n, prev) => { if (prev != null && prev !== -2 && n > prev) scheduleOnRN(onPass, n); },
  );
  useEffect(() => {
    if (banner == null) return;
    const t = setTimeout(() => setBanner(null), 1500);
    return () => clearTimeout(t);
  }, [banner]);

  // ---- landing
  const score = launchScore(launchKg);
  const isNewBest = phase === 'result' && score > bestAtLaunch.current && score > 0;
  const reportedRound = useRef(0);
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    if (phase !== 'result') { setShowResult(false); return; }
    if (reportedRound.current !== round) {
      reportedRound.current = round;
      playCue('landed');
      if (score > bestAtLaunch.current && score > 0) {
        onNewBest(score);
        setTimeout(() => playCue('best'), 700);
      }
      onGameOver?.(score);
    }
    const t = setTimeout(() => setShowResult(true), RESULT_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  // Station only: a while after landing, back to the waiting screen (and the
  // ground) for the next person.
  const [overIdle, setOverIdle] = useState(false);
  useEffect(() => {
    setOverIdle(false);
    if (!station || phase !== 'result') return;
    const t = setTimeout(() => { setOverIdle(true); rewind(1400); }, IDLE_AFTER_RESULT_MS);
    return () => clearTimeout(t);
  }, [station, phase, round, rewind]);

  const showWaiting = phase === 'ready' || (station && phase === 'result' && overIdle);
  const showResultCard = phase === 'result' && showResult && !(station && overIdle);

  // ---- UI-thread styles
  const skyStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(cam.value + 4, SKY_LV, SKY_COL) }));
  const hazeStyle = useAnimatedStyle(() => ({ opacity: interpolate(cam.value, [14, 34], [1, 0], 'clamp') }));
  const starsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cam.value, [28, 42], [0, 1], 'clamp'),
    transform: [{ translateY: ((cam.value * px * 0.12) % Math.max(1, H)) - H }],
  }));
  const worldStyle = useAnimatedStyle(() => ({ transform: [{ translateY: cam.value * px }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }, { translateY: -Math.abs(shake.value) * 0.5 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const box = birdR * 4;
  const birdStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const d = dur.value;
    const flying = t > 0 && t < d && back.value >= 1;
    const spd = flying ? (2 * final.value) / d * (1 - t / d) : 0;
    const onPad = level.value < 0.02;
    const wobble = Math.sin(idle.value * Math.PI * 2);
    const bob = onPad ? 0 : wobble * px * 0.06;
    const k = crouch.value;
    const sY = (1 - 0.3 * k) * (1 + 0.3 * Math.min(1, spd / 14));
    const sX = (1 + 0.16 * k) / (1 + 0.14 * Math.min(1, spd / 14));
    const quiver = k * 3.2 * Math.sin(idle.value * Math.PI * 2 * 22);
    // Squash keeps his feet planted on the pad.
    const y = restY - (level.value - cam.value) * px + bob + birdR * 0.3 * k;
    return {
      transform: [
        { translateX: W / 2 - box / 2 + quiver },
        { translateY: y - box / 2 },
        { rotate: `${-84 * Math.min(1, spd / 5)}deg` },
        { scaleX: sX },
        { scaleY: sY },
      ],
    };
  });
  const ringStyle = useAnimatedStyle(() => {
    const k = Math.min(1, Math.max(0, (clock.value - dur.value) / 0.75));
    const on = back.value >= 1 && clock.value > dur.value && k < 1;
    const y = restY - (level.value - cam.value) * px;
    return {
      opacity: on ? (1 - k) * 0.85 : 0,
      transform: [{ translateX: W / 2 - birdR }, { translateY: y - birdR }, { scale: 0.8 + k * 3.4 }],
    };
  });

  // What's worth mounting: up to just past where this flight (or the pull
  // being charged) can reach, so the pieces mount progressively during the
  // charge rather than all at lift-off.
  const reach = phase === 'charging' ? Math.max(peakKg, launchKg) : phase === 'ready' ? 0 : launchKg;
  const upTo = Math.min(130, Math.max(14, reach + 10));
  const world = { w: W, h: H, px, ground, upTo };

  const birdMode: BirdMode = phase === 'charging' ? 'tense' : phase === 'flying' ? 'tuck' : phase === 'result' ? 'flap' : 'rest';
  const heroUnit = Math.max(24, Math.min(56, H / 14.5));
  const overUnit = Math.max(22, Math.min(44, H / 17));
  const boardWidth = Math.min(W * 0.92, 640);
  const readoutUnit = Math.max(22, Math.min(44, H / 15));
  const bestKg = kgFromScore(best);
  const displayBest = kgFromScore(Math.max(best, phase === 'result' ? score : 0));

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>{best > 0 || phase === 'result' ? `BEST ${kgText(displayBest)}` : 'LAUNCH'}</Text>
        <View style={styles.headerActions}>
          {onTare != null && phase !== 'charging' && phase !== 'flying' && (
            <Pressable onPress={onTare} disabled={taring} hitSlop={12} accessibilityRole="button" accessibilityLabel="Zero the gauge"
              accessibilityHint="Zeroes the gauge. Take your hands off it first." accessibilityState={{ disabled: !!taring, busy: !!taring }}>
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

      <View style={styles.playArea} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {W > 0 && H > 0 && (
          <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]}>
            <Animated.View style={[StyleSheet.absoluteFill, skyStyle]} />
            <Animated.View style={[StyleSheet.absoluteFill, hazeStyle]} pointerEvents="none">
              <Svg width={W} height={H}>
                <Defs>
                  <LinearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.38} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={W} height={H} fill="url(#haze)" />
              </Svg>
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H * 2 }, starsStyle]} pointerEvents="none">
              <StarField w={W} h={H} />
              <StarField w={W} h={H} />
            </Animated.View>

            {SPEED_LINES.map((f, i) => <SpeedLine key={i} i={i} x={W * f} sv={sv} level={level} px={px} h={H} />)}

            <Animated.View style={[StyleSheet.absoluteFill, worldStyle]} pointerEvents="none">
              <Scenery {...world} />
            </Animated.View>

            {Array.from({ length: DUST }, (_, i) => (
              <DustPuff key={i} i={i} launchT={launchT} cam={cam} px={px} ground={ground} cx={W / 2} base={birdR * 1.6} />
            ))}
            {Array.from({ length: TRAIL_N }, (_, k) => (
              <TrailPuff key={k} k={k} sv={sv} px={px} restY={restY} cx={W / 2} base={birdR * 1.25} />
            ))}
            <Animated.View pointerEvents="none" style={[styles.ring, { width: birdR * 2, height: birdR * 2, borderRadius: birdR }, ringStyle]} />

            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: box, height: box }, birdStyle]}>
              <BirdSvg r={birdR} mode={birdMode} />
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, worldStyle]} pointerEvents="none">
              <CloudSeaFront {...world} />
            </Animated.View>
          </Animated.View>
        )}

        <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />

        {(phase === 'flying' || phase === 'result') && !showWaiting && <AltitudeHud level={level} kg={launchKg} />}

        {phase === 'flying' && banner != null && (
          <View style={styles.bannerWrap} pointerEvents="none">
            <Animated.View key={banner.key} entering={ZoomIn.springify().damping(12)} exiting={FadeOut.duration(200)} style={styles.banner}>
              <Text style={styles.bannerName}>{LANDMARKS[banner.idx].name}</Text>
              <Text style={styles.bannerAlt}>{formatAltitude(LANDMARKS[banner.idx].altitudeM)}</Text>
            </Animated.View>
          </View>
        )}

        {phase === 'charging' && H > 0 && (
          <>
            <ChargeReadout peakKg={peakKg} chargeSec={chargeSec} unit={readoutUnit} />
            <PowerMeter liveKg={liveKg} peakKg={peakKg} height={H * 0.62} />
          </>
        )}

        {showResultCard && isNewBest && <Confetti key={round} x={W / 2} y={H * 0.45} w={W} h={H} />}

        {showWaiting && (
          <Animated.View entering={FadeIn.duration(250)} style={styles.centerPanel} pointerEvents="none">
            <View style={{ width: station ? boardWidth : Math.min(W * 0.88, 440), alignItems: 'center' }}>
              <Text style={[styles.title, { fontSize: heroUnit * (station ? 0.95 : 1.1) }]}>LAUNCH</Text>
              <Text style={[styles.subtitle, { fontSize: heroUnit * 0.3 }]}>HOW HIGH CAN ONE PULL SEND HIM?</Text>
              {station && <View style={{ alignSelf: 'stretch', marginTop: heroUnit * 0.25 }}><GymLeaderboard entries={leaderboard} unit={heroUnit} format={launchScoreFormat} /></View>}
              <HowToPlay unit={station ? heroUnit : 26} lines={LAUNCH_HOW_TO_LINES} />
              {!station && best > 0 && <Text style={styles.bestLine}>YOUR BEST · {kgText(bestKg)} · {reachedPhrase(bestKg)}</Text>}
              <PullPrompt label="PULL TO START" size={station ? heroUnit * 0.5 : 14} />
            </View>
          </Animated.View>
        )}

        {showResultCard && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.centerPanel} pointerEvents="none">
            <Animated.View entering={ZoomIn.springify().damping(13)} style={styles.resultCard}>
            <Text style={[styles.resultPhrase, { fontSize: overUnit * 1.05 }]} numberOfLines={2} adjustsFontSizeToFit>{reachedPhrase(launchKg)}</Text>
            <Text style={[styles.resultAlt, { fontSize: overUnit * 1.25 }]} numberOfLines={1} adjustsFontSizeToFit>{formatAltitude(altitudeForKg(launchKg))}</Text>
            <Text style={[styles.resultKg, { fontSize: overUnit * 0.45 }]}>{kgText(launchKg)} · ONE ARM</Text>
            <Text style={[styles.resultBest, { fontSize: overUnit * 0.4 }, isNewBest && { color: Colours.go }]}>
              {isNewBest ? (station ? 'NEW WEEK BEST!' : 'NEW BEST!') : bestAtLaunch.current > 0 ? `${station ? 'WEEK BEST' : 'BEST'} ${kgText(kgFromScore(bestAtLaunch.current))}` : ''}
            </Text>
            {station && (
              <View style={{ width: boardWidth, marginTop: 8 }}>
                <GymLeaderboard entries={leaderboard} unit={overUnit} format={launchScoreFormat} />
              </View>
            )}
            <Text style={styles.resultHint}>RELEASE, THEN PULL TO GO AGAIN</Text>
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const textShadow = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } };

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLabel: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  zero: { ...Fonts.mono(12, 'bold'), color: ACCENT },
  zeroBusy: { color: Colours.dim },
  exit: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  playArea: { flex: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: SKY_COL[0] },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: '#FFFFFF' },
  ring: { position: 'absolute', left: 0, top: 0, borderWidth: 3, borderColor: GOLD },

  hud: { position: 'absolute', left: 14, top: 12 },
  hudLabel: { ...Fonts.mono(10, 'bold'), color: 'rgba(255,255,255,0.75)', letterSpacing: 1.5, ...textShadow },
  hudValue: { ...Fonts.timerDigits(30), color: '#FFFFFF', ...textShadow },
  hudSub: { ...Fonts.mono(11, 'bold'), color: GOLD, letterSpacing: 1, ...textShadow },

  bannerWrap: { position: 'absolute', top: '17%', left: 0, right: 0, alignItems: 'center' },
  banner: { alignItems: 'center', backgroundColor: 'rgba(10,14,22,0.72)', borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,211,77,0.7)', paddingHorizontal: 18, paddingVertical: 8 },
  bannerName: { ...Fonts.mono(20, 'bold'), color: GOLD, letterSpacing: 2, textShadowColor: 'rgba(255,211,77,0.6)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  bannerAlt: { ...Fonts.mono(12, 'bold'), color: '#FFFFFF', letterSpacing: 1 },

  readout: { position: 'absolute', top: '6%', left: 0, right: 0, alignItems: 'center' },
  readoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  readoutKg: { ...Fonts.timerDigits(64), color: '#FFFFFF', ...textShadow },
  readoutUnit: { ...Fonts.mono(18, 'bold'), color: '#FFFFFF', ...textShadow },
  readoutReach: { ...Fonts.mono(16, 'bold'), color: GOLD, letterSpacing: 1.5, ...textShadow },
  readoutHint: { ...Fonts.mono(12, 'bold'), color: 'rgba(255,255,255,0.8)', letterSpacing: 1.2, marginTop: 6, ...textShadow },
  timerTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(10,14,22,0.45)', marginTop: 10, overflow: 'hidden' },
  timerFill: { height: 8, borderRadius: 4, backgroundColor: GOLD },

  meter: { position: 'absolute', right: 12, top: '14%', width: 130, alignItems: 'flex-end' },
  meterTrack: { width: 22, borderRadius: 11, backgroundColor: 'rgba(10,14,22,0.5)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', overflow: 'hidden', justifyContent: 'flex-end' },
  meterFill: { width: '100%', borderRadius: 9 },
  meterMark: { position: 'absolute', right: 26, flexDirection: 'row', alignItems: 'center', gap: 4 },
  meterLabel: { ...Fonts.mono(9, 'bold'), color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6, ...textShadow },
  meterTick: { width: 8, height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  peakLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#FFFFFF' },
  peakArrow: { position: 'absolute', right: -12, width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderRightWidth: 10, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: '#FFFFFF' },

  centerPanel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.38)', paddingHorizontal: 16 },
  title: { ...Fonts.mono(40, 'bold'), color: GOLD, letterSpacing: 8, textShadowColor: 'rgba(255,211,77,0.6)', textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
  subtitle: { ...Fonts.mono(11, 'bold'), color: '#FFFFFF', letterSpacing: 1.5, marginTop: 2, ...textShadow },
  bestLine: { ...Fonts.mono(11, 'bold'), color: GOLD, letterSpacing: 1, marginTop: 12, ...textShadow },
  resultCard: { alignItems: 'center', gap: 6 },
  resultPhrase: { ...Fonts.mono(30, 'bold'), color: GOLD, letterSpacing: 3, textAlign: 'center', textShadowColor: 'rgba(255,211,77,0.6)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  resultAlt: { ...Fonts.timerDigits(48), color: '#FFFFFF', ...textShadow },
  resultKg: { ...Fonts.mono(14, 'bold'), color: 'rgba(255,255,255,0.8)', letterSpacing: 1.5 },
  resultBest: { ...Fonts.mono(12, 'bold'), color: 'rgba(255,255,255,0.65)', letterSpacing: 1, marginTop: 2 },
  resultHint: { ...Fonts.mono(10, 'medium'), color: 'rgba(255,255,255,0.6)', marginTop: 10 },
});

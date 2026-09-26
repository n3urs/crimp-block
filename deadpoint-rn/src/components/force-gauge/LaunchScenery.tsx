// src/components/force-gauge/LaunchScenery.tsx
/** Everything the Launch game's bird flies past: town, trees, balloons, a
    cloud sea with Everest poking out, a plane, the edge of space, aurora,
    the ISS, Earth, an astronaut, satellites, a comet, the Moon, Mars, the
    asteroid belt, Jupiter, Saturn, Voyager at the edge of the solar system,
    a nebula, the next star and a spiral galaxy.

    World coordinates are kg-levels (launchPhysics.ts): a thing at level L
    sits at screen y = ground - L * px while the camera is on the ground;
    LaunchGame translates the whole layer as the camera climbs. Each piece
    is its own small memoised SVG so nothing here re-renders per frame, and
    only pieces up to `upTo` are mounted. Cartoon style to match the bird:
    flat fills, one highlight, dark outlines by day, glows in space. */
import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Fonts } from '../../design/fonts';
import { LANDMARKS, formatAltitude } from '../../data/forceGauge/launchPhysics';

export interface WorldProps {
  w: number;
  h: number;
  /** Pixels per kg-level. */
  px: number;
  /** Screen y of the ground while the camera is on it. */
  ground: number;
  /** Highest level worth mounting right now. */
  upTo: number;
}

const INK = '#5B3A1A';
const SPACE_INK = '#1B2033';

/** Deterministic pseudo-random numbers, so the scenery is the same every round. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An absolutely positioned box spanning [bottom, top] in levels. */
function Band({ ground, px, bottom, top, left, width, children }: {
  ground: number; px: number; bottom: number; top: number; left: number; width: number; children: React.ReactNode;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, width, top: ground - top * px, height: (top - bottom) * px }}>
      {children}
    </View>
  );
}

/** A square box of side `size` centred on (cx, level). */
function Spot({ ground, px, level, cx, size, children }: {
  ground: number; px: number; level: number; cx: number; size: number; children: React.ReactNode;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: cx - size / 2, top: ground - level * px - size / 2, width: size, height: size }}>
      {children}
    </View>
  );
}

// ---------- gentle looping motions --------------------------------------------

function Bob({ amp, periodMs, children, style }: { amp: number; periodMs: number; children: React.ReactNode; style?: object }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: periodMs, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, periodMs]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: (t.value - 0.5) * 2 * amp }] }));
  return <Animated.View style={[StyleSheet.absoluteFill, style, s]}>{children}</Animated.View>;
}

function Spin({ periodMs, children, reverse }: { periodMs: number; children: React.ReactNode; reverse?: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: periodMs, easing: Easing.linear }), -1, false);
  }, [t, periodMs]);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${(reverse ? -360 : 360) * t.value}deg` }] }));
  return <Animated.View style={[StyleSheet.absoluteFill, s]}>{children}</Animated.View>;
}

function Sway({ deg, periodMs, children }: { deg: number; periodMs: number; children: React.ReactNode }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: periodMs, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, periodMs]);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${(t.value - 0.5) * 2 * deg}deg` }] }));
  return <Animated.View style={[StyleSheet.absoluteFill, s]}>{children}</Animated.View>;
}

function Blink({ periodMs, children }: { periodMs: number; children: React.ReactNode }) {
  const t = useSharedValue(1);
  useEffect(() => {
    t.value = withRepeat(withSequence(withTiming(1, { duration: periodMs * 0.5 }), withTiming(0.1, { duration: 80 }), withTiming(1, { duration: 80 })), -1, false);
  }, [t, periodMs]);
  const s = useAnimatedStyle(() => ({ opacity: t.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, s]}>{children}</Animated.View>;
}

// ---------- ground level ------------------------------------------------------

const Ground = memo(function Ground({ w, h, ground, px }: WorldProps) {
  const depth = h * 0.6;
  const rnd = seeded(7);
  const pebbles = Array.from({ length: 16 }, () => ({ x: rnd() * w, y: 22 + rnd() * (depth * 0.35), r: 1.5 + rnd() * 2.5 }));
  const hillH = px * 1.9;
  return (
    <>
      {/* Rolling hills behind the town. */}
      <Band ground={ground} px={px} bottom={0} top={1.9} left={0} width={w}>
        <Svg width={w} height={hillH}>
          <Path d={`M0 ${hillH * 0.55} Q ${w * 0.2} ${hillH * 0.05} ${w * 0.42} ${hillH * 0.5} T ${w * 0.85} ${hillH * 0.35} T ${w} ${hillH * 0.45} V ${hillH} H 0 Z`} fill="#A8DB7A" />
          <Path d={`M0 ${hillH * 0.8} Q ${w * 0.3} ${hillH * 0.35} ${w * 0.6} ${hillH * 0.75} T ${w} ${hillH * 0.62} V ${hillH} H 0 Z`} fill="#8FCB62" />
        </Svg>
      </Band>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: ground, width: w, height: depth }}>
        <Svg width={w} height={depth}>
          <Rect x={0} y={0} width={w} height={depth} fill="#DED895" />
          <Rect x={0} y={0} width={w} height={14} fill="#6FC344" />
          <Rect x={0} y={12} width={w} height={3} fill="#4A9528" />
          {pebbles.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#C9C27E" />)}
        </Svg>
      </View>
    </>
  );
});

/** The pad the bird sits on: a steel deck with hazard stripes and two flags. */
export function padHeight(px: number) {
  return Math.max(12, px * 0.2);
}
const LaunchPad = memo(function LaunchPad({ w, ground, px }: WorldProps) {
  const pw = Math.min(190, w * 0.34);
  const ph = padHeight(px);
  const flagH = ph * 3.2;
  const H = ph + flagH;
  const stripes = Math.ceil(pw / 14);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: w / 2 - pw / 2, top: ground - H + 2, width: pw, height: H }}>
      <Svg width={pw} height={H}>
        <Defs>
          <ClipPath id="padDeck"><Rect x={2} y={flagH} width={pw - 4} height={ph * 0.55} rx={3} /></ClipPath>
        </Defs>
        {[0.08, 0.92].map((f, i) => (
          <G key={i}>
            <Line x1={pw * f} y1={flagH + 2} x2={pw * f} y2={2} stroke={INK} strokeWidth={2.5} />
            <Path d={`M ${pw * f} 3 L ${pw * f + (i ? -1 : 1) * flagH * 0.5} ${flagH * 0.18} L ${pw * f} ${flagH * 0.36} Z`} fill={i ? '#FF5A5F' : '#FFD34D'} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
          </G>
        ))}
        <Rect x={pw * 0.14} y={flagH + ph * 0.5} width={pw * 0.08} height={ph * 0.5} fill="#8A96A8" stroke={INK} strokeWidth={1.5} />
        <Rect x={pw * 0.78} y={flagH + ph * 0.5} width={pw * 0.08} height={ph * 0.5} fill="#8A96A8" stroke={INK} strokeWidth={1.5} />
        <G clipPath="url(#padDeck)">
          <Rect x={0} y={flagH} width={pw} height={ph} fill="#FFD34D" />
          {Array.from({ length: stripes }, (_, i) => (
            <Path key={i} d={`M ${i * 14 - 6} ${flagH + ph} L ${i * 14 + 2} ${flagH} H ${i * 14 + 9} L ${i * 14 + 1} ${flagH + ph} Z`} fill="#2B2F3A" />
          ))}
        </G>
        <Rect x={2} y={flagH} width={pw - 4} height={ph * 0.55} rx={3} fill="none" stroke={INK} strokeWidth={2} />
      </Svg>
    </View>
  );
});

// ---------- the town (rooftops, 5) and the tall trees (10) -------------------

function Building({ w, px, ground, x, width, top, wall, roof, pitched, chimney }: {
  w: number; px: number; ground: number; x: number; width: number; top: number; wall: string; roof: string; pitched: boolean; chimney?: boolean;
}) {
  const H = top * px;
  const roofH = pitched ? Math.min(width * 0.45, H * 0.22) : H * 0.05;
  const bodyTop = roofH;
  const floorH = Math.max(34, px * 0.62);
  const floors = Math.max(1, Math.floor((H - bodyTop - floorH * 0.9) / floorH));
  const cols = width > 150 ? 3 : 2;
  const winW = (width * 0.62) / cols;
  const gapX = (width - winW * cols) / (cols + 1);
  const winH = floorH * 0.5;
  const rnd = seeded(Math.round(x * 13 + top * 7));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x, top: ground - H, width, height: H }}>
      <Svg width={width} height={H}>
        {chimney && <Rect x={width * 0.66} y={roofH * 0.05} width={width * 0.12} height={roofH * 0.8} fill="#A0503C" stroke={INK} strokeWidth={2} />}
        <Rect x={2} y={bodyTop} width={width - 4} height={H - bodyTop} fill={wall} stroke={INK} strokeWidth={2.5} />
        {pitched
          ? <Polygon points={`${-2},${bodyTop + 2} ${width / 2},${1.5} ${width + 2},${bodyTop + 2}`} fill={roof} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          : <Rect x={-2} y={0} width={width + 4} height={roofH + 3} fill={roof} stroke={INK} strokeWidth={2.5} />}
        {Array.from({ length: floors }, (_, f) =>
          Array.from({ length: cols }, (_, c) => {
            const lit = rnd() < 0.55;
            return (
              <Rect key={`${f}-${c}`} x={gapX + c * (winW + gapX)} y={bodyTop + floorH * 0.35 + f * floorH} width={winW} height={winH} rx={2}
                fill={lit ? '#FFE58A' : '#7FB8D6'} stroke={INK} strokeWidth={1.8} />
            );
          }),
        )}
        <Rect x={width / 2 - width * 0.11} y={H - floorH * 0.62} width={width * 0.22} height={floorH * 0.62} rx={3} fill="#8A4B3A" stroke={INK} strokeWidth={2} />
      </Svg>
    </View>
  );
}

const Town = memo(function Town({ w, px, ground }: WorldProps) {
  const b = (x: number, width: number, top: number, wall: string, roof: string, pitched: boolean, chimney?: boolean) => (
    <Building w={w} px={px} ground={ground} x={x * w} width={width * w} top={top} wall={wall} roof={roof} pitched={pitched} chimney={chimney} />
  );
  return (
    <>
      {b(-0.02, 0.19, 4.2, '#F2E6C9', '#8A4B3A', true)}
      {b(0.16, 0.17, 5, '#E4A37F', '#5E6A7A', true, true)}
      {b(0.66, 0.16, 5, '#D9E3EC', '#5E6A7A', false)}
      {b(0.81, 0.21, 3.9, '#F7D98B', '#8A4B3A', true, true)}
    </>
  );
});

function Pine({ px, ground, cx, width, top }: { px: number; ground: number; cx: number; width: number; top: number }) {
  const H = top * px;
  const tiers = 7;
  const trunkH = H * 0.08;
  const tierH = (H - trunkH) / tiers;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: cx - width / 2, top: ground - H, width, height: H }}>
      <Svg width={width} height={H}>
        <Rect x={width * 0.42} y={H - trunkH - 4} width={width * 0.16} height={trunkH + 4} fill="#8A5A3B" stroke={INK} strokeWidth={2} />
        {Array.from({ length: tiers }, (_, i) => {
          // Top tier first: narrow at the tip, widening downwards.
          const y0 = i * tierH;
          const half = width * (0.18 + 0.32 * ((i + 1) / tiers));
          const d = `M ${width / 2} ${y0 - tierH * 0.15} L ${width / 2 + half} ${y0 + tierH * 1.25} H ${width / 2 - half} Z`;
          return (
            <G key={i}>
              <Path d={d} fill={i % 2 ? '#3E9B4F' : '#45A857'} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
              <Path d={`M ${width / 2} ${y0 - tierH * 0.1} L ${width / 2 - half * 0.6} ${y0 + tierH * 1.05}`} stroke="#7DD08A" strokeWidth={2} strokeLinecap="round" />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const Trees = memo(function Trees({ w, px, ground }: WorldProps) {
  return (
    <>
      <Pine px={px} ground={ground} cx={w * 0.09} width={Math.min(w * 0.15, px * 1.8)} top={10} />
      <Pine px={px} ground={ground} cx={w * 0.9} width={Math.min(w * 0.15, px * 1.8)} top={9.6} />
    </>
  );
});

// ---------- low sky: little clouds, a flock, balloons (15) --------------------

function Puff({ cx, cy, r, fill = '#FFFFFF', shade = '#E3F1F6' }: { cx: number; cy: number; r: number; fill?: string; shade?: string }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy + r * 0.18} rx={r * 1.9} ry={r * 0.55} fill={shade} />
      <Circle cx={cx - r * 0.9} cy={cy} r={r * 0.62} fill={fill} />
      <Circle cx={cx} cy={cy - r * 0.25} r={r * 0.85} fill={fill} />
      <Circle cx={cx + r * 0.95} cy={cy + r * 0.05} r={r * 0.58} fill={fill} />
    </G>
  );
}

const SkyPuffs = memo(function SkyPuffs({ w, px, ground }: WorldProps) {
  const spots: Array<[number, number, number]> = [[0.78, 2.6, 0.5], [0.3, 6.8, 0.42], [0.7, 11.2, 0.55], [0.2, 12.6, 0.35], [0.62, 17.2, 0.45], [0.35, 27.5, 0.3], [0.8, 33, 0.25]];
  return (
    <>
      {spots.map(([x, lv, s], i) => {
        const r = Math.min(w * 0.11, px * 0.9) * s * 1.6;
        const size = r * 4.4;
        return (
          <Spot key={i} ground={ground} px={px} level={lv} cx={x * w} size={size}>
            <Svg width={size} height={size} opacity={lv > 25 ? 0.55 : 0.95}>
              <Puff cx={size / 2} cy={size / 2} r={r} />
            </Svg>
          </Spot>
        );
      })}
    </>
  );
});

const Flock = memo(function Flock({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.3, px * 2.6);
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 380, easing: Easing.inOut(Easing.sin) }), -1, true); }, [t]);
  const flap = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.55 + t.value * 0.45 }] }));
  const birds: Array<[number, number, number]> = [[0.2, 0.3, 1], [0.38, 0.42, 0.8], [0.52, 0.22, 0.9], [0.68, 0.38, 0.7], [0.82, 0.5, 0.6]];
  return (
    <Spot ground={ground} px={px} level={12.3} cx={w * 0.3} size={size}>
      <Animated.View style={[StyleSheet.absoluteFill, flap]}>
        <Svg width={size} height={size}>
          {birds.map(([x, y, s], i) => (
            <Path key={i} d={`M ${x * size - 12 * s} ${y * size - 5 * s} Q ${x * size - 5 * s} ${y * size - 9 * s} ${x * size} ${y * size} Q ${x * size + 5 * s} ${y * size - 9 * s} ${x * size + 12 * s} ${y * size - 5 * s}`}
              stroke="#2B3A4A" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </Animated.View>
    </Spot>
  );
});

function Balloon({ size, stripes }: { size: number; stripes: string[] }) {
  const cx = size / 2;
  const r = size * 0.36;
  const top = size * 0.04;
  const envelope = `M ${cx} ${top} C ${cx + r * 1.45} ${top}, ${cx + r * 1.35} ${top + r * 1.55}, ${cx + r * 0.32} ${top + r * 2.1} L ${cx - r * 0.32} ${top + r * 2.1} C ${cx - r * 1.35} ${top + r * 1.55}, ${cx - r * 1.45} ${top}, ${cx} ${top} Z`;
  const basketY = top + r * 2.45;
  const n = stripes.length;
  const clipId = `bal${stripes.join('').replace(/#/g, '')}`;
  return (
    <Svg width={size} height={size}>
      <Defs><ClipPath id={clipId}><Path d={envelope} /></ClipPath></Defs>
      <G clipPath={`url(#${clipId})`}>
        {stripes.map((c, i) => (
          <Rect key={i} x={cx - r * 1.2 + (i * r * 2.4) / n} y={0} width={(r * 2.4) / n + 1} height={size} fill={c} />
        ))}
        <Ellipse cx={cx - r * 0.45} cy={top + r * 0.7} rx={r * 0.22} ry={r * 0.5} fill="#FFFFFF" opacity={0.35} />
      </G>
      <Path d={envelope} fill="none" stroke={INK} strokeWidth={2.2} />
      <Line x1={cx - r * 0.32} y1={top + r * 2.1} x2={cx - r * 0.22} y2={basketY} stroke={INK} strokeWidth={1.5} />
      <Line x1={cx + r * 0.32} y1={top + r * 2.1} x2={cx + r * 0.22} y2={basketY} stroke={INK} strokeWidth={1.5} />
      <Rect x={cx - r * 0.26} y={basketY} width={r * 0.52} height={r * 0.36} rx={2} fill="#A0703F" stroke={INK} strokeWidth={2} />
    </Svg>
  );
}

const Balloons = memo(function Balloons({ w, px, ground }: WorldProps) {
  const big = Math.min(w * 0.26, px * 2.1);
  return (
    <>
      <Spot ground={ground} px={px} level={14.6} cx={w * 0.2} size={big}>
        <Bob amp={6} periodMs={2600}><Balloon size={big} stripes={['#FF5A5F', '#FFD34D', '#FF5A5F', '#FFD34D', '#FF5A5F']} /></Bob>
      </Spot>
      <Spot ground={ground} px={px} level={16.2} cx={w * 0.8} size={big * 0.72}>
        <Bob amp={5} periodMs={3100}><Balloon size={big * 0.72} stripes={['#4DA6FF', '#FFFFFF', '#4DA6FF', '#FFFFFF']} /></Bob>
      </Spot>
    </>
  );
});

// ---------- the cloud sea (20) and Everest (25) --------------------------------

function cloudBandPuffs(w: number, px: number, seed: number, count: number, spread: number) {
  const rnd = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: -w * 0.05 + (i / (count - 1)) * w * 1.1 + (rnd() - 0.5) * w * 0.04,
    y: (rnd() - 0.5) * spread * px,
    r: px * (0.42 + rnd() * 0.38),
  }));
}

/** Back layer of the cloud sea, behind the bird. */
const CloudSea = memo(function CloudSea({ w, px, ground }: WorldProps) {
  const H = px * 3.2;
  const mid = H * 0.5;
  const puffs = cloudBandPuffs(w, px, 21, Math.max(9, Math.round(w / 55)), 1.2);
  return (
    <Band ground={ground} px={px} bottom={18.4} top={21.6} left={0} width={w}>
      <Svg width={w} height={H}>
        <Rect x={0} y={mid - px * 0.3} width={w} height={px * 0.9} fill="#EEF7FA" />
        {puffs.map((p, i) => <Circle key={i} cx={p.x} cy={mid + p.y} r={p.r * 1.15} fill={i % 2 ? '#F4FAFC' : '#E6F2F6'} />)}
        {puffs.map((p, i) => <Circle key={`t${i}`} cx={p.x + px * 0.2} cy={mid + p.y - p.r * 0.45} r={p.r * 0.75} fill="#FFFFFF" />)}
      </Svg>
    </Band>
  );
});

/** Front layer: a few puffs drawn OVER the bird so he punches through. */
export const CloudSeaFront = memo(function CloudSeaFront({ w, px, ground, upTo }: WorldProps) {
  if (upTo < 17) return null;
  const H = px * 2.2;
  const puffs = cloudBandPuffs(w, px, 99, Math.max(6, Math.round(w / 90)), 0.8);
  return (
    <Band ground={ground} px={px} bottom={18.6} top={20.8} left={0} width={w}>
      <Svg width={w} height={H} opacity={0.93}>
        {puffs.map((p, i) => <Circle key={i} cx={p.x + (i % 2 ? px * 0.3 : 0)} cy={H * 0.55 + p.y} r={p.r * 0.9} fill="#FFFFFF" />)}
      </Svg>
    </Band>
  );
});

const Everest = memo(function Everest({ w, px, ground }: WorldProps) {
  const width = Math.min(w * 0.62, px * 7.5);
  const H = px * 5.3;
  const peakX = width * 0.46;
  const pts: Array<[number, number]> = [[0, H], [width * 0.1, H * 0.62], [width * 0.18, H * 0.66], [width * 0.3, H * 0.34], [width * 0.38, H * 0.38], [peakX, 0], [width * 0.6, H * 0.3], [width * 0.66, H * 0.27], [width * 0.8, H * 0.55], [width * 0.9, H * 0.52], [width, H]];
  const ridge = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const shadow = `${peakX},0 ${width * 0.6},${H * 0.3} ${width * 0.66},${H * 0.27} ${width * 0.8},${H * 0.55} ${width * 0.9},${H * 0.52} ${width},${H} ${width * 0.52},${H} ${width * 0.5},${H * 0.4}`;
  const snow = `${width * 0.3},${H * 0.34} ${width * 0.38},${H * 0.38} ${peakX},0 ${width * 0.6},${H * 0.3} ${width * 0.66},${H * 0.27} ${width * 0.7},${H * 0.36} ${width * 0.6},${H * 0.4} ${width * 0.52},${H * 0.33} ${width * 0.45},${H * 0.42} ${width * 0.38},${H * 0.46}`;
  return (
    <Band ground={ground} px={px} bottom={19.7} top={25} left={w * 0.02} width={width}>
      <Svg width={width} height={H + 2}>
        <Polygon points={ridge} fill="#8594AB" />
        <Polygon points={shadow} fill="#66748B" />
        <Polygon points={snow} fill="#FFFFFF" />
        <Polygon points={ridge} fill="none" stroke="#3C4656" strokeWidth={2.5} strokeLinejoin="round" />
        {/* A tiny summit flag. */}
        <Line x1={peakX} y1={1} x2={peakX} y2={-px * 0.45} stroke="#3C4656" strokeWidth={2} />
      </Svg>
      <View style={{ position: 'absolute', left: peakX, top: -px * 0.45, width: px * 0.36, height: px * 0.22 }}>
        <Sway deg={6} periodMs={700}>
          <Svg width={px * 0.36} height={px * 0.22}><Path d={`M0 0 L ${px * 0.34} ${px * 0.08} L 0 ${px * 0.2} Z`} fill="#FF5A5F" stroke="#3C4656" strokeWidth={1.5} /></Svg>
        </Sway>
      </View>
    </Band>
  );
});

// ---------- the plane (30) and the stratosphere (35) ---------------------------

function Airliner({ width }: { width: number }) {
  const h = width * 0.36;
  const y = h * 0.55;
  return (
    <Svg width={width} height={h}>
      <Path d={`M ${width * 0.62} ${y} L ${width * 0.9} ${h * 0.06} H ${width * 0.98} L ${width * 0.92} ${y}`} fill="#E84D4D" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <Path d={`M ${width * 0.06} ${y} Q ${width * 0.02} ${y + h * 0.13} ${width * 0.1} ${y + h * 0.2} H ${width * 0.95} Q ${width} ${y + h * 0.1} ${width * 0.95} ${y - h * 0.02} H ${width * 0.14} Q ${width * 0.08} ${y - h * 0.03} ${width * 0.06} ${y} Z`}
        fill="#F4F6F8" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <Path d={`M ${width * 0.38} ${y + h * 0.12} L ${width * 0.56} ${y + h * 0.45} H ${width * 0.64} L ${width * 0.56} ${y + h * 0.12} Z`} fill="#C9D2DC" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {Array.from({ length: 9 }, (_, i) => <Circle key={i} cx={width * (0.2 + i * 0.075)} cy={y + h * 0.07} r={Math.max(1.6, width * 0.012)} fill="#5B6B80" />)}
      <Path d={`M ${width * 0.08} ${y + h * 0.02} Q ${width * 0.11} ${y - h * 0.01} ${width * 0.15} ${y}`} stroke="#5B6B80" strokeWidth={2} fill="none" />
    </Svg>
  );
}

const Plane = memo(function Plane({ w, px, ground }: WorldProps) {
  const pw = Math.min(w * 0.34, px * 3.4);
  const ph = pw * 0.36;
  const trail = w * 0.9;
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false); }, [t]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: w + 20 - t.value * (w + pw + trail + 40) }] }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: ground - 30 * px - ph / 2, width: pw + trail, height: ph }}>
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', width: pw + trail, height: ph }, s]}>
        <Airliner width={pw} />
        <Svg width={trail} height={ph}>
          <Defs>
            <LinearGradient id="contrail" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={-4} y={ph * 0.58} width={trail} height={Math.max(3, ph * 0.1)} rx={3} fill="url(#contrail)" />
          <Rect x={-4} y={ph * 0.74} width={trail * 0.85} height={Math.max(2, ph * 0.07)} rx={3} fill="url(#contrail)" />
        </Svg>
      </Animated.View>
    </View>
  );
});

const WeatherBalloon = memo(function WeatherBalloon({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.22, px * 1.9);
  const r = size * 0.28;
  return (
    <Spot ground={ground} px={px} level={35} cx={w * 0.78} size={size}>
      <Sway deg={5} periodMs={3400}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={r + 2} r={r} fill="#F7F7F2" opacity={0.92} stroke="#9AA6B6" strokeWidth={1.5} />
          <Ellipse cx={size / 2 - r * 0.35} cy={r * 0.7} rx={r * 0.22} ry={r * 0.35} fill="#FFFFFF" />
          <Line x1={size / 2} y1={r * 2 + 2} x2={size / 2} y2={size * 0.82} stroke="#D9DEE6" strokeWidth={1.5} />
          <Rect x={size / 2 - size * 0.07} y={size * 0.82} width={size * 0.14} height={size * 0.1} rx={2} fill="#FFB84D" stroke={SPACE_INK} strokeWidth={1.5} />
        </Svg>
      </Sway>
    </Spot>
  );
});

// ---------- the edge of space (40) and aurora --------------------------------

const EdgeOfSpace = memo(function EdgeOfSpace({ w, px, ground }: WorldProps) {
  const H = px * 1.2;
  const d = `M ${-w * 0.05} ${H * 0.95} Q ${w / 2} ${-H * 0.55} ${w * 1.05} ${H * 0.95}`;
  return (
    <Band ground={ground} px={px} bottom={39} top={40.2} left={0} width={w}>
      <Svg width={w} height={H}>
        <Path d={d} stroke="#7FE3FF" strokeWidth={22} opacity={0.12} fill="none" />
        <Path d={d} stroke="#7FE3FF" strokeWidth={9} opacity={0.3} fill="none" />
        <Path d={d} stroke="#E8FBFF" strokeWidth={2} opacity={0.9} fill="none" />
      </Svg>
    </Band>
  );
});

const Aurora = memo(function Aurora({ w, px, ground }: WorldProps) {
  const H = px * 4.5;
  const ribbon = (y: number, amp: number, phase: number) => {
    let d = `M 0 ${y}`;
    for (let i = 1; i <= 8; i++) {
      const x = (i / 8) * w;
      d += ` Q ${x - w / 16} ${y + Math.sin(i + phase) * amp} ${x} ${y + Math.cos(i * 0.7 + phase) * amp * 0.5}`;
    }
    return `${d} V ${y - H * 0.6} H 0 Z`;
  };
  return (
    <Band ground={ground} px={px} bottom={42.5} top={47} left={0} width={w}>
      <Sway deg={1.5} periodMs={5200}>
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="auroraG" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#6BFFB0" stopOpacity={0.65} />
              <Stop offset="0.55" stopColor="#39D98A" stopOpacity={0.22} />
              <Stop offset="1" stopColor="#C77DFF" stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="auroraP" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#C77DFF" stopOpacity={0.45} />
              <Stop offset="1" stopColor="#C77DFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={ribbon(H * 0.92, px * 0.5, 0)} fill="url(#auroraG)" />
          <Path d={ribbon(H * 0.7, px * 0.4, 2)} fill="url(#auroraP)" />
          <Path d={ribbon(H * 0.82, px * 0.35, 4)} fill="url(#auroraG)" />
        </Svg>
      </Sway>
    </Band>
  );
});

// ---------- orbit: ISS (50), Earth, astronaut, satellites (60), comet ---------

const ISS = memo(function ISS({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.36, px * 3.4);
  const c = size / 2;
  const panel = (x: number, up: boolean) => (
    <G key={`${x}${up}`}>
      <Rect x={x} y={up ? c - size * 0.4 : c + size * 0.05} width={size * 0.1} height={size * 0.35} fill="#2E5AA8" stroke="#D9A441" strokeWidth={1.5} />
      {[0.25, 0.5, 0.75].map((f) => (
        <Line key={f} x1={x} x2={x + size * 0.1} y1={(up ? c - size * 0.4 : c + size * 0.05) + size * 0.35 * f} y2={(up ? c - size * 0.4 : c + size * 0.05) + size * 0.35 * f} stroke="#6E93D6" strokeWidth={1} />
      ))}
    </G>
  );
  return (
    <Spot ground={ground} px={px} level={50} cx={w * 0.7} size={size}>
      <Sway deg={4} periodMs={6000}>
        <Svg width={size} height={size}>
          <Rect x={size * 0.05} y={c - size * 0.025} width={size * 0.9} height={size * 0.05} fill="#C9CED6" stroke={SPACE_INK} strokeWidth={1.2} />
          {[0.1, 0.22, 0.68, 0.8].flatMap((f) => [panel(size * f, true), panel(size * f, false)])}
          <Rect x={c - size * 0.05} y={c - size * 0.2} width={size * 0.1} height={size * 0.4} rx={size * 0.03} fill="#F0F2F5" stroke={SPACE_INK} strokeWidth={1.2} />
          <Rect x={c - size * 0.13} y={c - size * 0.04} width={size * 0.26} height={size * 0.08} rx={size * 0.03} fill="#E4E7EC" stroke={SPACE_INK} strokeWidth={1.2} />
          <Rect x={c + size * 0.14} y={c - size * 0.14} width={size * 0.06} height={size * 0.1} fill="#F5F5F5" stroke={SPACE_INK} strokeWidth={1} />
        </Svg>
      </Sway>
    </Spot>
  );
});

const Earth = memo(function Earth({ w, px, ground }: WorldProps) {
  const R = Math.min(w * 0.42, px * 3.1);
  const size = R * 2.3;
  const c = size / 2;
  return (
    <Spot ground={ground} px={px} level={54} cx={-R * 0.25} size={size}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="earthGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0.8" stopColor="#8FD8FF" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#8FD8FF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="earthSea" cx="62%" cy="35%" r="75%">
            <Stop offset="0" stopColor="#4FA3FF" />
            <Stop offset="1" stopColor="#1C4FA8" />
          </RadialGradient>
          <ClipPath id="earthClip"><Circle cx={c} cy={c} r={R} /></ClipPath>
        </Defs>
        <Circle cx={c} cy={c} r={R * 1.14} fill="url(#earthGlow)" />
        <Circle cx={c} cy={c} r={R} fill="url(#earthSea)" />
        <G clipPath="url(#earthClip)">
          <Path d={`M ${c + R * 0.1} ${c - R * 0.7} q ${R * 0.4} ${R * 0.1} ${R * 0.45} ${R * 0.45} t ${R * 0.1} ${R * 0.5} q ${-R * 0.25} ${R * 0.2} ${-R * 0.3} ${-R * 0.1} t ${-R * 0.3} ${-R * 0.45} z`} fill="#4CB866" />
          <Path d={`M ${c - R * 0.5} ${c + R * 0.1} q ${R * 0.35} ${-R * 0.1} ${R * 0.4} ${R * 0.3} t ${-R * 0.1} ${R * 0.5} q ${-R * 0.3} ${-R * 0.05} ${-R * 0.35} ${-R * 0.35} z`} fill="#5CC374" />
          <Path d={`M ${c - R * 0.9} ${c - R * 0.35} q ${R * 0.6} ${-R * 0.2} ${R * 1.1} ${-R * 0.02}`} stroke="#FFFFFF" strokeWidth={R * 0.07} opacity={0.75} strokeLinecap="round" fill="none" />
          <Path d={`M ${c - R * 0.2} ${c + R * 0.55} q ${R * 0.5} ${-R * 0.15} ${R * 0.95} ${R * 0.05}`} stroke="#FFFFFF" strokeWidth={R * 0.06} opacity={0.7} strokeLinecap="round" fill="none" />
          {/* Night side. */}
          <Circle cx={c - R * 0.55} cy={c + R * 0.35} r={R * 1.05} fill="#050A1E" opacity={0.45} />
        </G>
      </Svg>
    </Spot>
  );
});

const Astronaut = memo(function Astronaut({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.14, px * 1.2);
  return (
    <Spot ground={ground} px={px} level={56.5} cx={w * 0.8} size={size}>
      <Spin periodMs={14000}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Rect x={30} y={40} width={40} height={32} rx={10} fill="#D0D4DA" stroke={SPACE_INK} strokeWidth={3} />
          <Rect x={34} y={44} width={32} height={38} rx={12} fill="#F2F2F2" stroke={SPACE_INK} strokeWidth={3} />
          <Path d="M34 52 Q 18 56 16 70" stroke="#F2F2F2" strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M66 52 Q 82 48 86 36" stroke="#F2F2F2" strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M42 80 L 38 96 M58 80 L 64 95" stroke="#F2F2F2" strokeWidth={11} strokeLinecap="round" />
          <Circle cx={50} cy={30} r={20} fill="#F2F2F2" stroke={SPACE_INK} strokeWidth={3} />
          <Ellipse cx={52} cy={30} rx={13} ry={10} fill="#FFB84D" stroke={SPACE_INK} strokeWidth={2.5} />
          <Ellipse cx={48} cy={27} rx={4} ry={2.5} fill="#FFF2D6" />
          <Rect x={44} y={58} width={12} height={8} rx={2} fill="#FF5A5F" />
        </Svg>
      </Spin>
    </Spot>
  );
});

function Satellite({ size }: { size: number }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Rect x={size * 0.02} y={c - size * 0.08} width={size * 0.3} height={size * 0.16} fill="#2E5AA8" stroke="#8FA9D9" strokeWidth={1} />
      <Rect x={size * 0.68} y={c - size * 0.08} width={size * 0.3} height={size * 0.16} fill="#2E5AA8" stroke="#8FA9D9" strokeWidth={1} />
      <Line x1={size * 0.32} y1={c} x2={size * 0.68} y2={c} stroke="#C9CED6" strokeWidth={2} />
      <Rect x={c - size * 0.12} y={c - size * 0.14} width={size * 0.24} height={size * 0.28} rx={2} fill="#D9A441" stroke={SPACE_INK} strokeWidth={1.5} />
      <Path d={`M ${c - size * 0.1} ${c + size * 0.14} Q ${c} ${c + size * 0.3} ${c + size * 0.1} ${c + size * 0.14} Z`} fill="#F0F2F5" stroke={SPACE_INK} strokeWidth={1.2} />
    </Svg>
  );
}

const Satellites = memo(function Satellites({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.2, px * 1.8);
  const blink = (cx: number, lv: number, sz: number, period: number) => (
    <Spot ground={ground} px={px} level={lv} cx={cx} size={sz}>
      <Sway deg={8} periodMs={period * 3}><Satellite size={sz} /></Sway>
      <View style={{ position: 'absolute', left: sz / 2 - 3, top: sz / 2 - sz * 0.14 - 7, width: 6, height: 6 }}>
        <Blink periodMs={period}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4D4D' }} /></Blink>
      </View>
    </Spot>
  );
  return (
    <>
      {blink(w * 0.2, 60.4, size, 1400)}
      {blink(w * 0.82, 59.2, size * 0.7, 1100)}
    </>
  );
});

function Comet({ w, px, ground, level, cx }: WorldProps & { level: number; cx: number }) {
  const len = Math.min(w * 0.5, px * 4);
  const H = len * 0.5;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: cx - len * 0.15, top: ground - level * px - H * 0.8, width: len, height: H }}>
      <Svg width={len} height={H}>
        <Defs>
          <LinearGradient id={`tail${level}`} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#BFF4FF" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#7FE3FF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={`M ${len * 0.15} ${H * 0.8} L ${len} ${H * 0.02} L ${len * 0.93} ${H * 0.2} Z`} fill={`url(#tail${level})`} />
        <Path d={`M ${len * 0.15} ${H * 0.8} L ${len * 0.9} ${H * 0.3} L ${len * 0.8} ${H * 0.42} Z`} fill={`url(#tail${level})`} opacity={0.6} />
        <Circle cx={len * 0.15} cy={H * 0.8} r={Math.max(5, len * 0.035)} fill="#E8FBFF" />
        <Circle cx={len * 0.15} cy={H * 0.8} r={Math.max(9, len * 0.06)} fill="#BFF4FF" opacity={0.35} />
      </Svg>
    </View>
  );
}

// ---------- the Moon (70), Mars (80), asteroids, Jupiter (90), Saturn (95) ---

function Planet({ size, base, dark, children, glow }: { size: number; base: string; dark: string; children?: React.ReactNode; glow?: string }) {
  const c = size / 2;
  const R = size * 0.42;
  const id = `pl${base.replace('#', '')}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`${id}shade`} cx="35%" cy="32%" r="75%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.18} />
          <Stop offset="0.55" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.55} />
        </RadialGradient>
        <RadialGradient id={`${id}glow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.78" stopColor={glow ?? base} stopOpacity={0.35} />
          <Stop offset="1" stopColor={glow ?? base} stopOpacity={0} />
        </RadialGradient>
        <ClipPath id={`${id}clip`}><Circle cx={c} cy={c} r={R} /></ClipPath>
      </Defs>
      <Circle cx={c} cy={c} r={size / 2} fill={`url(#${id}glow)`} />
      <Circle cx={c} cy={c} r={R} fill={base} />
      <G clipPath={`url(#${id}clip)`}>{children}</G>
      <Circle cx={c} cy={c} r={R} fill={`url(#${id}shade)`} />
      <Circle cx={c} cy={c} r={R} fill="none" stroke={dark} strokeWidth={1.5} />
    </Svg>
  );
}

const Moon = memo(function Moon({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.62, px * 5.2);
  const c = size / 2;
  const R = size * 0.42;
  const craters: Array<[number, number, number]> = [[-0.35, -0.3, 0.16], [0.2, -0.45, 0.1], [0.3, 0.1, 0.2], [-0.2, 0.35, 0.13], [-0.55, 0.1, 0.08], [0.05, 0.6, 0.09], [0.55, -0.15, 0.07]];
  return (
    <Spot ground={ground} px={px} level={70} cx={w * 0.2} size={size}>
      <Planet size={size} base="#D6D6D2" dark="#8E8E88" glow="#F4F4EA">
        <Circle cx={c - R * 0.2} cy={c - R * 0.05} r={R * 0.38} fill="#C4C4BE" />
        <Circle cx={c + R * 0.35} cy={c + R * 0.45} r={R * 0.25} fill="#C4C4BE" />
        {craters.map(([x, y, r], i) => (
          <G key={i}>
            <Circle cx={c + x * R} cy={c + y * R} r={r * R} fill="#B5B5AE" />
            <Circle cx={c + x * R + r * R * 0.15} cy={c + y * R + r * R * 0.15} r={r * R * 0.78} fill="#C9C9C3" />
          </G>
        ))}
      </Planet>
    </Spot>
  );
});

const Mars = memo(function Mars({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.36, px * 3);
  const c = size / 2;
  const R = size * 0.42;
  return (
    <Spot ground={ground} px={px} level={80} cx={w * 0.8} size={size}>
      <Planet size={size} base="#D1603D" dark="#7A2E1B" glow="#FF8A5C">
        <Path d={`M ${c - R} ${c + R * 0.1} q ${R * 0.5} ${-R * 0.3} ${R} ${-R * 0.05} t ${R} ${R * 0.1} v ${R * 0.3} q ${-R * 0.6} ${R * 0.2} ${-R * 2} ${0} z`} fill="#A8432B" opacity={0.8} />
        <Circle cx={c + R * 0.3} cy={c - R * 0.35} r={R * 0.16} fill="#B34A30" />
        <Ellipse cx={c} cy={c - R * 0.95} rx={R * 0.5} ry={R * 0.2} fill="#FFFFFF" />
      </Planet>
    </Spot>
  );
});

const Asteroids = memo(function Asteroids({ w, px, ground }: WorldProps) {
  const H = px * 3.4;
  const rnd = seeded(85);
  const rocks = Array.from({ length: 14 }, () => {
    let x = rnd() * w;
    if (Math.abs(x - w / 2) < w * 0.09) x += (x < w / 2 ? -1 : 1) * w * 0.12;
    const r = px * (0.12 + rnd() * 0.3);
    const pts = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      const rr = r * (0.75 + rnd() * 0.35);
      return `${x + Math.cos(a) * rr},${Math.sin(a) * rr}`;
    });
    return { x, y: rnd() * H, r, pts, shade: rnd() < 0.5 ? '#8C7B6B' : '#766656' };
  });
  return (
    <Band ground={ground} px={px} bottom={83.3} top={86.7} left={0} width={w}>
      <Svg width={w} height={H}>
        {rocks.map((k, i) => (
          <G key={i} transform={`translate(0 ${k.y})`}>
            <Polygon points={k.pts.join(' ')} fill={k.shade} stroke="#3E342B" strokeWidth={1.5} strokeLinejoin="round" />
            <Circle cx={k.x - k.r * 0.2} cy={-k.r * 0.15} r={k.r * 0.22} fill="#5E5146" />
          </G>
        ))}
      </Svg>
    </Band>
  );
});

const Jupiter = memo(function Jupiter({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.64, px * 4.8);
  const c = size / 2;
  const R = size * 0.42;
  const bands: Array<[number, number, string]> = [[-1, 0.3, '#F2E2C4'], [-0.7, 0.18, '#C98E5A'], [-0.52, 0.2, '#EBD3AE'], [-0.32, 0.22, '#B7784A'], [-0.1, 0.24, '#F2E2C4'], [0.14, 0.2, '#C98E5A'], [0.34, 0.2, '#E8C9A0'], [0.54, 0.16, '#B7784A'], [0.7, 0.35, '#EBD3AE']];
  return (
    <Spot ground={ground} px={px} level={90} cx={w * 0.2} size={size}>
      <Planet size={size} base="#E8C9A0" dark="#7A5230" glow="#F2D4A8">
        {bands.map(([y, hgt, col], i) => (
          <Path key={i} d={`M ${c - R} ${c + y * R} q ${R * 0.5} ${R * 0.05} ${R} 0 t ${R} 0 v ${hgt * R} q ${-R * 0.5} ${-R * 0.05} ${-R} 0 t ${-R} 0 z`} fill={col} />
        ))}
        <Ellipse cx={c + R * 0.3} cy={c + R * 0.42} rx={R * 0.22} ry={R * 0.12} fill="#C1502E" stroke="#8E3A20" strokeWidth={1.5} />
      </Planet>
    </Spot>
  );
});

const Saturn = memo(function Saturn({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.44, px * 3.4);
  const c = size / 2;
  const R = size * 0.2;
  const ring = (front: boolean) => (
    <Path
      d={front
        ? `M ${c - R * 2.2} ${c} A ${R * 2.2} ${R * 0.55} 0 0 0 ${c + R * 2.2} ${c}`
        : `M ${c - R * 2.2} ${c} A ${R * 2.2} ${R * 0.55} 0 0 1 ${c + R * 2.2} ${c}`}
      stroke="#E3CF94" strokeWidth={R * 0.34} fill="none" opacity={0.95} />
  );
  return (
    <Spot ground={ground} px={px} level={95} cx={w * 0.8} size={size}>
      <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-16deg' }] }]}>
        <Svg width={size} height={size}>
          {ring(false)}
          <Circle cx={c} cy={c} r={R} fill="#E9D39B" />
          <Path d={`M ${c - R} ${c - R * 0.2} Q ${c} ${c - R * 0.05} ${c + R} ${c - R * 0.2}`} stroke="#D6B775" strokeWidth={R * 0.18} fill="none" />
          <Path d={`M ${c - R * 0.95} ${c + R * 0.3} Q ${c} ${c + R * 0.45} ${c + R * 0.95} ${c + R * 0.3}`} stroke="#D6B775" strokeWidth={R * 0.14} fill="none" />
          <Circle cx={c} cy={c} r={R} fill="none" stroke="#8C7440" strokeWidth={1.5} />
          {ring(true)}
          <Path d={`M ${c - R * 1.75} ${c} A ${R * 1.75} ${R * 0.42} 0 0 0 ${c + R * 1.75} ${c}`} stroke="#B89B5C" strokeWidth={1.5} fill="none" />
        </Svg>
      </View>
    </Spot>
  );
});

// ---------- the edge of the solar system (100) and beyond ---------------------

const Heliopause = memo(function Heliopause({ w, px, ground }: WorldProps) {
  const H = px * 1.6;
  const d = `M ${-w * 0.05} ${H * 0.9} C ${w * 0.3} ${H * 0.1}, ${w * 0.7} ${H * 0.1}, ${w * 1.05} ${H * 0.9}`;
  const probe = Math.min(w * 0.2, px * 1.8);
  return (
    <>
      <Band ground={ground} px={px} bottom={99} top={100.6} left={0} width={w}>
        <Svg width={w} height={H}>
          <Path d={d} stroke="#FF6FD8" strokeWidth={26} opacity={0.1} fill="none" />
          <Path d={d} stroke="#B99CFF" strokeWidth={8} opacity={0.3} fill="none" />
          <Path d={d} stroke="#F3E8FF" strokeWidth={1.5} strokeDasharray="8 6" opacity={0.9} fill="none" />
        </Svg>
      </Band>
      <Spot ground={ground} px={px} level={102} cx={w * 0.24} size={probe}>
        <Sway deg={10} periodMs={5000}>
          <Svg width={probe} height={probe}>
            <Line x1={probe * 0.5} y1={probe * 0.5} x2={probe * 0.98} y2={probe * 0.2} stroke="#C9CED6" strokeWidth={2} />
            <Line x1={probe * 0.5} y1={probe * 0.5} x2={probe * 0.1} y2={probe * 0.85} stroke="#C9CED6" strokeWidth={2} />
            <Ellipse cx={probe * 0.42} cy={probe * 0.36} rx={probe * 0.3} ry={probe * 0.12} fill="#F0F2F5" stroke={SPACE_INK} strokeWidth={1.5} />
            <Rect x={probe * 0.36} y={probe * 0.44} width={probe * 0.16} height={probe * 0.12} fill="#D9A441" stroke={SPACE_INK} strokeWidth={1.2} />
            <Circle cx={probe * 0.44} cy={probe * 0.5} r={probe * 0.035} fill="#FFD34D" />
          </Svg>
        </Sway>
      </Spot>
    </>
  );
});

const Nebula = memo(function Nebula({ w, px, ground }: WorldProps) {
  const H = px * 6;
  const blob = (id: string, color: string) => (
    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={color} stopOpacity={0.5} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );
  return (
    <Band ground={ground} px={px} bottom={103} top={109} left={0} width={w}>
      <Svg width={w} height={H}>
        <Defs>
          {blob('nebA', '#FF6FD8')}
          {blob('nebB', '#7A5CFF')}
          {blob('nebC', '#3EC6FF')}
        </Defs>
        <Ellipse cx={w * 0.28} cy={H * 0.45} rx={w * 0.45} ry={H * 0.32} fill="url(#nebA)" />
        <Ellipse cx={w * 0.72} cy={H * 0.55} rx={w * 0.5} ry={H * 0.4} fill="url(#nebB)" />
        <Ellipse cx={w * 0.55} cy={H * 0.3} rx={w * 0.35} ry={H * 0.22} fill="url(#nebC)" />
      </Svg>
    </Band>
  );
});

const NextStar = memo(function NextStar({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.5, px * 4);
  const c = size / 2;
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true); }, [t]);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + t.value * 0.12 }], opacity: 0.85 + t.value * 0.15 }));
  return (
    <Spot ground={ground} px={px} level={110} cx={w * 0.76} size={size}>
      <Animated.View style={[StyleSheet.absoluteFill, pulse]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="starGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="0.18" stopColor="#FFF1B8" stopOpacity={0.95} />
              <Stop offset="0.45" stopColor="#FFB84D" stopOpacity={0.35} />
              <Stop offset="1" stopColor="#FF8A3D" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c} fill="url(#starGlow)" />
          <Path d={`M ${c} 0 L ${c + 3} ${c} L ${c} ${size} L ${c - 3} ${c} Z M 0 ${c} L ${c} ${c - 3} L ${size} ${c} L ${c} ${c + 3} Z`} fill="#FFFFFF" opacity={0.85} />
        </Svg>
      </Animated.View>
    </Spot>
  );
});

const Galaxy = memo(function Galaxy({ w, px, ground }: WorldProps) {
  const size = Math.min(w * 0.95, px * 7);
  const c = size / 2;
  const rnd = seeded(120);
  const dots: Array<{ x: number; y: number; r: number; col: string }> = [];
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 90; i++) {
      const t = i / 90;
      const a = arm * Math.PI + t * Math.PI * 3.2;
      const rr = c * (0.08 + t * 0.9);
      const jitter = c * 0.07 * (rnd() - 0.5);
      dots.push({
        x: c + Math.cos(a) * rr + jitter,
        y: c + Math.sin(a) * rr + jitter,
        r: 1 + rnd() * 2.2 * (1 - t * 0.5),
        col: rnd() < 0.3 ? '#FFD6F5' : rnd() < 0.5 ? '#B99CFF' : '#9FC8FF',
      });
    }
  }
  return (
    <Spot ground={ground} px={px} level={121.5} cx={w / 2} size={size}>
      {/* Squash a spinning disc into a tilted one. */}
      <View style={[StyleSheet.absoluteFill, { transform: [{ scaleY: 0.5 }, { rotate: '-12deg' }] }]}>
        <Spin periodMs={60000}>
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="galCore" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FFF6DD" stopOpacity={1} />
                <Stop offset="0.2" stopColor="#FFD9A8" stopOpacity={0.7} />
                <Stop offset="0.6" stopColor="#8E6CFF" stopOpacity={0.18} />
                <Stop offset="1" stopColor="#3E2A8F" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={c} cy={c} r={c} fill="url(#galCore)" />
            {dots.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.col} opacity={0.85} />)}
          </Svg>
        </Spin>
      </View>
    </Spot>
  );
});

// ---------- name tags on the landmarks ---------------------------------------

/** Which side each landmark's tag sits on: away from the thing itself. */
const TAG_LEFT = new Set([10, 35, 50, 80, 95, 110]);

/** Drawn above the front clouds (LaunchGame), so none is ever hidden. */
export const LandmarkTags = memo(function LandmarkTags({ w, px, ground, upTo }: WorldProps) {
  return (
    <>
      {LANDMARKS.filter((l) => l.kg <= upTo).map((l) => {
        const y = ground - l.kg * px;
        const left = TAG_LEFT.has(l.kg);
        return (
          <View key={l.kg} pointerEvents="none" style={{ position: 'absolute', left: 0, width: w, top: y - 26, height: 28 }}>
            <Svg width={w} height={28} style={StyleSheet.absoluteFill}>
              <Line x1={0} x2={w} y1={26} y2={26} stroke="#FFFFFF" strokeWidth={1.5} strokeDasharray="6 7" opacity={0.45} />
            </Svg>
            <View style={[styles.tag, left ? { left: 8 } : { right: 8 }]}>
              <Text style={styles.tagText} numberOfLines={1}>{l.name} · {formatAltitude(l.altitudeM)}</Text>
            </View>
          </View>
        );
      })}
    </>
  );
});

// ---------- stars ----------------------------------------------------------

/** One screen of stars, drawn twice and scrolled slowly for parallax. */
export const StarField = memo(function StarField({ w, h, seed = 3 }: { w: number; h: number; seed?: number }) {
  const rnd = seeded(seed);
  const stars = Array.from({ length: Math.round((w * h) / 5200) }, () => ({
    x: rnd() * w, y: rnd() * h, r: 0.5 + rnd() * rnd() * 2, o: 0.35 + rnd() * 0.65, col: rnd() < 0.12 ? '#FFE3B0' : rnd() < 0.2 ? '#BFD8FF' : '#FFFFFF',
  }));
  return (
    <Svg width={w} height={h}>
      {stars.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.col} opacity={s.o} />)}
    </Svg>
  );
});

// ---------- the whole world -------------------------------------------------

/** Every piece, lowest first, with the lowest level at which it's visible. */
const PIECES: Array<[number, React.ComponentType<WorldProps>]> = [
  [0, Ground], [0, SkyPuffs], [0, Trees], [0, Town], [0, LaunchPad], [11, Flock], [13, Balloons],
  [18, Everest], [17, CloudSea], [28, Plane], [33, WeatherBalloon], [38, EdgeOfSpace], [42, Aurora],
  [47, ISS], [50, Earth], [55, Astronaut], [57, Satellites], [66, Moon], [77, Mars], [82, Asteroids],
  [86, Jupiter], [92, Saturn], [98, Heliopause], [102, Nebula], [107, NextStar], [116, Galaxy],
];

export const Scenery = memo(function Scenery(props: WorldProps) {
  return (
    <>
      {PIECES.filter(([from]) => from <= props.upTo).map(([, Piece], i) => <Piece key={i} {...props} />)}
      {props.upTo >= 62 && <Comet {...props} level={65} cx={props.w * 0.72} />}
      {props.upTo >= 102 && <Comet {...props} level={105} cx={props.w * 0.2} />}
    </>
  );
});

const styles = StyleSheet.create({
  tag: { position: 'absolute', top: 0, backgroundColor: 'rgba(10,14,22,0.62)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '70%' },
  tagText: { ...Fonts.mono(10, 'bold'), color: '#FFFFFF', letterSpacing: 0.8 },
});

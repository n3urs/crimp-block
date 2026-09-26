// src/components/force-gauge/BirdSprite.tsx
/** The yellow bird, shared by both force-gauge games (FlappyBirdGame and
    LaunchGame). An SVG group to drop inside a parent <Svg>: body centred on
    (cx, cy), radius r, rotated by `tilt` degrees (positive = nose down),
    front wing rotated by `wingAngle` about its shoulder. */
import React from 'react';
import { Circle, Ellipse, G, Path } from 'react-native-svg';

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

// A leaf-shaped wing hinged at its shoulder (x0, y0), sweeping back and
// slightly down; `k` scales it. Rotating the group about the shoulder is
// what makes it flap.
const wingPath = (x0: number, y0: number, k: number) =>
  `M ${x0} ${y0} C ${x0 - 0.5 * k} ${y0 - 0.75 * k}, ${x0 - 1.45 * k} ${y0 - 0.55 * k}, ${x0 - 1.6 * k} ${y0 + 0.15 * k} ` +
  `C ${x0 - 1.35 * k} ${y0 + 0.55 * k}, ${x0 - 0.7 * k} ${y0 + 0.7 * k}, ${x0} ${y0 + 0.35 * k} Z`;

interface Props {
  cx: number;
  cy: number;
  r: number;
  tilt?: number;
  wingAngle?: number;
  /** Squash (<1) or stretch (>1) along the body's up/down axis, for the
      Launch game's crouch and blast-off. */
  stretch?: number;
}

export function BirdShape({ cx, cy, r, tilt = 0, wingAngle = -8, stretch = 1 }: Props) {
  const outlineW = Math.max(1.5, r * 0.09);
  const fwx = cx - r * 0.05;
  const fwy = cy + r * 0.1;
  const bwx = cx - r * 0.15;
  const bwy = cy - r * 0.2;
  // Squash about the bird's feet (its bottom), so a crouch stays planted on the pad.
  const squash = stretch === 1 ? '' : ` translate(${cx} ${cy + r}) scale(${1 / Math.sqrt(stretch)} ${stretch}) translate(${-cx} ${-(cy + r)})`;
  return (
    <G transform={`rotate(${tilt} ${cx} ${cy})${squash}`}>
      {/* Back wing: behind the body, peeking out above/behind it. */}
      <G transform={`rotate(${wingAngle * 0.8 + 14} ${bwx} ${bwy})`}>
        <Path d={wingPath(bwx, bwy, r * 0.85)} fill={BIRD_WING_BACK} stroke={BIRD_OUTLINE} strokeWidth={outlineW} strokeLinejoin="round" />
      </G>
      <Circle cx={cx} cy={cy} r={r} fill={BIRD_BODY} stroke={BIRD_OUTLINE} strokeWidth={outlineW * 1.2} />
      <Ellipse cx={cx + r * 0.1} cy={cy + r * 0.32} rx={r * 0.55} ry={r * 0.4} fill={BIRD_BELLY} />
      {/* The eye is deliberately huge — the original's giant eyeball is
          half its charm — with the pupil pushed to the front edge
          for a permanent wide-eyed stare, and a tiny glint. */}
      <Circle cx={cx + r * 0.34} cy={cy - r * 0.26} r={r * 0.52} fill="#FFFFFF" stroke={BIRD_OUTLINE} strokeWidth={outlineW} />
      <Circle cx={cx + r * 0.5} cy={cy - r * 0.22} r={r * 0.24} fill="#1A1A1A" />
      <Circle cx={cx + r * 0.57} cy={cy - r * 0.31} r={r * 0.07} fill="#FFFFFF" />
      <Path
        d={`M ${cx + r * 0.85} ${cy - r * 0.05} L ${cx + r * 1.55} ${cy + r * 0.12} L ${cx + r * 0.85} ${cy + r * 0.32} Z`}
        fill={BIRD_BEAK}
        stroke={BIRD_OUTLINE}
        strokeWidth={outlineW * 0.7}
        strokeLinejoin="round"
      />
      {/* Front wing: over the body, the one you actually see flap. */}
      <G transform={`rotate(${wingAngle} ${fwx} ${fwy})`}>
        <Path d={wingPath(fwx, fwy, r)} fill={BIRD_WING} stroke={BIRD_OUTLINE} strokeWidth={outlineW} strokeLinejoin="round" />
        <Path
          d={`M ${fwx - r * 0.45} ${fwy + r * 0.12} L ${fwx - r * 1.15} ${fwy + r * 0.05} M ${fwx - r * 0.4} ${fwy + r * 0.28} L ${fwx - r * 0.95} ${fwy + r * 0.3}`}
          stroke={BIRD_OUTLINE}
          strokeWidth={outlineW * 0.6}
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />
      </G>
    </G>
  );
}

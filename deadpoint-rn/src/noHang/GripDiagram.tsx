// src/noHang/GripDiagram.tsx
/** Which fingers go on the edge, both hands as seen facing the board:
    engaged fingers filled, the rest outlined. */
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Colours, resolveColour } from '../design/colours';
import type { Finger } from './protocol';

const ACCENT = resolveColour('--gorse');
const LENGTH: Record<Finger, number> = { index: 0.86, middle: 1, ring: 0.92, pinky: 0.7 };
const LEFT_HAND: Finger[] = ['pinky', 'ring', 'middle', 'index'];
const RIGHT_HAND: Finger[] = ['index', 'middle', 'ring', 'pinky'];
const STROKE = 1.5;

export function GripDiagram({ fingers, size = 56 }: { fingers: Finger[]; size?: number }) {
  const fingerW = size * 0.24;
  const gap = size * 0.1;
  const handW = fingerW * 4 + gap * 3;
  const handGap = size * 0.5;

  const hand = (order: Finger[], x0: number) =>
    order.map((finger, i) => {
      const on = fingers.includes(finger);
      const inset = on ? 0 : STROKE / 2;
      const h = size * LENGTH[finger];
      return (
        <Rect
          key={`${x0}-${finger}`}
          x={x0 + i * (fingerW + gap) + inset}
          y={size - h + inset}
          width={fingerW - inset * 2}
          height={h - inset * 2}
          rx={(fingerW - inset * 2) / 2}
          fill={on ? ACCENT : 'none'}
          stroke={on ? 'none' : Colours.s4}
          strokeWidth={STROKE}
        />
      );
    });

  return (
    <View accessible accessibilityLabel={`Fingers on the edge: ${fingers.join(', ')}`}>
      <Svg width={handW * 2 + handGap} height={size}>
        {hand(LEFT_HAND, 0)}
        {hand(RIGHT_HAND, handW + handGap)}
      </Svg>
    </View>
  );
}

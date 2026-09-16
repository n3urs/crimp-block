// src/noHang/BoardDiagram.tsx
/** Schematic Beastmaker board from BOARDS' measured hold positions: the
    routine's pair lit in gorse, every other hold drawn recessed. Our own
    drawing, no Beastmaker imagery. */
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Colours, resolveColour } from '../design/colours';
import type { Board } from './protocol';

const ACCENT = resolveColour('--gorse');

export function BoardDiagram({ board, width }: { board: Board; width: number }) {
  const height = width / board.aspect;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${board.name}: ${board.holdLabel}`}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={board.cornerRadius * height} fill={Colours.s2} />
        {board.holds.map((hold, i) => {
          const w = hold.w * width;
          const h = hold.h * height;
          return (
            <Rect
              key={i}
              x={hold.x * width}
              y={hold.y * height}
              width={w}
              height={h}
              rx={Math.min(w, h) / 2}
              fill={hold.used ? ACCENT : Colours.bg}
              opacity={hold.used ? 1 : 0.6}
            />
          );
        })}
      </Svg>
    </View>
  );
}

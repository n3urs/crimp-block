import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';

const CELL_HEIGHT = 38;
const BORDER_BLEED = 2; // half the grid's 4px inter-cell gap

export interface DayCellData {
  date: string;
  dayNum: number;
  isToday: boolean;
  loggedColour: string | null;
  isDeloadWindow: boolean;
  phaseColour: string | null;
  borderTop: boolean;
  borderBottom: boolean;
  borderLeft: boolean;
  borderRight: boolean;
}

export function DayCell({ data }: { data: DayCellData }) {
  const { dayNum, isToday, loggedColour, isDeloadWindow, phaseColour, borderTop, borderBottom, borderLeft, borderRight } = data;
  const fill = loggedColour ?? Colours.s2;
  const numberColour = loggedColour != null ? Colours.bg : withOpacity(Colours.fg, isDeloadWindow ? 1 : 0.55);

  return (
    <View style={[styles.root, { backgroundColor: fill }, isToday && styles.todayOutline]}>
      {isDeloadWindow && <View style={styles.deloadRing} />}
      <Text style={[styles.dayNum, { color: numberColour, fontWeight: isToday ? '700' : '500' }]}>{dayNum}</Text>
      {phaseColour != null && (borderTop || borderBottom || borderLeft || borderRight) && (
        <Svg
          width={100 + BORDER_BLEED * 2}
          height="100%"
          style={StyleSheet.absoluteFill}
          viewBox={`0 0 ${100 + BORDER_BLEED * 2} 100`}
          preserveAspectRatio="none"
        >
          {borderTop && <Line x1={0} y1={0} x2={100 + BORDER_BLEED * 2} y2={0} stroke={phaseColour} strokeWidth={2.5} />}
          {borderBottom && <Line x1={0} y1={100} x2={100 + BORDER_BLEED * 2} y2={100} stroke={phaseColour} strokeWidth={2.5} />}
          {borderLeft && <Line x1={0} y1={0} x2={0} y2={100} stroke={phaseColour} strokeWidth={2.5} />}
          {borderRight && <Line x1={100 + BORDER_BLEED * 2} y1={0} x2={100 + BORDER_BLEED * 2} y2={100} stroke={phaseColour} strokeWidth={2.5} />}
        </Svg>
      )}
    </View>
  );
}

/** RN colour values in this project are plain hex strings (src/design/
    colours.ts), no built-in opacity compositing the way SwiftUI's
    `.opacity(_:)` on a Color has — this does the same "fg at 55% over
    the cell's own background" maths Swift's `.opacity(0.55)` does,
    manually, since the fill is never guaranteed to be `bg` itself (an
    actually-logged cell's fill is the session's own accent colour). */
function withOpacity(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  root: {
    height: CELL_HEIGHT,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible', // the phase-border SVG deliberately bleeds past these bounds
  },
  todayOutline: {
    borderWidth: 1.5,
    borderColor: Colours.fg,
  },
  deloadRing: {
    position: 'absolute',
    top: 6, left: 6, right: 6, bottom: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colours.restC,
  },
  dayNum: {
    ...Fonts.mono(11, 'medium'),
  },
});

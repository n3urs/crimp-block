import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';

export const CELL_HEIGHT = 38;
const BORDER_BLEED = 2; // half the grid's 4px inter-cell gap

export interface DayCellData {
  date: string;
  dayNum: number;
  isToday: boolean;
  isPast: boolean;
  loggedColour: string | null;
  isDeloadWindow: boolean;
  phaseColour: string | null;
  borderTop: boolean;
  borderBottom: boolean;
  borderLeft: boolean;
  borderRight: boolean;
}

export function DayCell({ data }: { data: DayCellData }) {
  const { dayNum, isToday, isPast, loggedColour, isDeloadWindow, phaseColour, borderTop, borderBottom, borderLeft, borderRight } = data;
  // Swift: loggedColour?.opacity(0.85) ?? (isPast ? s2 : s1)
  const fill = loggedColour != null ? withOpacity(loggedColour, 0.85) : (isPast ? Colours.s2 : Colours.s1);
  const numberColour = loggedColour != null ? Colours.bg : withOpacity(Colours.fg, isDeloadWindow ? 1 : 0.55);

  return (
    <View style={[styles.root, { backgroundColor: fill }, isToday && styles.todayOutline]}>
      {isDeloadWindow && <View style={styles.deloadRing} />}
      {/* Fonts.mono swaps the actual TTF family for 'bold' vs 'medium' (static
          TTFs, no weight axis — see Fonts' own doc comment) — a numeric
          fontWeight layered on top of a fixed family, like a raw
          `fontWeight: isToday ? '700' : '500'`, would not reliably render
          bold. Has to be computed per-instance, so it can't live in the
          static StyleSheet.create block below (that font varies by isToday). */}
      <Text style={[Fonts.mono(11, isToday ? 'bold' : 'medium'), { color: numberColour }]}>{dayNum}</Text>
      {phaseColour != null && (borderTop || borderBottom || borderLeft || borderRight) && (
        // No explicit width/height props, deliberately — react-native-svg's
        // own Svg.tsx only defaults to width=height='100%' when BOTH are
        // undefined AND position !== 'absolute' (confirmed by reading the
        // installed package's source directly). With position: 'absolute'
        // set here, that fallback never fires, so this Svg's actual
        // rendered size comes purely from Yoga resolving the negative
        // top/left/right/bottom insets below — exactly cell width+4 ×
        // cell height+4, matching Swift's own
        // `.frame(width: geo.size.width + 4, height: geo.size.height + 4)`.
        // Percentage Line coordinates then resolve against THAT real
        // size with no viewBox/preserveAspectRatio scale distortion.
        <Svg style={styles.borderSvg}>
          {borderTop && <Line x1="0%" y1="0%" x2="100%" y2="0%" stroke={phaseColour} strokeWidth={2.5} />}
          {borderBottom && <Line x1="0%" y1="100%" x2="100%" y2="100%" stroke={phaseColour} strokeWidth={2.5} />}
          {borderLeft && <Line x1="0%" y1="0%" x2="0%" y2="100%" stroke={phaseColour} strokeWidth={2.5} />}
          {borderRight && <Line x1="100%" y1="0%" x2="100%" y2="100%" stroke={phaseColour} strokeWidth={2.5} />}
        </Svg>
      )}
    </View>
  );
}

/** RN colour values in this project are plain hex strings (src/design/
    colours.ts), no built-in opacity compositing the way SwiftUI's
    `.opacity(_:)` on a Color has — this does the same "fg at 55% over
    the cell's own background" maths Swift's `.opacity(0.55)` does,
    manually (an 8-digit #RRGGBBAA hex, which RN/CSS colour parsing
    supports natively), since the fill is never guaranteed to be `bg`
    itself (an actually-logged cell's fill is the session's own accent
    colour). Also used for the logged fill's own 0.85 opacity. */
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
  borderSvg: {
    position: 'absolute',
    top: -BORDER_BLEED, left: -BORDER_BLEED, right: -BORDER_BLEED, bottom: -BORDER_BLEED,
  },
});

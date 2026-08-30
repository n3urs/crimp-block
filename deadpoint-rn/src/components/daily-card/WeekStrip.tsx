/** Direct port of `WeekStripView` (`ios/CrimpBlock/WeekStripView.swift:1-58`,
    the `WeekDay`/`WeekStripView` pair only — `DayPickerView` in the same
    file is a separate, not-yet-built modal screen and out of scope here).
    The original brief cited this file but specified zero layout values;
    since the Swift source itself is short and simple, this is a direct
    line-for-line port of `WeekStripView.body` rather than a re-derivation
    from a spec table. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colours, resolveColour } from '../../design/colours';
import { Fonts } from '../../design/fonts';

export interface WeekDay {
  /** date, "yyyy-MM-dd" */
  id: string;
  dayLetter: string;
  /** null = nothing logged that day */
  colourVarName: string | null;
  isToday: boolean;
}

export interface WeekStripProps {
  days: WeekDay[];
  onTapDay: (date: string) => void;
}

const BAR_HEIGHT = 5;
const BAR_RADIUS = 2;
const BAR_BORDER_WIDTH = 1.5;

export function WeekStrip({ days, onTapDay }: WeekStripProps) {
  return (
    <View style={styles.row}>
      {days.map((day) => (
        <Pressable
          key={day.id}
          onPress={() => onTapDay(day.id)}
          style={[styles.tile, day.isToday && styles.tileToday]}
          accessibilityRole="button"
          accessibilityLabel={`${day.id}${day.isToday ? ', today' : ''}, ${day.colourVarName != null ? 'session logged' : 'no session logged'}`}
        >
          {day.colourVarName != null ? (
            <View style={[styles.bar, { backgroundColor: resolveColour(day.colourVarName) }]} />
          ) : (
            <View style={[styles.bar, styles.barUnlogged]} />
          )}
          <Text style={[styles.dayLetter, day.isToday ? styles.dayLetterToday : styles.dayLetterFaint]}>
            {day.dayLetter}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  tileToday: {
    backgroundColor: Colours.s2,
  },
  bar: {
    width: '100%',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
  },
  barUnlogged: {
    borderWidth: BAR_BORDER_WIDTH,
    borderColor: Colours.s4,
    backgroundColor: 'transparent',
  },
  dayLetter: {
    ...Fonts.mono(11, 'semibold'),
    marginTop: 6,
  },
  dayLetterToday: {
    ...Fonts.mono(11, 'bold'),
    // No design-system token exists for pure white (Colours.fg is an
    // off-white, #EDEBE5) — Swift uses the literal `.white` here too
    // (matches ExerciseRow's own title colour, same reasoning).
    color: '#FFFFFF',
  },
  dayLetterFaint: {
    color: Colours.faint,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { DayCell, type DayCellData } from './DayCell';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CELL_GAP = 4;

export function MonthGrid({ cells }: { cells: (DayCellData | null)[] }) {
  const rows: (DayCellData | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          // Index as key, not the letter itself — Tue/Thu and Sat/Sun
          // share a letter (same real bug Swift's own comment documents
          // and fixes the same way: identity by position, not by value).
          <Text key={i} style={styles.weekdayLetter}>{letter}</Text>
        ))}
      </View>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((cell, colIdx) => (
            <View key={colIdx} style={styles.cellWrapper}>
              {cell != null ? <DayCell data={cell} /> : <View style={{ height: 38 }} />}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: 'row', marginBottom: CELL_GAP },
  weekdayLetter: {
    flex: 1,
    textAlign: 'center',
    ...Fonts.mono(10, 'medium'),
    color: Colours.faint,
  },
  row: { flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP },
  cellWrapper: { flex: 1 },
});

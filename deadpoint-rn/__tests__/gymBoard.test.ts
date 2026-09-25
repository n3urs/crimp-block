/** gymBoard — the weekly top-5 for the gym station (app/gym.tsx). Lives on
    the station's own device: nothing here syncs to an account. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addToBoard, cleanName, loadBoard, qualifiesForBoard, saveBoard, thisWeeksBoard, weekStartMs,
  type BoardEntry,
} from '../src/data/forceGauge/gymBoard';

// Local-time dates so the tests hold in any timezone. 25 Sep 2026 is a Friday.
const FRI = new Date(2026, 8, 25, 15, 0).getTime();
const MON = new Date(2026, 8, 21, 0, 0).getTime();
const e = (name: string, score: number, at = FRI): BoardEntry => ({ name, score, at });

beforeEach(async () => { await AsyncStorage.clear(); });

test('the week starts on Monday 00:00 local', () => {
  expect(weekStartMs(FRI)).toBe(MON);
  expect(weekStartMs(MON)).toBe(MON);
  const sunday = new Date(2026, 8, 27, 23, 59).getTime();
  expect(weekStartMs(sunday)).toBe(MON);
  const nextMonday = new Date(2026, 8, 28, 0, 0).getTime();
  expect(weekStartMs(nextMonday)).toBe(nextMonday);
});

test('the board is this week only, best first, top five, earlier wins a tie', () => {
  const lastWeek = e('OLD', 99, MON - 1);
  const entries = [lastWeek, e('A', 5), e('B', 9), e('C', 5, FRI - 1000), e('D', 1), e('E', 3), e('F', 7)];
  const board = thisWeeksBoard(entries, FRI);
  expect(board.map((x) => x.name)).toEqual(['B', 'F', 'C', 'A', 'E']);
});

test('a score qualifies while there is room, then only if it beats fifth place', () => {
  expect(qualifiesForBoard([], 1, FRI)).toBe(true);
  expect(qualifiesForBoard([], 0, FRI)).toBe(false);
  const full = [e('A', 10), e('B', 8), e('C', 6), e('D', 4), e('E', 2)];
  expect(qualifiesForBoard(full, 2, FRI)).toBe(false);
  expect(qualifiesForBoard(full, 3, FRI)).toBe(true);
});

test('last week\'s scores never block this week\'s board', () => {
  const stale = [e('A', 10, MON - 5), e('B', 10, MON - 5), e('C', 10, MON - 5), e('D', 10, MON - 5), e('E', 10, MON - 5)];
  expect(qualifiesForBoard(stale, 1, FRI)).toBe(true);
});

test('adding drops last week and keeps five', () => {
  const start = [e('OLD', 50, MON - 1), e('A', 10), e('B', 8), e('C', 6), e('D', 4), e('E', 2)];
  const next = addToBoard(start, e('NEW', 5), FRI);
  expect(next.map((x) => x.name)).toEqual(['A', 'B', 'C', 'NEW', 'D']);
});

test('names are tidied to short upper-case letters and digits, blank becomes ANON', () => {
  expect(cleanName('  oscar  ')).toBe('OSCAR');
  expect(cleanName('a.b/c!d')).toBe('ABCD');
  expect(cleanName('averyveryverylongname')).toBe('AVERYVERYV');
  expect(cleanName('   ')).toBe('ANON');
  expect(cleanName('!!!')).toBe('ANON');
});

test('the board survives a save and load, and garbage in storage reads as empty', async () => {
  expect(await loadBoard()).toEqual([]);
  await saveBoard([e('A', 4)]);
  expect(await loadBoard()).toEqual([e('A', 4)]);
  await AsyncStorage.setItem('gymBoard', '{not json');
  expect(await loadBoard()).toEqual([]);
  await AsyncStorage.setItem('gymBoard', JSON.stringify([{ name: 'X' }, e('OK', 3)]));
  expect(await loadBoard()).toEqual([e('OK', 3)]);
});

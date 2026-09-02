import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredTicks, setStoredTicks } from '../src/data/tickStorage';

beforeEach(async () => { await AsyncStorage.clear(); });

test('getStoredTicks is empty before anything has ever been saved', async () => {
  expect(await getStoredTicks('2026-09-02', 'maxFingers')).toEqual(new Set());
});

test('setStoredTicks persists and getStoredTicks reads it back', async () => {
  await setStoredTicks('2026-09-02', 'maxFingers', new Set(['pickups', 'pinch']));
  expect(await getStoredTicks('2026-09-02', 'maxFingers')).toEqual(new Set(['pickups', 'pinch']));
});

test('keyed per (date, session) — browsing to a different session does not see another session\'s ticks', async () => {
  await setStoredTicks('2026-09-02', 'maxFingers', new Set(['pickups']));
  expect(await getStoredTicks('2026-09-02', 'pull')).toEqual(new Set());
  expect(await getStoredTicks('2026-09-01', 'maxFingers')).toEqual(new Set());
});

test('an empty Set can be saved (un-ticking the last exercise) and reads back empty, not the previous value', async () => {
  await setStoredTicks('2026-09-02', 'maxFingers', new Set(['pickups']));
  await setStoredTicks('2026-09-02', 'maxFingers', new Set());
  expect(await getStoredTicks('2026-09-02', 'maxFingers')).toEqual(new Set());
});

test('a corrupted/non-array stored value is treated as empty rather than throwing', async () => {
  await AsyncStorage.setItem('ticks:2026-09-02:maxFingers', '{"not":"an array"}');
  expect(await getStoredTicks('2026-09-02', 'maxFingers')).toEqual(new Set());
});

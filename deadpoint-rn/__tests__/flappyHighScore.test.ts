/** Device-local copy of the Flappy Bird high score (see
    src/data/forceGauge/flappyHighScore.ts). Exists because the account-
    synced score silently saved NOTHING for built-in accounts (Oscar,
    Joe) — they have no `profiles` row, so the server-side UPDATE matches
    zero rows without erroring and there was nowhere else for the score to
    live. Oscar's own report: "it forgets as soon as u close it even if u
    stay in the app". */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadLocalHighScore, saveLocalHighScore } from '../src/data/forceGauge/flappyHighScore';

beforeEach(async () => { await AsyncStorage.clear(); });

test('is 0 before anything has ever been saved', async () => {
  expect(await loadLocalHighScore('user-a')).toBe(0);
});

test('a saved score is there after "closing" — a fresh load reads it back', async () => {
  await saveLocalHighScore('user-a', 14);
  expect(await loadLocalHighScore('user-a')).toBe(14);
});

test('is keyed per user, so one account\'s score never shows on another', async () => {
  await saveLocalHighScore('user-a', 14);
  expect(await loadLocalHighScore('user-b')).toBe(0);
});

test('only ever ratchets up — a later, worse round can never overwrite a real best', async () => {
  await saveLocalHighScore('user-a', 30);
  await saveLocalHighScore('user-a', 5);
  expect(await loadLocalHighScore('user-a')).toBe(30);
  await saveLocalHighScore('user-a', 31);
  expect(await loadLocalHighScore('user-a')).toBe(31);
});

test('a corrupt stored value reads as 0 instead of putting NaN in the game', async () => {
  await AsyncStorage.setItem('flappyHighScore:user-a', 'not a number');
  expect(await loadLocalHighScore('user-a')).toBe(0);
  await AsyncStorage.setItem('flappyHighScore:user-a', '-4');
  expect(await loadLocalHighScore('user-a')).toBe(0);
});

test('a corrupt stored value does not block saving a real score over it', async () => {
  await AsyncStorage.setItem('flappyHighScore:user-a', 'garbage');
  await saveLocalHighScore('user-a', 3);
  expect(await loadLocalHighScore('user-a')).toBe(3);
});

test('the Launch game keeps its own best, separate from Flappy Bird', async () => {
  await saveLocalHighScore('user-a', 12);
  await saveLocalHighScore('user-a', 582, 'launch');
  expect(await loadLocalHighScore('user-a')).toBe(12);
  expect(await loadLocalHighScore('user-a', 'launch')).toBe(582);
});

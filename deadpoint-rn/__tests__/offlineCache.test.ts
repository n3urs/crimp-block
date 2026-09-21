/** The read half of offline support (see src/data/offlineCache.ts). The
    write half is outbox.test.ts.

    What this exists to prevent: before it, nothing the app fetched was
    ever written to disk, so a cold launch with no signal failed the
    `profiles` fetch and app/index.tsx rendered its "Couldn't load your
    account" screen — a total lockout, with the session log and weights
    empty behind it. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readCache, writeCache, clearUserCache } from '../src/data/offlineCache';

beforeEach(async () => { await AsyncStorage.clear(); });

test('round-trips a value for a user', async () => {
  await writeCache('sessions', 'user-a', { '2026-09-20': { t: 'maxFingers', l: null, sub: null } });
  expect(await readCache('sessions', 'user-a')).toEqual({ '2026-09-20': { t: 'maxFingers', l: null, sub: null } });
});

test('nothing cached yet reads as null, not an empty object', async () => {
  // The distinction matters: the hooks only fall back to a cached value
  // when there genuinely IS one, and `{}` would masquerade as "this user
  // has no logged sessions" rather than "we have never fetched".
  expect(await readCache('sessions', 'user-a')).toBeNull();
});

test('is keyed per user, so signing into another account never shows the previous one\'s data', async () => {
  await writeCache('sessions', 'user-a', { '2026-09-20': { t: 'maxFingers' } });
  expect(await readCache('sessions', 'user-b')).toBeNull();
});

test('a signed-out user neither reads nor writes a cache', async () => {
  await writeCache('sessions', '', { leaked: true });
  expect(await readCache('sessions', '')).toBeNull();
  // and nothing was written under a blank key either
  expect(await AsyncStorage.getItem('cache:sessions:')).toBeNull();
});

test('corrupt cached JSON reads as null rather than throwing', async () => {
  // A throw here would propagate into a hook's mount effect and take the
  // screen down — strictly worse than simply having no cache.
  await AsyncStorage.setItem('cache:sessions:user-a', '{not json');
  expect(await readCache('sessions', 'user-a')).toBeNull();
});

test('separate names for the same user do not collide', async () => {
  await writeCache('sessions', 'user-a', { a: 1 });
  await writeCache('loads', 'user-a', { b: 2 });
  expect(await readCache('sessions', 'user-a')).toEqual({ a: 1 });
  expect(await readCache('loads', 'user-a')).toEqual({ b: 2 });
});

test('clearUserCache removes every cached name for that user only', async () => {
  await writeCache('sessions', 'user-a', { a: 1 });
  await writeCache('loads', 'user-a', { b: 2 });
  await writeCache('sessions', 'user-b', { c: 3 });

  await clearUserCache('user-a');

  expect(await readCache('sessions', 'user-a')).toBeNull();
  expect(await readCache('loads', 'user-a')).toBeNull();
  expect(await readCache('sessions', 'user-b')).toEqual({ c: 3 });
});

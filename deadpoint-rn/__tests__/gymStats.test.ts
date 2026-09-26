/** gymStats — the gym station's usage log (who played, how often), sent to
    the admin dashboard. Two kinds of event: a 'play' for EVERY finished
    round (anonymous: just a score), and a 'name' when a score is saved to
    the board under a name. Events are built here to satisfy the table's
    constraints exactly (a row that breaks one would be rejected), and a small
    capped queue holds them while the gym's wifi is down so nothing is lost. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildNameEvent, buildPlayEvent, enqueue, isDataError, newStationId, MAX_QUEUE, MAX_BATCH, takeBatch,
  loadQueue, saveQueue, type GymEvent,
} from '../src/data/forceGauge/gymStats';

const CTX = { stationId: 'abcdef0123456789abcdef01', platform: 'ios' as const, at: Date.UTC(2026, 8, 26, 10, 0, 0) };

beforeEach(async () => { await AsyncStorage.clear(); });

test('a play event carries the score and no name', () => {
  const e = buildPlayEvent(17, CTX);
  expect(e).toEqual({ kind: 'play', game: 'flappy', score: 17, name: null, station_id: CTX.stationId, platform: 'ios', created_at: '2026-09-26T10:00:00.000Z' });
});

test('a name event carries the name and score', () => {
  const e = buildNameEvent('ISAAC P', 23, CTX);
  expect(e).toMatchObject({ kind: 'name', score: 23, name: 'ISAAC P' });
});

test('scores are forced into what the table accepts: whole numbers, 0 to 999', () => {
  expect(buildPlayEvent(-4, CTX).score).toBe(0);
  expect(buildPlayEvent(12.7, CTX).score).toBe(12);
  expect(buildPlayEvent(5000, CTX).score).toBe(999);
  expect(buildPlayEvent(NaN, CTX).score).toBe(0);
});

test('names are trimmed to the 10 characters the table allows, and blank names are not logged', () => {
  expect(buildNameEvent('averyverylongname', 3, CTX)!.name).toBe('averyveryl');
  expect(buildNameEvent('   ', 3, CTX)).toBeNull();
});

test('a station id is long, hex, and different each time', () => {
  const a = newStationId(); const b = newStationId();
  expect(a).toMatch(/^[0-9a-f]{24}$/);
  expect(a).not.toBe(b);
});

test('the queue keeps the newest events when it is full, and hands out bounded batches', () => {
  let q: GymEvent[] = [];
  for (let i = 0; i < MAX_QUEUE + 25; i++) q = enqueue(q, buildPlayEvent(i % 50, CTX));
  expect(q).toHaveLength(MAX_QUEUE);
  expect(q[q.length - 1].score).toBe((MAX_QUEUE + 24) % 50); // newest kept
  const { batch, rest } = takeBatch(q);
  expect(batch).toHaveLength(MAX_BATCH);
  expect(rest).toHaveLength(MAX_QUEUE - MAX_BATCH);
});

test('the queue survives a save and load, and garbage in storage reads as empty', async () => {
  expect(await loadQueue()).toEqual([]);
  await saveQueue([buildPlayEvent(4, CTX)]);
  expect(await loadQueue()).toEqual([buildPlayEvent(4, CTX)]);
  await AsyncStorage.setItem('gymStatsQueue', '{nope');
  expect(await loadQueue()).toEqual([]);
});

test('a rejected-data error is dropped, but a network or missing-table error is kept for later', () => {
  expect(isDataError({ code: '23514' })).toBe(true);   // check violation
  expect(isDataError({ code: '22P02' })).toBe(true);   // bad text representation
  expect(isDataError({ code: 'PGRST205' })).toBe(false); // table not created yet
  expect(isDataError({ code: '42501' })).toBe(false);  // permission - policy not applied yet
  expect(isDataError({ message: 'Network request failed' })).toBe(false);
  expect(isDataError(null)).toBe(false);
});

test('a Launch round is logged as its own game, with room for kg in tenths up to 150 kg', () => {
  expect(buildPlayEvent(582, CTX, 'launch')).toMatchObject({ kind: 'play', game: 'launch', score: 582 });
  expect(buildPlayEvent(4000, CTX, 'launch').score).toBe(1500);
  expect(buildNameEvent('OSCAR', 612, CTX, 'launch')).toMatchObject({ kind: 'name', game: 'launch', score: 612 });
});

test('events queued by an older build (no game) load as Flappy Bird', async () => {
  const { game, ...old } = buildPlayEvent(9, CTX);
  await AsyncStorage.setItem('gymStatsQueue', JSON.stringify([old]));
  expect(await loadQueue()).toEqual([buildPlayEvent(9, CTX)]);
});

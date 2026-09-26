// src/data/forceGauge/gymStats.ts
/** The gym station's usage log, sent to the `gym_events` table so the admin
    dashboard can show how often the station is played and by how many
    people (SUPABASE.md, "Gym station stats").

    Two kinds of event: a 'play' for EVERY finished round (anonymous — just
    a score), and a 'name' when a score is saved to the board under a name.
    Tries are therefore counted from plays; distinct people from names.

    Built to never get in the way: everything here is fire-and-forget and
    swallows its own errors, so a missing table, a policy that hasn't been
    applied yet or a dead wifi connection can never affect the game. Events
    wait in a small capped queue (persisted, so a relaunch doesn't lose them)
    and are sent in batches whenever a send works. An event the database
    rejects as malformed (a data error, Postgres class 22/23) is dropped so
    one bad row can't block the rest forever; anything else is retried later.

    The queue logic and event building are pure and tested; the Supabase call
    is the thin wiring around them. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

export type GymGame = 'flappy' | 'launch';

export interface GymEvent {
  kind: 'play' | 'name';
  /** Which station game. Launch scores are peak kg in tenths. */
  game: GymGame;
  score: number;
  name: string | null;
  station_id: string;
  platform: 'ios' | 'android' | 'web';
  created_at: string;
}

interface Context {
  stationId: string;
  platform: GymEvent['platform'];
  /** When it happened, ms since the epoch — kept so a queued event is dated
      when it occurred, not when it finally got sent. */
  at: number;
}

export const MAX_QUEUE = 200;
export const MAX_BATCH = 50;
const QUEUE_KEY = 'gymStatsQueue';
const STATION_KEY = 'gymStationId';

/** A random id for THIS installation (a station), so the dashboard can tell
    an iPad from an Android tablet. Not tied to any account or person. */
export function newStationId(): string {
  let id = '';
  for (let i = 0; i < 24; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/** The table's per-game limits: Flappy 0-999 pipes, Launch 0-1500 (150 kg). */
const MAX_SCORE: Record<GymGame, number> = { flappy: 999, launch: 1500 };
const clampScore = (n: number, game: GymGame) => (Number.isFinite(n) ? Math.min(MAX_SCORE[game], Math.max(0, Math.floor(n))) : 0);

export function buildPlayEvent(score: number, ctx: Context, game: GymGame = 'flappy'): GymEvent {
  return { kind: 'play', game, score: clampScore(score, game), name: null, station_id: ctx.stationId, platform: ctx.platform, created_at: new Date(ctx.at).toISOString() };
}

/** Null for a blank name — nothing worth logging, and the table rejects it. */
export function buildNameEvent(name: string, score: number, ctx: Context, game: GymGame = 'flappy'): GymEvent | null {
  const trimmed = name.trim().slice(0, 10);
  if (trimmed.length === 0) return null;
  return { kind: 'name', game, score: clampScore(score, game), name: trimmed, station_id: ctx.stationId, platform: ctx.platform, created_at: new Date(ctx.at).toISOString() };
}

/** Newest events win when the queue is full. */
export function enqueue(queue: GymEvent[], event: GymEvent): GymEvent[] {
  return [...queue, event].slice(-MAX_QUEUE);
}

export function takeBatch(queue: GymEvent[]): { batch: GymEvent[]; rest: GymEvent[] } {
  return { batch: queue.slice(0, MAX_BATCH), rest: queue.slice(MAX_BATCH) };
}

/** Postgres data-exception (22xxx) and integrity-constraint (23xxx) errors:
    the row itself is wrong, so retrying can never help. Anything else — no
    network, table not created yet (PGRST205), policy not applied yet
    (42501) — is worth retrying later. */
export function isDataError(err: { code?: string; message?: string } | null | undefined): boolean {
  const code = err?.code ?? '';
  return code.startsWith('22') || code.startsWith('23');
}

const isEvent = (x: any): x is GymEvent =>
  x != null && (x.kind === 'play' || x.kind === 'name') && Number.isFinite(x.score) && typeof x.station_id === 'string' && typeof x.created_at === 'string';

export async function loadQueue(): Promise<GymEvent[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '[]');
    // Events queued by a build from before the Launch game have no `game`.
    return Array.isArray(parsed) ? parsed.filter(isEvent).map((x) => ({ ...x, game: x.game === 'launch' ? 'launch' : 'flappy' })) : [];
  } catch {
    return [];
  }
}

export async function saveQueue(queue: GymEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // best effort
  }
}

// ---- wiring ---------------------------------------------------------------

// Every queue read-modify-write goes through one chain so a send can't
// overwrite an event recorded while it was in flight.
let lock: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.then(() => undefined, () => undefined);
  return run;
}

async function context(): Promise<Context> {
  let stationId = await AsyncStorage.getItem(STATION_KEY);
  if (!stationId) {
    stationId = newStationId();
    await AsyncStorage.setItem(STATION_KEY, stationId);
  }
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  return { stationId, platform, at: Date.now() };
}

/** Sends whatever is waiting. Safe to call any time, as often as you like. */
export function flushGymStats(): Promise<void> {
  return serial(async () => {
    try {
      let queue = await loadQueue();
      while (queue.length > 0) {
        const { batch, rest } = takeBatch(queue);
        const { error } = await supabase.from('gym_events').insert(batch);
        if (error && !isDataError(error)) return; // retry later
        queue = rest; // sent, or unfixable and dropped
        await saveQueue(queue);
      }
    } catch {
      // offline or similar: the queue stays as it was
    }
  });
}

async function record(build: (ctx: Context) => GymEvent | null): Promise<void> {
  try {
    const event = build(await context());
    if (event == null) return;
    await serial(async () => saveQueue(enqueue(await loadQueue(), event)));
    void flushGymStats();
  } catch {
    // stats must never affect the game
  }
}

/** A round finished (any score, named or not). */
export function recordGymPlay(score: number, game: GymGame = 'flappy'): Promise<void> {
  return record((ctx) => buildPlayEvent(score, ctx, game));
}

/** A score was saved to the board under a name. */
export function recordGymName(name: string, score: number, game: GymGame = 'flappy'): Promise<void> {
  return record((ctx) => buildNameEvent(name, score, ctx, game));
}

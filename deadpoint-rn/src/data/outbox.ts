/** Writes made with no signal, kept until they can be sent. The read half
    of offline support is offlineCache.ts.

    Real bug this fixes: useStore/useLoads write optimistically and then
    roll back if the network call fails — correct for a server rejection,
    but at a crag it meant logging a session showed the tick, then silently
    undid it a moment later. The data was simply thrown away. Now a write
    that failed only because there's no signal keeps its optimistic value
    and lands here instead, to be replayed when there is one.

    Why this needs no merge/conflict logic at all: every write the app
    makes is already an upsert with an explicit `onConflict` key
    (`user_id,date` for sessions, `user_id,date,ex` for loads), so
    replaying one later is byte-for-byte the same operation as making it
    live. Last-write-wins, which is what a single-user training log wants
    — the phone in your pocket is the only thing writing. No sync engine,
    no vector clocks, no CRDT; the existing upsert semantics ARE the
    conflict resolution.

    Deliberately covers `sessions` and `exercise_loads` only, not
    `profiles`. Profile writes (quiz answers, preferences, tutorial
    completion) all happen in flows that need the network anyway — you
    can't take the quiz without first signing in, which needs an emailed
    code — so queueing `update` semantics for them would be machinery for
    a case that can't really occur. Profiles are read-cached (the lockout
    fix); they're just not write-queued. */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QueuedWrite {
  table: 'sessions' | 'exercise_loads';
  op: 'upsert' | 'delete';
  /** The upsert row. Empty for a delete. */
  payload: Record<string, unknown>;
  /** Columns identifying the row to delete, always including user_id. */
  match?: Record<string, unknown>;
  onConflict?: string;
}

/** Minimal shape of the bits of the Supabase client flushOutbox drives.
    Passed in rather than imported so this module stays dependency-light
    and directly testable (outbox.test.ts hands it a recording fake). */
export interface WriteClient {
  from(table: string): {
    upsert(payload: Record<string, unknown>, options?: { onConflict?: string }): PromiseLike<{ error: unknown }>;
    delete(): {
      eq(column: string, value: unknown): unknown;
    };
  };
}

/** Structural stand-in for PostgrestError — `code` is the only field read.
    Deliberately no index signature: adding one to accept object literals
    would stop the real PostgrestError class being assignable at all. */
interface MaybeCoded { code?: string }

const outboxKey = (userId: string) => `outbox:${userId}`;

/** Whether a failed write should be kept and retried, or rolled back.

    Read straight out of the installed @supabase/postgrest-js source
    (src/PostgrestBuilder.ts), not inferred: its fetch `.catch` builds
    `{ message, details, hint, code: '' }` and carries an explicit comment
    that code/hint are left empty for client-side network errors "since
    those fields are meant for upstream service errors
    (PostgREST/PostgreSQL)". So an absent code means the request never
    reached the server — no signal, DNS failure, or supabase.ts's own 90s
    AbortController firing — and the write is worth keeping.

    Anything WITH a code was genuinely refused by the server (a constraint
    violation, an expired JWT, RLS) and would be refused identically
    forever, so it must roll back rather than queue. */
export function isOfflineError(error: MaybeCoded | null | undefined): boolean {
  return error != null && !error.code;
}

export async function readOutbox(userId: string): Promise<QueuedWrite[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch (e) {
    console.error('readOutbox failed:', e);
    return [];
  }
}

async function saveOutbox(userId: string, writes: QueuedWrite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(writes));
  } catch (e) {
    console.error('saveOutbox failed:', e);
  }
}

/** Dropped, not flushed, when an account is deleted — the rows these
    writes target no longer exist, so every one of them would be refused
    forever. See useSession.ts's deleteAccount. */
export async function clearOutbox(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(outboxKey(userId));
  } catch (e) {
    console.error('clearOutbox failed:', e);
  }
}

/** Appends, preserving order — replays must happen in the order they were
    made, so that logging a day and then clearing it doesn't resurrect it. */
export async function enqueue(userId: string, write: QueuedWrite): Promise<void> {
  if (!userId) return;
  const queued = await readOutbox(userId);
  queued.push(write);
  await saveOutbox(userId, queued);
}

/** Replays queued writes oldest-first. Returns how many were genuinely
    accepted by the server (a dropped rejection is not counted, though it
    does leave the queue).

    Scoped to one user id, and every replayed delete carries an explicit
    user_id match rather than leaning on RLS: if account A queued a delete
    while offline and account B were signed in at flush time, an
    RLS-scoped-only delete would land on B's row for that date. Keying the
    queue per user makes that unreachable, and the explicit match means it
    would still be harmless if it somehow weren't.

    Stops at the first still-offline failure and keeps that write and
    everything after it, so order is never broken by a partial flush. A
    write the server genuinely REJECTS is dropped instead — it would fail
    identically forever and would otherwise wedge the queue permanently.

    Only one flush runs at a time. useStore and useLoads both call this
    (each from its own reload, and every screen owns independent hook
    instances), so without the guard two overlapping flushes would read
    the same queue, replay it twice, and then each write back its own
    idea of what's left — resurrecting entries the other had just
    drained. The replays themselves are idempotent upserts, so the
    double-send would be harmless; the clobbered queue would not be. */
let flushing = false;

export async function flushOutbox(userId: string, client: WriteClient): Promise<number> {
  if (!userId || flushing) return 0;
  const queued = await readOutbox(userId);
  if (queued.length === 0) return 0;
  flushing = true;
  try {
    return await replay(userId, queued, client);
  } finally {
    flushing = false;
  }
}

async function replay(userId: string, queued: QueuedWrite[], client: WriteClient): Promise<number> {

  let removed = 0;
  let sent = 0;
  for (const write of queued) {
    let error: unknown;
    if (write.op === 'upsert') {
      ({ error } = await client.from(write.table).upsert(write.payload, { onConflict: write.onConflict }));
    } else {
      type DeleteQuery = { eq(column: string, value: unknown): DeleteQuery } & PromiseLike<{ error: unknown }>;
      let query = client.from(write.table).delete() as DeleteQuery;
      for (const [column, value] of Object.entries(write.match ?? {})) {
        query = query.eq(column, value);
      }
      ({ error } = await query);
    }

    if (isOfflineError(error as MaybeCoded)) break; // still offline — keep this and everything after it
    if (error) console.error('outbox: dropping a write the server rejected:', error, write);
    else sent += 1;
    removed += 1;
  }

  await saveOutbox(userId, queued.slice(removed));
  return sent;
}

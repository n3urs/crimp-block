/** The write half of offline support (see src/data/outbox.ts). The read
    half is offlineCache.test.ts.

    isOfflineError is the one genuinely subtle decision in the feature —
    keeping a write that failed because there's no signal, versus rolling
    back a write the server actually rejected. It's checked against the
    real shapes @supabase/postgrest-js produces, read directly from the
    installed source (src/PostgrestBuilder.ts), not guessed: its fetch
    `.catch` builds `{ message, details, hint, code: '' }` with an
    explicit comment that code/hint are deliberately left empty for
    client-side network errors because they're meant for upstream
    PostgREST/PostgreSQL errors. A real rejection always carries a code. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOfflineError, enqueue, readOutbox, flushOutbox, type QueuedWrite } from '../src/data/outbox';

const USER = 'user-a';

// The real network-failure shape, verbatim from PostgrestBuilder's catch.
const NETWORK_ERROR = { message: 'TypeError: Network request failed', details: '', hint: '', code: '' };
// What the 90s AbortController in supabase.ts produces on timeout.
const TIMEOUT_ERROR = { message: 'AbortError: Aborted', details: '', hint: '', code: '' };
// A genuine upstream rejection — unique-constraint violation.
const REJECTION = { message: 'duplicate key value', details: '', hint: '', code: '23505' };
// An expired/invalid JWT is a genuine refusal too, not a connectivity problem.
const AUTH_REJECTION = { message: 'JWT expired', details: '', hint: '', code: 'PGRST301' };

function upsert(date: string): QueuedWrite {
  return { table: 'sessions', op: 'upsert', payload: { user_id: USER, date, type: 'maxFingers' }, onConflict: 'user_id,date' };
}

/** Records every call so a test can assert on replay order. */
function fakeClient(failWith: (call: number) => unknown = () => null) {
  const calls: Array<{ table: string; op: string; payload?: unknown; match?: Record<string, unknown> }> = [];
  let n = 0;
  const client = {
    from(table: string) {
      return {
        upsert(payload: unknown) {
          calls.push({ table, op: 'upsert', payload });
          return Promise.resolve({ error: failWith(n++) });
        },
        delete() {
          const match: Record<string, unknown> = {};
          const q: any = {
            eq(col: string, val: unknown) { match[col] = val; return q; },
            then(resolve: (r: unknown) => void) {
              calls.push({ table, op: 'delete', match });
              return Promise.resolve({ error: failWith(n++) }).then(resolve);
            },
          };
          return q;
        },
      };
    },
  };
  return { client, calls };
}

beforeEach(async () => { await AsyncStorage.clear(); });

describe('isOfflineError', () => {
  test('a client-side network failure has no upstream code, so it is retryable', () => {
    expect(isOfflineError(NETWORK_ERROR)).toBe(true);
    expect(isOfflineError(TIMEOUT_ERROR)).toBe(true);
  });

  test('a real server rejection carries a code and must NOT be queued', () => {
    expect(isOfflineError(REJECTION)).toBe(false);
    // Retrying an expired JWT forever would never succeed.
    expect(isOfflineError(AUTH_REJECTION)).toBe(false);
  });

  test('no error at all is not an offline error', () => {
    expect(isOfflineError(null)).toBe(false);
    expect(isOfflineError(undefined)).toBe(false);
  });
});

describe('the queue', () => {
  test('round-trips writes in the order they were made', async () => {
    await enqueue(USER, upsert('2026-09-20'));
    await enqueue(USER, upsert('2026-09-21'));
    const queued = await readOutbox(USER);
    expect(queued.map((w) => w.payload.date)).toEqual(['2026-09-20', '2026-09-21']);
  });

  test('is keyed per user — replaying one account\'s writes while another is signed in would corrupt their data', async () => {
    await enqueue(USER, upsert('2026-09-20'));
    expect(await readOutbox('user-b')).toEqual([]);
  });
});

describe('flushOutbox', () => {
  test('replays queued writes in order and empties the queue on success', async () => {
    await enqueue(USER, upsert('2026-09-20'));
    await enqueue(USER, upsert('2026-09-21'));
    const { client, calls } = fakeClient();

    const flushed = await flushOutbox(USER, client as never);

    expect(flushed).toBe(2);
    expect(calls.map((c: any) => c.payload.date)).toEqual(['2026-09-20', '2026-09-21']);
    expect(await readOutbox(USER)).toEqual([]);
  });

  test('replays a delete with an explicit user_id, never relying on RLS alone', async () => {
    await enqueue(USER, { table: 'sessions', op: 'delete', payload: {}, match: { user_id: USER, date: '2026-09-20' } });
    const { client, calls } = fakeClient();

    await flushOutbox(USER, client as never);

    expect(calls[0].match).toEqual({ user_id: USER, date: '2026-09-20' });
  });

  test('still offline: stops at the first failure and keeps everything from there on', async () => {
    await enqueue(USER, upsert('2026-09-20'));
    await enqueue(USER, upsert('2026-09-21'));
    const { client, calls } = fakeClient((n) => (n === 0 ? NETWORK_ERROR : null));

    const flushed = await flushOutbox(USER, client as never);

    expect(flushed).toBe(0);
    expect(calls).toHaveLength(1); // did not barrel on through the rest
    const remaining = await readOutbox(USER);
    expect(remaining.map((w) => w.payload.date)).toEqual(['2026-09-20', '2026-09-21']);
  });

  test('a write the server genuinely rejects is dropped, so it cannot block the queue forever', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await enqueue(USER, upsert('2026-09-20'));
    await enqueue(USER, upsert('2026-09-21'));
    const { client } = fakeClient((n) => (n === 0 ? REJECTION : null));

    await flushOutbox(USER, client as never);

    expect(await readOutbox(USER)).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('flushing with nothing queued makes no network calls', async () => {
    const { client, calls } = fakeClient();
    expect(await flushOutbox(USER, client as never)).toBe(0);
    expect(calls).toHaveLength(0);
  });

  test('a signed-out user never flushes anything', async () => {
    await enqueue(USER, upsert('2026-09-20'));
    const { client, calls } = fakeClient();
    expect(await flushOutbox('', client as never)).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

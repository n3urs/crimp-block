// src/data/useStore.ts
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { readCache, writeCache } from './offlineCache';
import { enqueue, flushOutbox, isOfflineError } from './outbox';

export interface Entry { t: string; l: number | null; sub: string | null; }
export type Days = Record<string, Entry>;

/** Pure helpers, exported for test. Mirrors NativeStore.swift's contract:
    write locally FIRST, then fire the network call, and roll the local
    state back on failure — a failed write must never look identical to a
    success. The app has to stay usable at the crag with no signal. */
export function applyOptimisticSet(days: Days, date: string, type: string, sub: string | null): Days {
  return { ...days, [date]: { t: type, l: null, sub } };
}

export function rollback(days: Days, date: string, previous: Entry | undefined): Days {
  const next = { ...days };
  if (previous) next[date] = previous; else delete next[date];
  return next;
}

export function useStore(startDate: string | null, today: string, userId: string) {
  const [days, setDays] = useState<Days>({});

  // Last-known-good log, so the card has real history with no signal —
  // see offlineCache.ts. Never overwrites data the network has already
  // returned: a slow disk read landing after a fast fetch must not walk
  // the fresh result back to the cached one.
  useEffect(() => {
    let cancelled = false;
    readCache<Days>('sessions', userId).then((cached) => {
      if (cached && !cancelled) setDays((current) => (Object.keys(current).length > 0 ? current : cached));
    });
    return () => { cancelled = true; };
  }, [userId]);

  const reload = useCallback(async () => {
    // No point fetching `sessions` (RLS-protected, no explicit user_id
    // filter — relies entirely on the request's own JWT) before a real
    // session exists: confirmed live, an anon-key request with no
    // sign-in yet comes back as a genuine PostgREST error, not an empty
    // array, and that error is expected/routine here, not a real
    // failure worth surfacing even as a caught console.error.
    if (!startDate || !userId) return;
    // Push anything logged offline BEFORE reading back, never after: this
    // is the app's main "we have signal again" moment (it runs on every
    // screen focus), and fetching first would overwrite `days` with a
    // server copy that doesn't contain the queued writes yet, blanking a
    // session the user logged at the crag until some later refresh
    // happened to put it back.
    await flushOutbox(userId, supabase);
    // Window reaches back to startDate AND a 60-day buffer before it —
    // block progression counts every training day since day one, and
    // backdating pre-start days is normal. See NativeStore.load().
    const back = new Date(today); back.setDate(back.getDate() - 60);
    const from = back.toISOString().slice(0, 10) < startDate ? back.toISOString().slice(0, 10) : startDate;
    const { data, error } = await supabase.from('sessions').select('date,type,load,sub').gte('date', from);
    if (error) throw error;
    const fresh = Object.fromEntries((data ?? []).map(r => [r.date, { t: r.type, l: r.load, sub: r.sub }]));
    setDays(fresh);
    writeCache('sessions', userId, fresh);
  }, [startDate, today, userId]);

  // Genuine failures (a real network error, a real RLS/schema problem
  // once signed in) can still throw here — reload() is fired fire-and-
  // forget from a synchronous effect body, so without this .catch that
  // throw would be a true uncaught promise rejection (confirmed live on
  // a real device before the `!userId` guard above existed). `.catch`
  // doesn't hide a real failure, it just stops it from crashing/toasting
  // as unhandled — `days` simply stays at its current state.
  useEffect(() => { reload().catch((e) => console.error('useStore.reload failed:', e)); }, [reload]);

  // The "we might have signal again" moment that screen focus alone
  // misses. card.tsx already reloads on focus (useFocusEffect), but that
  // does NOT fire when the app itself returns from the background — so
  // the realistic offline round trip (log a session at the crag, pocket
  // the phone, reopen it back at the car with signal) would otherwise
  // leave the queued write sitting there until something happened to
  // navigate away and back. reload() flushes before it fetches, so this
  // both sends what's pending and refreshes what's on screen.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') reload().catch((e) => console.error('useStore foreground reload failed:', e));
    });
    return () => subscription.remove();
  }, [reload]);

  const set = useCallback(async (date: string, type: string, sub: string | null = null) => {
    // Real bug, caught live tapping Done on a fresh (not-yet-signed-in)
    // build: with no sign-in screen built yet (see app/index.tsx's own
    // doc comment — Phase 3 scope, not built through Task 12), userId is
    // '' here, and upserting `user_id: ''` isn't just "will fail
    // gracefully" — Postgres rejects it before RLS even runs
    // ("invalid input syntax for type uuid: \"\""), and that rejection
    // reached the UI as a genuine uncaught-promise-rejection toast, the
    // same failure class as the reload() guards above but on the WRITE
    // path, which had never had one. Thrown before the optimistic update
    // so there's no flash-then-rollback on a write that was never going
    // to succeed.
    if (!userId) throw new Error('Not signed in — cannot save.');
    const previous = days[date];
    const optimistic = applyOptimisticSet(days, date, type, sub);
    setDays(optimistic);
    // userId comes from useSession()'s already-held session (no network
    // round trip) — see this file's own doc comment above and the Task 12
    // final-review fix that removed a `supabase.auth.getUser()` call from
    // this exact spot: that call could hang/reject offline, or resolve
    // `{ user: null }` and throw on `user!.id`, in both cases OUTSIDE this
    // try's error handling, leaving the optimistic write un-rolled-back.
    const row = { user_id: userId, date, type, sub };
    const { error } = await supabase.from('sessions')
      .upsert(row, { onConflict: 'user_id,date' });
    if (error) {
      // No signal is not a failed write — it's a write that hasn't been
      // sent yet. Rolling back here is what made logging a session at a
      // crag show the tick and then silently undo it. Keep the optimistic
      // state, persist it, and queue the real write for later; the caller
      // (useDoneFlow) deliberately sees this as success, because from the
      // user's point of view it is: nothing was lost. See outbox.ts.
      if (isOfflineError(error)) {
        await enqueue(userId, { table: 'sessions', op: 'upsert', payload: row, onConflict: 'user_id,date' });
        writeCache('sessions', userId, optimistic);
        return;
      }
      setDays(d => rollback(d, date, previous)); throw error;
    }
    writeCache('sessions', userId, optimistic);
  }, [days, userId]);

  const clear = useCallback(async (date: string) => {
    if (!userId) throw new Error('Not signed in — cannot save.'); // see set()'s doc comment
    const previous = days[date];
    const optimistic = rollback(days, date, undefined);
    setDays(optimistic);
    const { error } = await supabase.from('sessions').delete().eq('date', date);
    if (error) {
      // Same offline contract as set() above — un-logging a day with no
      // signal must stick too, or the session reappears a moment later.
      // The queued delete carries an explicit user_id (see outbox.ts's
      // own note on why relying on RLS alone would be unsafe on replay).
      if (isOfflineError(error)) {
        await enqueue(userId, { table: 'sessions', op: 'delete', payload: {}, match: { user_id: userId, date } });
        writeCache('sessions', userId, optimistic);
        return;
      }
      setDays(d => ({ ...d, [date]: previous! })); throw error;
    }
    writeCache('sessions', userId, optimistic);
  }, [days, userId]);

  return { days, get: (date: string) => days[date], set, clear, reload };
}

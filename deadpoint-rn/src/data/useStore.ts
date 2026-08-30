// src/data/useStore.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

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

  const reload = useCallback(async () => {
    if (!startDate) return;
    // Window reaches back to startDate AND a 60-day buffer before it —
    // block progression counts every training day since day one, and
    // backdating pre-start days is normal. See NativeStore.load().
    const back = new Date(today); back.setDate(back.getDate() - 60);
    const from = back.toISOString().slice(0, 10) < startDate ? back.toISOString().slice(0, 10) : startDate;
    const { data, error } = await supabase.from('sessions').select('date,type,load,sub').gte('date', from);
    if (error) throw error;
    setDays(Object.fromEntries((data ?? []).map(r => [r.date, { t: r.type, l: r.load, sub: r.sub }])));
  }, [startDate, today]);

  // reload() can throw (a real Supabase/RLS failure — confirmed live: with
  // no signed-in session yet, an anon-key request against `sessions` can
  // come back as a genuine error, not just an empty array). Calling an
  // async function fire-and-forget from a synchronous effect body means
  // that throw becomes a true UNCAUGHT PROMISE REJECTION — caught live on
  // a real device build (an "Uncaught (in promise...)" toast on first
  // launch, before any sign-in). `.catch` here doesn't hide the failure —
  // just stops it from crashing/toasting as unhandled; `days` simply stays
  // at its initial empty state, same as any other reload failure.
  useEffect(() => { reload().catch((e) => console.error('useStore.reload failed:', e)); }, [reload]);

  const set = useCallback(async (date: string, type: string, sub: string | null = null) => {
    const previous = days[date];
    setDays(d => applyOptimisticSet(d, date, type, sub));
    // userId comes from useSession()'s already-held session (no network
    // round trip) — see this file's own doc comment above and the Task 12
    // final-review fix that removed a `supabase.auth.getUser()` call from
    // this exact spot: that call could hang/reject offline, or resolve
    // `{ user: null }` and throw on `user!.id`, in both cases OUTSIDE this
    // try's error handling, leaving the optimistic write un-rolled-back.
    const { error } = await supabase.from('sessions')
      .upsert({ user_id: userId, date, type, sub }, { onConflict: 'user_id,date' });
    if (error) { setDays(d => rollback(d, date, previous)); throw error; }
  }, [days, userId]);

  const clear = useCallback(async (date: string) => {
    const previous = days[date];
    setDays(d => rollback(d, date, undefined));
    const { error } = await supabase.from('sessions').delete().eq('date', date);
    if (error) { setDays(d => ({ ...d, [date]: previous! })); throw error; }
  }, [days]);

  return { days, get: (date: string) => days[date], set, clear, reload };
}

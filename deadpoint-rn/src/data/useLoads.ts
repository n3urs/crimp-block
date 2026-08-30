// src/data/useLoads.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface LoadEntry { date: string; kg: number; }
export type LoadsByExercise = Record<string, LoadEntry[]>;

/** Pure helpers, exported for test. Same optimistic-write/rollback contract
    as useStore.ts's applyOptimisticSet/rollback (see NativeLoads.swift's
    own doc comment). Entries stay newest-first per exercise. */
export function applyOptimisticLoad(byExercise: LoadsByExercise, id: string, date: string, kg: number): LoadsByExercise {
  const entries = byExercise[id] ?? [];
  const idx = entries.findIndex(e => e.date === date);
  const next = idx >= 0
    ? entries.map((e, i) => (i === idx ? { date, kg } : e))
    : [...entries, { date, kg }].sort((a, b) => (a.date > b.date ? -1 : 1));
  return { ...byExercise, [id]: next };
}

export function rollbackLoad(byExercise: LoadsByExercise, id: string, previous: LoadEntry[]): LoadsByExercise {
  return { ...byExercise, [id]: previous };
}

export function useLoads(userId: string) {
  const [byExercise, setByExercise] = useState<LoadsByExercise>({});

  /** Not date-filtered, same reasoning as NativeLoads.load(): "what did I
      lift last time" has to survive a long layoff, and the table is small
      enough that loading all of it costs nothing. */
  const reload = useCallback(async () => {
    // Same reasoning as useStore.ts: `exercise_loads` is RLS-protected
    // with no explicit user_id filter, so an anon-key request before any
    // sign-in is a genuine, expected, routine non-result — not worth a
    // real network round trip or a caught console.error either.
    if (!userId) return;
    const { data, error } = await supabase.from('exercise_loads').select('date,ex,kg').order('date', { ascending: false });
    if (error) {
      // Genuinely missing table (migration not run yet) must not take the
      // app down — weights just don't appear, same as NativeLoads.load()'s
      // narrowed PGRST205 catch. Any other error still throws.
      if (error.code === 'PGRST205') { setByExercise({}); return; }
      throw error;
    }
    const grouped: LoadsByExercise = {};
    for (const r of (data ?? []) as { date: string; ex: string; kg: number }[]) {
      (grouped[r.ex] ??= []).push({ date: r.date, kg: r.kg });
    }
    setByExercise(grouped);
  }, [userId]);

  // A genuine failure (once signed in) can still throw here — reload() is
  // fired fire-and-forget from a synchronous effect body, so without this
  // .catch that throw would be a true uncaught promise rejection
  // (confirmed live on a real device before the `!userId` guard above
  // existed). `.catch` doesn't hide a real failure, it just stops it from
  // crashing/toasting as unhandled.
  useEffect(() => { reload().catch((e) => console.error('useLoads.reload failed:', e)); }, [reload]);

  const history = (id: string): LoadEntry[] => byExercise[id] ?? [];
  const on = (id: string, date: string): LoadEntry | undefined => byExercise[id]?.find(e => e.date === date);

  const set = useCallback(async (date: string, id: string, kg: number) => {
    // See useStore.ts's matching set()/clear() guard: with no sign-in
    // screen built yet, userId can genuinely be '' here, and upserting
    // `user_id: ''` fails Postgres's own uuid-column validation before
    // RLS runs — surfaced live as an uncaught-promise-rejection toast
    // when this ran from onLog's auto-record-weight step.
    if (!userId) throw new Error('Not signed in — cannot save.');
    const previous = byExercise[id] ?? [];
    setByExercise(b => applyOptimisticLoad(b, id, date, kg));
    // userId comes from useSession()'s already-held session (no network
    // round trip) — see useStore.ts's matching fix and doc comment: a
    // `supabase.auth.getUser()` call here could hang/reject offline, or
    // resolve `{ user: null }` and throw on `user!.id`, in both cases
    // OUTSIDE this try's error handling, leaving the optimistic write
    // un-rolled-back.
    const { error } = await supabase.from('exercise_loads')
      .upsert({ user_id: userId, date, ex: id, kg }, { onConflict: 'user_id,date,ex' });
    if (error) { setByExercise(b => rollbackLoad(b, id, previous)); throw error; }
  }, [byExercise, userId]);

  /** Matches NativeLoads.all() — the exact shape createEngine's `loadLog`
      argument (Task 4) expects: exercise id -> {date,kg}[]. */
  const all = useCallback((): LoadsByExercise => byExercise, [byExercise]);

  return { byExercise, history, on, set, all, reload };
}

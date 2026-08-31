// src/data/useProfile.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Mirrors NativeProfile.Row field-for-field (see NativeProfile.swift's
    CodingKeys for the camelCase<->snake_case mapping this hook performs
    by hand at the query boundary, same translation Swift's Codable does
    automatically). `modifiers` is a free-form JSON object (equipment/
    injuryFlags/weaknesses/tripDate/daysPerWeek — see template-resolver.js)
    — plain `Record<string, unknown>` here needs no Swift-style AnyCodable
    wrapper, since JSON round-trips through JS objects natively. */
export interface ProfileRow {
  assignedTemplateId: string | null;
  programStartDate: string;
  modifiers: Record<string, unknown>;
  tier: string;
  quizCompletedAt: string | null;
  tutorialCompletedAt: string | null;
  trackType: string;
  rehabInjuryArea: string | null;
  rehabPhaseIndex: number | null;
}

interface ProfileDbRow {
  assigned_template_id: string | null;
  program_start_date: string;
  modifiers: Record<string, unknown> | null;
  tier: string;
  quiz_completed_at: string | null;
  tutorial_completed_at: string | null;
  track_type: string;
  rehab_injury_area: string | null;
  rehab_phase_index: number | null;
}

function fromDbRow(r: ProfileDbRow): ProfileRow {
  return {
    assignedTemplateId: r.assigned_template_id,
    programStartDate: r.program_start_date,
    modifiers: r.modifiers ?? {},
    tier: r.tier,
    quizCompletedAt: r.quiz_completed_at,
    tutorialCompletedAt: r.tutorial_completed_at,
    trackType: r.track_type,
    rehabInjuryArea: r.rehab_injury_area,
    rehabPhaseIndex: r.rehab_phase_index,
  };
}

const PROFILE_COLUMNS =
  'assigned_template_id,program_start_date,modifiers,tier,quiz_completed_at,tutorial_completed_at,track_type,rehab_injury_area,rehab_phase_index';

/** `userId` comes from the caller's already-held session (`useSession()`),
    not a fresh `supabase.auth.getUser()` call inside each write — a
    network round-trip on the write path meant a genuine offline write
    threw OUTSIDE the `if (error)` rollback block below (`getUser()`
    itself failing, or resolving with `user: null` and crashing on
    `user!.id`), leaving the optimistic state uncorrected. Same fix as
    useStore.ts/useLoads.ts, for the identical reason. */
export function useProfile(userId: string) {
  const [row, setRow] = useState<ProfileRow | null>(null);

  /** Settles once the hook's initial fetch for the CURRENT `userId` has
      genuinely resolved — whether that means a real row came back, the
      query genuinely found nothing (a real new user who hasn't done the
      quiz — `loaded:true, row:null`), or the fetch itself errored (still
      counts as settled: a network error must not leave `loaded` false
      forever, or an offline user would be stuck exactly like the routing
      bug this flag exists to fix). This is what lets a consumer like
      app/index.tsx tell "haven't checked yet" (`loaded:false`) apart from
      "checked, nothing there" (`loaded:true, row:null`) — `row` alone
      can't do that, since both states leave it `null`.

      `!userId` (not signed in) resolves to `loaded:true` synchronously,
      not `false`: there is genuinely nothing pending to wait for in that
      state (same reasoning as reload()'s own doc comment below, which
      already treats "not signed in yet" and "genuinely no profile yet" as
      the same `row: null` outcome) — and a caller that gates on `loaded`
      before routing (app/index.tsx) must not be blocked forever for a
      genuinely signed-out user, who has no profile row to wait for at
      all. */
  const [loaded, setLoaded] = useState(false);

  /** null `row` afterward means genuinely no profile yet (a real new user
      who hasn't done the quiz) — distinct from a network/decode failure,
      which throws instead of silently leaving `row` null, so the caller
      doesn't mistake "couldn't check" for "definitely new." */
  const reload = useCallback(async () => {
    // Same reasoning as useStore.ts/useLoads.ts: `profiles` is RLS-
    // protected with no explicit user_id filter, so an anon-key request
    // before any sign-in is expected and routine, not a real failure —
    // and "not signed in yet" correctly collapses to the same `row: null`
    // state as "genuinely no profile yet" below; there's nothing to
    // distinguish it from until a session actually exists.
    if (!userId) { setLoaded(true); return; }
    try {
      const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).maybeSingle();
      if (error) throw error;
      setRow(data ? fromDbRow(data as ProfileDbRow) : null);
    } finally {
      // Runs whether the query above succeeded, found nothing, or threw —
      // "settled" covers all three, per `loaded`'s own doc comment above.
      // The `throw` a few lines up still propagates to the caller
      // (reload()'s existing contract, unchanged) after this runs.
      setLoaded(true);
    }
  }, [userId]);

  // A genuine failure (once signed in) can still throw here — reload() is
  // fired fire-and-forget from a synchronous effect body, so without this
  // .catch that throw would be a true uncaught promise rejection
  // (confirmed live on a real device before the `!userId` guard above
  // existed). `.catch` doesn't hide a real failure, it just stops it from
  // crashing/toasting as unhandled — `row` simply stays null, same as the
  // "genuinely no profile yet" case this
  // function's own doc comment already describes.
  useEffect(() => {
    // Reset to "pending" before kicking off the fetch for this (possibly
    // new) userId — covers both a fresh sign-in (a real fetch is about to
    // run) and a sign-out (reload() below flips this straight back to
    // `true` synchronously, since `!userId` has nothing to wait for).
    // Batches with reload()'s own synchronous `setLoaded(true)` in the
    // `!userId` case, so there's no visible flicker to `false` and back
    // within the same commit.
    setLoaded(false);
    reload().catch((e) => console.error('useProfile.reload failed:', e));
  }, [reload]);

  /** Called once, right after the quiz's standard branch — creates (or
      re-creates, for someone switching back into standard who's never had
      a standard assignment before) the profile that makes this a
      template-assigned Standard-tier user from then on. */
  const create = useCallback(async (templateId: string, startDate: string, modifiers: Record<string, unknown>) => {
    const quizCompletedAt = new Date().toISOString();
    const { error } = await supabase.from('profiles').upsert({
      user_id: userId,
      assigned_template_id: templateId,
      program_start_date: startDate,
      modifiers,
      tier: 'standard',
      track_type: 'standard',
      quiz_completed_at: quizCompletedAt,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    setRow(r => ({
      assignedTemplateId: templateId, programStartDate: startDate, modifiers,
      tier: 'standard', quizCompletedAt, tutorialCompletedAt: r?.tutorialCompletedAt ?? null,
      trackType: 'standard', rehabInjuryArea: null, rehabPhaseIndex: null,
    }));
  }, [userId]);

  /** Assigns (or first-assigns) the rehab track. Deliberately omits
      assigned_template_id/program_start_date/modifiers from the write
      when a profile row already exists — upsert's merge-duplicates only
      touches columns present in the payload, so any existing standard
      assignment is left completely untouched underneath the rehab track,
      ready to restore instantly via switchToStandard() once rehab
      finishes. A brand-new user (no row yet) has no prior assignment to
      preserve, so this also supplies today's date for program_start_date's
      NOT NULL constraint in that case only — unused while trackType stays
      "rehab". */
  const assignRehab = useCallback(async (injuryArea: string, startingPhaseIndex = 0) => {
    const quizCompletedAt = new Date().toISOString();
    const existing = row;
    const payload: Record<string, unknown> = {
      user_id: userId,
      track_type: 'rehab',
      rehab_injury_area: injuryArea,
      rehab_phase_index: startingPhaseIndex,
      quiz_completed_at: quizCompletedAt,
    };
    if (!existing) payload.program_start_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
    setRow(existing
      ? { ...existing, trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex }
      : {
          assignedTemplateId: null, programStartDate: payload.program_start_date as string,
          modifiers: {}, tier: 'standard', quizCompletedAt, tutorialCompletedAt: null,
          trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex,
        });
  }, [row, userId]);

  /** Restores the Standard track using whatever assignment already exists
      on this profile — the "instant" path for someone who's finished
      rehab, no requiz. PATCH (`.update`), not upsert — see
      NativeProfile.switchToStandard()'s own comment: a partial upsert here
      would fail program_start_date's NOT NULL check the same way
      markTutorialCompleted's used to. */
  const switchToStandard = useCallback(async () => {
    const { error } = await supabase.from('profiles').update({ track_type: 'standard' }).eq('user_id', userId);
    if (error) throw error;
    setRow(r => (r ? { ...r, trackType: 'standard' } : r));
  }, [userId]);

  /** Persists a new rehab phase index once every self-report criterion for
      the current phase has been checked and the user confirms they're
      ready to move on. */
  const advanceRehabPhase = useCallback(async (phaseIndex: number) => {
    const { error } = await supabase.from('profiles').update({ rehab_phase_index: phaseIndex }).eq('user_id', userId);
    if (error) throw error;
    setRow(r => (r ? { ...r, rehabPhaseIndex: phaseIndex } : r));
  }, [userId]);

  const markTutorialCompleted = useCallback(async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('profiles').update({ tutorial_completed_at: now }).eq('user_id', userId);
    if (error) throw error;
    setRow(r => (r ? { ...r, tutorialCompletedAt: now } : r));
  }, [userId]);

  return { row, loaded, reload, create, assignRehab, switchToStandard, advanceRehabPhase, markTutorialCompleted };
}

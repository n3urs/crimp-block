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

  /** null `row` afterward means genuinely no profile yet (a real new user
      who hasn't done the quiz) — distinct from a network/decode failure,
      which throws instead of silently leaving `row` null, so the caller
      doesn't mistake "couldn't check" for "definitely new." */
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).maybeSingle();
    if (error) throw error;
    setRow(data ? fromDbRow(data as ProfileDbRow) : null);
  }, []);

  // Same fix as useStore.ts/useLoads.ts: reload() can throw (confirmed
  // live on device), and calling it fire-and-forget from a synchronous
  // effect body turns that into a genuine uncaught promise rejection.
  // `.catch` stops the crash/toast without hiding the failure — `row`
  // simply stays null, same as the "genuinely no profile yet" case this
  // function's own doc comment already describes.
  useEffect(() => { reload().catch((e) => console.error('useProfile.reload failed:', e)); }, [reload]);

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

  return { row, reload, create, assignRehab, switchToStandard, advanceRehabPhase, markTutorialCompleted };
}

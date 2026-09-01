// src/data/useProfile.ts
import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Task 11 bug-fix round 4 — STRUCTURAL rewrite, not another patch.

    Rounds 1-3's history (for whoever reads this next): round 1 added a
    bare `loaded` boolean (stale across a userId change — a reset effect
    and the routing effect can fire off the same stale render, so the
    routing effect could still read the OLD value). Round 2 replaced it
    with `loadedFor === userId` keying (this genuinely closed the
    userId-transition race — proven, and the reasoning below still relies
    on it) plus a separate `error` boolean — but `reload()` only set
    `loadedFor` at the END, in `finally`, never invalidating it at the
    START. That meant tapping the retry button synchronously cleared
    `error` while `loadedFor` STILL equalled the current `userId` from the
    failed attempt, so `loaded` was true and `error` was false on the very
    next render, before the retry could possibly have resolved — reopening
    app/index.tsx's routing gate with `row` still null and risking a
    destructive profile.create() in /quiz.

    Both bugs are the same root cause: `loadedFor`, `error`, and `row`
    were three independently-`setState`'d values that had to agree with
    each other and with `userId`, but nothing enforced that agreement.
    Every fix patched one way they could disagree while leaving the
    mechanism that allowed disagreement — separate state slots — in place.

    The fix: ONE state slot, a discriminated union keyed to the userId
    each variant was actually computed for. There is no longer a
    "loaded"/"error"/"row" triple that can independently drift — there is
    exactly one value, and it is impossible for it to be "ready" and
    "error" at the same time, or to report success for one userId while
    secretly holding data from another, because the type itself has no
    representation for that. Every consumer field below (`loaded`,
    `isLoading`, `hasError`, `row`) is DERIVED from this one slot, always
    re-checked against the CURRENT `userId` at render time — so even a
    stale write landing in the slot (see the ref-guard note in `reload`
    below) can never be misread as current, because its own `forUserId`
    tag won't match. */
export type ProfileFetchState =
  | { status: 'idle' } // userId is '' — signed out, nothing to load
  | { status: 'loading'; forUserId: string } // a fetch is in flight for this userId
  | { status: 'ready'; forUserId: string; row: ProfileRow | null } // settled — row may legitimately be null (genuine new user)
  | { status: 'error'; forUserId: string }; // settled with a genuine failure (network/RLS/etc.)

export function useProfile(userId: string) {
  const [state, setState] = useState<ProfileFetchState>({ status: 'idle' });

  // Derived, not stored — every one of these is computed fresh from
  // `state` against the CURRENT `userId` on every render, so there is no
  // separate value that could ever fall out of sync with `state` itself.
  // `loaded`/`hasError` are mutually exclusive by construction (a single
  // `status` field can't be both `'ready'` and `'error'`), which is
  // exactly the disagreement round 2 could fall into and this design
  // can't: there is no possible sequence of writes to `state` that
  // produces `loaded === true && hasError === true`, because there is
  // only one write target and only one of the four shapes can occupy it.
  const loaded = state.status === 'ready' && state.forUserId === userId;
  const isLoading = state.status === 'loading' && state.forUserId === userId;
  const hasError = state.status === 'error' && state.forUserId === userId;
  const row = loaded && state.status === 'ready' ? state.row : null;

  // Belt-and-braces guard against a STALE write landing in `state` at
  // all, for the case the routing-correctness argument above doesn't by
  // itself need: userId transitions from A to B while A's fetch is still
  // genuinely in flight, and A's response arrives late (after B's own
  // `reload()` has already moved `state` to `{status:'loading', forUserId:
  // B}`). Without this guard, A's late settlement would overwrite that
  // `loading` entry with `{status:'ready'|'error', forUserId: A}` — the
  // read-site checks above still correctly refuse to treat that as
  // current (A !== B), so this can NOT cause a wrong route or a wrong
  // row to be trusted. But it WOULD transiently erase the genuine
  // `isLoading` signal for B (neither loaded, isLoading, nor hasError
  // would be true for B until B's own fetch resolves and overwrites the
  // slot again) — a cosmetic flicker, not a correctness bug, but cheap to
  // close outright rather than merely tolerate. `currentUserIdRef` always
  // holds the LATEST `userId` synchronously (assigned every render, not
  // via an effect, so it's never a render behind), and `reload()` checks
  // it immediately before every settling `setState` call, skipping the
  // write entirely if a newer userId has since taken over.
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

  /** `userId` comes from the caller's already-held session (`useSession()`),
      not a fresh `supabase.auth.getUser()` call inside each write — a
      network round-trip on the write path meant a genuine offline write
      threw OUTSIDE the `if (error)` rollback block below (`getUser()`
      itself failing, or resolving with `user: null` and crashing on
      `user!.id`), leaving the optimistic state uncorrected. Same fix as
      useStore.ts/useLoads.ts, for the identical reason. */
  const reload = useCallback(async () => {
    // Captured once per call, so every settlement path below reports the
    // ACTUAL userId this particular fetch was for, regardless of whether
    // `userId` itself has since changed again.
    const forUserId = userId;
    // "Not signed in yet" collapses to `idle` synchronously — there is
    // genuinely nothing pending to wait for, same reasoning as before:
    // `profiles` is RLS-protected with no explicit user_id filter, so an
    // anon-key request before any sign-in is expected and routine, not a
    // real failure, and a caller gating on `loaded` before routing
    // (app/index.tsx) must not be blocked forever for a genuinely
    // signed-out user, who has no profile row to wait for at all.
    if (!forUserId) { setState({ status: 'idle' }); return; }
    // THE step that was missing in every prior round: the state moves to
    // `loading` for THIS userId immediately, before any network call is
    // even started — not at the end, in a `finally`. This is what makes a
    // manual retry safe: the very next render after a `reload()` call
    // (whether it's the initial fetch, a userId-change-triggered one, or
    // a button-tap retry) already reflects "loading, for this specific
    // id" — there is no render at which a stale `ready`/`error` from a
    // previous attempt for the same id can be read, because the single
    // state slot has already left that shape before this function does
    // anything else.
    setState({ status: 'loading', forUserId });
    try {
      const { data, error: fetchError } = await supabase.from('profiles').select(PROFILE_COLUMNS).maybeSingle();
      if (fetchError) throw fetchError;
      // See the ref-guard note above `reload` — skip the write if a newer
      // userId has taken over while this fetch was in flight, rather than
      // clobbering that newer attempt's own state.
      if (currentUserIdRef.current === forUserId) {
        setState({ status: 'ready', forUserId, row: data ? fromDbRow(data as ProfileDbRow) : null });
      }
    } catch (e) {
      if (currentUserIdRef.current === forUserId) {
        setState({ status: 'error', forUserId });
      }
      // Always propagates, independent of the guard above — a caller
      // awaiting reload() (the manual retry button) must see the failure
      // even in the vanishingly unlikely case its own userId was already
      // superseded by the time this rejects.
      throw e;
    }
  }, [userId]);

  // A genuine failure (once signed in) can still throw here — reload() is
  // fired fire-and-forget from a synchronous effect body, so without this
  // .catch that throw would be a true uncaught promise rejection
  // (confirmed live on a real device before the `!userId` guard above
  // existed). `.catch` doesn't hide a real failure — `hasError` above
  // already captures it — it just stops it from crashing/toasting as
  // unhandled.
  useEffect(() => {
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
    // Optimistic write lands directly as a `ready` state for the current
    // userId — reachable only once the quiz screen itself is reachable,
    // which (per computeRoute.ts's non-built-in branch) already requires
    // a settled `ready` fetch for this same userId, so this is not
    // widening what "ready" can mean, just recording the new row under
    // the same shape the read path already produced.
    setState((s) => {
      const prevRow = s.status === 'ready' && s.forUserId === userId ? s.row : null;
      return {
        status: 'ready',
        forUserId: userId,
        row: {
          assignedTemplateId: templateId, programStartDate: startDate, modifiers,
          tier: 'standard', quizCompletedAt, tutorialCompletedAt: prevRow?.tutorialCompletedAt ?? null,
          trackType: 'standard', rehabInjuryArea: null, rehabPhaseIndex: null,
        },
      };
    });
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
    setState({
      status: 'ready',
      forUserId: userId,
      row: existing
        ? { ...existing, trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex }
        : {
            assignedTemplateId: null, programStartDate: payload.program_start_date as string,
            modifiers: {}, tier: 'standard', quizCompletedAt, tutorialCompletedAt: null,
            trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex,
          },
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
    setState((s) => (s.status === 'ready' && s.forUserId === userId && s.row
      ? { ...s, row: { ...s.row, trackType: 'standard' } }
      : s));
  }, [userId]);

  /** Persists a new rehab phase index once every self-report criterion for
      the current phase has been checked and the user confirms they're
      ready to move on. */
  const advanceRehabPhase = useCallback(async (phaseIndex: number) => {
    const { error } = await supabase.from('profiles').update({ rehab_phase_index: phaseIndex }).eq('user_id', userId);
    if (error) throw error;
    setState((s) => (s.status === 'ready' && s.forUserId === userId && s.row
      ? { ...s, row: { ...s.row, rehabPhaseIndex: phaseIndex } }
      : s));
  }, [userId]);

  const markTutorialCompleted = useCallback(async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('profiles').update({ tutorial_completed_at: now }).eq('user_id', userId);
    if (error) throw error;
    setState((s) => (s.status === 'ready' && s.forUserId === userId && s.row
      ? { ...s, row: { ...s.row, tutorialCompletedAt: now } }
      : s));
  }, [userId]);

  return { row, loaded, isLoading, hasError, reload, create, assignRehab, switchToStandard, advanceRehabPhase, markTutorialCompleted };
}

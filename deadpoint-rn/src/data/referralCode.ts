// src/data/referralCode.ts
/** The pure half of Settings' referral-code entry; useProfile.ts's
    setReferredBy is the wiring (same split as crashReport.ts/lastCrash.ts,
    holdRepeat.ts/StepperButton.tsx elsewhere in this codebase — pure
    decision logic pulled out and tested, the Supabase call around it left
    as thin, untested wiring like every other network write in this file).

    A code can only ever be set ONCE (see useProfile.ts's own doc comment
    on setReferredBy for why: a one-way door, enforced here as well as by
    Settings only showing the entry screen while none exists). Trimmed
    and lowercased so "Joe", " joe ", and "JOE" all land as the same value
    a friend actually typed — the admin dashboard groups by this string
    verbatim, with no canonical list to match against, so normalising it
    once here is the only thing keeping "joe" and "Joe" from splitting
    into two separate rows there. */
export function normaliseReferralCode(input: string, alreadySet: string | null): string | null {
  if (alreadySet != null) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

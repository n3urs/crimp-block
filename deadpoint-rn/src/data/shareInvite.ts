// src/data/shareInvite.ts
/** The pure half of Settings' "Invite a friend" row (the native share
    sheet call is the thin wiring in app/settings.tsx).

    The code is a prefix of the user's own id rather than a stored value:
    nothing to generate, no table, no collision handling at this scale.
    It goes through the existing quiz/Settings referral field, which
    lowercases it, so `profiles.referred_by` holds exactly this string and
    the admin dashboard can be searched for the sharer by id prefix.

    The link is the website rather than a store URL on purpose: it works
    on both platforms and the Play listing isn't live yet. The message
    deliberately promises nothing — no reward is tied to sharing (Apple
    3.1.1: no unlocking features through the app's own mechanisms). */
export const SHARE_URL = 'https://getdeadpoint.co.uk';

export function shareCodeForUser(userId: string): string {
  return `dp-${userId.replace(/-/g, '').slice(0, 6).toLowerCase()}`;
}

export function inviteMessage(code: string): string {
  return `I plan my finger training with Deadpoint — it builds each day's session around what you've actually climbed. Get it at ${SHARE_URL} and enter my code ${code} when you sign up.`;
}

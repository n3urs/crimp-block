// src/data/kiosk.ts
/** Accounts that turn a device into the gym station. Signing in with one
    routes straight to app/gym.tsx (see computeRoute.ts) and the screen
    locks itself down: no way back to the rest of the app, only a hidden
    staff sign-out. The game shows no paid content, so this skips the
    paywall without unlocking anything a subscriber pays for.

    An exact-match list, not a pattern, so no ordinary sign-up can land in
    it by accident. Changing it needs a new build. The sign-in code goes to
    this address, so it must be a mailbox someone can read. */
export const KIOSK_EMAILS = ['gym@getdeadpoint.co.uk'];

export function isKioskEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return KIOSK_EMAILS.includes(email.trim().toLowerCase());
}

// src/data/kiosk.ts
/** The gym-station code word. It is NOT an account: typing it into the
    sign-in screen's email box (app/sign-in.tsx) sets a device flag
    (deviceFlags.setKioskMode) and jumps straight to app/gym.tsx, with no
    code emailed and no login. From then on the device routes to the game
    whether or not anyone is signed in, and the game screen locks itself
    down (no EXIT, hidden staff exit). Nothing an account owns sits behind
    it — the game reads no account data and the board is local — so anyone
    who types the word only gets the game.

    Exact match, ignoring case and spaces. Changing it needs a new build. */
export const KIOSK_CODE_WORDS = ['flappybird'];

export function isKioskCode(input: string | null | undefined): boolean {
  if (!input) return false;
  return KIOSK_CODE_WORDS.includes(input.trim().toLowerCase());
}

// src/data/forceGauge/flappyHighScore.ts
/** Device-local copy of the Flappy Bird high score, alongside the
    account-synced one (`profiles.flappy_high_score`, see useProfile.ts's
    setFlappyHighScore).

    Why both: the synced score is a PATCH on the account's `profiles` row,
    and built-in accounts (Oscar, Joe — hand-authored PROGRAMS, no quiz)
    have NO such row. The UPDATE then matches zero rows, which PostgREST
    does not treat as an error, so nothing throws, nothing is written, and
    the local state update is skipped too (there's no row to patch) — the
    score simply vanished the moment the game closed. Oscar's report:
    "it forgets as soon as u close it even if u stay in the app". A score
    the player just earned must never depend on a server row existing, so
    it's always kept here first; the synced copy is the extra, for
    accounts that have somewhere to put it.

    Keyed by user id (not one global slot) so switching accounts on a
    device never shows someone else's score. A failing read/write is
    swallowed on purpose — a broken local cache must never break the
    game. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (userId: string) => `flappyHighScore:${userId}`;

/** Corrupt or foreign stored text reads as 0 rather than letting NaN or
    a negative reach the game screen. */
function parseScore(raw: string | null): number {
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function loadLocalHighScore(userId: string): Promise<number> {
  try {
    return parseScore(await AsyncStorage.getItem(key(userId)));
  } catch {
    return 0;
  }
}

/** A ratchet, not a plain write: only stores a score that beats what's
    already there, so a stale caller (say, one that hadn't finished
    loading the stored best yet) can't lower it. */
export async function saveLocalHighScore(userId: string, score: number): Promise<void> {
  try {
    const stored = parseScore(await AsyncStorage.getItem(key(userId)));
    if (score > stored) await AsyncStorage.setItem(key(userId), String(score));
  } catch {
    // best effort — see the header comment
  }
}

/** Last-known-good copies of what the app fetches from Supabase, so it
    opens and works with no signal. Same AsyncStorage-over-SecureStore/MMKV
    reasoning as deviceFlags.ts and tickStorage.ts — none of this is
    sensitive (it's already on the device's screen), and the access token
    that IS sensitive stays in SecureStore via supabase.ts's own adapter.

    Real bug this exists to fix: nothing fetched was ever written to disk,
    so a cold launch with no signal failed the `profiles` fetch and
    app/index.tsx rendered its "Couldn't load your account" retry screen —
    a total lockout of an app whose whole point is being usable at a crag,
    with the session log and weights empty behind it. The training engine
    itself never needed the network (it resolves programs on-device from
    bundled templates), so caching these three fetches is the entire
    difference between "locked out" and "works".

    Keyed per user id, not global: signing into a different account must
    never show the previous account's training data, and a replayed write
    scoped by RLS alone would be worse than useless (see outbox.ts). */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** The fetches worth surviving a cold launch — one key each. */
export type CacheName = 'profile' | 'sessions' | 'loads';

const CACHE_NAMES: CacheName[] = ['profile', 'sessions', 'loads'];

const cacheKey = (name: CacheName, userId: string) => `cache:${name}:${userId}`;

/** null means "we have genuinely never cached this", deliberately distinct
    from an empty object — the hooks only fall back to a cached value when
    there really is one, and `{}` would masquerade as "this user has no
    logged sessions" rather than "we have never successfully fetched". */
export async function readCache<T>(name: CacheName, userId: string): Promise<T | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(name, userId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    // Corrupt JSON or an unreadable store must not throw: this is called
    // from hook mount effects, so a throw would take the screen down —
    // strictly worse than simply having no cache to fall back on.
    console.error(`readCache(${name}) failed:`, e);
    return null;
  }
}

export async function writeCache(name: CacheName, userId: string, value: unknown): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(cacheKey(name, userId), JSON.stringify(value));
  } catch (e) {
    // Best-effort by design — a failed cache write must never fail the
    // real fetch/write that triggered it.
    console.error(`writeCache(${name}) failed:`, e);
  }
}

/** Called when an account is deleted (see useSession.ts's deleteAccount):
    the rows are already gone server-side, so leaving a readable copy of
    someone's training history on the device after they asked for deletion
    would be its own small betrayal of that request. */
export async function clearUserCache(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.multiRemove(CACHE_NAMES.map((n) => cacheKey(n, userId)));
  } catch (e) {
    console.error('clearUserCache failed:', e);
  }
}

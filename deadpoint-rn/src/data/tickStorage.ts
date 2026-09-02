/** Device-local persistence for card.tsx's `ticks` (which exercises are
    checked off for today's session, before logging). Same reasoning as
    deviceFlags.ts for AsyncStorage over expo-secure-store/MMKV.

    Real bug reported live: ticking exercises off, then swiping the daily
    card to browse a different session (or backgrounding/closing the app)
    and coming back, showed every exercise unticked again — card.tsx's own
    `ticks` was plain in-memory `useState`, wiped on every `today`/
    `displayKey` change and never surviving a real app restart at all.
    Keying storage by (today, sessionKey) rather than one flat value fixes
    both: browsing away and back to the SAME session restores exactly what
    was ticked, a genuinely DIFFERENT session still starts fresh (matching
    the original Swift's own intentional reset-on-session-change), and the
    value now survives an app close/reopen on the same day.

    No cleanup of past days' keys — ponytail: unbounded but genuinely
    negligible (a few bytes/day for a personal training app); add pruning
    if this ever actually matters. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const tickKey = (today: string, sessionKey: string): string => `ticks:${today}:${sessionKey}`;

export async function getStoredTicks(today: string, sessionKey: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(tickKey(today, sessionKey));
  if (!raw) return new Set();
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids) : new Set();
  } catch {
    return new Set();
  }
}

export async function setStoredTicks(today: string, sessionKey: string, ticks: Set<string>): Promise<void> {
  await AsyncStorage.setItem(tickKey(today, sessionKey), JSON.stringify([...ticks]));
}

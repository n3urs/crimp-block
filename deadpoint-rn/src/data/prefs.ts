/** Two device-local exercise-tracking preferences — SettingsView.swift's own
    @AppStorage("setsCounterEnabled")/@AppStorage("autoStartRestOnTally")
    (DailyCardView.swift lines 1129-1130, 41-42). Same reasoning as
    deviceFlags.ts for choosing AsyncStorage over expo-secure-store (wrong
    tool for non-sensitive booleans) or MMKV (already removed as broken in
    this Expo SDK, see Phase 0-2's Task 12).

    Unlike deviceFlags.ts's plain async get/set functions, these need to be
    REACTIVE across components that don't share a common parent's render
    state: Settings' own toggle (a separate route) and ExerciseRow
    (rendered deep inside the daily card, reached via a completely
    different screen) both need to observe the same live value the instant
    it changes, matching what @AppStorage gives Swift for free. A minimal
    module-level store + subscriber list is the standard-library-only way
    to get that without adding a state management dependency for two
    booleans. */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETS_COUNTER_KEY = 'setsCounterEnabled';
const AUTO_START_REST_KEY = 'autoStartRestOnTally';

export interface Prefs {
  setsCounterEnabled: boolean;
  autoStartRestOnTally: boolean;
  loaded: boolean;
}

let setsCounterEnabled = false;
let autoStartRestOnTally = false;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

async function load(): Promise<void> {
  const [sc, asr] = await Promise.all([
    AsyncStorage.getItem(SETS_COUNTER_KEY),
    AsyncStorage.getItem(AUTO_START_REST_KEY),
  ]);
  setsCounterEnabled = sc === 'true';
  autoStartRestOnTally = asr === 'true';
  loaded = true;
  notify();
}
const loadPromise = load();

/** Plain, hook-free snapshot of the current module-level state — the exact
    value `usePrefs()` itself returns, exported separately so the reactive
    store underneath the hook is directly testable. This project has no
    react-test-renderer / @testing-library/react-hooks installed (confirmed
    against __tests__/dailyCard.test.ts and __tests__/useDoneFlow's own doc
    comments — both explicit that no test-renderer exists here), so every
    hook in this codebase is tested through the plain function(s) it wraps,
    never by actually invoking the hook outside a real React render (which
    throws "Invalid hook call" with no dispatcher present anyway). */
export function getPrefsSnapshot(): Prefs {
  return { setsCounterEnabled, autoStartRestOnTally, loaded };
}

/** Plain, hook-free subscribe — the exact mechanism `usePrefs()` uses
    internally to re-render on change. Exported so a test can register two
    independent subscribers (standing in for two separately-mounted
    components, e.g. Settings' toggle and ExerciseRow) and confirm ONE
    setter call notifies both from the shared module-level state, not just
    whichever call site made it. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) loadPromise.then(listener);
  return () => { listeners.delete(listener); };
}

export async function setSetsCounterEnabled(value: boolean): Promise<void> {
  setsCounterEnabled = value;
  notify();
  await AsyncStorage.setItem(SETS_COUNTER_KEY, value ? 'true' : 'false');
}

export async function setAutoStartRestOnTally(value: boolean): Promise<void> {
  autoStartRestOnTally = value;
  notify();
  await AsyncStorage.setItem(AUTO_START_REST_KEY, value ? 'true' : 'false');
}

/** Live-subscribes to both prefs — any component calling this re-renders
    the instant either setter above is called anywhere in the app, the
    same app-wide reactivity @AppStorage gives Swift's SettingsView and
    ExerciseRowView for free. `loaded` is false until the initial
    AsyncStorage read resolves; both prefs already default to `false`
    either way, so callers should treat "not yet loaded" the same as
    "off" rather than blocking render on it (matches every other
    async-storage-backed read in this project — nothing here shows a
    loading spinner for two booleans). */
export function usePrefs(): Prefs {
  const [, forceRender] = useState(0);
  useEffect(() => subscribe(() => forceRender((n) => n + 1)), []);
  return getPrefsSnapshot();
}

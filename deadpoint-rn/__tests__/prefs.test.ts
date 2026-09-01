/** No react-test-renderer / @testing-library/react-hooks exists in this
    project (confirmed against __tests__/dailyCard.test.ts's and
    src/components/daily-card/useDoneFlow.ts's own doc comments — both
    explicit that no test-renderer is installed, and testEnvironment is
    plain 'node' with no reconciler at all), so `usePrefs()` itself can't
    be invoked directly here — calling any hook outside a real React render
    throws "Invalid hook call" with no dispatcher present. Every hook in
    this codebase is instead tested through the plain function(s) it
    wraps; `usePrefs()` wraps `getPrefsSnapshot()` + `subscribe()` (see
    prefs.ts), which are exactly what's exercised below — the real
    mechanism the hook is built on, not a parallel reimplementation of it. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPrefsSnapshot,
  subscribe,
  setSetsCounterEnabled,
  setAutoStartRestOnTally,
} from '../src/data/prefs';

// Captured synchronously, at module-eval time, before any test body runs and
// before even one microtask has had a chance to flush — module-level load()
// already started at import (see prefs.ts's own `const loadPromise =
// load()`), but `AsyncStorage.getItem` is itself an async function, so its
// continuation needs at least one microtask tick before `loaded` flips true.
// This proves `loaded` really does start false, not just that it's
// eventually true by the time a test body happens to run.
const initialLoadedSnapshot = getPrefsSnapshot().loaded;
const loadedPromise = new Promise<void>((resolve) => {
  const unsubscribe = subscribe(() => {
    if (getPrefsSnapshot().loaded) {
      unsubscribe();
      resolve();
    }
  });
});

test('loaded starts false and becomes true once the initial AsyncStorage read resolves', async () => {
  expect(initialLoadedSnapshot).toBe(false);
  await loadedPromise;
  expect(getPrefsSnapshot().loaded).toBe(true);
});

test('both prefs default to false on a fresh install (nothing in AsyncStorage yet), matching Swift\'s @AppStorage default', async () => {
  await loadedPromise;
  expect(getPrefsSnapshot().setsCounterEnabled).toBe(false);
  expect(getPrefsSnapshot().autoStartRestOnTally).toBe(false);
});

test('setSetsCounterEnabled(true) is reflected in the snapshot usePrefs() itself returns', async () => {
  await setSetsCounterEnabled(true);
  expect(getPrefsSnapshot().setsCounterEnabled).toBe(true);
});

test('setSetsCounterEnabled persists to AsyncStorage, not just module memory', async () => {
  await setSetsCounterEnabled(true);
  expect(await AsyncStorage.getItem('setsCounterEnabled')).toBe('true');
  await setSetsCounterEnabled(false);
  expect(await AsyncStorage.getItem('setsCounterEnabled')).toBe('false');
});

test('setAutoStartRestOnTally persists to AsyncStorage under its own key, independent of setsCounterEnabled', async () => {
  await setAutoStartRestOnTally(true);
  expect(await AsyncStorage.getItem('autoStartRestOnTally')).toBe('true');
  expect(getPrefsSnapshot().autoStartRestOnTally).toBe(true);
});

test('setSetsCounterEnabled notifies every independent subscriber, not just whichever call site made it — the same cross-component reactivity usePrefs() gives Settings\' toggle and ExerciseRow, two separately-mounted components reached via completely different screens', async () => {
  await loadedPromise;
  let settingsScreenNotified = false;
  let exerciseRowNotified = false;
  const unsubSettings = subscribe(() => { settingsScreenNotified = true; });
  const unsubExerciseRow = subscribe(() => { exerciseRowNotified = true; });

  await setSetsCounterEnabled(false); // start from a known value
  settingsScreenNotified = false;
  exerciseRowNotified = false;

  await setSetsCounterEnabled(true);

  expect(settingsScreenNotified).toBe(true);
  expect(exerciseRowNotified).toBe(true);
  // Both subscribers read the SAME module-level state, not a copy taken at
  // subscribe time — proving it's the shared store reacting, not a fluke of
  // one subscriber's own local closure.
  expect(getPrefsSnapshot().setsCounterEnabled).toBe(true);

  unsubSettings();
  unsubExerciseRow();
});

test('a subscriber that unsubscribes stops being notified by later setter calls', async () => {
  await loadedPromise;
  let notifiedCount = 0;
  const unsubscribe = subscribe(() => { notifiedCount += 1; });
  unsubscribe();

  await setAutoStartRestOnTally(false);
  await setAutoStartRestOnTally(true);

  expect(notifiedCount).toBe(0);
});

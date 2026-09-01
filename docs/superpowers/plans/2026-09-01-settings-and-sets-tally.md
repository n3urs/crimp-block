# Settings Screen + Sets Tally Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Settings screen (reached from the daily card's gear icon, currently a dead `onTapSettings={() => {}}` no-op) and wire the already-built-but-unused `SetsTally` component into `ExerciseRow.tsx`, matching `SettingsView.swift`/`DailyCardView.swift:1100-1399` exactly.

**Architecture:** A new reactive, AsyncStorage-backed `src/data/prefs.ts` module (mirroring `deviceFlags.ts`'s storage choice, but with cross-component reactivity via a minimal module-level pub-sub, since Settings' toggle and `ExerciseRow` — a completely different screen/route — both need to observe the same live value, matching Swift's `@AppStorage`). `ExerciseRow.tsx` reads `setsCounterEnabled`/`autoStartRestOnTally` directly via a new `usePrefs()` hook call (no new prop threading needed) and owns `completedSets` as local state, synced from `isTicked` exactly like Swift's `.onChange(of: isTicked)`. `app/settings.tsx` is a new modal route, following the exact pattern `app/day-picker.tsx` already established (independently resolves its own `useSession`/`useProfile`, not sharing state with `card.tsx`).

**Tech Stack:** Same as the rest of `deadpoint-rn` — Expo Router, `@react-native-async-storage/async-storage` (already a dependency, used by `deviceFlags.ts`), React Native core components. No new dependencies.

## Global Constraints

- Design tokens (`Colours`, `Fonts`) via those modules only.
- `npx jest` and `npx tsc --noEmit` clean after every task.
- Flat `test(...)` calls, no `describe` blocks.
- Local-noon date parsing convention if any date is touched (`new Date(y, m-1, d, 12)`, never `new Date(dateString)` directly) — not expected to come up in this plan, noted for completeness.
- **Account deletion is explicitly OUT OF SCOPE**, matching the existing Paywall `// TODO(Phase 7)` precedent — confirmed via grep, no `deleteAccount`/Supabase Edge Function exists anywhere in this project. `SettingsView.swift`'s ACCOUNT section has a DELETE ACCOUNT button gated on `onDeleteAccount != nil`; the RN port's caller (`app/settings.tsx`) simply never has a delete handler to pass, so that whole sub-section (confirmation dialog, deleting state, error text) is not built at all — not a stubbed no-op button, entirely absent, matching Swift's own `if onDeleteAccount != nil` gate philosophy (never show a control that does nothing).
- **Rehab track-switching IS in scope**, reusing `/quiz` unmodified — `/quiz` already has a complete Rehab flow (`RehabAreaStep`, `RehabStartingPointStep`, `RehabSummaryStep`, calling `profile.assignRehab(...)`), already reachable today from onboarding for a brand-new user. Exposing the same `/quiz` screen again from Settings for an existing user carries the identical, already-accepted Phase 6 gap (no Rehab daily-card UI exists yet) — not a new risk this plan introduces, so it is not scoped out. Do not build any new "hide Rehab" variant of the quiz.
- `useProfile(userId)`'s real, already-existing methods this plan uses — confirmed present, do not re-derive or guess: `row.trackType: string`, `row.rehabInjuryArea: string | null`, `row.rehabPhaseIndex: number | null`, `row.assignedTemplateId: string | null`, `reload()`, `switchToStandard()` (async, no args). `TEMPLATE_META`/`REHAB_META` (both `Record<string, { name: string; description: string }>`) are already exported from `src/screens/quiz/quizModel.ts`.

---

## Task 1: `src/data/prefs.ts` + wire `SetsTally` into `ExerciseRow.tsx`

**Files:**
- Create: `deadpoint-rn/src/data/prefs.ts`
- Create: `deadpoint-rn/__tests__/prefs.test.ts`
- Modify: `deadpoint-rn/src/components/daily-card/ExerciseRow.tsx`

**Interfaces:**
- Consumes: `SetsTally`, `totalSetsFor` (both already exported from `./SetsTally`, unchanged — read `src/components/daily-card/SetsTally.tsx` in full before starting, its own doc comment explains exactly what business logic it deliberately does NOT own).
- Produces: `usePrefs(): { setsCounterEnabled: boolean; autoStartRestOnTally: boolean; loaded: boolean }`, `setSetsCounterEnabled(value: boolean): Promise<void>`, `setAutoStartRestOnTally(value: boolean): Promise<void>` — all from `src/data/prefs.ts`. Task 2's `app/settings.tsx` calls `usePrefs()` and both setters directly; no other task depends on this task's `ExerciseRow.tsx` changes.

- [ ] **Step 1: Read `src/components/daily-card/SetsTally.tsx` in full**, and `ios/CrimpBlock/DailyCardView.swift` lines 1100-1399 (the real Swift source this whole task ports — `@State private var completedSets`, `@AppStorage("setsCounterEnabled")`/`@AppStorage("autoStartRestOnTally")`, `setsTally(_:)`, `tapTally(totalSets:)`, `undoLastSet()`, and the `.onChange(of: isTicked)` sync). Also read `deadpoint-rn/src/data/deviceFlags.ts` in full — it's the existing AsyncStorage pattern this task's storage half mirrors (same library, same rationale for AsyncStorage over `expo-secure-store`/MMKV), though this task's own values need cross-component reactivity deviceFlags.ts's plain async functions don't provide (see Step 2).

- [ ] **Step 2: Write `src/data/prefs.ts`**

```typescript
// src/data/prefs.ts
/** Two device-local exercise-tracking preferences — SettingsView.swift's
    own @AppStorage("setsCounterEnabled")/@AppStorage("autoStartRestOnTally")
    (lines 1129-1130, 41-42). Same reasoning as deviceFlags.ts for choosing
    AsyncStorage over expo-secure-store (wrong tool for non-sensitive
    booleans) or MMKV (already removed as broken in this Expo SDK, see
    Phase 0-2's Task 12).

    Unlike deviceFlags.ts's plain async get/set functions, these need to be
    REACTIVE across components that don't share a common parent's render
    state: Settings' own toggle (app/settings.tsx, a separate route) and
    ExerciseRow (rendered deep inside the daily card, reached via a
    completely different screen) both need to observe the same live
    value the instant it changes, matching what @AppStorage gives Swift
    for free. A minimal module-level store + subscriber list is the
    standard-library-only way to get that without adding a state
    management dependency for two booleans. */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETS_COUNTER_KEY = 'setsCounterEnabled';
const AUTO_START_REST_KEY = 'autoStartRestOnTally';

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
export function usePrefs(): { setsCounterEnabled: boolean; autoStartRestOnTally: boolean; loaded: boolean } {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    if (!loaded) loadPromise.then(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return { setsCounterEnabled, autoStartRestOnTally, loaded };
}
```

- [ ] **Step 2b: Write `__tests__/prefs.test.ts`**

Flat `test(...)` calls, no `describe`. `@react-native-async-storage/async-storage` already has a jest mock configured for this project (confirmed: `deviceFlags.ts` is already exercised by an existing test file — find and follow that file's exact mocking setup, don't invent a new one). Cover: `setSetsCounterEnabled(true)` then `usePrefs()` (via `@testing-library/react-hooks`-style `renderHook`, or this project's own established hook-testing pattern — check how an existing hook like `useLoads` or `useStore` is tested and match it exactly) reflects `setsCounterEnabled: true`; a value persists across a fresh `usePrefs()` subscriber (i.e., the module-level state, not just the specific hook instance that set it); `loaded` becomes `true` after the initial async read resolves.

- [ ] **Step 3: Wire `SetsTally` into `ExerciseRow.tsx`**

Read the full current file first (already open from Step 1's context). Add:

```typescript
// new imports at the top
import { usePrefs } from '../../data/prefs';
import { SetsTally, totalSetsFor } from './SetsTally';
```

Inside the component function body (exact placement/variable names are this task's own judgment — match the file's existing style):

```typescript
const { setsCounterEnabled, autoStartRestOnTally } = usePrefs();
const totalSets = totalSetsFor(ex);
const [completedSets, setCompletedSets] = useState(0);

// Mirrors Swift's `.onChange(of: isTicked) { completedSets = newValue ? totalSets : 0 }`
// (DailyCardView.swift:1307-1310) — keeps the tally in sync with whichever
// side actually changed isTicked: filling every pip auto-ticks (see
// handleTallyTap below), but the checkbox itself is still tappable
// directly too, bypassing the tally entirely, and an external Undo can
// flip isTicked back to false. Either direction, the tally must reflect
// reality: full when done, reset to zero the moment it isn't.
useEffect(() => {
  if (totalSets == null) return;
  setCompletedSets(isTicked ? totalSets : 0);
}, [isTicked, totalSets]);

// Mirrors Swift's tapTally(totalSets:) (DailyCardView.swift:1373-1386).
// Reuses onTapRest — the SAME callback the row's own Rest button already
// calls — rather than duplicating rest-timer-start logic here; confirmed
// real at the real call site (app/(main)/card.tsx's handleTapRest does
// exactly `restTimer.start(ex.restSeconds, ex.title, accent)`, guarded on
// ex.restSeconds != null, matching Swift's own restTimer.start(...) call
// inside tapTally exactly).
const handleTallyTap = () => {
  if (totalSets == null) return;
  if (completedSets >= totalSets) return; // already full — row will have collapsed via the tick below anyway
  const next = completedSets + 1;
  setCompletedSets(next);
  if (autoStartRestOnTally && ex.restSeconds != null) {
    onTapRest?.(ex);
  }
  if (next >= totalSets && !isTicked) {
    onToggleTick?.(ex.id);
  }
};

// Mirrors Swift's undoLastSet() (DailyCardView.swift:1393-1398). No return
// value needed here (unlike Swift's `-> Bool`) — SetsTallyProps.onLongPressUndo
// is typed `() => void`, and SetsTally.tsx's OWN internal suppressNextTap
// handling already fully owns the "don't let the long-press's release also
// fire a tap" concern (see that file's own doc comment) — this callback's
// only job is the state change itself.
const handleTallyUndo = () => {
  setCompletedSets((c) => Math.max(0, c - 1));
};
```

Render `<SetsTally>` in the same position Swift has it (`DailyCardView.swift:1253-1255`) — inside the existing `!isTicked` branch, after the description block (if `showDetail`) and before the START/Rest button:

```tsx
{!isTicked && setsCounterEnabled && totalSets != null && (
  <SetsTally
    totalSets={totalSets}
    completedSets={completedSets}
    accent={accent}
    onTap={handleTallyTap}
    onLongPressUndo={handleTallyUndo}
  />
)}
```

- [ ] **Step 4: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean, test count only grows (this task's new `prefs.test.ts`; `ExerciseRow`'s own existing tests, if any, must still pass unmodified — check for and read any existing `ExerciseRow`-covering test file before this step, don't assume none exists).

- [ ] **Step 5: Commit**

```bash
cd deadpoint-rn && git add src/data/prefs.ts __tests__/prefs.test.ts src/components/daily-card/ExerciseRow.tsx
git commit -m "feat: reactive setsCounter/autoStartRest prefs, wire SetsTally into ExerciseRow"
```

---

## Task 2: `app/settings.tsx`

**Files:**
- Create: `deadpoint-rn/app/settings.tsx`
- Modify: `deadpoint-rn/app/_layout.tsx`
- Modify: `deadpoint-rn/app/(main)/card.tsx`

**Interfaces:**
- Consumes: `usePrefs`, `setSetsCounterEnabled`, `setAutoStartRestOnTally` (Task 1, `src/data/prefs.ts`); `useSession()` (existing — `{ session, signOut }`, confirmed real shape from `app/quiz.tsx`/`app/sign-in.tsx`); `useProfile(userId)` (existing — `row`, `reload`, `switchToStandard`); `TEMPLATE_META`/`REHAB_META` (existing, `src/screens/quiz/quizModel.ts`).
- Produces: nothing another task consumes — this is the final piece, wired directly into navigation.

- [ ] **Step 1: Read `SettingsView.swift` in full** (already read this session — re-read now for exact copy/structure fidelity) and `app/day-picker.tsx` in full (the pattern this screen's own session/profile resolution and CLOSE-button/header structure follows most closely — simpler here, since Settings needs no `store`/`engine`/`PROGRAMS` at all, just `session` and `profile`).

- [ ] **Step 2: Write `app/settings.tsx`**

Structure (four sections, top to bottom, matching Swift's real body order at `SettingsView.swift:56-139`):

1. **ACCOUNT** — email (`session?.user?.email`), SIGN OUT button. On press: `await signOut(); router.replace('/');` (same pattern as `app/quiz.tsx`'s own `onCancel`). No delete-account UI at all (Global Constraints above).
2. **TRAINING TRACK** — only rendered when `profile.row != null`. A summary line ported from `trackSummaryText` (`SettingsView.swift:236-247`): if `row.trackType === 'rehab'`, `` `Rehab — ${REHAB_META[row.rehabInjuryArea ?? '']?.name ?? row.rehabInjuryArea ?? 'Rehab'}, ${phaseNames[row.rehabPhaseIndex ?? 0] ?? phaseNames[0]}` `` where `phaseNames = ['Tissue Unload', 'Mobility', 'Strength', 'Return to Climbing']` (a local const in this file — Swift hardcodes this same array inline at `SettingsView.swift:240`, not a shared constant elsewhere in this codebase; don't invent a new shared export for one caller). Otherwise `` `Standard — ${TEMPLATE_META[row.assignedTemplateId ?? '']?.name ?? row.assignedTemplateId ?? 'Standard'}` ``. A SWITCH TRACK button: `router.push('/quiz')`. When `row.trackType === 'rehab'` AND `row.assignedTemplateId != null`, also a "RESTORE “{name}” INSTANTLY" button (name = `TEMPLATE_META[row.assignedTemplateId]?.name ?? row.assignedTemplateId`) — on press, `busy`/`error` state (mirror `day-picker.tsx`'s own `busy`/`error` pattern exactly): `await profile.switchToStandard(); await profile.reload(); router.back();` inside a try/catch setting `error` on failure.
3. **HELP** — REPLAY TUTORIAL button: `router.push('/tutorial')` (confirmed `app/tutorial.tsx` takes no route params — a bare push is correct, no `useLocalSearchParams` call exists in that file).
4. **EXERCISE TRACKING** — SETS COUNTER toggle bound to `usePrefs().setsCounterEnabled` / `setSetsCounterEnabled`. AUTO-START REST TIMER toggle, only rendered when `setsCounterEnabled` is true (matches Swift's `if setsCounterEnabled { ... }` nesting at `SettingsView.swift:130`), bound to `autoStartRestOnTally` / `setAutoStartRestOnTally`. Use RN's built-in `Switch` component (no toggle component exists yet in this codebase — confirm via grep before assuming one does) for both.

Header: title "SETTINGS" (matches this app's existing all-caps header convention — see `day-picker.tsx`'s own `headerTitle`) and a CLOSE button calling `router.back()`, same visual pattern as `day-picker.tsx`'s header (`styles.header`/`styles.headerTitle`/`styles.close` — copy that structure, don't reinvent it). Independently resolve `session`/`profile` exactly like `day-picker.tsx` does (no `store`/`engine`/`PROGRAMS` needed here — this screen never touches session-log data). Wrap the whole screen in a `ScrollView` with `useSafeAreaInsets()` applied to top/bottom padding, matching every other modal screen this project has built (`weight-edit.tsx`, `day-picker.tsx`, `quiz.tsx`).

- [ ] **Step 3: Register the route** — add to `app/_layout.tsx`, following the exact `weight-edit`/`day-picker` precedent immediately above them (not group-qualified, `app/settings.tsx` lives directly under `app/`):

```tsx
<Stack.Screen name="settings" options={{ presentation: 'modal' }} />
```

- [ ] **Step 4: Wire the gear icon** — in `app/(main)/card.tsx`, replace the current `onTapSettings={() => {}}` no-op with `onTapSettings={() => router.push('/settings')}`.

- [ ] **Step 5: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add app/settings.tsx app/_layout.tsx "app/(main)/card.tsx"
git commit -m "feat: build the Settings screen, wire the gear icon"
```

---

## Task 3: Live device verification

- [ ] **Step 1:** Fresh Metro reload (iOS Simulator first, then the real Android device) — pure JS/TS, no native rebuild needed.
- [ ] **Step 2:** Tap the gear icon on the daily card — confirm Settings opens (it previously did nothing at all).
- [ ] **Step 3:** Toggle SETS COUNTER on. Go back to the card. Confirm a tally of pips appears on an exercise with an unambiguous set count in its prescription (e.g. Max Fingers' pickups), and does NOT appear on an interval exercise or one with a range prescription (e.g. "4–5 sets").
- [ ] **Step 4:** Tap the tally repeatedly — confirm pips fill one at a time, and filling the last pip auto-ticks the row (collapsing it), matching the existing tick-collapse animation.
- [ ] **Step 5:** Long-press a partially-filled tally — confirm the last pip removes, and the very next ordinary tap after releasing the long-press does NOT also add a pip (the suppress-next-tap behavior `SetsTally.tsx` already owns internally).
- [ ] **Step 6:** Toggle AUTO-START REST TIMER on (only visible once SETS COUNTER is on). Tap a tally pip on an exercise with rest seconds — confirm the rest timer overlay starts automatically, the same as tapping that exercise's own Rest button would.
- [ ] **Step 7:** Confirm ticking the checkbox directly (bypassing the tally) still works, and resets the tally to 0 empty pips if later unticked via Undo (if this app has an undo-tick path — confirm whether one exists; if not, this half of the check is N/A, note that rather than skipping silently).
- [ ] **Step 8:** In Settings, confirm SIGN OUT actually signs out and lands back on sign-in.
- [ ] **Step 9:** Confirm the TRAINING TRACK summary line reads correctly for your current real account state, SWITCH TRACK opens `/quiz`, and (if applicable to your current track) RESTORE INSTANTLY works and lands you back on the correct standard program.
- [ ] **Step 10:** Confirm REPLAY TUTORIAL opens `/tutorial` from the beginning.

## Self-Review

**Spec coverage:** Settings' four real sections (Account minus delete, Training Track, Help, Exercise Tracking) are all covered by Task 2; the sets-tally behavior (tally render condition, tap/undo, auto-tick, auto-rest-start) is covered by Task 1, ported line-for-line against the real Swift source rather than guessed.

**Placeholder scan:** no TBD/"add appropriate handling"-style steps — every code block above is complete, real TypeScript against confirmed-real interfaces (`useProfile`'s actual method names, `TEMPLATE_META`/`REHAB_META`'s actual shape, `day-picker.tsx`'s actual busy/error pattern).

**Type consistency:** `usePrefs()`'s return shape (`{ setsCounterEnabled, autoStartRestOnTally, loaded }`) is defined once in Task 1 and is the only shape Task 2 consumes — no task assumes a different one. `SetsTallyProps` (from the already-existing `SetsTally.tsx`) is used as-is, unmodified by this plan.

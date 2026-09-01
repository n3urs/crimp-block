# Weight Editing + Day Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two known, pre-existing gaps in the daily card, both flagged by live device testing: tapping a weight badge does nothing (no editor), and tapping a previous day in the week strip does nothing (no way to log/edit/clear a past day).

**Architecture:** Two new expo-router modal routes, `/weight-edit` and `/day-picker`, following the exact same pattern Phase 4 established for `/calendar` — a real route registered with `presentation: 'modal'` in `app/_layout.tsx`, pushed via `router.push()` with the minimal primitive data each screen needs passed as query params (both screens' inputs are simple strings/numbers, not complex objects, so this avoids inventing a new cross-screen data-passing mechanism). Both are direct ports of `WeightEditView.swift`/`DayPickerView.swift`, using the already-existing `useLoads().set()`/`useStore().set()`/`useStore().clear()` data-layer methods (built in Phase 1, unused for this purpose until now).

**Tech Stack:** No new dependencies. `expo-router` for the modal routes (already used for `/calendar`).

## Global Constraints

- Design tokens (`Colours`, `Fonts`, `resolveColour`) via those modules only.
- `npx jest` and `npx tsc --noEmit` clean after every task.
- Flat `test(...)` calls, no `describe` blocks.
- No floor at 0 for weight — a negative value is real (assistance taken off a band/pulley), matching `WeightEditView.swift`'s own comment exactly. Do not clamp.
- Both screens are real modal routes (not inline component swaps) — `router.push()` to enter, `router.back()` to dismiss (matching `/calendar`'s own `onDismiss={() => router.back()}` pattern), not React state toggling a visibility flag.

---

## Task 1: Weight editing screen

**Files:**
- Create: `deadpoint-rn/app/weight-edit.tsx`
- Modify: `deadpoint-rn/app/_layout.tsx` (register the modal route)
- Modify: `deadpoint-rn/app/(main)/card.tsx` (wire `onTapWeight`)

**Interfaces:**
- Consumes: `useLoads(userId).set(date, id, kg): Promise<void>` (pre-existing, `src/data/useLoads.ts`).
- Route params (all strings, since expo-router query params are always strings): `exerciseId`, `title`, `step` (numeric, stringified), `weightKg` (numeric, stringified, or `''` for "no current value" — matches Swift's `exercise.weightKg ?? 0` starting point), `date` (the day this weight is being logged for — always `today` from the caller, but passed explicitly rather than re-derived, so this screen has no engine/program dependency of its own).

- [ ] **Step 1: Read `app/(main)/card.tsx` and `app/_layout.tsx` in full** to confirm their current exact content before editing (both have evolved across many prior phases).

- [ ] **Step 2: Write `app/weight-edit.tsx`**

Direct port of `WeightEditView.swift`. Precision matches Swift's own `.number.precision(.fractionLength(0...2))` — up to 2 decimal places, trailing zeros dropped.

```typescript
// app/weight-edit.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { resolveColour } from '../src/design/colours';
import { useSession } from '../src/data/useSession';
import { useLoads } from '../src/data/useLoads';

/** Matches Swift's `.number.precision(.fractionLength(0...2))` — up to 2
    decimal places, no trailing zeros (20 -> "20", 20.5 -> "20.5",
    20.25 -> "20.25", 20.256 would round to "20.26" but the +/- step
    values in real program data never produce more than 2 real decimal
    places in practice). */
function formatValue(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

export default function WeightEdit() {
  const router = useRouter();
  const params = useLocalSearchParams<{ exerciseId: string; title: string; step: string; weightKg: string; date: string }>();
  const { session } = useSession();
  const userId = session?.user?.id ?? '';
  const loads = useLoads(userId);

  const step = useMemo(() => Number(params.step) || 2.5, [params.step]);
  const [value, setValue] = useState(() => (params.weightKg ? Number(params.weightKg) : 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await loads.set(params.date, params.exerciseId, value);
      router.back();
    } catch (e: any) {
      setError(`Couldn't save: ${e?.message ?? 'something went wrong'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>CANCEL</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{params.title}</Text>

      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => setValue((v) => v - step)}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Decrease by ${step}kg`}
        >
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <Text style={styles.value}>{formatValue(value)}kg</Text>
        <Pressable
          onPress={() => setValue((v) => v + step)}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Increase by ${step}kg`}
        >
          <Text style={styles.stepperGlyph}>+</Text>
        </Pressable>
      </View>

      {error != null && <Text style={styles.error}>{error}</Text>}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={onSave}
        disabled={saving}
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Save"
      >
        <Text style={styles.saveButtonText}>{saving ? 'SAVING…' : 'SAVE'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  cancel: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  title: { fontSize: 22, fontWeight: '800', color: Colours.fg, marginBottom: 20 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  stepperButton: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: Colours.s2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperGlyph: { fontSize: 28, fontWeight: '700', color: Colours.fg },
  value: { ...Fonts.mono(34, 'bold'), color: Colours.fg, minWidth: 140, textAlign: 'center' },
  error: { fontSize: 12, color: Colours.restC, textAlign: 'center', marginTop: 16 },
  saveButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: resolveColour('--gorse') },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});
```

- [ ] **Step 3: Register the modal route**

In `app/_layout.tsx`, add a second `<Stack.Screen>` entry alongside the existing `(main)/calendar` one:
```tsx
<Stack.Screen name="weight-edit" options={{ presentation: 'modal' }} />
```
(Exact placement: as a sibling of the existing `<Stack.Screen name="(main)/calendar" ...>` line, inside the same `<Stack>`.)

- [ ] **Step 4: Wire `onTapWeight` in `card.tsx`**

Replace whatever `card.tsx` currently does for `onTapWeight` (nothing, per the confirmed gap) with:
```typescript
const onTapWeight = useCallback((ex: RenderedExercise) => {
  router.push({
    pathname: '/weight-edit',
    params: {
      exerciseId: ex.id ?? '',
      title: ex.title,
      step: String(ex.step),
      weightKg: ex.weightKg != null ? String(ex.weightKg) : '',
      date: today,
    },
  });
}, [router, today]);
```
Pass `onTapWeight={onTapWeight}` to `<DailyCard>`. (Adjust exact variable names — `today`, `router` — to match whatever `card.tsx` currently calls them; read the file first per Step 1.)

- [ ] **Step 5: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean, no new tests required (this screen is a real Supabase-backed modal, verified live later, matching the precedent set by `sign-in.tsx`/`quiz.tsx`).

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add app/weight-edit.tsx app/_layout.tsx "app/(main)/card.tsx"
git commit -m "feat(daily-card): weight editing modal"
```

---

## Task 2: Day picker screen

**Files:**
- Create: `deadpoint-rn/app/day-picker.tsx`
- Modify: `deadpoint-rn/app/_layout.tsx` (register the modal route)
- Modify: `deadpoint-rn/app/(main)/card.tsx` (wire `onTapDay`)

**Interfaces:**
- Consumes: `useStore(startDate, today, userId).set(date, type, sub)` and `.clear(date)` (pre-existing, `src/data/useStore.ts`); `useStore(...).get(date)` (to determine whether a CLEAR option should show); the engine facade's `SESSION_ORDER` (`src/engine/index.ts`) and `sessionInfo(key)`/`sessionColourVarName(key)` (already used elsewhere, e.g. `card.tsx` itself).
- Route params: `date` (the day being edited — NOT necessarily today, since this is reached by tapping ANY day in the week strip).

- [ ] **Step 1: Read `app/(main)/card.tsx` in full again** (if not already fresh from Task 1) to confirm the exact `engine`/`store` variable names and how `program`/`startDate`/`today` are currently resolved, so this new screen's own resolution matches exactly (it needs its OWN `useStore`/engine instance, independent of card.tsx's, the same way `app/(main)/calendar.tsx` already does — read that file too for the established pattern of a second screen resolving its own program/store independently).

- [ ] **Step 2: Write `app/day-picker.tsx`**

Direct port of `DayPickerView.swift`. Date label formatting: Swift uses `"EEEE d MMM"` (e.g. "Tuesday 1 Sep") via `en_GB` locale — use `Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })` parsed from the date string at LOCAL NOON (matching this project's own established local-noon-safe date-parsing convention — never `new Date(dateString)` directly, which parses as UTC midnight and can shift a day backward in negative-UTC-offset timezones).

```typescript
// app/day-picker.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useStore } from '../src/data/useStore';
import { useProfile } from '../src/data/useProfile';
import { createEngine, SESSION_ORDER } from '../src/engine';
import { resolveColour } from '../src/design/colours';

const PROGRAMS = require('../src/engine/programs.js');

function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12); // local noon - matches this project's own date-parsing convention
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(dt);
}

export default function DayPicker() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const program = useMemo(() => PROGRAMS[(email ?? '').toLowerCase()] ?? PROGRAMS.default, [email]);
  const profile = useProfile(userId);

  const [today] = useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());
  const startDate = profile.row?.programStartDate ?? program.startDate ?? null;
  const store = useStore(startDate, today, userId);
  const engine = useMemo(() => createEngine(program, { sessionLog: store.days, loadLog: {} }), [program, store.days]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingEntry = store.get(date);

  const onPick = async (key: string) => {
    setBusy(true);
    setError(null);
    try {
      await store.set(date, key);
      router.back();
    } catch (e: any) {
      setError(`Couldn't save: ${e?.message ?? 'something went wrong'}`);
      setBusy(false);
    }
  };

  const onClear = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.clear(date);
      router.back();
    } catch (e: any) {
      setError(`Couldn't clear: ${e?.message ?? 'something went wrong'}`);
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{dateLabel(date)}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {SESSION_ORDER.map((key) => {
          const info = engine.sessionInfo(key);
          if (!info) return null;
          const colour = resolveColour(engine.sessionColourVarName(key));
          return (
            <Pressable
              key={key}
              onPress={() => onPick(key)}
              disabled={busy}
              style={[styles.row, { backgroundColor: Colours.s1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Log ${info.n} for ${dateLabel(date)}`}
            >
              <Text style={[styles.rowTitle, { color: colour }]}>{(info.n ?? '').toUpperCase()}</Text>
              <Text style={[styles.rowSubtitle, { color: colour }]}>{info.w}</Text>
            </Pressable>
          );
        })}

        {existingEntry != null && (
          <Pressable
            onPress={onClear}
            disabled={busy}
            style={[styles.clearButton, busy && styles.clearButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Clear the logged entry for ${dateLabel(date)}`}
          >
            <Text style={styles.clearButtonText}>CLEAR</Text>
          </Pressable>
        )}

        {error != null && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  list: { padding: 20, paddingTop: 0, gap: 10 },
  row: { padding: 14, borderRadius: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { ...Fonts.mono(11, 'medium'), opacity: 0.7, marginTop: 2 },
  clearButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: Colours.s2 },
  clearButtonDisabled: { opacity: 0.6 },
  clearButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.dim },
  error: { fontSize: 12, color: Colours.restC, textAlign: 'center' },
});
```

**Note:** `SESSION_ORDER` and `createEngine` must both be real named exports of `../src/engine` (confirmed: `SESSION_ORDER` is exported from `src/engine/index.ts:10`; `createEngine` is the facade's own default construction function already used identically in `card.tsx`/`calendar.tsx` — confirm the exact import name matches by reading `src/engine/index.ts`'s actual export list before trusting this verbatim).

- [ ] **Step 3: Register the modal route**

In `app/_layout.tsx`:
```tsx
<Stack.Screen name="day-picker" options={{ presentation: 'modal' }} />
```

- [ ] **Step 4: Wire `onTapDay` in `card.tsx`**

Replace the current `onTapDay={() => {}}` with:
```typescript
onTapDay={(date: string) => router.push({ pathname: '/day-picker', params: { date } })}
```
Confirm `WeekDay`'s/`onTapDay`'s real prop signature in `DailyCard.tsx` first — the plan assumes `onTapDay: (date: string) => void`, matching Swift's `WeekStripView.onTapDay: (String) -> Void` and this project's own established WeekDay/`id`-is-the-date convention; adjust if the real prop differs.

- [ ] **Step 5: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add app/day-picker.tsx app/_layout.tsx "app/(main)/card.tsx"
git commit -m "feat(daily-card): day picker modal (backdating/editing a previous day)"
```

---

## Task 3: Live device verification

- [ ] **Step 1:** Fresh `expo run:ios` build (or confirm Fast Refresh has genuinely reloaded by checking the Metro log for a fresh bundle event before trusting any screenshot — this exact mistake cost real time earlier this session).
- [ ] **Step 2:** Tap a weight badge on a real exercise — confirm the weight-edit modal opens with the exercise's real title and current weight, +/- buttons adjust by the real step size, SAVE persists (confirm by dismissing and seeing the updated value on the card), CANCEL discards without saving.
- [ ] **Step 3:** Tap a previous (non-today) day in the week strip — confirm the day-picker modal opens with the real date label, every real session type from the program listed with correct name/colour, tapping one logs it (confirm by dismissing and seeing the week strip's dot update for that day), and CLEAR appears only when that day already has something logged.
- [ ] **Step 4:** Confirm today's own weight badge / day tap still work identically to before (no regression to the existing today-only behavior).

## Self-Review

**Spec coverage:** both confirmed pre-existing gaps (weight badge, day-strip tap) now have real screens wired to the real pre-existing data-layer write methods.

**Placeholder scan:** none — both screens are complete, real implementations, not stubs.

**Type consistency:** both new screens' route params are plain strings (expo-router's own constraint); every consumer parses them explicitly (`Number(...)`, direct string use) rather than assuming a type expo-router doesn't actually guarantee.

# Plan Overview Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Plan" overview screen (tapping the "BASE · WK 4 · DELOAD" phase badge on the daily card, currently `onTapPhaseBadge={() => {}}`, a dead no-op) plus its phase-detail drill-down, porting `ios/CrimpBlock/PlanSheetView.swift` (both `PlanSheetView` and the nested `PhaseDetailView`) line-for-line.

**Architecture:** Two new modal routes, `app/plan.tsx` (the overview) and `app/plan-phase.tsx` (the drill-down, reached by tapping a phase row in `plan.tsx`), following the exact pattern `app/day-picker.tsx`/`app/settings.tsx` already established: independently resolves its own program/profile/store/engine (a screen reached via `router.push` never assumes it shares React state with the screen that pushed it), registered in `app/_layout.tsx` with `presentation: 'modal'`. `plan-phase.tsx` is pushed from `plan.tsx` (not a gate screen, no `dismissAll` concerns — it only ever needs a plain `router.back()` to close, unlike Settings' quiz/tutorial/sign-out paths).

**Tech Stack:** Same as the rest of `deadpoint-rn` — Expo Router, the existing `src/engine` facade (`createEngine`), no new dependencies.

## Global Constraints

- Design tokens (`Colours`, `Fonts`) via those modules only.
- `npx jest` and `npx tsc --noEmit` clean after every task.
- Flat `test(...)` calls, no `describe` blocks.
- Local-noon date parsing convention if any date is touched (`new Date(y, m-1, d, 12)`, never `new Date(dateString)` directly) — not expected to come up in this plan (all dates here are pre-formatted strings passed straight to the engine, same as `card.tsx` already does with `today`).
- Every value/behavior in this plan is taken directly from the real Swift source (`ios/CrimpBlock/PlanSheetView.swift`, `ios/Shared/EngineBridge.swift`) — this is a fidelity port, not a redesign. Match spacing/copy/logic exactly unless a step below says otherwise.

---

## Task 1: Expose `returnInfo`/`phaseRange` and add `phaseChanges` to the engine facade

**Files:**
- Modify: `deadpoint-rn/src/engine/types.ts`
- Modify: `deadpoint-rn/src/engine/index.ts`
- Test: `deadpoint-rn/__tests__/engineFacadePlan.test.ts` (new)

**Interfaces:**
- Consumes: `engine-core.js`'s already-real `e.returnInfo(date)` and `e.phaseRange(index)` (confirmed present in the returned object at `engine-core.js:520-521` — read that file's `returnInfo`/`phaseRange` function bodies, lines ~147 and ~186, to confirm their real return shapes before writing types). `program.sessions`/`program.phases`, already available in `createEngine`'s closure.
- Produces: `ReturnInfo` type, `PhaseChange` type, and three new methods on the object `createEngine(...)` returns: `returnInfo(date: string): ReturnInfo | null`, `phaseRange(index: number): string`, `phaseChanges(phaseName: string): PhaseChange[]`. Task 2/3 consume all three directly off the same `engine` object `card.tsx`/`day-picker.tsx` already construct via `createEngine(program, data)`.

- [ ] **Step 1: Read `engine-core.js`'s real `returnInfo`/`phaseRange` function bodies** (around lines 147 and 186 — confirm exact line numbers, they may have shifted) to get their real return shapes. Cross-check against the Swift source's own contract: `ios/Shared/EngineBridge.swift:263` (`struct ReturnInfo: Codable { let gap: Int; let resumed: String; let session: Int }`) and `:273` (`phaseRange(_ index: Int) -> String`).

- [ ] **Step 2: Add types to `src/engine/types.ts`**

```typescript
export interface ReturnInfo {
  gap: number;
  resumed: string;
  session: number;
}

export interface PhaseChange {
  sessionName: string;
  title: string;
  prescription: string;
}
```

- [ ] **Step 3: Add `returnInfo`/`phaseRange` to `createEngine`'s returned object in `src/engine/index.ts`** (thin wrappers, same pattern as `phaseIndexAt`/`isDeload` already there):

```typescript
returnInfo: (date: string): ReturnInfo | null => e.returnInfo(date),
phaseRange: (index: number): string => e.phaseRange(index),
```

(Add `ReturnInfo, PhaseChange` to the `export type { ... }` line and the `import type { ... }` line at the top of the file.)

- [ ] **Step 4: Add `phaseChanges` as a new pure function + wire it into `createEngine`'s returned object.**

This one is NOT a call into the underlying `e` object — `EngineBridge.swift`'s own `phaseChanges` (`ios/Shared/EngineBridge.swift:298-316`) reads `program` directly, not the engine. Port it faithfully as a plain TS function operating on `program` and the already-exported `SESSION_ORDER`:

```typescript
/** Faithful port of EngineBridge.phaseChanges(_:) — every exercise, across
    every session, that carries a `ph` override for this specific phase
    name, derived from the data rather than written out by hand so it can
    never drift from what resolveEx()/resolveExercises() actually applies. */
function phaseChanges(program: any, phaseName: string): PhaseChange[] {
  const out: PhaseChange[] = [];
  const sessions = program.sessions;
  if (!sessions) return out;
  for (const key of SESSION_ORDER) {
    const session = sessions[key];
    const list = session?.x;
    if (!session || !Array.isArray(list)) continue;
    const sessionName: string = session.n ?? '?';
    for (const ex of list) {
      const override = ex?.ph?.[phaseName];
      if (override == null) continue;
      out.push({ sessionName, title: ex.t ?? '?', prescription: String(override) });
    }
  }
  return out;
}
```

Add to `createEngine`'s returned object: `phaseChanges: (phaseName: string): PhaseChange[] => phaseChanges(program, phaseName),` — note the naming collision between the module-level function and the object property; give the object property the name `phaseChanges` and rename the function itself if TypeScript complains (e.g. `computePhaseChanges`), matching this file's own existing pattern of a private helper (`resolveExercises`) backing a same-named-or-related public method.

- [ ] **Step 5: Write `__tests__/engineFacadePlan.test.ts`**

Flat `test(...)` calls, no `describe`. Use one of the real programs from `src/engine/programs.js` (e.g. `PROGRAMS.default` or `PROGRAMS['oscar@sullivanltd.co.uk']` — check `__tests__/engine-parity.test.ts` for the established pattern of importing/using real program fixtures in this test suite, don't invent a different one). Cover:
- `phaseChanges('Base')` (or whichever phase name a real program's exercises actually override — check `programs.js` for a real `ph:{...}` key to test against, e.g. Oscar's own `osc-pickup-half` exercise has `ph:{'Base':'4 × 8s / hand — lighter', ...}`) returns a non-empty array containing that exact exercise's title/prescription/session name.
- `phaseChanges('SomePhaseNoOverridesReferenceAtAll')` (a phase name no exercise's `ph` object has a key for) returns `[]`.
- `phaseRange`/`returnInfo` are callable and return the expected shape (a smoke test is enough here — the underlying logic already lives in, and is presumably already tested via, `engine-core.js`/`engine-parity.test.ts`; this task is only testing the NEW facade wiring, not re-testing engine-core's own internals).

- [ ] **Step 6: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean, test count only grows.

- [ ] **Step 7: Commit**

```bash
cd deadpoint-rn && git add src/engine/types.ts src/engine/index.ts __tests__/engineFacadePlan.test.ts
git commit -m "feat(engine): expose returnInfo/phaseRange, add phaseChanges"
```

---

## Task 2: `app/plan.tsx` (the overview screen)

**Files:**
- Create: `deadpoint-rn/app/plan.tsx`
- Modify: `deadpoint-rn/app/_layout.tsx`
- Modify: `deadpoint-rn/app/(main)/card.tsx`

**Interfaces:**
- Consumes: Task 1's `returnInfo`/`phaseRange`/`phaseChanges` (only `phaseRange` is actually used directly in THIS task — `phaseChanges` is Task 3's), `engine.block(date)`, `engine.phaseIndexAt(block)`, `engine.phases`, `resolveColour` (`src/design/colours.ts`), `Colours`.
- Produces: nothing another task consumes directly, but Task 3's `plan-phase.tsx` is reached by this screen's own phase-row taps.

- [ ] **Step 1: Read `ios/CrimpBlock/PlanSheetView.swift` in full** (already read this session — re-read now for exact copy/logic fidelity) and `app/day-picker.tsx` in full (the pattern this screen's own program/profile/store/engine resolution and CLOSE-button header follow — this screen needs `profile` for `programStartDate`/`store.days` the same way `card.tsx`/`day-picker.tsx` already resolve them, since `engine.block(today)` needs real session-log data to compute `done`/`total` correctly, not a fresh empty engine).

- [ ] **Step 2: Write `app/plan.tsx`**

Structure, top to bottom, matching Swift's real body order (`PlanSheetView.swift:20-48`):

1. **Header**: title "THE PLAN" (matches this app's all-caps header convention), CLOSE button → `router.back()`. Use `useSafeAreaInsets()` for top/bottom padding, matching every other modal screen.
2. **Overall progress bar** (`overallBar`, `PlanSheetView.swift:64-79`): 6 equal-width horizontal bar segments (one per block), each showing a filled fraction `frac = clamp((block.wIdx - (b-1)*4) / 4, 0, 1)` for block number `b` from 1 to 6, filled colour = the accent of whichever phase's `from <= b` (the LAST phase in `engine.phases` whose `from` is `<= b`, falling back to `--gorse` if none — port the Swift `phases.last(where: { $0.from <= b })` search exactly), track colour `Colours.s2` (unfilled portion), `Colours.s3` for blocks beyond `engine.phases.length`. Height 6, rounded corners 3.
3. **Current phase card** (`currentCard`, `PlanSheetView.swift:81-103`): only rendered if a current phase exists (`engine.phaseIndexAt(block.b)` resolves to a valid index into `engine.phases`). Shows: `"{PHASE NAME UPPERCASE} · {BLOCK N or ONGOING} · WEEK N{ · DELOAD if week 4}"` in the phase's accent colour (mono, bold, 12px), a progress bar (`block.done / max(block.per, 1)`, clamped to 1, height 8, rounded 4, filled = phase accent, track = `Colours.s2`), and `"{done} of {per} sessions into this week · {total} logged since you started"` (mono, 12px, `Colours.faint`). Card background `Colours.s1`, a 3px-wide left accent-colour bar (`overlay(... alignment: .leading)` in Swift — port as an absolutely-positioned or flex-row 3px-wide View), corner radius 8, padding 14.
4. **Static explanatory text** (`PlanSheetView.swift:28-32`): if `block.over`, show the "You've worked through all six blocks..." copy; otherwise the "A week advances when you've banked..." copy — copy both strings VERBATIM from the Swift source, do not paraphrase. 13.5px, `Colours.dim`.
5. **"Coming back" taper card** (`comingBackCard`, `PlanSheetView.swift:105-118`): only rendered if `engine.returnInfo(today)` returns non-null. "COMING BACK" label (mono, bold, 11px, `Colours.dim`), then `"{gap} days off, back since {resumed} — session {session} of 2 in the taper. Weights are cut and volume is trimmed. Normal prescriptions from the session after this."` (13.5px, `Colours.dim`) — copy verbatim, substituting the real `ReturnInfo` fields. Card background `Colours.s1`, corner radius 8, padding 14.
6. **Phase list** (`PlanSheetView.swift:38-45`, `phaseRow` at `:120-138`): every entry in `engine.phases`, each a pressable row: phase name uppercase (15px bold), `"{NOW ·  if isCurrent}{phaseRange(index)}"` (11px mono, 70% opacity) below it, a chevron-right icon on the right (use a plain Unicode `›` character or a simple triangle View — check whether this codebase already has an icon-font/chevron convention anywhere else before inventing a new one; if not, a plain `Text` glyph is fine, matching this project's own established "no icon font" pattern from `ExerciseRow.tsx`'s info icon). Text colour = phase accent if current, else `Colours.dim`. Background `Colours.s1`, corner radius 8, padding 14, opacity 0.75 if not current (1 if current). **On press**: `router.push({ pathname: '/plan-phase', params: { phaseIndex: String(index) } })` (Task 3's screen — pass the index into `engine.phases`, not the whole phase object, since route params must be primitives; Task 3 re-resolves the same `engine.phases[phaseIndex]` from its own independently-constructed engine).

- [ ] **Step 3: Register the route** in `app/_layout.tsx`, following the exact `weight-edit`/`day-picker`/`settings` precedent (not group-qualified, `app/plan.tsx` lives directly under `app/`):

```tsx
<Stack.Screen name="plan" options={{ presentation: 'modal' }} />
```

- [ ] **Step 4: Wire the phase badge** — in `app/(main)/card.tsx`, replace `onTapPhaseBadge={() => {}}` with `onTapPhaseBadge={() => router.push('/plan')}`.

- [ ] **Step 5: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add app/plan.tsx app/_layout.tsx "app/(main)/card.tsx"
git commit -m "feat: build the Plan overview screen, wire the phase badge"
```

---

## Task 3: `app/plan-phase.tsx` (the phase-detail drill-down)

**Files:**
- Create: `deadpoint-rn/app/plan-phase.tsx`
- Modify: `deadpoint-rn/app/_layout.tsx`

**Interfaces:**
- Consumes: Task 1's `phaseChanges`, `engine.phases`, `engine.phaseIndexAt`. Route param `phaseIndex` (string, from Task 2's push).

- [ ] **Step 1: Read `PhaseDetailView` in `ios/CrimpBlock/PlanSheetView.swift:141-200`** in full.

- [ ] **Step 2: Write `app/plan-phase.tsx`**

Independently resolves its own program/profile/store/engine (same pattern as `plan.tsx`/`day-picker.tsx`). Reads `phaseIndex` via `useLocalSearchParams<{ phaseIndex: string }>()`, resolves `const phase = engine.phases[Number(phaseIndex)]` (guard against an out-of-range index — if `phase` is undefined, render nothing meaningful or just close immediately via a `useEffect` calling `router.back()`; check whether any other screen in this codebase already has a "bad param, bail out" precedent to match, e.g. `weight-edit.tsx`, before inventing a new pattern). `isCurrent` = compare against `engine.phaseIndexAt(engine.block(today).b)`.

Structure, top to bottom (`PlanSheetView.swift:153-186`):
1. **Header**: title = the phase's own name (`phase.n`), CLOSE → `router.back()`.
2. **Phase description** (`phase.d`, 14px, `Colours.dim`).
3. **"WHAT CHANGES IN THIS PHASE"** label (11px mono bold, `Colours.faint`).
4. Call `engine.phaseChanges(phase.n)`. If empty, show: *"Sessions run at their standard prescriptions — this is the phase the others are written against."* (13.5px, `Colours.dim`) — copy verbatim. Otherwise, one card per `PhaseChange`: title uppercase (13px semibold) on the left, session name (10px mono, `Colours.faint`) on the right, same row; prescription text below (12px mono, phase's own accent colour). Card background `Colours.s1`, corner radius 8, padding 12.

- [ ] **Step 3: Register the route** in `app/_layout.tsx`, same precedent as the others:

```tsx
<Stack.Screen name="plan-phase" options={{ presentation: 'modal' }} />
```

- [ ] **Step 4: Run `npx tsc --noEmit` and the full `npx jest` suite** — must be clean.

- [ ] **Step 5: Commit**

```bash
cd deadpoint-rn && git add app/plan-phase.tsx app/_layout.tsx
git commit -m "feat: build the phase-detail drill-down screen"
```

---

## Task 4: Live device verification

- [ ] **Step 1:** Fresh Metro reload (iOS Simulator) — pure JS/TS, no native rebuild needed.
- [ ] **Step 2:** Tap the phase badge ("BASE · WK 4 · DELOAD" or equivalent) on the daily card — confirm it opens the Plan screen (it previously did nothing at all).
- [ ] **Step 3:** Confirm the overall progress bar shows 6 segments with a sensible filled fraction, the current phase card shows real numbers matching what's actually logged, and the explanatory paragraph matches whether all 6 blocks are complete or not.
- [ ] **Step 4:** Confirm the "coming back" card appears only if genuinely returning from a real gap in logged sessions (may not be reachable to test live without real gap data — if not reachable, confirm via code reading that the condition is wired correctly, and say so explicitly rather than silently skipping this check).
- [ ] **Step 5:** Tap a phase row — confirm it opens the phase-detail screen with that phase's real name, description, and "what changes" list (or the "standard prescriptions" fallback text if that phase has no `ph` overrides anywhere).
- [ ] **Step 6:** Confirm CLOSE on both screens returns correctly (phase-detail back to plan, plan back to the daily card).

## Self-Review

**Spec coverage:** every visible element of `PlanSheetView`/`PhaseDetailView` (overall bar, current-phase card, explanatory text, coming-back card, phase list, phase-detail drill-down) is covered by a task above, derived from the real Swift source, not guessed.

**Placeholder scan:** no TBD/"add appropriate handling" steps — every code block is complete, real TypeScript against confirmed-real interfaces (`engine-core.js`'s actual `returnInfo`/`phaseRange`, `BlockInfo`'s actual fields, `programs.js`'s actual `ph` override shape).

**Type consistency:** `ReturnInfo`/`PhaseChange` are defined once in Task 1 and are the only shapes Task 2/3 consume — no task assumes a different one.

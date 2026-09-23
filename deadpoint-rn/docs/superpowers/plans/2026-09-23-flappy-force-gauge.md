# Flappy Bird Force-Gauge Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Flappy Bird mode to `app/force-gauge.tsx` — pull the gauge to climb, ease off to fall, dodge scrolling pipe gaps, beat your synced high score.

**Architecture:** Pure physics module (tested) → a wiring hook that decouples a `requestAnimationFrame` loop from the BLE stream's bursty cadence via a trailing-average ref → an SVG + Reanimated rendering component → a toggle on the existing screen. Full design rationale: `docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md`.

**Tech Stack:** React Native, `react-native-svg` (already a dependency), `react-native-reanimated` (already a dependency), Supabase.

## Global Constraints

- Play range is **0–10kg** (`maxKg: 10` in the physics config) — the smoothed reading is clamped to this before it reaches the physics step.
- Smoothing is a **120ms trailing moving average** over `useForceGauge`'s existing `points`, not a heavier filter.
- Visual language is Deadpoint's existing dark/mono/gorse system (`src/design/colours.ts`'s `Colours`/`resolveColour`, `src/design/fonts.ts`'s `Fonts`) — no literal Flappy Bird art (no sky blue, no green pipes, no bird sprite).
- No new npm dependencies — `react-native-svg` and `react-native-reanimated` cover everything.
- The physics module (`flappyPhysics.ts`) is pure: no React, no timers, no `Math.random`. Pipe placement uses a seeded LCG keyed on spawn index so runs are deterministic and testable.
- High score is a single integer column on `profiles`, a ratchet (only ever increases) — no play history, no leaderboard.
- Game mode only renders while `status === 'connected'` in `useForceGauge` — no offline/simulated play.

---

### Task 1: Pure physics (`flappyPhysics.ts`)

**Files:**
- Create: `src/data/forceGauge/flappyPhysics.ts`
- Test: `__tests__/flappyPhysics.test.ts`

**Interfaces:**
- Produces: `BirdState { y: number; vy: number }`, `Pipe { x: number; gapCenterY: number; passed: boolean }`, `GameStatus = 'ready' | 'playing' | 'over'`, `GameState { status, bird, pipes, score, elapsedSec, spawnedCount }`, `PhysicsConfig` (all tuning constants), `DEFAULT_CONFIG: PhysicsConfig`, `initialGameState(config?): GameState`, `startGame(config?): GameState`, `stepGame(state, pulledKg, dtSec, config?): GameState`. Task 3 (`useFlappyBird.ts`) consumes all of these directly.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/flappyPhysics.test.ts`:

```ts
/** flappyPhysics — the pure step function behind the force gauge's
    Flappy Bird mode (see src/data/forceGauge/flappyPhysics.ts and the
    design spec at docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md).
    useFlappyBird.ts (untested wiring, same convention as useForceGauge.ts
    itself) owns smoothing the raw BLE reading and the requestAnimationFrame
    loop; every actual game rule lives here instead, where it can be
    exercised without a live gauge or a running app. */
import {
  DEFAULT_CONFIG,
  startGame,
  stepGame,
  type GameState,
  type Pipe,
} from '../src/data/forceGauge/flappyPhysics';

function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...startGame(DEFAULT_CONFIG), ...overrides };
}

test('zero pull: gravity wins and the bird sinks', () => {
  let state = playing();
  for (let i = 0; i < 30; i++) state = stepGame(state, 0, 1 / 60, DEFAULT_CONFIG);
  expect(state.bird.vy).toBeGreaterThan(0); // increasing y == falling
  expect(state.bird.y).toBeGreaterThan(50); // started at worldHeight/2 == 50
});

test('a sustained hard pull produces a net climb', () => {
  let state = playing();
  for (let i = 0; i < 30; i++) state = stepGame(state, DEFAULT_CONFIG.maxKg, 1 / 60, DEFAULT_CONFIG);
  expect(state.bird.vy).toBeLessThan(0); // decreasing y == climbing
  expect(state.bird.y).toBeLessThan(50);
});

test('a pull below the hover point still slows the fall without reversing it', () => {
  const dt = 1 / 60;
  const noPull = stepGame(playing(), 0, dt, DEFAULT_CONFIG);
  const lightPull = stepGame(playing(), 3, dt, DEFAULT_CONFIG); // well under the ~6.4kg hover point
  expect(lightPull.bird.vy).toBeGreaterThan(0); // still falling...
  expect(lightPull.bird.vy).toBeLessThan(noPull.bird.vy); // ...just less steeply
});

test('hitting the floor ends the game', () => {
  let state = playing();
  for (let i = 0; i < 200 && state.status === 'playing'; i++) {
    state = stepGame(state, 0, 1 / 60, DEFAULT_CONFIG);
  }
  expect(state.status).toBe('over');
});

test('missing a pipe gap ends the game', () => {
  const pipe: Pipe = { x: DEFAULT_CONFIG.birdX, gapCenterY: 90, passed: false }; // gap far below the bird
  const state = playing({ bird: { y: 50, vy: 0 }, pipes: [pipe] });
  const next = stepGame(state, 6.4, 0.001, DEFAULT_CONFIG); // near-zero dt: test overlap, not fall
  expect(next.status).toBe('over');
});

test('flying through a pipe gap does not end the game', () => {
  const pipe: Pipe = { x: DEFAULT_CONFIG.birdX, gapCenterY: 50, passed: false }; // gap centred on the bird
  const state = playing({ bird: { y: 50, vy: 0 }, pipes: [pipe] });
  const next = stepGame(state, 6.4, 0.001, DEFAULT_CONFIG);
  expect(next.status).toBe('playing');
});

test('a passed pipe scores exactly once, not once per overlapping frame', () => {
  const pipe: Pipe = { x: DEFAULT_CONFIG.birdX - DEFAULT_CONFIG.pipeWidth - 0.01, gapCenterY: 50, passed: false };
  let state = playing({ bird: { y: 50, vy: 0 }, pipes: [pipe], score: 0 });
  for (let i = 0; i < 10; i++) state = stepGame(state, 6.4, 0.001, DEFAULT_CONFIG);
  expect(state.score).toBe(1);
});

test('a non-playing state is a frozen no-op', () => {
  const over = { ...playing(), status: 'over' as const };
  expect(stepGame(over, 10, 1 / 60, DEFAULT_CONFIG)).toBe(over); // same reference, not just equal
});

test('pipe placement is deterministic, not random', () => {
  let a = playing();
  let b = playing();
  for (let i = 0; i < 300; i++) {
    a = stepGame(a, 4, 1 / 60, DEFAULT_CONFIG);
    b = stepGame(b, 4, 1 / 60, DEFAULT_CONFIG);
  }
  expect(a.pipes).toEqual(b.pipes);
  expect(a.spawnedCount).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx jest flappyPhysics --verbose`
Expected: FAIL — `Cannot find module '../src/data/forceGauge/flappyPhysics'`

- [ ] **Step 3: Implement `flappyPhysics.ts`**

Create `src/data/forceGauge/flappyPhysics.ts`:

```ts
// src/data/forceGauge/flappyPhysics.ts
/** Pure physics for the force gauge's Flappy Bird mode (design:
    docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md). No
    React, no BLE, no timers, no Math.random — every input is a plain
    argument, so this is fully unit tested (flappyPhysics.test.ts) the
    same way protocol.ts is the tested core beneath the untested
    useForceGauge.ts wiring. The caller (useFlappyBird.ts) owns smoothing
    the raw force reading and the requestAnimationFrame loop; this file
    only turns an already-smoothed kg value into motion. Screen-space
    convention throughout: increasing y is DOWN (matches SVG), so
    "climbing" means vy going negative. */

export interface BirdState {
  y: number;
  vy: number;
}

export interface Pipe {
  x: number;
  gapCenterY: number;
  passed: boolean;
}

export type GameStatus = 'ready' | 'playing' | 'over';

export interface GameState {
  status: GameStatus;
  bird: BirdState;
  pipes: Pipe[];
  score: number;
  elapsedSec: number;
  /** Total pipes ever spawned this run, including ones already dropped
      off-screen — pipes.length alone can't drive spawn timing since it
      shrinks as pipes leave the world. Spawning compares this against
      floor(elapsedSec / pipeSpacingSec) each frame: a pure function of
      elapsed time, so it can't drift or double-spawn regardless of
      frame rate. */
  spawnedCount: number;
}

export interface PhysicsConfig {
  gravity: number;        // logical units / s²
  thrustPerKg: number;    // logical units / s² per kg of smoothed pull
  maxKg: number;          // pulls above this clamp, they don't help further
  worldWidth: number;     // logical width; pipes spawn just past this edge
  worldHeight: number;    // logical height
  pipeGapHeight: number;  // logical units
  pipeSpeed: number;      // logical units / s, leftward
  pipeSpacingSec: number; // seconds between pipe spawns
  birdX: number;          // fixed logical x of the bird (pipes move, bird doesn't)
  birdRadius: number;
  pipeWidth: number;
}

export const DEFAULT_CONFIG: PhysicsConfig = {
  gravity: 90,
  thrustPerKg: 14, // at ~6.4kg, thrust ≈ gravity → roughly hovers
  maxKg: 10,
  worldWidth: 100,
  worldHeight: 100,
  pipeGapHeight: 32,
  pipeSpeed: 28,
  pipeSpacingSec: 1.8,
  birdX: 20,
  birdRadius: 3.2,
  pipeWidth: 10,
};

export function initialGameState(config: PhysicsConfig = DEFAULT_CONFIG): GameState {
  return {
    status: 'ready',
    bird: { y: config.worldHeight / 2, vy: 0 },
    pipes: [],
    score: 0,
    elapsedSec: 0,
    spawnedCount: 0,
  };
}

export function startGame(config: PhysicsConfig = DEFAULT_CONFIG): GameState {
  return { ...initialGameState(config), status: 'playing' };
}

/** Deterministic pseudo-random gap placement, keyed on the pipe's own
    spawn index rather than wall-clock time or Math.random — the same
    spawnIndex always produces the same gapCenterY, so a run is
    reproducible and tests can assert exact placement. A standard 32-bit
    LCG (Numerical Recipes constants), mapped to a fraction in [0, 1). */
function pipeGapFraction(spawnIndex: number): number {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  const seed = (a * (spawnIndex + 1) + c) % m;
  return seed / m;
}

function gapCenterFor(spawnIndex: number, config: PhysicsConfig): number {
  const margin = config.pipeGapHeight / 2 + 6; // keeps the gap off the very top/bottom
  const usable = config.worldHeight - margin * 2;
  return margin + pipeGapFraction(spawnIndex) * usable;
}

function collides(bird: BirdState, pipes: Pipe[], config: PhysicsConfig): boolean {
  if (bird.y - config.birdRadius < 0 || bird.y + config.birdRadius > config.worldHeight) return true;
  const birdLeft = config.birdX - config.birdRadius;
  const birdRight = config.birdX + config.birdRadius;
  for (const pipe of pipes) {
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + config.pipeWidth;
    if (birdRight < pipeLeft || birdLeft > pipeRight) continue; // no x-overlap
    const gapTop = pipe.gapCenterY - config.pipeGapHeight / 2;
    const gapBottom = pipe.gapCenterY + config.pipeGapHeight / 2;
    if (bird.y - config.birdRadius < gapTop || bird.y + config.birdRadius > gapBottom) return true;
  }
  return false;
}

/** One frame. `pulledKg` is the caller's already-smoothed reading —
    this clamps it to [0, config.maxKg] itself, but does no smoothing of
    its own; it only turns a force value into motion. A no-op when
    `status !== 'playing'`: the caller still renders the returned state,
    it just stops evolving (a frozen last frame for 'ready'/'over'). */
export function stepGame(state: GameState, pulledKg: number, dtSec: number, config: PhysicsConfig = DEFAULT_CONFIG): GameState {
  if (state.status !== 'playing') return state;

  const clampedKg = Math.min(config.maxKg, Math.max(0, pulledKg));
  const elapsedSec = state.elapsedSec + dtSec;
  const vy = state.bird.vy + (config.gravity - clampedKg * config.thrustPerKg) * dtSec;
  const y = state.bird.y + vy * dtSec;
  const bird: BirdState = { y, vy };

  let pipes = state.pipes
    .map((p) => ({ ...p, x: p.x - config.pipeSpeed * dtSec }))
    .filter((p) => p.x > -config.pipeWidth);

  let spawnedCount = state.spawnedCount;
  const due = Math.floor(elapsedSec / config.pipeSpacingSec);
  while (spawnedCount < due) {
    pipes = [...pipes, {
      x: config.worldWidth + config.pipeWidth,
      gapCenterY: gapCenterFor(spawnedCount, config),
      passed: false,
    }];
    spawnedCount += 1;
  }

  let score = state.score;
  pipes = pipes.map((p) => {
    if (!p.passed && p.x + config.pipeWidth < config.birdX) {
      score += 1;
      return { ...p, passed: true };
    }
    return p;
  });

  const status: GameStatus = collides(bird, pipes, config) ? 'over' : 'playing';

  return { status, bird, pipes, score, elapsedSec, spawnedCount };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx jest flappyPhysics --verbose`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/forceGauge/flappyPhysics.ts __tests__/flappyPhysics.test.ts
git commit -m "Flappy Bird: pure physics (flappyPhysics.ts)

Gravity-vs-thrust motion, deterministic (LCG-seeded) pipe placement,
collision, and scoring — no React, no BLE, no Math.random, fully unit
tested. Design: docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md."
```

---

### Task 2: High score on `profiles` (`useProfile.ts` + `SUPABASE.md`)

**Files:**
- Modify: `src/data/useProfile.ts`
- Modify: `SUPABASE.md` (worktree root, one level above `deadpoint-rn/`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProfileRow.flappyHighScore: number`, `useProfile(...).setFlappyHighScore(score: number): Promise<void>`. Task 5 (`app/force-gauge.tsx`) reads `profile.row?.flappyHighScore` and calls `profile.setFlappyHighScore`.

- [ ] **Step 1: Add the field to `ProfileRow`**

In `src/data/useProfile.ts`, in the `ProfileRow` interface, immediately after the existing `referredBy: string | null;` field (around line 31), add:

```ts
  /** Force-gauge Flappy Bird mode's best score — a ratchet, not a lock
      (see setFlappyHighScore below): only ever increases. 0 for an
      account that's never played, same as every other profile field
      that reads as a plain default rather than null (see the migration
      in SUPABASE.md). */
  flappyHighScore: number;
```

- [ ] **Step 2: Add the column to `ProfileDbRow`, `fromDbRow`, and `PROFILE_COLUMNS`**

In the `ProfileDbRow` interface, after `referred_by: string | null;`, add:

```ts
  flappy_high_score: number;
```

In `fromDbRow`, after `referredBy: r.referred_by,`, add:

```ts
    flappyHighScore: r.flappy_high_score,
```

Change the `PROFILE_COLUMNS` constant from:

```ts
const PROFILE_COLUMNS =
  'assigned_template_id,program_start_date,modifiers,tier,quiz_completed_at,tutorial_completed_at,track_type,rehab_injury_area,rehab_phase_index,referred_by';
```

to:

```ts
const PROFILE_COLUMNS =
  'assigned_template_id,program_start_date,modifiers,tier,quiz_completed_at,tutorial_completed_at,track_type,rehab_injury_area,rehab_phase_index,referred_by,flappy_high_score';
```

- [ ] **Step 3: Fix the one non-spread `ProfileRow` literal (`assignRehab`'s new-row branch)**

`assignRehab` builds a fresh `ProfileRow` object literal (not a spread) when there's no existing row. Find:

```ts
            trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex,
            // This branch only runs when `existing` is already falsy (the
            // ternary's other branch spreads it), so there is no prior row
            // to have carried a referral from — always null here.
            referredBy: null,
          },
```

Replace with:

```ts
            trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex,
            // This branch only runs when `existing` is already falsy (the
            // ternary's other branch spreads it), so there is no prior row
            // to have carried a referral or a high score from — both
            // start at their real defaults here.
            referredBy: null,
            flappyHighScore: 0,
          },
```

(The other `ProfileRow`-shaped site, `create()`'s optimistic write around `referredBy: referredBy ?? prevRow?.referredBy ?? null,`, is untouched by this task — Task 5 doesn't need `create()` to know about high scores, and `stepGame`/`setFlappyHighScore` never touch it either. Leave it be; TypeScript will only complain about a literal genuinely missing a required field, and this one already gets `flappyHighScore` from nowhere — check by running `tsc` in Step 6 below, and if it DOES complain, add `flappyHighScore: prevRow?.flappyHighScore ?? 0,` there too, matching the existing `referredBy` line's own fallback shape.)

- [ ] **Step 4: Add the `setFlappyHighScore` writer**

Immediately after the existing `setReferredBy` function (after its closing `}, [row, userId]);` and before the final `return { ... }` statement), add:

```ts
  /** Force gauge's Flappy Bird mode. A ratchet: only writes when the new
      score beats what's stored, so a lower score from a later, worse
      round can never overwrite a real best. PATCH, same as every other
      single-field profile write in this file. */
  const setFlappyHighScore = useCallback(async (score: number) => {
    if (score <= (row?.flappyHighScore ?? 0)) return;
    const { error } = await supabase.from('profiles').update({ flappy_high_score: score }).eq('user_id', userId);
    if (error) throw error;
    setState((s) => (s.status === 'ready' && s.forUserId === userId && s.row
      ? { ...s, row: { ...s.row, flappyHighScore: score } }
      : s));
  }, [row, userId]);
```

- [ ] **Step 5: Add it to the returned object**

Change:

```ts
  return { row, loaded, isLoading, hasError, reload, create, assignRehab, switchToStandard, advanceRehabPhase, updatePreferences, markTutorialCompleted, setReferredBy };
```

to:

```ts
  return { row, loaded, isLoading, hasError, reload, create, assignRehab, switchToStandard, advanceRehabPhase, updatePreferences, markTutorialCompleted, setReferredBy, setFlappyHighScore };
```

- [ ] **Step 6: Typecheck and run the existing suite**

Run: `npx tsc --noEmit`
Expected: no errors (if `create()`'s optimistic-write literal errors on a missing `flappyHighScore`, apply the fallback noted in Step 3 and re-run).

Run: `npx jest`
Expected: all existing suites still pass (this task adds no new test file — `useProfile.ts` has no direct unit tests today, same convention as `useForceGauge.ts`).

- [ ] **Step 7: Document the migration in `SUPABASE.md`**

In `SUPABASE.md` (the worktree root, one level above `deadpoint-rn/` — confirm with `git rev-parse --show-toplevel` if unsure which file this is), add a new section after the existing "## Referral codes (2026-09-22)" section:

```markdown
## Flappy Bird high score (2026-09-23)

```sql
alter table public.profiles add column if not exists flappy_high_score integer not null default 0;
```
```

(Paste this SQL into Supabase's SQL Editor yourself — there's no DDL-execution path available via the REST API with the service-role key, only reads/writes to existing tables/rows. Nothing in this task depends on the column existing yet; `setFlappyHighScore` simply won't find anywhere to write to as a real user until you've run it, same as the referral-codes column before it.)

- [ ] **Step 8: Commit**

```bash
git add src/data/useProfile.ts ../SUPABASE.md
git commit -m "Flappy Bird: sync high score to profiles.flappy_high_score

A ratchet (setFlappyHighScore only writes when the new score beats the
stored one), same wiring shape as setReferredBy. Migration documented
in SUPABASE.md for manual application — no DDL-execution path exists
here."
```

---

### Task 3: Wiring hook (`useFlappyBird.ts`)

**Files:**
- Create: `src/data/forceGauge/useFlappyBird.ts`

**Interfaces:**
- Consumes: `GraphPoint` from `./useForceGauge` (`{ tSec: number; kg: number }`); `DEFAULT_CONFIG`, `initialGameState`, `startGame`, `stepGame`, `GameState`, `PhysicsConfig` from `./flappyPhysics` (Task 1).
- Produces: `useFlappyBird(points: GraphPoint[], active: boolean, config?: PhysicsConfig): { state: GameState; start: () => void }`. Task 4 (`FlappyBirdGame.tsx`) consumes this directly.

- [ ] **Step 1: Implement the hook**

Create `src/data/forceGauge/useFlappyBird.ts`:

```ts
// src/data/forceGauge/useFlappyBird.ts
/** Wiring for the force gauge's Flappy Bird mode — the requestAnimationFrame
    loop and the trailing-average smoothing live here; every actual game
    rule lives in the tested, dependency-free flappyPhysics.ts. Not unit
    tested directly, same reasoning as useForceGauge.ts itself: a live RAF
    loop isn't something Jest exercises meaningfully. See the design spec
    (docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md) for
    why the loop is decoupled from the BLE stream's own bursty cadence. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphPoint } from './useForceGauge';
import {
  DEFAULT_CONFIG,
  initialGameState,
  startGame,
  stepGame,
  type GameState,
  type PhysicsConfig,
} from './flappyPhysics';

// Short enough to feel responsive, long enough to sand off per-notification
// jitter — the first thing to retune if it ever feels twitchy or laggy.
const SMOOTH_WINDOW_SEC = 0.12;

function smoothedKg(points: GraphPoint[], maxKg: number): number {
  if (points.length === 0) return 0;
  const latestT = points[points.length - 1].tSec;
  const cutoff = latestT - SMOOTH_WINDOW_SEC;
  let sum = 0;
  let count = 0;
  for (let i = points.length - 1; i >= 0 && points[i].tSec >= cutoff; i--) {
    sum += points[i].kg;
    count += 1;
  }
  const avg = count > 0 ? sum / count : 0;
  return Math.min(maxKg, Math.max(0, avg));
}

export function useFlappyBird(points: GraphPoint[], active: boolean, config: PhysicsConfig = DEFAULT_CONFIG) {
  const [state, setState] = useState<GameState>(() => initialGameState(config));

  // Bypasses React's render cycle on purpose: the RAF loop below reads
  // this every frame, and a ref can never be stale the way a value
  // captured in the loop's own closure would be.
  const forceRef = useRef(0);
  useEffect(() => {
    forceRef.current = smoothedKg(points, config.maxKg);
  }, [points, config.maxKg]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dtSec = Math.min(0.05, (now - last) / 1000); // clamps a stalled tab/background gap
      last = now;
      setState((s) => stepGame(s, forceRef.current, dtSec, config));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, config]);

  const start = useCallback(() => setState(startGame(config)), [config]);

  return { state, start };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/forceGauge/useFlappyBird.ts
git commit -m "Flappy Bird: RAF loop + trailing-average smoothing (useFlappyBird.ts)

Reads useForceGauge's existing points history into a ref via a 120ms
trailing average, then runs its own requestAnimationFrame loop stepping
flappyPhysics — decoupled from the BLE stream's own bursty notification
timing, so frame pacing stays smooth regardless of radio jitter."
```

---

### Task 4: Rendering (`FlappyBirdGame.tsx`)

**Files:**
- Create: `src/components/force-gauge/FlappyBirdGame.tsx`

**Interfaces:**
- Consumes: `GraphPoint` from `../../data/forceGauge/useForceGauge`; `useFlappyBird` (Task 3); `DEFAULT_CONFIG` from `../../data/forceGauge/flappyPhysics` (Task 1); `Colours`, `resolveColour` from `../../design/colours`; `Fonts` from `../../design/fonts`.
- Produces: `FlappyBirdGame` component, props `{ points: GraphPoint[]; highScore: number; onNewHighScore: (score: number) => void; onExit: () => void }`. Task 5 (`app/force-gauge.tsx`) mounts this directly.

- [ ] **Step 1: Implement the component**

Create `src/components/force-gauge/FlappyBirdGame.tsx`:

```tsx
// src/components/force-gauge/FlappyBirdGame.tsx
/** The force gauge's Flappy Bird mode — pull the gauge to climb, ease off
    to fall, dodge scrolling pipe gaps. Mounted by app/force-gauge.tsx in
    place of the live stat/graph/action rows while a round is in progress.
    Design: docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md. */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colours, resolveColour } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { GraphPoint } from '../../data/forceGauge/useForceGauge';
import { useFlappyBird } from '../../data/forceGauge/useFlappyBird';
import { DEFAULT_CONFIG } from '../../data/forceGauge/flappyPhysics';

const ACCENT = resolveColour('--gorse');

interface Props {
  points: GraphPoint[];
  highScore: number;
  onNewHighScore: (score: number) => void;
  onExit: () => void;
}

export function FlappyBirdGame({ points, highScore, onNewHighScore, onExit }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // false while 'ready' or 'over', true only while a round is actually
  // in progress — useFlappyBird's RAF loop runs only when this is true.
  const [running, setRunning] = useState(false);
  const { state, start } = useFlappyBird(points, running);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (state.status === 'over' && !reportedRef.current) {
      reportedRef.current = true;
      setRunning(false);
      if (state.score > highScore) onNewHighScore(state.score);
    }
    if (state.status === 'playing') reportedRef.current = false;
  }, [state.status, state.score, highScore, onNewHighScore]);

  const handlePress = () => {
    if (state.status !== 'playing') { start(); setRunning(true); }
  };

  const isNewHighScore = state.status === 'over' && state.score > highScore && state.score > 0;
  const displayHighScore = Math.max(highScore, state.score);

  const overOpacity = useSharedValue(0);
  const overScale = useSharedValue(0.9);
  useEffect(() => {
    if (state.status === 'over') {
      overOpacity.value = withTiming(1, { duration: 200 });
      overScale.value = withSpring(1, { damping: 14 });
    } else {
      overOpacity.value = 0;
      overScale.value = 0.9;
    }
  }, [state.status, overOpacity, overScale]);
  const overStyle = useAnimatedStyle(() => ({
    opacity: overOpacity.value,
    transform: [{ scale: overScale.value }],
  }));

  const readyOpacity = useSharedValue(1);
  useEffect(() => {
    readyOpacity.value = withTiming(state.status === 'ready' ? 1 : 0, { duration: 200 });
  }, [state.status, readyOpacity]);
  const readyStyle = useAnimatedStyle(() => ({ opacity: readyOpacity.value }));

  const scoreScale = useSharedValue(1);
  const lastScoreRef = useRef(0);
  useEffect(() => {
    if (state.score > lastScoreRef.current) {
      lastScoreRef.current = state.score;
      scoreScale.value = withSpring(1.25, { damping: 6 }, () => {
        scoreScale.value = withSpring(1);
      });
    }
    if (state.status === 'ready') lastScoreRef.current = 0;
  }, [state.score, state.status, scoreScale]);
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: scoreScale.value }] }));

  const flashOpacity = useSharedValue(0);
  const flashedRef = useRef(false);
  useEffect(() => {
    if (state.status === 'over' && !flashedRef.current) {
      flashedRef.current = true;
      flashOpacity.value = 0.35;
      flashOpacity.value = withTiming(0, { duration: 350 });
    }
    if (state.status !== 'over') flashedRef.current = false;
  }, [state.status, flashOpacity]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  const { width, height } = size;
  const scaleX = width / DEFAULT_CONFIG.worldWidth;
  const scaleY = height / DEFAULT_CONFIG.worldHeight;
  const px = (x: number) => x * scaleX;
  const py = (y: number) => y * scaleY;

  // Nose up while climbing (vy < 0), nose down while falling — clamped
  // so a hard collision doesn't spin it past a readable angle.
  const tilt = Math.max(-30, Math.min(50, state.bird.vy * 2.2));
  const birdCx = px(DEFAULT_CONFIG.birdX);
  const birdCy = py(state.bird.y);
  const birdR = px(DEFAULT_CONFIG.birdRadius);

  return (
    <Pressable
      style={styles.root}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={state.status === 'playing' ? 'Playing' : 'Tap to start'}
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>SCORE</Text>
        <Pressable onPress={onExit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Exit game">
          <Text style={styles.exit}>EXIT</Text>
        </Pressable>
      </View>

      <View
        style={styles.playArea}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {width > 0 && height > 0 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="flappyBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colours.bg} />
                <Stop offset="1" stopColor={Colours.s1} />
              </LinearGradient>
              <RadialGradient id="flappyBird" cx="35%" cy="35%" r="65%">
                <Stop offset="0" stopColor={ACCENT} stopOpacity={1} />
                <Stop offset="1" stopColor={ACCENT} stopOpacity={0.55} />
              </RadialGradient>
            </Defs>

            <Rect x={0} y={0} width={width} height={height} fill="url(#flappyBg)" />
            <Rect x={0} y={0} width={width} height={2} fill={Colours.s4} />
            <Rect x={0} y={height - 2} width={width} height={2} fill={Colours.s4} />

            {state.pipes.map((pipe, i) => {
              const gapTop = pipe.gapCenterY - DEFAULT_CONFIG.pipeGapHeight / 2;
              const gapBottom = pipe.gapCenterY + DEFAULT_CONFIG.pipeGapHeight / 2;
              return (
                <React.Fragment key={i}>
                  <Rect x={px(pipe.x)} y={0} width={px(DEFAULT_CONFIG.pipeWidth)} height={py(gapTop)} rx={6} fill={Colours.s3} />
                  <Rect x={px(pipe.x)} y={py(gapBottom)} width={px(DEFAULT_CONFIG.pipeWidth)} height={height - py(gapBottom)} rx={6} fill={Colours.s3} />
                </React.Fragment>
              );
            })}

            <G transform={`rotate(${tilt} ${birdCx} ${birdCy})`}>
              <Circle cx={birdCx} cy={birdCy} r={birdR} fill="url(#flappyBird)" />
              <Path
                d={`M ${birdCx + birdR * 0.9} ${birdCy - birdR * 0.35} L ${birdCx + birdR * 1.6} ${birdCy} L ${birdCx + birdR * 0.9} ${birdCy + birdR * 0.35} Z`}
                fill={ACCENT}
              />
            </G>
          </Svg>
        )}

        <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />

        <Animated.View style={[styles.centerPanel, readyStyle]} pointerEvents="none">
          <Text style={styles.readyText}>PULL TO START</Text>
        </Animated.View>

        <Animated.View style={[styles.centerPanel, overStyle]} pointerEvents="none">
          <Text style={styles.overTitle}>GAME OVER</Text>
          <Text style={styles.overScore}>{state.score}</Text>
          <Text style={[styles.overHighScore, isNewHighScore && { color: Colours.go }]}>
            {isNewHighScore ? 'NEW HIGH SCORE' : `BEST ${displayHighScore}`}
          </Text>
          <Text style={styles.overHint}>TAP TO PLAY AGAIN</Text>
        </Animated.View>
      </View>

      <Animated.Text style={[styles.scoreValue, scoreStyle]}>{state.score}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLabel: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1 },
  exit: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  playArea: { flex: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: Colours.bg },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: Colours.restC },
  centerPanel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6 },
  readyText: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
  overTitle: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
  overScore: { ...Fonts.timerDigits(48), color: ACCENT },
  overHighScore: { ...Fonts.mono(12, 'bold'), color: Colours.dim, letterSpacing: 0.6 },
  overHint: { ...Fonts.mono(10, 'medium'), color: Colours.faint, marginTop: 8 },
  scoreValue: { ...Fonts.timerDigits(28), color: Colours.fg, textAlign: 'center', marginTop: 10 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/force-gauge/FlappyBirdGame.tsx
git commit -m "Flappy Bird: SVG scene + Reanimated polish (FlappyBirdGame.tsx)

Bird tilts with velocity (a small beak Path on a rotated G, since a
plain circle has no visible orientation), soft radial-gradient fill,
rounded pipes, a subtle background gradient, spring-pop on score, a
green pulse on a new high score, and a brief red flash on death — all
from react-native-svg/react-native-reanimated, both already
dependencies. No new libraries."
```

---

### Task 5: Screen integration (`app/force-gauge.tsx`)

**Files:**
- Modify: `app/force-gauge.tsx`

**Interfaces:**
- Consumes: `useSession` from `../src/data/useSession` (for `session?.user?.id`); `useProfile` from `../src/data/useProfile` (Task 2's `row.flappyHighScore` / `setFlappyHighScore`); `FlappyBirdGame` from `../src/components/force-gauge/FlappyBirdGame` (Task 4).

- [ ] **Step 1: Add the new imports**

At the top of `app/force-gauge.tsx`, after the existing `import { ... } from '../src/data/forceGauge/useForceGauge';` block, add:

```ts
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { FlappyBirdGame } from '../src/components/force-gauge/FlappyBirdGame';
```

- [ ] **Step 2: Wire up session/profile and a `playing` toggle**

In the `ForceGauge` component, change:

```ts
export default function ForceGauge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, errorMessage, devices, deviceName, current, peak, points, taring, scan, connect, reset, tare } = useForceGauge();
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
```

to:

```ts
export default function ForceGauge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, errorMessage, devices, deviceName, current, peak, points, taring, scan, connect, reset, tare } = useForceGauge();
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const { session } = useSession();
  const profile = useProfile(session?.user?.id ?? '');
  // Leaving the live graph to play (and back) shouldn't disconnect the
  // gauge — this is purely a display-mode toggle, same connection.
  const [playing, setPlaying] = useState(false);
```

- [ ] **Step 3: Swap in the game when playing, add the PLAY entry point**

Find the `isLive` block:

```tsx
      {isLive ? (
        <>
          <View style={styles.statRow}>
            <Stat label="CURRENT" kg={current} colour={Colours.fg} />
            <Stat label="PEAK" kg={peak} colour={ACCENT} />
          </View>

          <View style={styles.graphCard}>
            <View style={styles.graphCaptionRow}>
              <Text style={styles.graphCaption}>KG</Text>
              <Text style={styles.graphCaption}>LAST {GRAPH_WINDOW_SEC} SEC</Text>
            </View>
            <View
              style={styles.graphArea}
              onLayout={(e) => setGraphSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
              {graphSize.height > 0 && <ForceGraph points={points} peak={peak} width={graphSize.width} height={graphSize.height} />}
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={tare}
              disabled={taring}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Tare"
              accessibilityHint="Zeroes the gauge. Take your hands off it first."
              accessibilityState={{ disabled: taring, busy: taring }}
            >
              <Text style={[styles.actionText, taring && styles.actionTextBusy]}>{taring ? 'ZEROING…' : 'TARE'}</Text>
            </Pressable>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Reset"
              accessibilityHint="Clears the peak and the graph."
            >
              <Text style={styles.actionText}>RESET</Text>
            </Pressable>
          </View>
        </>
      ) : (
```

Replace with:

```tsx
      {isLive ? (
        playing ? (
          <FlappyBirdGame
            points={points}
            highScore={profile.row?.flappyHighScore ?? 0}
            onNewHighScore={(score) => {
              profile.setFlappyHighScore(score).catch((e) => console.error('setFlappyHighScore failed:', e));
            }}
            onExit={() => setPlaying(false)}
          />
        ) : (
          <>
            <View style={styles.statRow}>
              <Stat label="CURRENT" kg={current} colour={Colours.fg} />
              <Stat label="PEAK" kg={peak} colour={ACCENT} />
            </View>

            <View style={styles.graphCard}>
              <View style={styles.graphCaptionRow}>
                <Text style={styles.graphCaption}>KG</Text>
                <Text style={styles.graphCaption}>LAST {GRAPH_WINDOW_SEC} SEC</Text>
              </View>
              <View
                style={styles.graphArea}
                onLayout={(e) => setGraphSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
              >
                {graphSize.height > 0 && <ForceGraph points={points} peak={peak} width={graphSize.width} height={graphSize.height} />}
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={tare}
                disabled={taring}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Tare"
                accessibilityHint="Zeroes the gauge. Take your hands off it first."
                accessibilityState={{ disabled: taring, busy: taring }}
              >
                <Text style={[styles.actionText, taring && styles.actionTextBusy]}>{taring ? 'ZEROING…' : 'TARE'}</Text>
              </Pressable>
              <Pressable
                onPress={reset}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Reset"
                accessibilityHint="Clears the peak and the graph."
              >
                <Text style={styles.actionText}>RESET</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setPlaying(true)}
              style={styles.scanButton}
              accessibilityRole="button"
              accessibilityLabel="Play Flappy Bird"
            >
              <Text style={styles.scanButtonText}>PLAY FLAPPY BIRD</Text>
            </Pressable>
          </>
        )
      ) : (
```

(Reuses the existing `scanButton`/`scanButtonText` styles — already a solid accent-filled pill button, no new styles needed.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: all suites pass (this task adds no new tests — `app/force-gauge.tsx` has none today, same as before).

- [ ] **Step 6: Commit**

```bash
git add app/force-gauge.tsx
git commit -m "Flappy Bird: PLAY toggle on the force-gauge screen

Swaps the live graph for FlappyBirdGame in place, same BLE connection
— no new route, no reconnect required to get back to the plain live
view. Wires the account's synced high score through."
```

---

### Task 6: Manual verification (device required — not simulator-testable)

BLE needs real hardware; the iOS Simulator cannot connect to a real peripheral, so this task is a checklist for Oscar on his phone, not something automatable from here.

- [ ] Build and run on a real device (existing release/dev workflow — see `deadpoint-ios-archive-workflow` for the release path, or a normal Metro dev build for a quick check).
- [ ] Connect to the real force gauge as usual.
- [ ] Confirm **PLAY FLAPPY BIRD** appears next to Tare/Reset once connected.
- [ ] Tap it, confirm the "PULL TO START" panel shows, tap/pull to start.
- [ ] Pull gently — bird should sink slowly, not reverse. Pull hard — bird should climb. Release — bird falls under gravity.
- [ ] Confirm it feels smooth, not twitchy — if it's still jittery, raise `SMOOTH_WINDOW_SEC` in `useFlappyBird.ts` (currently 0.12); if it feels laggy/unresponsive, lower it.
- [ ] Fly through a few pipes, confirm score increments once per pipe, not repeatedly.
- [ ] Deliberately hit a pipe or the floor/ceiling, confirm GAME OVER shows with the right score.
- [ ] Beat your previous best, confirm "NEW HIGH SCORE" shows in green.
- [ ] Force-quit and reopen the app, reconnect, confirm the high score persisted (synced via Supabase).
- [ ] Tap EXIT mid-round and from the game-over screen, confirm it returns cleanly to the live graph, gauge still connected (not disconnected/re-scanning).
- [ ] If anything about the feel needs retuning (hover point, gravity, pipe gap/speed), the constants are all in `DEFAULT_CONFIG` in `src/data/forceGauge/flappyPhysics.ts` — one file, no other changes needed.

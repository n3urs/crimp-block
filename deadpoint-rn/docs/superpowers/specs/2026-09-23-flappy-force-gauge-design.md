# Flappy Bird Force-Gauge Mode — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task, once superpowers:writing-plans has turned this design into one.

**Goal:** Turn a live force-gauge connection into a playable Flappy Bird variant — pull the gauge to climb, ease off to fall through scrolling pipe gaps — without leaving the existing force-gauge screen.

**Origin:** Oscar, verbatim: *"pulling on the force gauge makes it go up and releasing on it makes it go down just like in flappy bird... we need some sort of smoothing, but not too much. Maybe just like averaging out what we're currently doing."* Confirmed in review: 0–10kg play range, Deadpoint's own dark/gorse look (not a literal Flappy Bird skin), high score synced to the account, and — this round — "nice animations, super simple, make it look polished."

## Global Constraints

- Play range is **0–10kg** — the full force reading is clamped to this before it ever reaches the physics step.
- Smoothing is a **trailing moving average**, not a heavier filter (Kalman, exponential, etc.) — matches Oscar's own "just like averaging out" framing.
- Visual language is Deadpoint's existing dark/mono/gorse system (`src/design/colours.ts`, `Fonts.mono`) — no Flappy-Bird-specific art (no sky blue, no green pipes, no bird sprite).
- Animation reuses **react-native-reanimated**, already a dependency and already used elsewhere in this codebase (`LoggedStamp.tsx`, `RestTimerOverlay.tsx`) — no new animation library.
- The moment-to-moment bird/pipe positions are driven by a plain `requestAnimationFrame` loop updating React state, rendered via `react-native-svg` — the same technique `ForceGraph` in `app/force-gauge.tsx` already uses for its live trace. Reanimated is for the discrete UI transitions layered on top (state-change fades/pops), not for the physics loop itself.
- Game mode only exists while a gauge is connected (`status === 'connected'`) — no offline/simulated play.
- High score is a single integer per account, written to Supabase — no play history, no leaderboard (YAGNI unless asked).

---

## Architecture

Three layers, matching this codebase's established pure/wiring split (`referralCode.ts` + `useProfile.ts`'s `setReferredBy`, `holdRepeat.ts` + `StepperButton.tsx`):

1. **Pure physics** (`src/data/forceGauge/flappyPhysics.ts`) — no React, no BLE, no timers. Takes a game state, a smoothed force reading, and a time delta; returns the next game state. Fully unit tested.
2. **Wiring hook** (`src/data/forceGauge/useFlappyBird.ts`) — owns the `requestAnimationFrame` loop, reads `useForceGauge`'s existing `points` to compute the trailing average each frame, calls into the pure step function, and exposes plain state for rendering. Not unit tested directly (same reasoning as `useForceGauge` itself — a live RAF loop isn't something Jest exercises meaningfully), but every decision it makes lives in the tested pure module.
3. **Rendering** (`src/components/force-gauge/FlappyBirdGame.tsx`) — SVG scene (bird, pipes, ground, score, ready/game-over panels) plus the Reanimated polish layer. Mounted by `app/force-gauge.tsx` in place of the live stat/graph/action rows when game mode is toggled on.

```
useForceGauge (existing)          useFlappyBird (new)              FlappyBirdGame (new)
  points[] ───────────────────▶  trailing-average ref  ──┐
                                  RAF loop ────────────────┼─▶  flappyPhysics.stepGame()  ──▶  GameState ──▶  SVG + Reanimated
  tare() ──────────────────────▶  (exposed passthrough)  ─┘
```

### Why decouple the loop from the BLE stream

BLE notifications arrive in irregular bursts (the gauge batches ~320 SPS into whatever-sized packets the radio link gives it), so driving the game directly off `onNotification` would make frame pacing exactly as jittery as the radio link. Instead:

- A `useEffect` keyed on `points` recomputes a trailing average (window: **120ms**, tunable) into a ref every time new samples land — cheap, just a slice + reduce over `points` (already capped to a 20s window, so this is never a large array).
- A separate `useEffect` (started when the game is `active`) runs its own `requestAnimationFrame` loop, ticking at true display refresh rate regardless of when the last BLE packet arrived. Each tick reads the ref (never stale — refs bypass React's render cycle) and steps the physics by real elapsed `dt`.

This is the same shape as `condition-based-waiting` generally recommends: decouple the thing you're polling from the thing driving your loop's cadence.

---

## Physics (`flappyPhysics.ts`)

All physics runs in a fixed **logical coordinate space** (100×100 units by default — `config.worldWidth`/`worldHeight`), so the pure module never needs to know the screen's actual pixel size. `FlappyBirdGame.tsx` maps logical → pixel the same way `ForceGraph`'s `x()`/`y()` helpers already do, independently on each axis (the logical space doesn't need to match the screen's aspect ratio).

```ts
export interface BirdState { y: number; vy: number }
export interface Pipe { x: number; gapCenterY: number; passed: boolean }
export type GameStatus = 'ready' | 'playing' | 'over';
export interface GameState {
  status: GameStatus;
  bird: BirdState;
  pipes: Pipe[];
  score: number;
  elapsedSec: number;
  /** Total pipes ever spawned this run, including ones already dropped
      off-screen — `pipes.length` alone can't drive spawn timing because
      it shrinks as pipes leave the world. Spawning compares this against
      `floor(elapsedSec / pipeSpacingSec)` each frame: a pure function of
      elapsed time, so it can't drift or double-spawn regardless of frame
      rate. */
  spawnedCount: number;
}

export interface PhysicsConfig {
  gravity: number;        // logical units / s²
  thrustPerKg: number;    // logical units / s² per kg of smoothed pull
  maxKg: number;          // 10 — pulls above this clamp, they don't help further
  worldWidth: number;     // logical width; pipes spawn just past this edge
  worldHeight: number;    // logical height (== WORLD_HEIGHT above)
  pipeGapHeight: number;  // logical units
  pipeSpeed: number;      // logical units / s, leftward
  pipeSpacingSec: number; // seconds between pipe spawns at current speed
  birdX: number;          // fixed logical x of the bird (pipes move, bird doesn't)
  birdRadius: number;
  pipeWidth: number;
}

export const DEFAULT_CONFIG: PhysicsConfig = {
  gravity: 90,
  thrustPerKg: 14,       // at ~6.4kg, thrust ≈ gravity → roughly hovers
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

export function initialGameState(): GameState;

/** One frame. `pulledKg` is the CALLER's already-smoothed, already-clamped
    (0..config.maxKg) reading — this function does no smoothing of its own,
    it only turns a force value into motion. Pure: no Date.now(), no
    randomness beyond a seeded/deterministic pipe-gap placement so tests
    are reproducible (see below). */
export function stepGame(state: GameState, pulledKg: number, dtSec: number, config: PhysicsConfig): GameState;

/** Starts a fresh run. */
export function startGame(state: GameState): GameState;
```

**Rules `stepGame` implements:**

- If `status !== 'playing'`, return `state` unchanged (a frozen frame for `'ready'`/`'over'` — the caller still renders it, it just stops evolving).
- `elapsedSec += dtSec`.
- `vy += (pulledKg * config.thrustPerKg - config.gravity) * dtSec; y += vy * dtSec` (screen-space: increasing `y` is *down*, matching SVG's own coordinate convention, so "climbing" decreases `y`).
- Pipes: existing pipes' `x -= config.pipeSpeed * dtSec`, then drop any with `x < -pipeWidth`.
- **Spawning**: let `due = Math.floor(elapsedSec / pipeSpacingSec)`. While `spawnedCount < due`: append a new pipe at `x = worldWidth + pipeWidth` with a deterministic `gapCenterY` (a seeded LCG keyed on `spawnedCount`, not `Math.random()`, so a test can assert exact placement for a given run), and increment `spawnedCount`. Comparing against elapsed time (not "time since last spawn") means spawning is a pure function of `elapsedSec` — frame-rate hiccups can never drift or double-spawn it.
- **Collision** → `status = 'over'`: bird's `y` outside `[0, worldHeight]` (hit ceiling/floor), OR bird's x-span `[birdX - birdRadius, birdX + birdRadius]` overlaps a pipe's x-span `[pipe.x, pipe.x + pipeWidth]` while bird's `y` is outside that pipe's `[gapCenterY - pipeGapHeight/2, gapCenterY + pipeGapHeight/2]`.
- **Scoring**: a pipe whose right edge (`pipe.x + pipeWidth`) has just crossed `birdX` and isn't yet `passed` → `passed = true`, `score += 1`.

This is the one file with real branching logic worth isolating and testing — everything else in this feature is wiring or rendering.

---

## Smoothing (in `useFlappyBird.ts`)

```ts
const SMOOTH_WINDOW_SEC = 0.12;

function smoothedKg(points: GraphPoint[], maxKg: number): number {
  if (points.length === 0) return 0;
  const latestT = points[points.length - 1].tSec;
  const windowed = points.filter((p) => p.tSec >= latestT - SMOOTH_WINDOW_SEC);
  const avg = windowed.reduce((sum, p) => sum + p.kg, 0) / windowed.length;
  return Math.min(maxKg, Math.max(0, avg));
}
```

Reuses `useForceGauge`'s existing `points` (already floored at 0 by the hook's own tare-noise clamp) — no change to `useForceGauge.ts` itself. 120ms is short enough to feel responsive, long enough to smooth out per-notification jitter; called out as the first thing to tune if it still feels twitchy or laggy once Oscar's tried it.

---

## Polish — "nice, simple, polished"

Kept deliberately small: a handful of cheap, well-placed touches rather than a particle system.

- **Bird tilt**: SVG `rotate` on the bird derived straight from `vy` (already computed, free) — clamped to roughly −30°…+50°, nose up climbing, nose down falling. The single highest-value "juice" touch in the original game.
- **Bird fill**: a small radial gradient (gorse → transparent edge), same `<Defs><LinearGradient>` technique `ForceGraph` already uses for `traceFill`, just radial — a soft glowing dot instead of a flat circle.
- **Pipes**: rounded rects (small `rx`), not hard-edged — a one-attribute change that reads as considerably more designed.
- **Background**: a subtle vertical gradient between `Colours.bg` and `Colours.s1` instead of a flat fill — matches the depth the rest of the app already has via its surface tokens (`s1`–`s4`).
- **Ground/ceiling**: thin `Colours.s4` lines bounding the play area — functional (shows the kill-zone) and tidy.
- **State transitions** (Reanimated, `useAnimatedStyle` + `withTiming`/`withSpring`, same API `LoggedStamp.tsx` already uses):
  - `'ready'` panel ("PULL TO START") fades in on mount, fades out the frame `status` flips to `'playing'`.
  - `'over'` panel fades + scales in (`withSpring`) over the frozen final frame.
  - Score number does a quick `withSpring` scale-pop each time it increments.
  - New high score: the high-score line switches to `Colours.go` and does one gentle pulse — reuses the palette's existing "positive" colour rather than inventing a new one.
- Collision flash: a single-frame `Colours.restC` tint over the play area on the transition into `'over'`, faded out immediately via `withTiming` — cheap "you died" feedback without a sound/haptic system.

No new dependencies for any of this — `react-native-svg` and `react-native-reanimated` are both already in `package.json`.

---

## Screen integration (`app/force-gauge.tsx`)

- New local state: `const [playing, setPlaying] = useState(false)`.
- When `isLive && !playing`: existing stat/graph rows, plus a new "PLAY" button in `actionRow` alongside Tare/Reset.
- When `isLive && playing`: render `<FlappyBirdGame points={points} tare={tare} onExit={() => setPlaying(false)} />` instead of the stat/graph/action rows. Header (title/close) stays as-is — leaving the screen still disconnects, same as today.
- `FlappyBirdGame` owns its own "EXIT" control (back to the live view) separate from the screen's top-right "CLOSE" (which disconnects entirely) — playing a round shouldn't require re-scanning/reconnecting to check the plain live trace afterward.

---

## High score (Supabase)

Same shape as `referredBy`, minus the one-way-door — this is a ratchet, not a lock:

- **Schema** (documented in `SUPABASE.md` for Oscar to run, per this project's convention — no DDL-execution path is available to me):
  ```sql
  alter table public.profiles add column if not exists flappy_high_score integer not null default 0;
  ```
- `useProfile.ts`: add `flappyHighScore: number` to `ProfileRow`/`ProfileDbRow`, wire it through `fromDbRow`, add `flappy_high_score` to `PROFILE_COLUMNS`.
- New writer, mirroring `setReferredBy`'s wiring but with a one-line ratchet instead of `normaliseReferralCode`'s one-way-door check (trivial enough — a single `>` comparison — that it doesn't warrant its own pure module; inlined here, matching this file's existing precedent of small guard clauses living directly in the wiring functions):
  ```ts
  const setFlappyHighScore = useCallback(async (score: number) => {
    if (score <= (row?.flappyHighScore ?? 0)) return;
    const { error } = await supabase.from('profiles').update({ flappy_high_score: score }).eq('user_id', userId);
    if (error) throw error;
    setState((s) => s.status === 'ready' ? { ...s, row: { ...s.row, flappyHighScore: score } } : s);
  }, [row, userId]);
  ```
- `FlappyBirdGame` (or `useFlappyBird`) calls `profile.setFlappyHighScore(finalScore)` the moment `status` transitions to `'over'`, if `finalScore > flappyHighScore` — fire-and-forget with a swallowed/logged error (same pattern as this codebase's other best-effort writes), never blocking the game-over UI on the network round trip.
- A signed-in-but-no-profile-row account (never did the quiz — e.g. a built-in demo account) has no `flappyHighScore` to read; treat missing as `0`, same as every other optional profile field already does.

---

## Files

- **Create:** `src/data/forceGauge/flappyPhysics.ts` — pure physics.
- **Create:** `__tests__/flappyPhysics.test.ts` — unit tests for the above.
- **Create:** `src/data/forceGauge/useFlappyBird.ts` — RAF loop + smoothing + wiring.
- **Create:** `src/components/force-gauge/FlappyBirdGame.tsx` — SVG scene + Reanimated polish + Supabase high-score write.
- **Modify:** `app/force-gauge.tsx` — PLAY toggle, mount `FlappyBirdGame` when playing.
- **Modify:** `src/data/useProfile.ts` — `flappyHighScore` field + `setFlappyHighScore` writer.
- **Modify:** `SUPABASE.md` (worktree root) — new migration section, same convention as the 2026-09-22 referral-codes entry.

## Testing

- `flappyPhysics.test.ts` covers: gravity-only descent over time; sufficient sustained pull produces net climb; a pull below the hover point still slows descent without reversing it; collision when the bird's y leaves `[0, worldHeight]`; collision when a pipe's gap is missed; no collision when a pipe's gap is hit; score increments exactly once per pipe passed (not once per frame while overlapping); frozen state (`stepGame` is a no-op) when `status !== 'playing'`; deterministic pipe placement and spawn timing given the same `dtSec` sequence (seeded generator keyed on `spawnedCount`, not `Math.random` or wall-clock time).
- No new tests for `useFlappyBird.ts` or `FlappyBirdGame.tsx` — matches this codebase's existing line for BLE/RAF/render-only code (`useForceGauge.ts` itself has none either); verified live on-device/simulator instead.
- Manual verification: connect a real gauge (or the simulator, if a mocked BLE peripheral is available — otherwise on Oscar's phone), play a round, confirm smoothing feels neither jittery nor laggy, confirm a new high score persists across a reconnect.

// src/data/forceGauge/flappyPhysics.ts
/** Pure physics for the force gauge's Flappy Bird mode (design:
    docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md). No
    React, no BLE, no timers, no Math.random — every input is a plain
    argument, so this is fully unit tested (flappyPhysics.test.ts) the
    same way protocol.ts is the tested core beneath the untested
    useForceGauge.ts wiring. The caller (useFlappyBird.ts) owns smoothing
    the raw force reading, the requestAnimationFrame loop, and the pull-
    to-(re)start gating; this file only turns an already-smoothed kg
    value into motion. Screen-space convention throughout: increasing y
    is DOWN (matches SVG), so "climbing" means vy going negative. */

export interface BirdState {
  y: number;
  vy: number;
}

export interface Pipe {
  x: number;
  gapCenterY: number;
  /** This pipe's own gap size, fixed at spawn time — difficulty (see
      pipeGapHeightForScore below) changes the gap for NEW pipes only,
      so an already-on-screen pipe's collision box can't retroactively
      change under you. Rendering reads this too, so what's drawn always
      matches what you actually collide with. */
  gapHeight: number;
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
      shrinks as pipes leave the world. Also seeds gapCenterForSpawnIndex,
      so it has to keep counting even though nextSpawnAtSec (below) is
      what actually decides timing now. */
  spawnedCount: number;
  /** When (in elapsedSec terms) the next pipe should appear. Spacing
      itself varies with score (see pipeSpacingForScore), so — unlike a
      constant spacing — "next spawn" can't be recovered from elapsedSec
      alone each frame; it has to be carried forward as its own piece of
      state, advanced by whatever the CURRENT difficulty's spacing is
      each time a pipe actually spawns. */
  nextSpawnAtSec: number;
  /** This run's random seed, folded into gapCenterForSpawnIndex's hash
      alongside spawnIndex so different runs land on different pipe
      layouts — chosen once by startGame's caller and fixed for the
      whole run. See startGame's own doc comment for why it isn't
      generated here. */
  runSeed: number;
}

export interface PhysicsConfig {
  gravity: number;        // logical units / s²
  thrustPerKg: number;    // logical units / s² per kg of smoothed pull
  maxKg: number;          // pulls above this clamp, they don't help further
  worldWidth: number;     // logical width; pipes spawn just past this edge
  worldHeight: number;    // logical height
  pipeGapHeight: number;  // logical units — the BASE gap; see pipeGapHeightForScore
  pipeSpeed: number;      // logical units / s, leftward
  pipeSpacingSec: number; // seconds between pipe spawns — the BASE spacing; see pipeSpacingForScore
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

// Difficulty ramp — Oscar's own framing: "space out the pipes...a little
// bit [at first]. But then as you progress, the pipes can get closer
// together to make it harder." Spacing starts wide (an easy warm-up) and
// tightens down to the config's own base spacing by SPACING_RAMP_SCORE,
// then holds steady — the base spacing IS the target difficulty, not a
// floor to keep shrinking past.
const SPACING_RAMP_SCORE = 15;
const SPACING_START_MULTIPLIER = 1.4;

export function pipeSpacingForScore(score: number, config: PhysicsConfig = DEFAULT_CONFIG): number {
  const t = Math.min(1, Math.max(0, score) / SPACING_RAMP_SCORE);
  const startSpacing = config.pipeSpacingSec * SPACING_START_MULTIPLIER;
  return startSpacing + (config.pipeSpacingSec - startSpacing) * t;
}

// "And then if you get really far, make the gaps between the pipes
// closer. But that's not until you get to like 30 points." — a second,
// later difficulty spike on top of the spacing squeeze above: the gap
// itself stays at the full base size through the whole early-to-mid
// game, only tightening from GAP_TIGHTEN_START_SCORE, and never past a
// floor (GAP_MIN_FRACTION) so it stays physically possible.
const GAP_TIGHTEN_START_SCORE = 30;
const GAP_TIGHTEN_FULL_SCORE = 60;
const GAP_MIN_FRACTION = 0.7;

export function pipeGapHeightForScore(score: number, config: PhysicsConfig = DEFAULT_CONFIG): number {
  if (score < GAP_TIGHTEN_START_SCORE) return config.pipeGapHeight;
  const t = Math.min(1, (score - GAP_TIGHTEN_START_SCORE) / (GAP_TIGHTEN_FULL_SCORE - GAP_TIGHTEN_START_SCORE));
  return config.pipeGapHeight * (1 - (1 - GAP_MIN_FRACTION) * t);
}

export function initialGameState(config: PhysicsConfig = DEFAULT_CONFIG, runSeed: number = 0): GameState {
  return {
    status: 'ready',
    bird: { y: config.worldHeight / 2, vy: 0 },
    pipes: [],
    score: 0,
    elapsedSec: 0,
    spawnedCount: 0,
    nextSpawnAtSec: pipeSpacingForScore(0, config),
    runSeed,
  };
}

/** `runSeed` is the ONE piece of real randomness anywhere in this
    feature, and deliberately isn't generated here — this file stays a
    pure function of its inputs, same as everywhere else in it. The
    caller (useFlappyBird.ts, the one place allowed to be
    non-deterministic) rolls a fresh random seed each time it starts a
    round and passes it in; omit it (as every existing test does) and
    you get the same reproducible layout every time, which is exactly
    what made a real bug possible here — see gapCenterForSpawnIndex. */
export function startGame(config: PhysicsConfig = DEFAULT_CONFIG, runSeed: number = 0): GameState {
  return { ...initialGameState(config, runSeed), status: 'playing' };
}

/** Deterministic pseudo-random gap placement, keyed on the pipe's spawn
    index WITHIN this run and the run's own seed — the same (spawnIndex,
    runSeed) pair always produces the same gapCenterY (reproducible,
    testable), but two different runSeeds scramble to completely
    different layouts. `gapHeight` is the SPECIFIC gap size this one
    pipe was given (see pipeGapHeightForScore) — margin has to shrink
    along with a tighter gap, or a late-game small gap could still get
    placed hard against the very top/bottom edge.

    Real bug this once had: an earlier version hashed spawnIndex ALONE,
    with no seed at all. spawnedCount always restarts at 0 each run, so
    every run replayed the identical sequence of gaps — Oscar's own
    report: "the pipes aren't changing between deaths." Folding runSeed
    in before hashing is the fix; the hash itself (see below) was
    already fine.

    NOT a textbook LCG (an even earlier version here was, and that was
    a DIFFERENT bug — a plain `seed = (a * x + c) % m` barely moves for
    small sequential x: with x running 0, 1, 2, 3..., `a * x` stays tiny
    next to the modulus for a LONG time, so the output only crawls, and
    every real pipe in a single session landed at nearly the same
    height. This is a 32-bit integer mix (Murmur3's own finalizer,
    `fmix32`) instead — built specifically to avalanche even between
    adjacent/related integers, whether that's consecutive spawn indices
    or two seeds a stone's throw apart. */
export function gapCenterForSpawnIndex(spawnIndex: number, runSeed: number, gapHeight: number, config: PhysicsConfig = DEFAULT_CONFIG): number {
  let x = (spawnIndex ^ runSeed) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  const fraction = x / 0x100000000; // [0, 1)
  const margin = gapHeight / 2 + 6; // keeps the gap off the very top/bottom
  const usable = config.worldHeight - margin * 2;
  return margin + fraction * usable;
}

function collides(bird: BirdState, pipes: Pipe[], config: PhysicsConfig): boolean {
  if (bird.y - config.birdRadius < 0 || bird.y + config.birdRadius > config.worldHeight) return true;
  const birdLeft = config.birdX - config.birdRadius;
  const birdRight = config.birdX + config.birdRadius;
  for (const pipe of pipes) {
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + config.pipeWidth;
    if (birdRight < pipeLeft || birdLeft > pipeRight) continue; // no x-overlap
    const gapTop = pipe.gapCenterY - pipe.gapHeight / 2;
    const gapBottom = pipe.gapCenterY + pipe.gapHeight / 2;
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
  let nextSpawnAtSec = state.nextSpawnAtSec;
  while (elapsedSec >= nextSpawnAtSec) {
    const gapHeight = pipeGapHeightForScore(state.score, config);
    pipes = [...pipes, {
      x: config.worldWidth + config.pipeWidth,
      gapCenterY: gapCenterForSpawnIndex(spawnedCount, state.runSeed, gapHeight, config),
      gapHeight,
      passed: false,
    }];
    spawnedCount += 1;
    nextSpawnAtSec += pipeSpacingForScore(state.score, config);
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

  return { status, bird, pipes, score, elapsedSec, spawnedCount, nextSpawnAtSec, runSeed: state.runSeed };
}

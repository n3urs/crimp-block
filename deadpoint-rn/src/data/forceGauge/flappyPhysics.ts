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
    reproducible and tests can assert exact placement.

    NOT a textbook LCG (an earlier version here was, and that was the
    bug — a plain `seed = (a * x + c) % m` barely moves for small
    sequential x: with x running 0, 1, 2, 3..., `a * x` stays tiny next
    to the modulus for a LONG time, so the output only crawls, and every
    real pipe in a session landed at nearly the same height. This is a
    32-bit integer mix (Murmur3's own finalizer, `fmix32`) instead —
    built specifically to avalanche even between adjacent integers, so
    consecutive spawn indices land nowhere near each other. */
export function gapCenterForSpawnIndex(spawnIndex: number, config: PhysicsConfig = DEFAULT_CONFIG): number {
  let x = spawnIndex | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  const fraction = x / 0x100000000; // [0, 1)
  const margin = config.pipeGapHeight / 2 + 6; // keeps the gap off the very top/bottom
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
      gapCenterY: gapCenterForSpawnIndex(spawnedCount, config),
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

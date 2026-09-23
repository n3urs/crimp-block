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
  // Pull near the hover point (~6.4kg) so the bird stays roughly level
  // long enough for a pipe to actually spawn (pipeSpacingSec is 1.8s) —
  // a lower pull would crash it into the floor first, before either run
  // ever reaches a spawn to compare.
  let a = playing();
  let b = playing();
  for (let i = 0; i < 300; i++) {
    a = stepGame(a, 6.43, 1 / 60, DEFAULT_CONFIG);
    b = stepGame(b, 6.43, 1 / 60, DEFAULT_CONFIG);
  }
  expect(a.pipes).toEqual(b.pipes);
  expect(a.spawnedCount).toBeGreaterThan(0);
});

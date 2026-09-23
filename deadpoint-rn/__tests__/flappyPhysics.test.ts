/** flappyPhysics — the pure step function behind the force gauge's
    Flappy Bird mode (see src/data/forceGauge/flappyPhysics.ts and the
    design spec at docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md).
    useFlappyBird.ts (untested wiring, same convention as useForceGauge.ts
    itself) owns smoothing the raw BLE reading, the requestAnimationFrame
    loop, and the pull-to-(re)start gating; every actual game rule lives
    here instead, where it can be exercised without a live gauge or a
    running app. */
import {
  DEFAULT_CONFIG,
  gapCenterForSpawnIndex,
  pipeGapHeightForScore,
  pipeSpacingForScore,
  startGame,
  stepGame,
  type GameState,
  type Pipe,
} from '../src/data/forceGauge/flappyPhysics';

function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...startGame(DEFAULT_CONFIG), ...overrides };
}

function pipeAt(x: number, gapCenterY: number, overrides: Partial<Pipe> = {}): Pipe {
  return { x, gapCenterY, gapHeight: DEFAULT_CONFIG.pipeGapHeight, passed: false, ...overrides };
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
  const pipe = pipeAt(DEFAULT_CONFIG.birdX, 90); // gap far below the bird
  const state = playing({ bird: { y: 50, vy: 0 }, pipes: [pipe] });
  const next = stepGame(state, 6.4, 0.001, DEFAULT_CONFIG); // near-zero dt: test overlap, not fall
  expect(next.status).toBe('over');
});

test('flying through a pipe gap does not end the game', () => {
  const pipe = pipeAt(DEFAULT_CONFIG.birdX, 50); // gap centred on the bird
  const state = playing({ bird: { y: 50, vy: 0 }, pipes: [pipe] });
  const next = stepGame(state, 6.4, 0.001, DEFAULT_CONFIG);
  expect(next.status).toBe('playing');
});

test('a smaller late-game gap still ends the game if missed, even when the base gap would have been safe', () => {
  // A pipe placed with a TIGHTENED gap (as pipeGapHeightForScore gives
  // past score 30) — the bird sits just past that smaller gap's edge,
  // which the ORIGINAL base gap would have comfortably covered. Proves
  // collision reads the pipe's own stored gapHeight, not the config's
  // static one.
  const tightGap = DEFAULT_CONFIG.pipeGapHeight * 0.7; // the floor pipeGapHeightForScore ramps to
  const pipe = pipeAt(DEFAULT_CONFIG.birdX, 50, { gapHeight: tightGap });
  const justOutside = 50 + tightGap / 2 + DEFAULT_CONFIG.birdRadius + 1;
  const state = playing({ bird: { y: justOutside, vy: 0 }, pipes: [pipe] });
  const next = stepGame(state, 6.4, 0.001, DEFAULT_CONFIG);
  expect(next.status).toBe('over');
});

test('a passed pipe scores exactly once, not once per overlapping frame', () => {
  const pipe = pipeAt(DEFAULT_CONFIG.birdX - DEFAULT_CONFIG.pipeWidth - 0.01, 50);
  let state = playing({ bird: { y: 50, vy: 0 }, pipes: [pipe], score: 0 });
  for (let i = 0; i < 10; i++) state = stepGame(state, 6.4, 0.001, DEFAULT_CONFIG);
  expect(state.score).toBe(1);
});

test('a non-playing state is a frozen no-op', () => {
  const over = { ...playing(), status: 'over' as const };
  expect(stepGame(over, 10, 1 / 60, DEFAULT_CONFIG)).toBe(over); // same reference, not just equal
});

test('consecutive pipes land at genuinely different heights, not nearly the same one', () => {
  // Regression test for a real bug: an earlier "LCG" barely moved for
  // small sequential spawn indices, so every real pipe in a session
  // landed within a hair of the same height (Oscar's own report:
  // "you can just sit at the same height and go forever"). A handful
  // of consecutive gaps should span a real chunk of the usable range,
  // not cluster in a sliver of it.
  const centers = Array.from({ length: 8 }, (_, i) => gapCenterForSpawnIndex(i, 42, DEFAULT_CONFIG.pipeGapHeight, DEFAULT_CONFIG));
  const spread = Math.max(...centers) - Math.min(...centers);
  const margin = DEFAULT_CONFIG.pipeGapHeight / 2 + 6;
  const usableRange = DEFAULT_CONFIG.worldHeight - margin * 2;
  expect(spread).toBeGreaterThan(usableRange * 0.5);
});

test('two different runs land on genuinely different pipe layouts', () => {
  // Regression test for a real bug: gap placement was keyed ONLY on
  // spawnIndex, which always restarts at 0 every run — so every run
  // replayed the identical sequence of gaps (Oscar's own report: "the
  // pipes aren't changing between deaths"). Same spawn index, two
  // different run seeds, should land nowhere near each other.
  const seedA = gapCenterForSpawnIndex(0, 111, DEFAULT_CONFIG.pipeGapHeight, DEFAULT_CONFIG);
  const seedB = gapCenterForSpawnIndex(0, 999, DEFAULT_CONFIG.pipeGapHeight, DEFAULT_CONFIG);
  const margin = DEFAULT_CONFIG.pipeGapHeight / 2 + 6;
  const usableRange = DEFAULT_CONFIG.worldHeight - margin * 2;
  expect(Math.abs(seedA - seedB)).toBeGreaterThan(usableRange * 0.2);
});

test('the same run seed still reproduces the exact same layout', () => {
  // The flip side of the above — within one run (one seed), placement
  // must stay exactly reproducible, or the earlier "deterministic, not
  // random" and "consecutive pipes differ" tests would be meaningless.
  const first = gapCenterForSpawnIndex(3, 555, DEFAULT_CONFIG.pipeGapHeight, DEFAULT_CONFIG);
  const second = gapCenterForSpawnIndex(3, 555, DEFAULT_CONFIG.pipeGapHeight, DEFAULT_CONFIG);
  expect(first).toBe(second);
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

test('a real run with a different seed spawns a different first pipe', () => {
  // End-to-end companion to the "different runs land on different
  // layouts" test above — this exercises stepGame's actual spawn call,
  // not just gapCenterForSpawnIndex in isolation, so it would have
  // caught the real bug even if the wiring between state.runSeed and
  // the spawn call itself had been wrong.
  let a = startGame(DEFAULT_CONFIG, 111);
  let b = startGame(DEFAULT_CONFIG, 999);
  for (let i = 0; i < 300 && (a.pipes.length === 0 || b.pipes.length === 0); i++) {
    a = stepGame(a, 6.43, 1 / 60, DEFAULT_CONFIG);
    b = stepGame(b, 6.43, 1 / 60, DEFAULT_CONFIG);
  }
  expect(a.pipes[0].gapCenterY).not.toBe(b.pipes[0].gapCenterY);
});

test('pipe spacing starts wider than base and tightens to it as score climbs', () => {
  const start = pipeSpacingForScore(0, DEFAULT_CONFIG);
  const mid = pipeSpacingForScore(7, DEFAULT_CONFIG);
  const ramped = pipeSpacingForScore(15, DEFAULT_CONFIG);
  const beyond = pipeSpacingForScore(50, DEFAULT_CONFIG);
  expect(start).toBeGreaterThan(DEFAULT_CONFIG.pipeSpacingSec);
  expect(mid).toBeLessThan(start);
  expect(mid).toBeGreaterThan(ramped);
  expect(ramped).toBeCloseTo(DEFAULT_CONFIG.pipeSpacingSec, 5);
  expect(beyond).toBeCloseTo(DEFAULT_CONFIG.pipeSpacingSec, 5); // holds, doesn't keep shrinking
});

test('pipe gap stays full size until score 30, then tightens toward a floor', () => {
  expect(pipeGapHeightForScore(0, DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.pipeGapHeight);
  expect(pipeGapHeightForScore(29, DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.pipeGapHeight);
  const atForty = pipeGapHeightForScore(40, DEFAULT_CONFIG);
  const atSixty = pipeGapHeightForScore(60, DEFAULT_CONFIG);
  const atHundred = pipeGapHeightForScore(100, DEFAULT_CONFIG);
  expect(atForty).toBeLessThan(DEFAULT_CONFIG.pipeGapHeight);
  expect(atSixty).toBeLessThan(atForty);
  expect(atSixty).toBeCloseTo(DEFAULT_CONFIG.pipeGapHeight * 0.7, 5); // the floor
  expect(atHundred).toBeCloseTo(atSixty, 5); // holds at the floor, never fully closes
});

test('a real run actually spawns tighter-spaced, smaller-gap pipes once the score climbs', () => {
  // End-to-end check that stepGame's spawn loop actually USES the two
  // difficulty functions above, not just that the functions themselves
  // work in isolation. Hover (no net climb/fall) so the run survives
  // long enough, and starts already past score 30 so gap-tightening is
  // active from the first spawn too.
  let state = playing({ score: 35 });
  const gapsSeen: number[] = [];
  const spawnTimes: number[] = [];
  let lastPipeCount = 0;
  for (let i = 0; i < 600; i++) {
    state = stepGame(state, 6.43, 1 / 60, DEFAULT_CONFIG);
    if (state.pipes.length > lastPipeCount) {
      const newest = state.pipes[state.pipes.length - 1];
      gapsSeen.push(newest.gapHeight);
      spawnTimes.push(state.elapsedSec);
    }
    lastPipeCount = state.pipes.length;
  }
  expect(gapsSeen.length).toBeGreaterThan(1);
  for (const g of gapsSeen) expect(g).toBeLessThan(DEFAULT_CONFIG.pipeGapHeight);
  const firstSpacing = spawnTimes[1] - spawnTimes[0];
  expect(firstSpacing).toBeCloseTo(DEFAULT_CONFIG.pipeSpacingSec, 1); // already ramped past score 15
});

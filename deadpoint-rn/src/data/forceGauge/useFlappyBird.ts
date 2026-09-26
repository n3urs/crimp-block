// src/data/forceGauge/useFlappyBird.ts
/** Wiring for the force gauge's Flappy Bird mode — the requestAnimationFrame
    loop, the trailing-average smoothing, and the pull-to-(re)start gating
    all live here; every actual game rule lives in the tested, dependency-
    free flappyPhysics.ts. Not unit tested directly, same reasoning as
    useForceGauge.ts itself: a live RAF loop isn't something Jest exercises
    meaningfully. See the design spec
    (docs/superpowers/specs/2026-09-23-flappy-force-gauge-design.md) for
    why the loop is decoupled from the BLE stream's own bursty cadence. */
import { useEffect, useRef, useState } from 'react';
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

// A deliberate pull, not resting slack in the line — low enough to start
// immediately, high enough that the gauge's own noise floor (already
// clamped to 0 in useForceGauge, but a real hand at rest never sits at
// a dead zero) can't false-start a round on its own.
const START_PULL_KG = 1.5;
// Must drop to (or below) this before a pull is allowed to start a round
// again — see the "armed" gating below. Deliberately well under
// START_PULL_KG so there's a real gap between "let go" and "pulling
// again", not one twitchy threshold.
const RELEASE_KG = 0.5;

/** Trailing average over the last SMOOTH_WINDOW_SEC, clamped to [0, maxKg].
    Shared with the Launch game (useLaunchGame.ts). */
export function smoothedKg(points: GraphPoint[], maxKg: number): number {
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

export function useFlappyBird(points: GraphPoint[], config: PhysicsConfig = DEFAULT_CONFIG) {
  const [state, setState] = useState<GameState>(() => initialGameState(config));

  // Bypasses React's render cycle on purpose: the RAF loop below reads
  // this every frame, and a ref can never be stale the way a value
  // captured in the loop's own closure would be.
  const forceRef = useRef(0);

  // Whether a pull is currently ALLOWED to start a round — the safeguard
  // Oscar asked for: "if you die, it won't just immediately start again
  // ... release the force and then pull it again to start." Forced false
  // continuously while actually playing (so death always starts
  // disarmed, whatever the exact reading was at the moment of
  // collision), and only re-armed once the reading drops to/under
  // RELEASE_KG — i.e. a real release, not a fixed timer that could
  // still expire mid-pull.
  const armedRef = useRef(true); // true so the very first-ever pull works with nothing to "release" from

  useEffect(() => {
    const kg = smoothedKg(points, config.maxKg);
    forceRef.current = kg;

    setState((s) => {
      if (s.status === 'playing') {
        armedRef.current = false;
        return s;
      }
      if (!armedRef.current) {
        if (kg <= RELEASE_KG) armedRef.current = true;
        return s;
      }
      // A fresh random seed every round — flappyPhysics.ts stays pure
      // (no Math.random inside it), so this is the one place that
      // actually rolls it, matching how DEFAULT_CONFIG's own physics
      // constants get supplied from outside too.
      return kg >= START_PULL_KG ? startGame(config, Math.floor(Math.random() * 0x100000000)) : s;
    });
  }, [points, config]);

  useEffect(() => {
    if (state.status !== 'playing') return;
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
  }, [state.status, config]);

  return { state };
}

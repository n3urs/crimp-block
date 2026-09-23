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

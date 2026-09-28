// src/data/forceGauge/useLaunchGame.ts
/** Wiring for the Launch game: feeds the gauge into launchPhysics.ts's
    state machine, where every rule lives (and is tested). Steps on every
    reading, plus a light timer only while time itself matters — during the
    3 s charge (so it launches on time even if the gauge goes quiet), at the
    end of a flight, and when the result's minimum display time runs out.
    The flight itself animates on the UI thread (LaunchGame.tsx), so there's
    no per-frame React work here. Not unit tested, same as useFlappyBird.ts. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphPoint } from './useForceGauge';
import { smoothedKg } from './useFlappyBird';
import { MAX_KG, MIN_RESULT_SEC, flightDurationSec, initialLaunchState, stepLaunch, type LaunchState } from './launchPhysics';

const CHARGE_TICK_MS = 50;

export function useLaunchGame(points: GraphPoint[], locked = false): { state: LaunchState } {
  const [state, setState] = useState<LaunchState>(initialLaunchState);
  const kgRef = useRef(0);
  const lastRef = useRef(performance.now());

  // Real elapsed time, not a fixed tick: readings arrive at whatever rate
  // the gauge sends them, and the timers below fill the gaps.
  const step = useCallback(() => {
    const now = performance.now();
    const dt = (now - lastRef.current) / 1000;
    lastRef.current = now;
    setState((s) => stepLaunch(s, kgRef.current, dt));
  }, []);

  useEffect(() => {
    // Locked (the gym station's name prompt is up): feed a flat zero
    // rather than the real pull, so stepLaunch's own 'result' -> 'charging'
    // transition (a fresh pull after landing) can never fire underneath the
    // modal — the one place a round starts, same guard as useFlappyBird.ts.
    kgRef.current = locked ? 0 : smoothedKg(points, MAX_KG);
    step();
  }, [points, step, locked]);

  const { phase, launchKg } = state;
  useEffect(() => {
    if (phase === 'charging') {
      const id = setInterval(step, CHARGE_TICK_MS);
      return () => clearInterval(id);
    }
    const waitMs = phase === 'flying' ? flightDurationSec(launchKg) * 1000 : phase === 'result' ? MIN_RESULT_SEC * 1000 : null;
    if (waitMs == null) return;
    const t = setTimeout(step, waitMs + 30);
    return () => clearTimeout(t);
  }, [phase, launchKg, step]);

  return { state };
}

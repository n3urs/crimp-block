// src/data/forceGauge/launchPhysics.ts
/** Every rule of the Launch game (a max pull fires the bird up through the
    sky and into space), pure and dependency-free so it's tested directly.
    Spec: docs/superpowers/specs/2026-09-26-launch-game-design.md.

    The world is laid out in kg: a landmark's position on screen IS the kg
    that reaches it, so they're evenly spaced however many orders of
    magnitude apart their real altitudes are. The altitude shown is
    interpolated in log space between the landmarks' real heights. Scaled
    for ONE arm on a 20 mm edge: 100 kg leaves the solar system. */

export interface Landmark {
  kg: number;
  altitudeM: number;
  /** For the "you passed it" banner. */
  name: string;
  /** For the result screen: the highest landmark passed. */
  reached: string;
}

export const LANDMARKS: Landmark[] = [
  { kg: 5, altitudeM: 10, name: 'ROOFTOPS', reached: 'OVER THE ROOFTOPS' },
  { kg: 10, altitudeM: 30, name: 'TREETOPS', reached: 'ABOVE THE TREES' },
  { kg: 15, altitudeM: 1_000, name: 'HOT-AIR BALLOONS', reached: 'UP WITH THE BALLOONS' },
  { kg: 20, altitudeM: 3_000, name: 'THE CLOUDS', reached: 'THROUGH THE CLOUDS' },
  { kg: 25, altitudeM: 8_849, name: 'EVEREST', reached: 'HIGHER THAN EVEREST' },
  { kg: 30, altitudeM: 11_000, name: 'THE PLANES', reached: 'ABOVE THE PLANES' },
  { kg: 35, altitudeM: 30_000, name: 'THE STRATOSPHERE', reached: 'INTO THE STRATOSPHERE' },
  { kg: 40, altitudeM: 100_000, name: 'SPACE!', reached: 'INTO SPACE' },
  { kg: 50, altitudeM: 408_000, name: 'THE ISS', reached: 'PAST THE ISS' },
  { kg: 60, altitudeM: 20_200_000, name: 'THE SATELLITES', reached: 'UP WITH THE SATELLITES' },
  { kg: 70, altitudeM: 384_400_000, name: 'THE MOON', reached: 'TO THE MOON' },
  { kg: 80, altitudeM: 2.25e11, name: 'MARS', reached: 'TO MARS' },
  { kg: 90, altitudeM: 7.78e11, name: 'JUPITER', reached: 'TO JUPITER' },
  { kg: 95, altitudeM: 1.4e12, name: 'SATURN', reached: 'TO SATURN' },
  { kg: 100, altitudeM: 2.4e13, name: 'EDGE OF THE SOLAR SYSTEM', reached: 'OUT OF THE SOLAR SYSTEM' },
  { kg: 110, altitudeM: 4.0e16, name: 'THE NEXT STAR', reached: 'TO THE NEXT STAR' },
  { kg: 120, altitudeM: 2.4e22, name: 'ANOTHER GALAXY', reached: 'TO ANOTHER GALAXY' },
];

/** The scenery ends a little past the last landmark; a stronger pull still
    scores its real kg, it just stops there on screen. */
export const TOP_LEVEL = 124;
/** Anything above this is a glitch, not a person. */
export const MAX_KG = 150;

/** A pull this hard starts the 3 s window... */
export const START_KG = 2;
/** ...and dropping under this is "let go". */
export const LET_GO_KG = 1;
export const CHARGE_SEC = 3;
/** The result stays up at least this long before a pull can start again. */
export const MIN_RESULT_SEC = 1.5;

const cleanKg = (kg: number) => (Number.isFinite(kg) ? Math.min(MAX_KG, Math.max(0, kg)) : 0);

// log10(1 + metres): 0 on the ground, ~log10(m) once off it.
const ANCHORS = [{ kg: 0, h: 0 }, ...LANDMARKS.map((l) => ({ kg: l.kg, h: Math.log10(1 + l.altitudeM) }))];

export function altitudeForKg(kgIn: number): number {
  const kg = cleanKg(kgIn);
  let i = 1;
  while (i < ANCHORS.length - 1 && kg > ANCHORS[i].kg) i++;
  // Past the last landmark the last segment's slope carries on.
  const a = ANCHORS[i - 1];
  const b = ANCHORS[i];
  const h = a.h + ((kg - a.kg) / (b.kg - a.kg)) * (b.h - a.h);
  return Math.max(0, 10 ** h - 1);
}

/** Index into LANDMARKS of the highest one passed, -1 for none. */
export function reachedIndex(kgIn: number): number {
  const kg = cleanKg(kgIn);
  let idx = -1;
  LANDMARKS.forEach((l, i) => { if (kg >= l.kg) idx = i; });
  return idx;
}

export function reachedPhrase(kg: number): string {
  const i = reachedIndex(kg);
  return i < 0 ? 'BARELY OFF THE GROUND' : LANDMARKS[i].reached;
}

const LIGHT_YEAR_M = 9.4607e15;
const commas = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const sig3 = (n: number) => String(Number(n.toPrecision(3)));

/** "8,849 M", "384,400 KM", "225 MILLION KM", "1.17 TRILLION KM", "4.23 LIGHT
    YEARS". `short`
    abbreviates the big units for the leaderboard ("225 MN KM", "4.23 LY"). */
export function formatAltitude(m: number, short = false): string {
  if (!(m > 0)) return '0 M';
  if (m < 10_000) return `${commas(m)} M`;
  const km = m / 1000;
  if (km < 1e6) return `${commas(Number(km.toPrecision(4)))} KM`;
  if (km < 1e9) return `${sig3(km / 1e6)} ${short ? 'MN' : 'MILLION'} KM`;
  if (km < 1e12) return `${sig3(km / 1e9)} ${short ? 'BN' : 'BILLION'} KM`;
  const ly = m / LIGHT_YEAR_M;
  if (ly < 1) return `${sig3(km / 1e12)} ${short ? 'TN' : 'TRILLION'} KM`;
  if (ly < 1e6) return `${sig3(ly)} ${short ? 'LY' : 'LIGHT YEARS'}`;
  return `${sig3(ly / 1e6)} ${short ? 'MN LY' : 'MILLION LIGHT YEARS'}`;
}

/** Board and stats scores are integers: kg to one decimal, in tenths. */
export const launchScore = (kg: number) => Math.max(0, Math.round(cleanKg(kg) * 10));
export const kgFromScore = (score: number) => score / 10;

// ---- the flight: up, a moment at the top, a freefall, a parachute, touchdown.
// Positions are in kg-levels. Everything here also runs on the UI thread
// (LaunchGame's animation), hence the 'worklet' directives.

/** How long he hangs at the top before falling. */
export const HANG_SEC = 0.9;
/** The parachute's share of the way down, from chuteLevel() to the pad. */
export const CHUTE_SEC = 1.1;
/** Top speed of the freefall, in levels per second (a touch faster than the climb: gravity). */
const MAX_FALL_SPEED = 36;

export interface FlightTimes {
  /** Reaches the top. */
  up: number;
  /** Starts falling. */
  hangEnd: number;
  /** Parachute opens. */
  fallEnd: number;
  /** Touches down. */
  land: number;
}

/** Bigger pulls get a longer, grander climb. */
export function ascentSec(finalLevel: number): number {
  'worklet';
  return 1.6 + 0.07 * Math.min(TOP_LEVEL, Math.max(0, finalLevel));
}

/** Where the parachute opens: rooftop height, or halfway for a tiny hop. */
export function chuteLevel(finalLevel: number): number {
  'worklet';
  return Math.min(4, Math.max(0, finalLevel) * 0.5);
}

export function flightTimes(finalLevel: number): FlightTimes {
  'worklet';
  const up = ascentSec(finalLevel);
  const hangEnd = up + HANG_SEC;
  const drop = Math.max(0, finalLevel) - chuteLevel(finalLevel);
  const fallEnd = hangEnd + Math.max(0.8, (2 * drop) / MAX_FALL_SPEED);
  return { up, hangEnd, fallEnd, land: fallEnd + CHUTE_SEC };
}

/** The whole flight, lift-off to touchdown. */
export function flightDurationSec(kg: number): number {
  return flightTimes(Math.min(TOP_LEVEL, cleanKg(kg))).land;
}

/** Where he is `t` seconds after lift-off. Up: thrown straight up, full
    speed off the pad and slowing evenly to a stop (a real throw under
    gravity). Down: a freefall that starts slow and speeds up, then the
    parachute snaps him to a gentle stop on the pad. */
export function flightLevel(t: number, finalLevel: number): number {
  'worklet';
  const f = Math.max(0, finalLevel);
  const T = flightTimes(f);
  if (t <= 0) return 0;
  if (t < T.up) {
    const u = t / T.up;
    return f * (1 - (1 - u) * (1 - u));
  }
  if (t < T.hangEnd) return f;
  const c = chuteLevel(f);
  if (t < T.fallEnd) {
    const s = (t - T.hangEnd) / (T.fallEnd - T.hangEnd);
    return f - (f - c) * s * s;
  }
  if (t < T.land) {
    const u = (t - T.fallEnd) / CHUTE_SEC;
    return c * (1 - u) * (1 - u);
  }
  return 0;
}

/** Levels per second at `t` (positive = going up). */
export function flightSpeed(t: number, finalLevel: number): number {
  'worklet';
  return (flightLevel(t + 0.02, finalLevel) - flightLevel(t - 0.02, finalLevel)) / 0.04;
}

/** 0 climbing, 1 at the top, 2 falling, 3 under the parachute, 4 landed. */
export function flightStage(t: number, finalLevel: number): number {
  'worklet';
  const T = flightTimes(Math.max(0, finalLevel));
  return t < T.up ? 0 : t < T.hangEnd ? 1 : t < T.fallEnd ? 2 : t < T.land ? 3 : 4;
}

export type LaunchPhase = 'ready' | 'charging' | 'flying' | 'result';

export interface LaunchState {
  phase: LaunchPhase;
  /** Whether a pull may start a round: needs a release first after every
      launch, so a pull held through the flight can't start the next one. */
  armed: boolean;
  liveKg: number;
  chargeSec: number;
  peakKg: number;
  /** The peak the current/last flight was launched with. */
  launchKg: number;
  flightSec: number;
  resultSec: number;
  /** Counts launches, so the screen can tell one flight from the next. */
  round: number;
}

export function initialLaunchState(): LaunchState {
  return { phase: 'ready', armed: true, liveKg: 0, chargeSec: 0, peakKg: 0, launchKg: 0, flightSec: 0, resultSec: 0, round: 0 };
}

const startCharge = (s: LaunchState, kg: number): LaunchState =>
  ({ ...s, phase: 'charging', armed: false, chargeSec: 0, peakKg: kg, flightSec: 0, resultSec: 0 });

/** One tick: `kg` is the latest smoothed reading, `dtSec` the time since
    the last tick. */
export function stepLaunch(s: LaunchState, kgIn: number, dtSec: number): LaunchState {
  const kg = cleanKg(kgIn);
  const released = kg < LET_GO_KG;
  switch (s.phase) {
    case 'ready': {
      if (!s.armed) return { ...s, liveKg: kg, armed: released };
      return kg >= START_KG ? { ...startCharge(s, kg), liveKg: kg } : { ...s, liveKg: kg };
    }
    case 'charging': {
      const chargeSec = s.chargeSec + dtSec;
      const peakKg = released ? s.peakKg : Math.max(s.peakKg, kg);
      if (released || chargeSec >= CHARGE_SEC) {
        return { ...s, phase: 'flying', armed: false, liveKg: kg, chargeSec, peakKg, launchKg: peakKg, flightSec: 0, round: s.round + 1 };
      }
      return { ...s, liveKg: kg, chargeSec, peakKg };
    }
    case 'flying': {
      const flightSec = s.flightSec + dtSec;
      if (flightSec >= flightDurationSec(s.launchKg)) return { ...s, phase: 'result', armed: false, liveKg: kg, flightSec, resultSec: 0 };
      return { ...s, armed: false, liveKg: kg, flightSec };
    }
    case 'result': {
      const resultSec = s.resultSec + dtSec;
      const armed = s.armed || released;
      if (armed && resultSec >= MIN_RESULT_SEC && kg >= START_KG) return { ...startCharge(s, kg), liveKg: kg };
      return { ...s, liveKg: kg, resultSec, armed };
    }
  }
}

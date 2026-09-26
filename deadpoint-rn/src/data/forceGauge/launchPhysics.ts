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

/** "8,849 M", "384,400 KM", "225 MILLION KM", "4.23 LIGHT YEARS". `short`
    abbreviates the big units for the leaderboard ("225 MN KM", "4.23 LY"). */
export function formatAltitude(m: number, short = false): string {
  if (!(m > 0)) return '0 M';
  if (m < 10_000) return `${commas(m)} M`;
  const km = m / 1000;
  if (km < 1e6) return `${commas(Number(km.toPrecision(4)))} KM`;
  if (km < 1e9) return `${sig3(km / 1e6)} ${short ? 'MN' : 'MILLION'} KM`;
  const ly = m / LIGHT_YEAR_M;
  if (ly < 0.1) return `${sig3(km / 1e9)} ${short ? 'BN' : 'BILLION'} KM`;
  if (ly < 1e6) return `${sig3(ly)} ${short ? 'LY' : 'LIGHT YEARS'}`;
  return `${sig3(ly / 1e6)} ${short ? 'MN LY' : 'MILLION LIGHT YEARS'}`;
}

/** Board and stats scores are integers: kg to one decimal, in tenths. */
export const launchScore = (kg: number) => Math.max(0, Math.round(cleanKg(kg) * 10));
export const kgFromScore = (score: number) => score / 10;

/** Bigger pulls get a longer, grander flight. */
export function flightDurationSec(kg: number): number {
  return 1.6 + 0.07 * Math.min(TOP_LEVEL, cleanKg(kg));
}

/** Where he is (in kg-levels) `t` seconds after lift-off: thrown straight
    up — full speed off the pad, slowing evenly to a stop at the top, like
    a real throw under gravity. Runs on the UI thread too, hence 'worklet'. */
export function flightLevel(t: number, finalLevel: number, durSec: number): number {
  'worklet';
  const u = Math.min(1, Math.max(0, t / durSec));
  return finalLevel * (1 - (1 - u) * (1 - u));
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

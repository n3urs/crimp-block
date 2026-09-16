// src/noHang/protocol.ts
/** Emil Abrahamsson's sub-max daily fingerboard routine, as run in his own
    follow-along video (2023-05-24): 10s on / 20s rest, feet on the floor,
    ~40% effort, one edge throughout, grip changing between blocks. Pure
    data + lookups so the whole sequence is unit tested. */
import type { IntervalConfig } from '../engine/types';
import type { Phase } from '../components/timers/intervalTimerLogic';

export type Finger = 'index' | 'middle' | 'ring' | 'pinky';

export interface Grip {
  name: string;
  reps: number;
  fingers: Finger[];
  style: 'crimp' | 'drag';
}

export const GRIPS: Grip[] = [
  { name: 'Half crimp', reps: 6, fingers: ['index', 'middle', 'ring', 'pinky'], style: 'crimp' },
  { name: 'Three-finger drag', reps: 6, fingers: ['index', 'middle', 'ring'], style: 'drag' },
  { name: 'Front two-finger drag', reps: 2, fingers: ['index', 'middle'], style: 'drag' },
  { name: 'Middle two-finger drag', reps: 2, fingers: ['middle', 'ring'], style: 'drag' },
  { name: 'Front two-finger half crimp', reps: 2, fingers: ['index', 'middle'], style: 'crimp' },
  { name: 'Middle two-finger half crimp', reps: 2, fingers: ['middle', 'ring'], style: 'crimp' },
];

export const TOTAL_REPS = GRIPS.reduce((sum, g) => sum + g.reps, 0);

/** 20 one-rep "sets" so the grip can change between reps. `off: 0`: with
    reps 1 the short `off` phase is only reached after the LAST load (every
    other rep goes on → setrest), so 0s ends the routine straight away
    instead of adding a 20s rest after rep 20. */
export const TIMER_CONFIG: { interval: IntervalConfig; setRestSecs: number; sets: number } = {
  interval: { on: 10, off: 0, reps: 1 },
  setRestSecs: 20,
  sets: TOTAL_REPS,
};

export function gripForRep(rep: number): Grip {
  let remaining = Math.max(1, Math.min(rep, TOTAL_REPS));
  for (const grip of GRIPS) {
    if (remaining <= grip.reps) return grip;
    remaining -= grip.reps;
  }
  return GRIPS[GRIPS.length - 1];
}

/** The current grip while loading; the UPCOMING one while getting ready or
    resting, so fingers are set before the load starts. */
export function displayedGrip(phase: Phase, set: number): { grip: Grip; rep: number; isNext: boolean; isChange: boolean } {
  if (phase === 'ready') return { grip: gripForRep(1), rep: 1, isNext: true, isChange: true };
  if (phase === 'setrest') {
    const grip = gripForRep(set + 1);
    return { grip, rep: set + 1, isNext: true, isChange: grip !== gripForRep(set) };
  }
  if (phase === 'on') return { grip: gripForRep(set), rep: set, isNext: false, isChange: false };
  return { grip: gripForRep(TOTAL_REPS), rep: TOTAL_REPS, isNext: false, isChange: false };
}

export type BoardId = 'bm1000' | 'bm2000';

/** Fractions of the board face: x/w of its width, y/h of its height. */
export interface Hold {
  x: number;
  y: number;
  w: number;
  h: number;
  used?: boolean;
}

export interface Board {
  id: BoardId;
  name: string;
  shortName: string;
  aspect: number;
  cornerRadius: number;
  holdLabel: string;
  holds: Hold[];
}

const ROW_H = 0.145;

/** A hold and its mirror image — both boards are left/right symmetric. */
function pair(x: number, y: number, w: number, used = false): Hold[] {
  return [{ x, y, w, h: ROW_H, used }, { x: 1 - x - w, y, w, h: ROW_H, used }];
}

function centre(y: number, w: number): Hold {
  return { x: (1 - w) / 2, y, w, h: ROW_H };
}

// Positions measured from Beastmaker's own product photos (left half, then
// mirrored); BM1000's bottom outer edges are the ~20mm edges per Gordon
// Lesti's measured depths.
export const BOARDS: Record<BoardId, Board> = {
  bm1000: {
    id: 'bm1000',
    name: 'Beastmaker 1000',
    shortName: '1000',
    aspect: 3.82,
    cornerRadius: 0.42,
    holdLabel: 'Bottom row, outer edges (~20mm)',
    holds: [
      ...pair(0.04, 0.215, 0.138),
      ...pair(0.379, 0.215, 0.103),
      ...pair(0.026, 0.455, 0.145),
      ...pair(0.196, 0.455, 0.074),
      ...pair(0.293, 0.455, 0.107),
      centre(0.455, 0.156),
      ...pair(0.105, 0.735, 0.153, true),
      ...pair(0.284, 0.735, 0.074),
      ...pair(0.384, 0.735, 0.103),
    ],
  },
  bm2000: {
    id: 'bm2000',
    name: 'Beastmaker 2000',
    shortName: '2000',
    aspect: 3.88,
    cornerRadius: 0.08,
    holdLabel: 'Middle row, outer edges',
    holds: [
      ...pair(0.379, 0.211, 0.103),
      ...pair(0.022, 0.441, 0.136, true),
      ...pair(0.168, 0.441, 0.037),
      ...pair(0.231, 0.441, 0.076),
      ...pair(0.329, 0.441, 0.076),
      centre(0.441, 0.146),
      ...pair(0.02, 0.745, 0.137),
      ...pair(0.169, 0.745, 0.037),
      ...pair(0.225, 0.745, 0.077),
      ...pair(0.322, 0.745, 0.075),
      centre(0.745, 0.17),
    ],
  },
};

export function parseBoardId(raw: string | null): BoardId {
  return raw === 'bm2000' ? 'bm2000' : 'bm1000';
}

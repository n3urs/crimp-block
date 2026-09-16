# No-Hang Routine Follow-Along Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings-reachable follow-along screen for Emil Abrahamsson's 20-rep sub-max no-hang routine, showing a Beastmaker 1000/2000 diagram with the edge pair lit, the current/next grip, and a traffic-light countdown.

**Architecture:** Pure routine + board data in `src/noHang/protocol.ts` (unit tested). Two SVG components draw the board and the finger diagram. `app/no-hang.tsx` drives the existing, unchanged `useIntervalTimer` with 20 one-rep sets and renders setup (timer idle) or follow-along (timer running).

**Tech Stack:** Expo 57 / React Native, expo-router, react-native-svg, @react-native-async-storage/async-storage, Jest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-16-no-hang-routine-design.md`.
- Every rep: 10s on / 20s rest; 20 reps: 6 half crimp, 6 three-finger drag, 2 front two-finger drag, 2 middle two-finger drag, 2 front two-finger half crimp, 2 middle two-finger half crimp.
- Timer config exactly `{ on: 10, off: 0, reps: 1 }`, set rest 20, sets 20. Do not modify `src/components/timers/*`.
- Highlighted holds: Beastmaker 1000 bottom-row outer pair; Beastmaker 2000 middle-row outer pair.
- Only the board choice is persisted (AsyncStorage key `noHangBoard`, default `bm1000`). Nothing written to the plan, session log or calendar.
- Colours/fonts only from `src/design/colours.ts` and `src/design/fonts.ts`; phase colours `readyC` / `go` / `restC` as the repeater timer uses.
- No new dependencies. No Beastmaker images shipped.
- Run `npx` commands from `~/crimp-block/.worktrees/react-native-rebuild/deadpoint-rn`; run `git` commands from the repo root `~/crimp-block/.worktrees/react-native-rebuild` (paths below are `deadpoint-rn/...`).

(Deviation from spec, deliberate: the spec's `boardPref.ts` is folded into `parseBoardId()` in protocol.ts plus two AsyncStorage calls in the screen — one reader, one writer, no second consumer to justify a module.)

---

### Task 1: Routine and board data

**Files:**
- Create: `src/noHang/protocol.ts`
- Test: `__tests__/noHangProtocol.test.ts`

**Interfaces:**
- Consumes: `IntervalConfig` from `src/engine/types.ts`; `Phase`, `PhaseState`, `advancePhase` from `src/components/timers/intervalTimerLogic.ts`.
- Produces: `Finger`, `Grip`, `GRIPS`, `TOTAL_REPS`, `TIMER_CONFIG`, `gripForRep(rep)`, `displayedGrip(phase, set) → { grip, rep, isNext, isChange }`, `BoardId`, `Hold`, `Board`, `BOARDS`, `parseBoardId(raw)`.

- [ ] **Step 1: Write the failing test** — `__tests__/noHangProtocol.test.ts`

```ts
import { advancePhase, type PhaseState } from '../src/components/timers/intervalTimerLogic';
import { BOARDS, TIMER_CONFIG, TOTAL_REPS, displayedGrip, gripForRep, parseBoardId } from '../src/noHang/protocol';

test('the routine is 20 reps', () => {
  expect(TOTAL_REPS).toBe(20);
  expect(TIMER_CONFIG.sets).toBe(20);
});

test.each([
  [1, 'Half crimp'], [6, 'Half crimp'],
  [7, 'Three-finger drag'], [12, 'Three-finger drag'],
  [13, 'Front two-finger drag'], [14, 'Front two-finger drag'],
  [15, 'Middle two-finger drag'], [16, 'Middle two-finger drag'],
  [17, 'Front two-finger half crimp'], [18, 'Front two-finger half crimp'],
  [19, 'Middle two-finger half crimp'], [20, 'Middle two-finger half crimp'],
])('rep %i is %s', (rep, name) => {
  expect(gripForRep(rep).name).toBe(name);
});

test('get ready previews the first grip', () => {
  expect(displayedGrip('ready', 1)).toMatchObject({ rep: 1, isNext: true, isChange: true, grip: { name: 'Half crimp' } });
});

test('a load shows the current grip', () => {
  expect(displayedGrip('on', 9)).toMatchObject({ rep: 9, isNext: false, isChange: false, grip: { name: 'Three-finger drag' } });
});

test('the rest after rep 6 previews the grip change', () => {
  expect(displayedGrip('setrest', 6)).toMatchObject({ rep: 7, isNext: true, isChange: true, grip: { name: 'Three-finger drag' } });
});

test('a rest inside a block previews the same grip without flagging a change', () => {
  expect(displayedGrip('setrest', 2)).toMatchObject({ rep: 3, isNext: true, isChange: false });
});

test('the timer config runs exactly 20 loads and finishes straight after the last', () => {
  let state: PhaseState = { phase: 'ready', set: 1, rep: 1 };
  const phases: string[] = [];
  for (let i = 0; i < 100; i++) {
    const next = advancePhase(state, TIMER_CONFIG.sets, TIMER_CONFIG.interval.reps);
    if (next === 'finish') break;
    phases.push(next.phase);
    state = next;
  }
  expect(phases.filter((p) => p === 'on')).toHaveLength(20);
  expect(phases.filter((p) => p === 'setrest')).toHaveLength(19);
  expect(phases[phases.length - 1]).toBe('off');
  expect(TIMER_CONFIG.interval.off).toBe(0);
});

test.each(['bm1000', 'bm2000'] as const)('%s lights exactly one mirrored pair, all holds on the board', (id) => {
  const used = BOARDS[id].holds.filter((h) => h.used);
  expect(used).toHaveLength(2);
  expect(used[0].x + used[0].w / 2 + used[1].x + used[1].w / 2).toBeCloseTo(1, 5);
  for (const h of BOARDS[id].holds) {
    expect(h.x).toBeGreaterThanOrEqual(0);
    expect(h.x + h.w).toBeLessThanOrEqual(1);
    expect(h.y + h.h).toBeLessThanOrEqual(1);
  }
});

test('an unknown saved board falls back to the 1000', () => {
  expect(parseBoardId('bm2000')).toBe('bm2000');
  expect(parseBoardId(null)).toBe('bm1000');
  expect(parseBoardId('junk')).toBe('bm1000');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/noHangProtocol.test.ts`
Expected: FAIL — `Cannot find module '../src/noHang/protocol'`.

- [ ] **Step 3: Implement** — `src/noHang/protocol.ts`

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/noHangProtocol.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add deadpoint-rn/src/noHang/protocol.ts deadpoint-rn/__tests__/noHangProtocol.test.ts
git commit -m "Add no-hang routine data: grip sequence, timer mapping, board hold maps"
```

---

### Task 2: Board and grip diagrams

**Files:**
- Create: `src/noHang/BoardDiagram.tsx`
- Create: `src/noHang/GripDiagram.tsx`

**Interfaces:**
- Consumes: `Board`, `Finger` from `src/noHang/protocol.ts`.
- Produces: `BoardDiagram({ board: Board; width: number })`, `GripDiagram({ fingers: Finger[]; size?: number })`.

No unit tests (render-only; this project has no component test renderer). Verified visually in Task 3.

- [ ] **Step 1: Create** `src/noHang/BoardDiagram.tsx`

```tsx
// src/noHang/BoardDiagram.tsx
/** Schematic Beastmaker board from BOARDS' measured hold positions: the
    routine's pair lit in gorse, every other hold drawn recessed. Our own
    drawing, no Beastmaker imagery. */
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Colours, resolveColour } from '../design/colours';
import type { Board } from './protocol';

const ACCENT = resolveColour('--gorse');

export function BoardDiagram({ board, width }: { board: Board; width: number }) {
  const height = width / board.aspect;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${board.name}: ${board.holdLabel}`}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={board.cornerRadius * height} fill={Colours.s2} />
        {board.holds.map((hold, i) => {
          const w = hold.w * width;
          const h = hold.h * height;
          return (
            <Rect
              key={i}
              x={hold.x * width}
              y={hold.y * height}
              width={w}
              height={h}
              rx={Math.min(w, h) / 2}
              fill={hold.used ? ACCENT : Colours.bg}
              opacity={hold.used ? 1 : 0.6}
            />
          );
        })}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 2: Create** `src/noHang/GripDiagram.tsx`

```tsx
// src/noHang/GripDiagram.tsx
/** Which fingers go on the edge, both hands as seen facing the board:
    engaged fingers filled, the rest outlined. */
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Colours, resolveColour } from '../design/colours';
import type { Finger } from './protocol';

const ACCENT = resolveColour('--gorse');
const LENGTH: Record<Finger, number> = { index: 0.86, middle: 1, ring: 0.92, pinky: 0.7 };
const LEFT_HAND: Finger[] = ['pinky', 'ring', 'middle', 'index'];
const RIGHT_HAND: Finger[] = ['index', 'middle', 'ring', 'pinky'];
const STROKE = 1.5;

export function GripDiagram({ fingers, size = 56 }: { fingers: Finger[]; size?: number }) {
  const fingerW = size * 0.24;
  const gap = size * 0.1;
  const handW = fingerW * 4 + gap * 3;
  const handGap = size * 0.5;

  const hand = (order: Finger[], x0: number) =>
    order.map((finger, i) => {
      const on = fingers.includes(finger);
      const inset = on ? 0 : STROKE / 2;
      const h = size * LENGTH[finger];
      return (
        <Rect
          key={`${x0}-${finger}`}
          x={x0 + i * (fingerW + gap) + inset}
          y={size - h + inset}
          width={fingerW - inset * 2}
          height={h - inset * 2}
          rx={(fingerW - inset * 2) / 2}
          fill={on ? ACCENT : 'none'}
          stroke={on ? 'none' : Colours.s4}
          strokeWidth={STROKE}
        />
      );
    });

  return (
    <View accessible accessibilityLabel={`Fingers on the edge: ${fingers.join(', ')}`}>
      <Svg width={handW * 2 + handGap} height={size}>
        {hand(LEFT_HAND, 0)}
        {hand(RIGHT_HAND, handW + handGap)}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add deadpoint-rn/src/noHang/BoardDiagram.tsx deadpoint-rn/src/noHang/GripDiagram.tsx
git commit -m "Add Beastmaker board and grip finger diagrams"
```

---

### Task 3: Screen, route and Settings entry

**Files:**
- Create: `app/no-hang.tsx`
- Modify: `app/_layout.tsx` (register route after `force-gauge`)
- Modify: `app/settings.tsx` (new section after `FORCE GAUGE`)

**Interfaces:**
- Consumes: `useIntervalTimer()` → `{ state, start, stop, pause, resume, toggleMute }` and `IntervalTimerState` from `src/components/timers/useIntervalTimer.ts`; `start(config: IntervalConfig, setRestSecs: number, sets: number, label: string)`; everything from Tasks 1–2.
- Produces: route `/no-hang`.

- [ ] **Step 0: Keep the feature commit clean.** `app/settings.tsx` already carries an earlier, uncommitted change (whole Settings cards tappable). If `git diff --stat deadpoint-rn/app/settings.tsx` shows changes, commit them on their own first:

```bash
git add deadpoint-rn/app/settings.tsx
git commit -m "Make whole Settings cards tappable instead of just the 12pt label"
```

- [ ] **Step 1: Create** `app/no-hang.tsx`

```tsx
// app/no-hang.tsx
/** Follow-along for Emil Abrahamsson's sub-max daily fingerboard routine.
    Setup (pick board, start) while the timer is idle; board, grip and
    countdown while it runs. Same useIntervalTimer as the plan's repeaters;
    TIMER_CONFIG in src/noHang/protocol.ts maps the 20 reps onto it.
    Nothing is logged. Leaving the screen stops the timer (the hook clears
    its ticker on unmount). */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useIntervalTimer, type IntervalTimerState } from '../src/components/timers/useIntervalTimer';
import { BoardDiagram } from '../src/noHang/BoardDiagram';
import { GripDiagram } from '../src/noHang/GripDiagram';
import { BOARDS, TIMER_CONFIG, TOTAL_REPS, displayedGrip, parseBoardId, type BoardId } from '../src/noHang/protocol';

const ACCENT = resolveColour('--gorse');
const BOARD_KEY = 'noHangBoard';
const RULES = [
  'Feet stay on the floor. Take some weight off, never a full hang.',
  'About 40% effort, 30–50% on the two-finger grips. Unsure? Go lighter.',
  '20 reps of 10s on, 20s rest. Leave 6 hours before the next session.',
];

function phaseColour(phase: IntervalTimerState['phase']): string {
  if (phase === 'ready') return Colours.readyC;
  if (phase === 'on' || phase === 'done') return Colours.go;
  return Colours.restC;
}

function phaseWord(state: IntervalTimerState): string {
  if (state.isPaused) return 'PAUSED';
  if (state.phase === 'ready') return 'GET READY';
  if (state.phase === 'on') return 'HANG';
  if (state.phase === 'done') return 'DONE';
  return 'REST';
}

export default function NoHang() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { state, start, stop, pause, resume, toggleMute } = useIntervalTimer();
  const [boardId, setBoardId] = useState<BoardId>('bm1000');
  const chosenRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(BOARD_KEY)
      .then((raw) => { if (!chosenRef.current) setBoardId(parseBoardId(raw)); })
      .catch(() => {});
  }, []);

  const chooseBoard = (id: BoardId) => {
    chosenRef.current = true;
    setBoardId(id);
    AsyncStorage.setItem(BOARD_KEY, id).catch(() => {});
  };

  const board = BOARDS[boardId];
  const boardWidth = screenWidth - 40;

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>NO-HANG ROUTINE</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      {state == null ? (
        <>
          <View style={styles.toggle}>
            {(['bm1000', 'bm2000'] as const).map((id) => {
              const selected = id === boardId;
              return (
                <Pressable
                  key={id}
                  onPress={() => chooseBoard(id)}
                  style={[styles.toggleOption, selected && styles.toggleOptionSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={BOARDS[id].name}
                >
                  <Text style={[styles.toggleText, selected && styles.toggleTextSelected]}>BEASTMAKER {BOARDS[id].shortName}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.setupBody}>
            <BoardDiagram board={board} width={boardWidth} />
            <Text style={styles.holdLabel}>{board.holdLabel}</Text>
            <View style={styles.rules}>
              {RULES.map((rule) => (
                <View key={rule} style={styles.ruleRow}>
                  <View style={styles.ruleDot} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => start(TIMER_CONFIG.interval, TIMER_CONFIG.setRestSecs, TIMER_CONFIG.sets, 'No-hang routine')}
            style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Start the routine"
          >
            <Text style={styles.startText}>START · 10 MIN</Text>
          </Pressable>
        </>
      ) : (
        <FollowAlong
          state={state}
          boardWidth={boardWidth}
          boardId={boardId}
          onPause={pause}
          onResume={resume}
          onStop={stop}
          onToggleMute={toggleMute}
        />
      )}
    </View>
  );
}

function FollowAlong({
  state, boardWidth, boardId, onPause, onResume, onStop, onToggleMute,
}: {
  state: IntervalTimerState;
  boardWidth: number;
  boardId: BoardId;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}) {
  const shown = displayedGrip(state.phase, state.set);
  const isDone = state.phase === 'done';
  const detail = isDone
    ? `All ${TOTAL_REPS} reps done`
    : shown.isNext
      ? `Up next, rep ${shown.rep} of ${TOTAL_REPS}${shown.isChange ? ' · change grip' : ''}`
      : `Rep ${shown.rep} of ${TOTAL_REPS}`;

  return (
    <>
      <View style={styles.followBody}>
        <BoardDiagram board={BOARDS[boardId]} width={boardWidth} />

        <View style={styles.gripPanel}>
          <GripDiagram fingers={shown.grip.fingers} />
          <Text style={styles.gripName}>{shown.grip.name.toUpperCase()}</Text>
          <Text style={[styles.gripDetail, shown.isChange && !isDone && { color: ACCENT }]}>{detail}</Text>
        </View>

        <View
          style={[styles.countdownCard, { backgroundColor: phaseColour(state.phase) }, state.isPaused && styles.countdownPaused]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${phaseWord(state)}, ${state.remainingSeconds} seconds`}
        >
          <Text style={styles.phaseWord}>{phaseWord(state)}</Text>
          {!isDone && <Text style={styles.countdown}>{state.remainingSeconds}</Text>}
        </View>
      </View>

      {!isDone && (
        <View style={styles.controls}>
          <ControlButton label={state.isPaused ? 'RESUME' : 'PAUSE'} onPress={state.isPaused ? onResume : onPause} />
          <ControlButton label={state.isMuted ? 'UNMUTE' : 'MUTE'} onPress={onToggleMute} />
          <ControlButton label="STOP" onPress={onStop} />
        </View>
      )}
    </>
  );
}

function ControlButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
      accessibilityRole="button"
      accessibilityLabel={label.toLowerCase()}
    >
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },

  toggle: { flexDirection: 'row', backgroundColor: Colours.s1, borderRadius: 8, padding: 4, gap: 4 },
  toggleOption: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  toggleOptionSelected: { backgroundColor: Colours.s3 },
  toggleText: { ...Fonts.mono(12, 'bold'), color: Colours.dim, letterSpacing: 1 },
  toggleTextSelected: { color: Colours.fg },

  setupBody: { flex: 1, justifyContent: 'center', gap: 12 },
  holdLabel: { ...Fonts.mono(12, 'medium'), color: ACCENT, textAlign: 'center' },
  rules: { gap: 10, marginTop: 20 },
  ruleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ruleDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colours.s4, marginTop: 7 },
  ruleText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colours.dim },

  startButton: { paddingVertical: 16, borderRadius: 8, alignItems: 'center', backgroundColor: ACCENT },
  startButtonPressed: { opacity: 0.85 },
  startText: { ...Fonts.mono(13, 'bold'), color: Colours.bg, letterSpacing: 1 },

  followBody: { flex: 1, gap: 20 },
  gripPanel: { alignItems: 'center', gap: 10 },
  gripName: { ...Fonts.heading(24), color: Colours.fg, textAlign: 'center' },
  gripDetail: { ...Fonts.mono(12, 'medium'), color: Colours.dim, textAlign: 'center' },

  countdownCard: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  countdownPaused: { opacity: 0.45 },
  phaseWord: { ...Fonts.mono(15, 'bold'), color: Colours.bg, letterSpacing: 2 },
  countdown: { ...Fonts.timerDigits(104), color: Colours.bg },

  controls: { flexDirection: 'row', gap: 12, marginTop: 16 },
  controlButton: { flex: 1, paddingVertical: 16, borderRadius: 8, alignItems: 'center', backgroundColor: Colours.s2 },
  controlButtonPressed: { backgroundColor: Colours.s3 },
  controlText: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
});
```

- [ ] **Step 2: Register the route** in `app/_layout.tsx`, directly after the `force-gauge` `Stack.Screen`:

```tsx
          {/* No-hang routine follow-along — app/no-hang.tsx, same
              not-group-qualified naming as force-gauge above. */}
          <Stack.Screen name="no-hang" options={{ presentation: 'modal' }} />
```

- [ ] **Step 3: Add the Settings entry** in `app/settings.tsx`, directly after the closing `</Section>` of `FORCE GAUGE`:

```tsx
        <Section title="NO-HANG ROUTINE">
          <Pressable
            style={styles.helpBody}
            hitSlop={16}
            onPress={() => router.push('/no-hang')}
            accessibilityRole="button"
            accessibilityLabel="Open the no-hang routine"
          >
            <Text style={styles.helpAction}>EMIL'S DAILY NO-HANG ROUTINE</Text>
            <Text style={styles.helpSubtitle}>A 10-minute sub-max fingerboard follow-along for a Beastmaker 1000 or 2000.</Text>
          </Pressable>
        </Section>
```

- [ ] **Step 4: Type-check and run the full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc exit 0; all suites pass.

- [ ] **Step 5: Verify in the Simulator** (app already running against Metro; relaunch with `xcrun simctl terminate 831F1D39-4AF5-498C-B307-3F952E55F32A uk.co.sullivanltd.crimpblock; xcrun simctl launch 831F1D39-4AF5-498C-B307-3F952E55F32A uk.co.sullivanltd.crimpblock` to load new JS)

Check, one screenshot each: Settings shows the NO-HANG ROUTINE card; setup with 1000 selected (bottom outer pair lit); setup with 2000 selected (middle outer pair lit); START → get ready (amber, "Up next, rep 1 of 20 · change grip", half crimp, all four fingers filled); a HANG (green); the first REST (red, "Up next, rep 2 of 20"). Close mid-routine → no further beeps. Reopen → the last-chosen board is still selected.

- [ ] **Step 6: Commit**

```bash
git add deadpoint-rn/app/no-hang.tsx deadpoint-rn/app/_layout.tsx deadpoint-rn/app/settings.tsx
git commit -m "Add no-hang routine follow-along screen with Settings entry"
```

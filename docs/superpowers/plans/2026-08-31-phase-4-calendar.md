# Phase 4 — Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the calendar screen (month grid with phase-boundary borders, deload rings, all-time stats, plan progress, trend-based deload forecast) from `ios/CrimpBlock/CalendarView.swift`.

**Architecture:** Pure-logic modules for every computation (month grid, trend forecast, all-time stats, plan progress), each directly unit-tested against concrete known-correct calendar dates — matching the split every previous phase has used, and specifically load-bearing here since several of these rules encode real, previously-reported bugs (see the design spec's Risks section). UI components consume these as plain data, verified live on device.

**Tech Stack:** `react-native-svg` (the month grid's phase-boundary borders — installed since Phase 0-2, unused until now), `expo-router` (new modal route for the calendar screen).

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-08-31-phase-4-calendar-design.md` and the Phase 0-2 plan's own Global Constraints (still binding):

- Design tokens (`Colours`, `Fonts`) and motion constants (`Motion`) must be used via those modules — never a raw hex/font-family/ms literal duplicating what they already provide.
- Every date computation must match this codebase's own established convention exactly (`src/engine/engine-core.js`'s `addDays`/`iso`): construct local dates via `new Date(y, m-1, d, 12)` (noon, local time — avoids DST-transition day-shifting), format back via local getters (`getFullYear`/`getMonth`/`getDate`), never `toISOString()` (UTC-shifts near midnight in some timezones).
- Every test file in this project is a flat `test(...)` call with no `describe` blocks.
- `npx jest` and `npx tsc --noEmit` must both stay clean after every task.
- No React Testing Library exists in this project and none should be added. UI components are verified live on a real device (Task 6), not under Jest — only pure logic functions get Jest tests.
- The engine facade (`src/engine/index.ts`) already exposes every method this phase needs (`today`, `addDays`, `decide`, `block`, `phaseNameAt`, `isDeload`, `isTraining`, `phaseIndexAt`, `phases`, `programStartDate`, `sessionColourVarName`, `sessionInfo`, `SESSION_ORDER`) — do not add new engine methods or touch `engine-core.js`/`programs.js`/`templates.js` (all three are COPIED VERBATIM from the web app and never edited).

---

## Task 1: `react-native-svg` proof and month-grid math

Deliberately first and isolated, per this project's own established practice (Phase 3 Task 1 did the same for `expo-audio`): prove the one genuinely unproven dependency actually renders on a real device before building UI on top of it.

**Files:**
- Create: `deadpoint-rn/src/screens/calendar/svgProof.tsx` (temporary — deleted at the end of Task 4 once `DayCell.tsx` proves the real thing works)
- Create: `deadpoint-rn/src/screens/calendar/calendarMath.ts`
- Create: `deadpoint-rn/__tests__/calendarMath.test.ts`

**Interfaces:**
- Produces: `daysInMonthGrid(monthISO: string): (string | null)[]`, `startOfMonth(dateISO: string): string`, `shiftMonth(monthISO: string, delta: number): string`, `monthTitle(monthISO: string): string`, all exported from `src/screens/calendar/calendarMath.ts`. Tasks 4 and 6 import these.

- [ ] **Step 1: Write a throwaway SVG smoke-test component**

```typescript
// src/screens/calendar/svgProof.tsx
// TEMPORARY — deleted once DayCell.tsx (Task 4) proves the real partial-
// border rendering works on device. This only exists to isolate whether
// react-native-svg itself renders at all before building UI on top of it,
// same practice as Phase 3 Task 1 proving expo-audio first.
import React from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

export function SvgProof() {
  return (
    <View style={{ width: 100, height: 100 }}>
      <Svg width={100} height={100}>
        <Line x1={0} y1={0} x2={100} y2={100} stroke="#F2B134" strokeWidth={3} />
        <Line x1={100} y1={0} x2={0} y2={100} stroke="#4FB3A5" strokeWidth={3} />
      </Svg>
    </View>
  );
}
```

Temporarily render `<SvgProof />` somewhere reachable — the simplest option is adding it directly inside `app/(main)/card.tsx`'s returned JSX (e.g. right after the `<DailyCard ... />` element, wrapped in nothing special) for a moment, run `npx expo run:ios --device "iPhone 17"` (`export LANG=en_US.UTF-8 && export LC_ALL=en_US.UTF-8` first, per this project's own CocoaPods Unicode workaround), and confirm an X made of two crossing coloured lines actually renders on the simulator. **Remove the temporary render from `card.tsx` immediately after confirming** — do not leave it wired in; only the `svgProof.tsx` file itself stays (for Task 4's convenience) until Task 4 deletes it once `DayCell.tsx` proves the real thing.

If the lines don't render, or the build fails on `react-native-svg`, stop and report BLOCKED — do not build Tasks 2-6 on an unproven dependency.

- [ ] **Step 2: Write the failing tests for month-grid math**

Ground truth below is independently verified (via macOS's own `cal` command, not re-derived from the same `Date` object the implementation uses):
```
August 2026:   1st is a Saturday. Mon-first week → 5 leading blanks. 31 days.
February 2026: 1st is a Sunday.   Mon-first week → 6 leading blanks. 28 days (not a leap year).
December 2026: 1st is a Tuesday.  Mon-first week → 1 leading blank.  31 days.
```

```typescript
// __tests__/calendarMath.test.ts
import { daysInMonthGrid, startOfMonth, shiftMonth, monthTitle } from '../src/screens/calendar/calendarMath';

test('August 2026 has 5 leading blanks (1st is a Saturday) and 31 real days', () => {
  const days = daysInMonthGrid('2026-08-01');
  expect(days.slice(0, 5)).toEqual([null, null, null, null, null]);
  expect(days[5]).toBe('2026-08-01');
  expect(days.filter((d) => d != null)).toHaveLength(31);
  expect(days.length % 7).toBe(0);
});

test('February 2026 has 6 leading blanks (1st is a Sunday) and 28 real days', () => {
  const days = daysInMonthGrid('2026-02-01');
  expect(days.slice(0, 6)).toEqual([null, null, null, null, null, null]);
  expect(days[6]).toBe('2026-02-01');
  expect(days.filter((d) => d != null)).toHaveLength(28);
});

test('December 2026 has 1 leading blank (1st is a Tuesday) and 31 real days', () => {
  const days = daysInMonthGrid('2026-12-01');
  expect(days[0]).toBeNull();
  expect(days[1]).toBe('2026-12-01');
  expect(days.filter((d) => d != null)).toHaveLength(31);
});

test('daysInMonthGrid pads the trailing end to a multiple of 7', () => {
  const days = daysInMonthGrid('2026-08-01');
  // 5 leading blanks + 31 days = 36; next multiple of 7 is 42, so 6 trailing blanks
  expect(days).toHaveLength(42);
  expect(days.slice(36)).toEqual([null, null, null, null, null, null]);
});

test('startOfMonth normalizes any date in the month to its 1st', () => {
  expect(startOfMonth('2026-08-17')).toBe('2026-08-01');
});

test('shiftMonth moves forward within a year', () => {
  expect(shiftMonth('2026-08-01', 1)).toBe('2026-09-01');
});

test('shiftMonth rolls over into the next year', () => {
  expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
});

test('shiftMonth moves backward across a year boundary', () => {
  expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
});

test('monthTitle formats and uppercases, matching Swift\'s "MMMM yyyy" en_GB', () => {
  expect(monthTitle('2026-08-01')).toBe('AUGUST 2026');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd deadpoint-rn && npx jest calendarMath`
Expected: FAIL — `Cannot find module '../src/screens/calendar/calendarMath'`.

- [ ] **Step 4: Write the pure month-grid math**

Direct port of `CalendarView.swift`'s "MARK: - Month math" section (`monthTitle`, `shiftMonth`, `startOfMonth`, `daysInVisibleMonth`), using this project's own `engine-core.js`-established date convention (local noon, local getters — see Global Constraints) instead of Swift's `Calendar` object.

```typescript
// src/screens/calendar/calendarMath.ts
/** Direct port of CalendarView.swift's "MARK: - Month math" section. Uses
    plain local-time Date arithmetic at noon (same convention as
    engine-core.js's own addDays/iso — noon avoids any date shifting from
    a DST transition landing at midnight), not Swift's Calendar object.
    Swift's Calendar.firstWeekday = 2 (Monday) is the one piece of that
    object's behaviour this still has to replicate exactly — see
    daysInMonthGrid's own comment for the leading-blanks formula. */

/** Mirrors engine-core.js's own iso(d) formatting exactly (local getters,
    zero-padded) — not exported from that file's own public facade, so
    duplicated here rather than reached into engine-core.js's internals. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseMonth(monthISO: string): { y: number; m: number } {
  const [y, m] = monthISO.split('-').map(Number);
  return { y, m };
}

export function startOfMonth(dateISO: string): string {
  const { y, m } = parseMonth(dateISO);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function shiftMonth(monthISO: string, delta: number): string {
  const { y, m } = parseMonth(monthISO);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function monthTitle(monthISO: string): string {
  const { y, m } = parseMonth(monthISO);
  const date = new Date(y, m - 1, 1, 12);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date).toUpperCase();
}

/** Mirrors CalendarView.swift's daysInVisibleMonth() exactly — a flat,
    7-per-row array (null = a leading/trailing blank cell), grouped into
    weeks by the caller (MonthGrid.tsx), not here.

    Leading-blanks formula: JS's Date.getDay() is already 0=Sun..6=Sat,
    the same numbering as Swift's own `weekday - 1` (Swift's Calendar
    weekday is 1=Sun..7=Sat). Swift's
    `(firstWeekday - cal.firstWeekday + 7) % 7` with cal.firstWeekday = 2
    (Monday) becomes, substituting firstWeekday = jsWeekday + 1:
    `(jsWeekday + 1 - 2 + 7) % 7` = `(jsWeekday - 1 + 7) % 7`. Verified
    against real ground truth (macOS `cal`, not re-derived from this same
    Date object) in this task's own test file: Aug 2026 (Sat 1st) → 5,
    Feb 2026 (Sun 1st) → 6, Dec 2026 (Tue 1st) → 1. */
export function daysInMonthGrid(monthISO: string): (string | null)[] {
  const { y, m } = parseMonth(monthISO);
  const firstOfMonth = new Date(y, m - 1, 1, 12);
  const daysInMonth = new Date(y, m, 0, 12).getDate(); // day 0 of next month = last day of this one
  const leadingBlanks = (firstOfMonth.getDay() - 1 + 7) % 7;

  const days: (string | null)[] = new Array(leadingBlanks).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(iso(new Date(y, m - 1, d, 12)));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd deadpoint-rn && npx jest calendarMath`
Expected: PASS, 9 tests.

- [ ] **Step 6: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all tests pass, `tsc` produces no output.

- [ ] **Step 7: Commit**

```bash
cd deadpoint-rn && git add src/screens/calendar/calendarMath.ts src/screens/calendar/svgProof.tsx __tests__/calendarMath.test.ts
git commit -m "feat(calendar): month-grid math + react-native-svg proof"
```

---

## Task 2: Trend forecast

Direct port of `CalendarView.swift`'s `TrendForecast` struct (rate-based deload projection).

**Files:**
- Create: `deadpoint-rn/src/screens/calendar/trendForecast.ts`
- Create: `deadpoint-rn/__tests__/trendForecast.test.ts`

**Interfaces:**
- Consumes: `Days`/`Entry` from `src/data/useStore.ts` (already exists: `Entry { t: string; l: number | null; sub: string | null }`, `Days = Record<string, Entry>`); `BlockInfo` from `src/engine/types.ts`.
- Produces:
  ```typescript
  export interface Deload { start: string; end: string; }
  export interface TrendForecastResult { weeklyRate: number; windowDays: number; deload: Deload | null; }
  export interface TrendForecastEngine {
    addDays(date: string, n: number): string;
    block(date: string): BlockInfo;
    isTraining(type: string): boolean;
  }
  export function computeTrendForecast(engine: TrendForecastEngine, history: Days, today: string): TrendForecastResult;
  ```
  `TrendForecastEngine` is a narrow subset of what `createEngine()` (Task 4 of the Phase 0-2 plan) already returns — any real engine instance satisfies it structurally, no adapter needed. Task 6 imports `computeTrendForecast` and passes its real `engine`/`store.days`/`today` straight through.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/trendForecast.test.ts
import { computeTrendForecast, type TrendForecastEngine } from '../src/screens/calendar/trendForecast';
import type { Days } from '../src/data/useStore';

/** A minimal fake satisfying TrendForecastEngine — addDays does real
    calendar-day arithmetic (ISO strings, no Date-object dependency,
    since the tests need to reason about exact offsets), block() and
    isTraining() are configurable per test. */
function fakeAddDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function makeEngine(block: TrendForecastEngine['block']): TrendForecastEngine {
  return { addDays: fakeAddDays, block, isTraining: (t) => t !== 'rest' };
}

test('weeklyRate reflects real training frequency in the window', () => {
  const history: Days = {
    '2026-08-01': { t: 'pull', l: null, sub: null },
    '2026-08-08': { t: 'pull', l: null, sub: null },
    '2026-08-15': { t: 'pull', l: null, sub: null },
  };
  // 3 training days over a 15-day window (Aug 1 -> Aug 15) = 1/5 per day = 1.4/week
  const engine = makeEngine(() => ({ b: 1, w: 1, done: 0, per: 3, total: 3, wIdx: 0, over: false }));
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.weeklyRate).toBeCloseTo(1.4, 1);
  expect(result.windowDays).toBe(15);
});

test('weeklyRate window is bounded by the earliest real entry, not the full 56 days, on a new account', () => {
  const history: Days = { '2026-08-10': { t: 'pull', l: null, sub: null } };
  const engine = makeEngine(() => ({ b: 1, w: 1, done: 0, per: 3, total: 1, wIdx: 0, over: false }));
  const result = computeTrendForecast(engine, history, '2026-08-15');
  // window is Aug 10 -> Aug 15 (6 days), not 56 - the account didn't exist before Aug 10
  expect(result.windowDays).toBe(6);
});

test('weeklyRate floors at a nonzero minimum, never divides by a true zero rate', () => {
  const engine = makeEngine(() => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }));
  const result = computeTrendForecast(engine, {}, '2026-08-15');
  expect(result.weeklyRate).toBeGreaterThan(0);
  expect(Number.isFinite(result.weeklyRate)).toBe(true);
});

test('mid-deload week (w===4) projects the REMAINING days of THIS week, not a full window three weeks out', () => {
  // per=3, done=1 -> 2 remaining training days this deload week
  const engine = makeEngine(() => ({ b: 2, w: 4, done: 1, per: 3, total: 22, wIdx: 3, over: false }));
  const history: Days = { '2026-08-01': { t: 'pull', l: null, sub: null } };
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.deload).not.toBeNull();
  expect(result.deload!.start).toBe('2026-08-15'); // starts today, not in the future
});

test('non-deload week projects a future deload window, offset ahead of today', () => {
  // per=3, total=5 (3*3 - 5 = 4 training days still needed to reach the next deload)
  const engine = makeEngine(() => ({ b: 1, w: 2, done: 2, per: 3, total: 5, wIdx: 1, over: false }));
  const history: Days = { '2026-08-01': { t: 'pull', l: null, sub: null } };
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.deload).not.toBeNull();
  expect(result.deload!.start > '2026-08-15').toBe(true); // strictly in the future
});

test('a deload projected to already be under way (offset <= 0) is not shown', () => {
  // per=3, total already at/past 3*3=9 -> trainingDaysToDeload floors at 0 -> offset 0, not shown
  const engine = makeEngine(() => ({ b: 1, w: 2, done: 2, per: 3, total: 12, wIdx: 1, over: false }));
  const history: Days = { '2026-08-01': { t: 'pull', l: null, sub: null } };
  const result = computeTrendForecast(engine, history, '2026-08-15');
  expect(result.deload).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd deadpoint-rn && npx jest trendForecast`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure forecast logic**

```typescript
// src/screens/calendar/trendForecast.ts
/** Direct port of CalendarView.swift's TrendForecast struct — a rate-
    based projection ("at the rate you've actually been training, when
    will the next deload/phase change really land"), distinct from the
    engine's own forecast(days) ("what would happen if every recommended
    day gets trained" - a different question, used elsewhere in the app,
    not reused here). See the Swift source's own doc comment on the
    struct for the full framing. */
import type { BlockInfo } from '../../engine/types';
import type { Days } from '../../data/useStore';

export interface Deload {
  start: string;
  end: string;
}

export interface TrendForecastResult {
  weeklyRate: number;
  windowDays: number;
  deload: Deload | null;
}

export interface TrendForecastEngine {
  addDays(date: string, n: number): string;
  block(date: string): BlockInfo;
  isTraining(type: string): boolean;
}

/** Training days per calendar day over the last `windowDays` (or however
    much real history exists, if less) - recency-weighted on purpose, see
    Swift's own extensive doc comment on weeklyRate(bridge:history:today:
    windowDays:) for why: a rolling window reflects how someone is
    training NOW, and is bounded by the earliest real history entry so a
    brand-new account's pre-existing silence isn't counted as a training
    gap. */
function weeklyRate(
  engine: TrendForecastEngine,
  history: Days,
  today: string,
  windowDays: number
): { rate: number; actualDays: number } {
  const keys = Object.keys(history);
  const earliest = keys.length > 0 ? keys.reduce((a, b) => (a < b ? a : b)) : today;
  const requestedStart = engine.addDays(today, -windowDays);
  const start = requestedStart > earliest ? requestedStart : earliest; // ISO strings sort chronologically

  let trainingCount = 0;
  let calendarCount = 0;
  let d = start;
  while (d <= today) {
    calendarCount += 1;
    const entry = history[d];
    if (entry && engine.isTraining(entry.t)) trainingCount += 1;
    d = engine.addDays(d, 1);
  }

  if (calendarCount === 0) return { rate: 4, actualDays: 0 };
  // Floored, not left at zero — a genuine 0/window would otherwise divide
  // the projection by zero and produce a nonsense date, not just a
  // distant one.
  const daily = Math.max(trainingCount / calendarCount, 1 / 30);
  return { rate: daily * 7, actualDays: calendarCount };
}

export function computeTrendForecast(
  engine: TrendForecastEngine,
  history: Days,
  today: string
): TrendForecastResult {
  const { rate: weekly, actualDays: windowDays } = weeklyRate(engine, history, today, 56);
  const calendarDaysPerTrainingDay = 7 / weekly;
  const b = engine.block(today);

  let deload: Deload | null;
  if (b.w === 4) {
    // Mid-deload right now: the days LEFT in THIS week, not a full window
    // three weeks out — block() freezes at today's real progress for any
    // future date, so reusing isDeload() past today would ring forever.
    const remainingTrainingDays = Math.max(0, b.per - b.done);
    const endOffset = Math.max(1, Math.round(remainingTrainingDays * calendarDaysPerTrainingDay));
    deload = { start: today, end: engine.addDays(today, endOffset) };
  } else {
    const trainingDaysToDeload = Math.max(0, b.per * 3 - b.total);
    const deloadStartOffset = Math.round(trainingDaysToDeload * calendarDaysPerTrainingDay);
    const deloadLengthOffset = Math.max(1, Math.round(b.per * calendarDaysPerTrainingDay));
    const deloadStart = engine.addDays(today, deloadStartOffset);
    const deloadEnd = engine.addDays(deloadStart, deloadLengthOffset);
    // Only worth showing once genuinely ahead of today, not one that (per
    // this projection) should already be under way.
    deload = deloadStartOffset > 0 ? { start: deloadStart, end: deloadEnd } : null;
  }

  return { weeklyRate: weekly, windowDays, deload };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd deadpoint-rn && npx jest trendForecast`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add src/screens/calendar/trendForecast.ts __tests__/trendForecast.test.ts
git commit -m "feat(calendar): trend-based deload forecast"
```

---

## Task 3: All-time stats and plan progress

Direct port of `CalendarView.swift`'s `computeAllTimeStats` (private static func) and the `planProgress` computed property.

**Files:**
- Create: `deadpoint-rn/src/screens/calendar/allTimeStats.ts`
- Create: `deadpoint-rn/src/screens/calendar/planProgress.ts`
- Create: `deadpoint-rn/__tests__/allTimeStats.test.ts`
- Create: `deadpoint-rn/__tests__/planProgress.test.ts`

**Interfaces:**
- Consumes: `SESSION_ORDER` from `src/engine/index.ts`; `Days` from `src/data/useStore.ts`; `Phase`, `BlockInfo` from `src/engine/types.ts`.
- Produces:
  ```typescript
  // allTimeStats.ts
  export interface StatsBreakdownRow { key: string; name: string; colour: string; count: number; }
  export interface AllTimeStats {
    loggedCount: number;
    consistencyPercent: number | null;
    consistencyFraction: string | null;
    streak: number;
    breakdown: StatsBreakdownRow[];
  }
  export interface AllTimeStatsEngine {
    addDays(date: string, n: number): string;
    block(date: string): BlockInfo;
    decide(date: string): { k: string };
    programStartDate(): string | undefined;
    sessionColourVarName(key: string): string;
    sessionInfo(key: string): { n?: string } | undefined;
  }
  export function computeAllTimeStats(engine: AllTimeStatsEngine, history: Days, today: string, resolveColour: (varName: string) => string, sessionOrder: readonly string[]): AllTimeStats;

  // planProgress.ts
  export interface PlanProgress { percent: number; current: number; total: number; }
  export interface PlanProgressEngine { phases: Phase[]; block(date: string): BlockInfo; }
  export function computePlanProgress(engine: PlanProgressEngine, today: string): PlanProgress | null;
  ```
  Task 6 imports both and wires them to the real `engine`, `resolveColour` (already exists: `src/design/colours.ts`), `store.days`, and `today`.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/allTimeStats.test.ts
import { computeAllTimeStats, type AllTimeStatsEngine } from '../src/screens/calendar/allTimeStats';
import type { Days } from '../src/data/useStore';

function fakeAddDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function makeEngine(overrides: Partial<AllTimeStatsEngine> = {}): AllTimeStatsEngine {
  return {
    addDays: fakeAddDays,
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }),
    decide: () => ({ k: 'pull' }),
    programStartDate: () => undefined,
    sessionColourVarName: (key) => `--${key}`,
    sessionInfo: (key) => ({ n: key.toUpperCase() }),
    ...overrides,
  };
}
const colour = (v: string) => v; // identity resolver, real one is src/design/colours.ts's resolveColour
const ORDER = ['pull', 'push', 'climbHard'] as const; // real one is SESSION_ORDER from src/engine

test('loggedCount counts every non-rest entry up to and including today, ignores future entries', () => {
  const history: Days = {
    '2026-08-01': { t: 'pull', l: null, sub: null },
    '2026-08-02': { t: 'rest', l: null, sub: null },
    '2026-08-03': { t: 'push', l: null, sub: null },
    '2026-09-01': { t: 'pull', l: null, sub: null }, // future - not counted
  };
  const stats = computeAllTimeStats(makeEngine(), history, '2026-08-15', colour, ORDER);
  expect(stats.loggedCount).toBe(2); // pull + push, not rest, not the future entry
});

test('climbHard becomes a single "Board" breakdown row, counting only board-tagged entries', () => {
  const history: Days = {
    '2026-08-01': { t: 'climbHard', l: null, sub: 'board' },
    '2026-08-02': { t: 'climbHard', l: null, sub: 'climb' }, // not board - doesn't count toward Board
  };
  const stats = computeAllTimeStats(makeEngine(), history, '2026-08-15', colour, ORDER);
  const board = stats.breakdown.find((r) => r.key === 'climbHard-board');
  expect(board).toEqual({ key: 'climbHard-board', name: 'Board', colour: '--climbHard', count: 1 });
});

test('Board always appears even at zero count, unlike every other breakdown row', () => {
  const stats = computeAllTimeStats(makeEngine(), {}, '2026-08-15', colour, ORDER);
  const board = stats.breakdown.find((r) => r.key === 'climbHard-board');
  expect(board?.count).toBe(0);
});

test('a session type with zero logged entries is omitted from the breakdown (except Board)', () => {
  const stats = computeAllTimeStats(makeEngine(), {}, '2026-08-15', colour, ORDER);
  expect(stats.breakdown.some((r) => r.key === 'pull')).toBe(false);
});

test('consistency percent and fraction are computed from block().total against a time-scaled expectation', () => {
  const engine = makeEngine({
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 3, wIdx: 0, over: false }),
    programStartDate: () => '2026-08-01',
  });
  // daysElapsed = Aug1 -> Aug8 inclusive = 8 days; expected = round(3 * 8 / 7) = 3
  const stats = computeAllTimeStats(engine, {}, '2026-08-08', colour, ORDER);
  expect(stats.consistencyFraction).toBe('3/3');
  expect(stats.consistencyPercent).toBe(100);
});

test('consistency is null with no programStartDate', () => {
  const stats = computeAllTimeStats(makeEngine({ programStartDate: () => undefined }), {}, '2026-08-08', colour, ORDER);
  expect(stats.consistencyPercent).toBeNull();
  expect(stats.consistencyFraction).toBeNull();
});

test('streak counts back from today, today gets a pass if nothing is logged yet', () => {
  const history: Days = {
    '2026-08-14': { t: 'pull', l: null, sub: null },
    '2026-08-13': { t: 'push', l: null, sub: null },
  };
  // today (15th) has nothing logged yet - gets a pass, doesn't break the streak
  const stats = computeAllTimeStats(makeEngine(), history, '2026-08-15', colour, ORDER);
  expect(stats.streak).toBe(2);
});

test('streak breaks on a real missed training day, but a rest day (decide()==="rest") does not break it', () => {
  const engine = makeEngine({ decide: (d) => ({ k: d === '2026-08-13' ? 'rest' : 'pull' }) });
  const history: Days = { '2026-08-14': { t: 'pull', l: null, sub: null } };
  // 13th: nothing logged, but decide() says it was a rest day -> streak continues
  // 12th: nothing logged, decide() says pull was due -> streak breaks here
  const stats = computeAllTimeStats(engine, history, '2026-08-15', colour, ORDER);
  expect(stats.streak).toBe(2); // today (pass) + the 14th; the 13th's rest pass extends it to include the 14th already counted, 12th breaks it
});

test('streak is bounded at programStartDate, never counts pre-account history', () => {
  const engine = makeEngine({ programStartDate: () => '2026-08-14' });
  const history: Days = {
    '2026-08-14': { t: 'pull', l: null, sub: null },
    '2026-08-13': { t: 'push', l: null, sub: null }, // before program start - must not count
  };
  const stats = computeAllTimeStats(engine, history, '2026-08-15', colour, ORDER);
  expect(stats.streak).toBe(1); // just the 14th; the 13th is before startDate, stops there regardless of its own logged entry
});
```

```typescript
// __tests__/planProgress.test.ts
import { computePlanProgress, type PlanProgressEngine } from '../src/screens/calendar/planProgress';

test('null with no Performance phase', () => {
  const engine: PlanProgressEngine = { phases: [], block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }) };
  expect(computePlanProgress(engine, '2026-08-15')).toBeNull();
});

test('null when Performance is the first phase (from <= 1, nothing to progress toward)', () => {
  const engine: PlanProgressEngine = {
    phases: [{ n: 'Performance', from: 1, c: '--gorse', d: '' }],
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 0, wIdx: 0, over: false }),
  };
  expect(computePlanProgress(engine, '2026-08-15')).toBeNull();
});

test('computes percent/current/total from banked training days against blocks-before-Performance', () => {
  const engine: PlanProgressEngine = {
    phases: [
      { n: 'Base', from: 1, c: '--gorse', d: '' },
      { n: 'Performance', from: 3, c: '--go', d: '' },
    ],
    block: () => ({ b: 1, w: 1, done: 0, per: 3, total: 12, wIdx: 0, over: false }),
  };
  // totalNeeded = (3-1) * 3 * 4 = 24
  const result = computePlanProgress(engine, '2026-08-15');
  expect(result).toEqual({ percent: 50, current: 12, total: 24 });
});

test('percent is capped at 100 for an account already past Performance', () => {
  const engine: PlanProgressEngine = {
    phases: [
      { n: 'Base', from: 1, c: '--gorse', d: '' },
      { n: 'Performance', from: 3, c: '--go', d: '' },
    ],
    block: () => ({ b: 5, w: 1, done: 0, per: 3, total: 999, wIdx: 0, over: false }),
  };
  expect(computePlanProgress(engine, '2026-08-15')!.percent).toBe(100);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd deadpoint-rn && npx jest allTimeStats planProgress`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the pure stats logic**

```typescript
// src/screens/calendar/allTimeStats.ts
/** Direct port of CalendarView.swift's private static computeAllTimeStats.
    Every number here is genuinely all-time, none of it scoped to whatever
    month the calendar is currently showing - see the Swift source's own
    doc comment for the direct feedback that shaped this ("i want all the
    stats to be all time stats... so when u go to other months it shows
    how many climbs and stuff ever"). */
import type { BlockInfo } from '../../engine/types';
import type { Days } from '../../data/useStore';

export interface StatsBreakdownRow {
  key: string;
  name: string;
  colour: string;
  count: number;
}

export interface AllTimeStats {
  loggedCount: number;
  consistencyPercent: number | null;
  consistencyFraction: string | null;
  streak: number;
  breakdown: StatsBreakdownRow[];
}

export interface AllTimeStatsEngine {
  addDays(date: string, n: number): string;
  block(date: string): BlockInfo;
  decide(date: string): { k: string };
  programStartDate(): string | undefined;
  sessionColourVarName(key: string): string;
  sessionInfo(key: string): { n?: string } | undefined;
}

/** SESSION_ORDER is the app's fixed session order (swipe order, week
    dots) - imported by the caller from src/engine/index.ts and passed in
    here, so this file has no dependency on the engine facade's module
    shape beyond the narrow AllTimeStatsEngine interface above. */
export function computeAllTimeStats(
  engine: AllTimeStatsEngine,
  history: Days,
  today: string,
  resolveColour: (varName: string) => string,
  sessionOrder: readonly string[]
): AllTimeStats {
  let loggedCount = 0;
  const counts: Record<string, number> = {};
  // Board gets its own count rather than joining `counts`' single-key-
  // per-type shape - climbHard becomes one "Board" row below, direct
  // feedback: it should mean board sessions specifically. A climbHard day
  // not tagged as board still counts toward loggedCount and still colours
  // its day on the grid, it just isn't a board session.
  let boardCount = 0;
  for (const [date, entry] of Object.entries(history)) {
    if (date > today) continue;
    counts[entry.t] = (counts[entry.t] ?? 0) + 1;
    if (entry.t !== 'rest') loggedCount += 1;
    if (entry.t === 'climbHard' && entry.sub === 'board') boardCount += 1;
  }

  const breakdown: StatsBreakdownRow[] = [];
  for (const key of sessionOrder) {
    if (key === 'rest') continue;
    if (key === 'climbHard') {
      breakdown.push({ key: 'climbHard-board', name: 'Board', colour: resolveColour(engine.sessionColourVarName(key)), count: boardCount });
      continue;
    }
    const n = counts[key];
    if (!n) continue;
    breakdown.push({ key, name: engine.sessionInfo(key)?.n ?? key, colour: resolveColour(engine.sessionColourVarName(key)), count: n });
  }

  // Consistency: Actual = block(today).total (the exact same training-
  // days-banked count block() itself already uses for phase/deload
  // progression - can never drift from what the rest of the app
  // considers "trained"). Expected = the program's per-week target
  // scaled by calendar days elapsed since programStartDate (NOT the
  // earliest logged entry - block().total is already counted from the
  // real start date, so the denominator has to match that same window).
  let consistencyPercent: number | null = null;
  let consistencyFraction: string | null = null;
  const startDate = engine.programStartDate();
  const b = engine.block(today);
  if (b.per > 0 && startDate) {
    const daysElapsed = daysBetween(startDate, today) + 1;
    const expected = Math.max(1, Math.round((b.per * daysElapsed) / 7));
    consistencyPercent = Math.round((b.total / expected) * 100);
    consistencyFraction = `${b.total}/${expected}`;
  }

  // Streak: consecutive days with something logged, walking back from
  // today - rest counts (logging rest still shows up). Today gets a pass
  // regardless of what's recommended (the day isn't over yet). Every
  // earlier day follows the real rule: a missing day only breaks the
  // streak if something was actually due (decide(date).k !== 'rest').
  // Bounded at programStartDate so this can't wander into pre-account
  // history and count a run of correctly-skipped-but-not-really-rest
  // days as an unbroken streak.
  let streak = 0;
  let d = today;
  if (!history[d]) d = engine.addDays(d, -1);
  for (let i = 0; i < 3650; i++) {
    if (startDate && d < startDate) break;
    if (history[d]) {
      streak += 1;
    } else if (engine.decide(d).k === 'rest') {
      streak += 1;
    } else {
      break;
    }
    d = engine.addDays(d, -1);
  }

  return { loggedCount, consistencyPercent, consistencyFraction, streak, breakdown };
}

/** Whole-day difference between two ISO date strings, via UTC epoch ms —
    safe here specifically because both inputs are already pure Y-M-D
    with no time-of-day, so there's no local-timezone/DST ambiguity to
    introduce (unlike calendarMath.ts's date construction, which builds
    real calendar dates from parts and needs local noon for that reason). */
function daysBetween(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}
```

```typescript
// src/screens/calendar/planProgress.ts
/** Direct port of CalendarView.swift's `planProgress` computed property —
    progress through the STRUCTURED plan (Base, Max Strength, Power),
    ending at the block Performance starts, not the plan's nominal last
    block. See Swift's own doc comment: Performance is open-ended
    "climb and maintain", not a phase with a further endpoint. */
import type { Phase, BlockInfo } from '../../engine/types';

export interface PlanProgress {
  percent: number;
  current: number;
  total: number;
}

export interface PlanProgressEngine {
  phases: Phase[];
  block(date: string): BlockInfo;
}

export function computePlanProgress(engine: PlanProgressEngine, today: string): PlanProgress | null {
  const performance = engine.phases.find((p) => p.n === 'Performance');
  if (!performance || performance.from <= 1) return null;
  const b = engine.block(today);
  const totalNeeded = (performance.from - 1) * b.per * 4;
  if (totalNeeded <= 0) return null;
  const percent = Math.min(100, Math.round((b.total / totalNeeded) * 100));
  return { percent, current: b.total, total: totalNeeded };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd deadpoint-rn && npx jest allTimeStats planProgress`
Expected: PASS, 9 + 4 = 13 tests.

- [ ] **Step 5: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add src/screens/calendar/allTimeStats.ts src/screens/calendar/planProgress.ts __tests__/allTimeStats.test.ts __tests__/planProgress.test.ts
git commit -m "feat(calendar): all-time stats and plan progress"
```

---

## Task 4: Month grid UI (`DayCell`, `MonthGrid`)

Direct port of `CalendarView.swift`'s `monthGrid`/`dayCell`/`PartialBorder`. This is where Task 1's `react-native-svg` proof gets used for real.

**Files:**
- Create: `deadpoint-rn/src/screens/calendar/DayCell.tsx`
- Create: `deadpoint-rn/src/screens/calendar/MonthGrid.tsx`
- Delete: `deadpoint-rn/src/screens/calendar/svgProof.tsx` (Task 1's throwaway proof — no longer needed once this task's real `<Svg>` usage is confirmed live in Task 6)

**Interfaces:**
- Consumes: `daysInMonthGrid` from `calendarMath.ts` (Task 1); `Colours`, `Fonts` from `src/design`.
- Produces:
  ```typescript
  export interface DayCellData {
    date: string;
    dayNum: number;
    isToday: boolean;
    isPast: boolean; // date <= today — governs the unlogged fill (s2 vs s1), matching Swift's own isPast ? s2 : s1
    loggedColour: string | null; // resolved hex, or null for "no session"
    isDeloadWindow: boolean;
    phaseColour: string | null; // resolved hex for this day's phase, or null
    borderTop: boolean; borderBottom: boolean; borderLeft: boolean; borderRight: boolean;
  }
  ```
  `<DayCell data={...} />` and `<MonthGrid days={(DayCellData | null)[]} />`, both exported from their own files. Task 6 computes the `DayCellData[]` (the per-cell neighbour-phase-border logic — Swift's `dayCell(_:index:phases:)` body) and passes it down; that computation is small enough to live directly in `CalendarScreen.tsx` (Task 6) rather than adding a fifth pure-logic file for it, since it's tightly coupled to how the screen resolves per-day phase names (`phaseNameAt` for past days, the trend forecast's `projectedPhaseName` for future ones) rather than being a standalone testable unit on its own.

- [ ] **Step 1: Write `DayCell.tsx`**

Direct port of `dayCell(_:index:phases:)` (`CalendarView.swift:229-310`). Fixed 38pt height per Swift's own `.frame(height: 38)`. The phase-boundary border bleeds 2px past the cell's own bounds on every bordered side (half the grid's 4px inter-cell gap) so adjacent cells' segments meet mid-gap — matches Swift's own documented reasoning exactly.

```typescript
// src/screens/calendar/DayCell.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';

export const CELL_HEIGHT = 38;
const BORDER_BLEED = 2; // half the grid's 4px inter-cell gap

export interface DayCellData {
  date: string;
  dayNum: number;
  isToday: boolean;
  isPast: boolean;
  loggedColour: string | null;
  isDeloadWindow: boolean;
  phaseColour: string | null;
  borderTop: boolean;
  borderBottom: boolean;
  borderLeft: boolean;
  borderRight: boolean;
}

export function DayCell({ data }: { data: DayCellData }) {
  const { dayNum, isToday, isPast, loggedColour, isDeloadWindow, phaseColour, borderTop, borderBottom, borderLeft, borderRight } = data;
  // Swift: loggedColour?.opacity(0.85) ?? (isPast ? s2 : s1)
  const fill = loggedColour != null ? withOpacity(loggedColour, 0.85) : (isPast ? Colours.s2 : Colours.s1);
  const numberColour = loggedColour != null ? Colours.bg : withOpacity(Colours.fg, isDeloadWindow ? 1 : 0.55);

  return (
    <View style={[styles.root, { backgroundColor: fill }, isToday && styles.todayOutline]}>
      {isDeloadWindow && <View style={styles.deloadRing} />}
      {/* Fonts.mono swaps the actual TTF family for 'bold' vs 'medium' (static
          TTFs, no weight axis — see Fonts' own doc comment) — a numeric
          fontWeight layered on top of a fixed family, like a raw
          `fontWeight: isToday ? '700' : '500'`, would not reliably render
          bold. Has to be computed per-instance, so it can't live in the
          static StyleSheet.create block below (that font varies by isToday). */}
      <Text style={[Fonts.mono(11, isToday ? 'bold' : 'medium'), { color: numberColour }]}>{dayNum}</Text>
      {phaseColour != null && (borderTop || borderBottom || borderLeft || borderRight) && (
        // No explicit width/height props, deliberately — react-native-svg's
        // own Svg.tsx only defaults to width=height='100%' when BOTH are
        // undefined AND position !== 'absolute' (confirmed by reading the
        // installed package's source directly). With position: 'absolute'
        // set here, that fallback never fires, so this Svg's actual
        // rendered size comes purely from Yoga resolving the negative
        // top/left/right/bottom insets below — exactly cell width+4 ×
        // cell height+4, matching Swift's own
        // `.frame(width: geo.size.width + 4, height: geo.size.height + 4)`.
        // Percentage Line coordinates then resolve against THAT real
        // size with no viewBox/preserveAspectRatio scale distortion.
        <Svg style={styles.borderSvg}>
          {borderTop && <Line x1="0%" y1="0%" x2="100%" y2="0%" stroke={phaseColour} strokeWidth={2.5} />}
          {borderBottom && <Line x1="0%" y1="100%" x2="100%" y2="100%" stroke={phaseColour} strokeWidth={2.5} />}
          {borderLeft && <Line x1="0%" y1="0%" x2="0%" y2="100%" stroke={phaseColour} strokeWidth={2.5} />}
          {borderRight && <Line x1="100%" y1="0%" x2="100%" y2="100%" stroke={phaseColour} strokeWidth={2.5} />}
        </Svg>
      )}
    </View>
  );
}

/** RN colour values in this project are plain hex strings (src/design/
    colours.ts), no built-in opacity compositing the way SwiftUI's
    `.opacity(_:)` on a Color has — this does the same "fg at 55% over
    the cell's own background" maths Swift's `.opacity(0.55)` does,
    manually (an 8-digit #RRGGBBAA hex, which RN/CSS colour parsing
    supports natively), since the fill is never guaranteed to be `bg`
    itself (an actually-logged cell's fill is the session's own accent
    colour). Also used for the logged fill's own 0.85 opacity. */
function withOpacity(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  root: {
    height: CELL_HEIGHT,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible', // the phase-border SVG deliberately bleeds past these bounds
  },
  todayOutline: {
    borderWidth: 1.5,
    borderColor: Colours.fg,
  },
  deloadRing: {
    position: 'absolute',
    top: 6, left: 6, right: 6, bottom: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colours.restC,
  },
  borderSvg: {
    position: 'absolute',
    top: -BORDER_BLEED, left: -BORDER_BLEED, right: -BORDER_BLEED, bottom: -BORDER_BLEED,
  },
});
```

Export `CELL_HEIGHT` from this file (add `export` to its declaration) — `MonthGrid.tsx`'s Step 2 below reuses it for the `null`-cell placeholder instead of duplicating the literal `38`.

**Note on the SVG viewBox approach**: this cell's border needs to bleed 2px past its own rendered width/height on the bordered sides, matching Swift's `GeometryReader` + `.frame(width: geo.size.width + 4, height: geo.size.height + 4)`. A percentage-based `viewBox` (`"0 0 104 100"` scaled to the actual rendered box via `preserveAspectRatio="none"`) approximates this without needing `onLayout` measurement — verify this actually reads as a continuous-looking border across adjacent same-phase cells on a real device in Task 6's live pass; if the bleed doesn't look right at real cell sizes, switch to measuring the cell's actual pixel width via `onLayout` and sizing the `<Svg>` in fixed points instead of a relative viewBox (a legitimate fallback, not a sign anything upstream is wrong).

- [ ] **Step 2: Write `MonthGrid.tsx`**

Direct port of `monthGrid`/`weekdayRow` (`CalendarView.swift:181-227`). No `LazyVGrid` equivalent in RN — a manual 7-column flexbox grid, grouped into week rows.

```typescript
// src/screens/calendar/MonthGrid.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { DayCell, CELL_HEIGHT, type DayCellData } from './DayCell';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CELL_GAP = 4;

export function MonthGrid({ cells }: { cells: (DayCellData | null)[] }) {
  const rows: (DayCellData | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          // Index as key, not the letter itself — Tue/Thu and Sat/Sun
          // share a letter (same real bug Swift's own comment documents
          // and fixes the same way: identity by position, not by value).
          <Text key={i} style={styles.weekdayLetter}>{letter}</Text>
        ))}
      </View>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((cell, colIdx) => (
            <View key={colIdx} style={styles.cellWrapper}>
              {cell != null ? <DayCell data={cell} /> : <View style={{ height: CELL_HEIGHT }} />}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: 'row', marginBottom: CELL_GAP },
  weekdayLetter: {
    flex: 1,
    textAlign: 'center',
    ...Fonts.mono(10, 'medium'),
    color: Colours.faint,
  },
  row: { flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP },
  cellWrapper: { flex: 1 },
});
```

- [ ] **Step 3: Delete the Task 1 SVG proof and run the type check**

```bash
cd deadpoint-rn && rm src/screens/calendar/svgProof.tsx
npx tsc --noEmit
```
Expected: no output. No new Jest tests this task (presentational components) — verified live in Task 6, including the SVG border bleed note above.

- [ ] **Step 4: Commit**

```bash
cd deadpoint-rn && git add src/screens/calendar/DayCell.tsx src/screens/calendar/MonthGrid.tsx
git rm src/screens/calendar/svgProof.tsx
git commit -m "feat(calendar): month grid with phase-boundary borders"
```

---

## Task 5: Plan progress bar, stats panel, legend

Direct ports of `planProgressBar`, `statsPanel`/`statTile`, and `legend`/`legendItem` (`CalendarView.swift:312-604`).

**Files:**
- Create: `deadpoint-rn/src/screens/calendar/PlanProgressBar.tsx`
- Create: `deadpoint-rn/src/screens/calendar/StatsPanel.tsx`
- Create: `deadpoint-rn/src/screens/calendar/Legend.tsx`

**Interfaces:**
- Consumes: `PlanProgress` (Task 3), `AllTimeStats`/`StatsBreakdownRow` (Task 3), `Phase` (`src/engine/types.ts`), `Deload` (Task 2).
- Produces: `<PlanProgressBar progress={PlanProgress | null} accent={string} />`, `<StatsPanel stats={AllTimeStats | null} />`, `<Legend phases={Phase[]} deload={Deload | null} isDeloadOngoing={boolean} resolveColour={(v: string) => string} />`. Task 6 assembles all three.

- [ ] **Step 1: Write `PlanProgressBar.tsx`**

```typescript
// src/screens/calendar/PlanProgressBar.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { PlanProgress } from './planProgress';

export function PlanProgressBar({ progress, accent }: { progress: PlanProgress | null; accent: string }) {
  if (!progress) return null;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>PLAN PROGRESS</Text>
        <Text style={styles.percent}>{progress.percent}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, progress.percent)}%`, backgroundColor: accent }]} />
      </View>
      <Text style={styles.caption}>{progress.current}/{progress.total} training days to Performance</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { ...Fonts.mono(9.5, 'medium'), color: Colours.faint },
  percent: { ...Fonts.mono(13, 'bold'), color: '#FFFFFF' },
  track: { height: 8, borderRadius: 4, backgroundColor: Colours.s2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  caption: { ...Fonts.mono(9, 'medium'), color: Colours.faint },
});
```

- [ ] **Step 2: Write `StatsPanel.tsx`**

```typescript
// src/screens/calendar/StatsPanel.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { AllTimeStats } from './allTimeStats';

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function StatsPanel({ stats }: { stats: AllTimeStats | null }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.divider} />
      <Text style={styles.heading}>STATS</Text>
      <View style={styles.tileRow}>
        <StatTile value={stats ? `${stats.loggedCount}` : '—'} label="SESSIONS LOGGED" />
        <StatTile
          value={stats?.consistencyPercent != null ? `${stats.consistencyPercent}%` : '—'}
          label={stats?.consistencyFraction ? `CONSISTENCY · ${stats.consistencyFraction}` : 'CONSISTENCY'}
        />
        <StatTile value={stats ? `${stats.streak}` : '—'} label="DAY STREAK" />
      </View>
      {stats != null && stats.breakdown.length > 0 && (
        <View style={styles.breakdownGrid}>
          {stats.breakdown.map((row) => (
            <View key={row.key} style={styles.breakdownRow}>
              <View style={[styles.breakdownSwatch, { backgroundColor: row.colour }]} />
              <Text style={styles.breakdownText} numberOfLines={1}>{row.name.toUpperCase()} · {row.count}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: Colours.s2 },
  heading: { ...Fonts.mono(11, 'bold'), color: Colours.faint },
  tileRow: { flexDirection: 'row' },
  tile: { flex: 1, gap: 2 },
  tileValue: { ...Fonts.heading(22), color: '#FFFFFF' },
  tileLabel: { ...Fonts.mono(8.5, 'medium'), color: Colours.faint },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '47%' },
  breakdownSwatch: { width: 8, height: 8, borderRadius: 2 },
  breakdownText: { ...Fonts.mono(10, 'medium'), color: Colours.dim, flexShrink: 1 },
});
```

- [ ] **Step 3: Write `Legend.tsx`**

Direct port of `legend`/`legendItem` (`CalendarView.swift:312-368`). `displayDate` (Swift's `"d MMM"` en_GB formatter) is small enough to inline here rather than adding it to `calendarMath.ts`.

```typescript
// src/screens/calendar/Legend.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { Phase } from '../../engine/types';
import type { Deload } from './trendForecast';

function displayDate(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

export interface LegendProps {
  phases: Phase[];
  deload: Deload | null;
  isDeloadOngoing: boolean;
  resolveColour: (varName: string) => string;
}

export function Legend({ phases, deload, isDeloadOngoing, resolveColour }: LegendProps) {
  return (
    <View style={{ gap: 8, paddingTop: 4 }}>
      <View style={styles.row}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: Colours.s2 }]} />
          <Text style={styles.legendText}>No session</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.deloadSwatch} />
          <Text style={styles.legendText}>Deload week</Text>
        </View>
      </View>
      {deload != null && (
        <Text style={styles.caption}>
          {isDeloadOngoing
            ? `This deload runs to ${displayDate(deload.end)}, at your pace`
            : `Next deload, at your pace: ${displayDate(deload.start)} – ${displayDate(deload.end)}`}
        </Text>
      )}
      {phases.length > 0 && (
        <>
          <View style={[styles.row, { paddingTop: 2 }]}>
            {phases.map((phase) => (
              <View key={phase.n} style={styles.legendItem}>
                <View style={[styles.phaseSwatch, { borderColor: resolveColour(phase.c) }]} />
                <Text style={styles.legendText}>{phase.n.toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.caption, { paddingTop: 2 }]}>
            Phases past today are projected from your current pace, not confirmed.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  deloadSwatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colours.restC },
  phaseSwatch: { width: 10, height: 10, borderRadius: 2, borderWidth: 2 },
  legendText: { ...Fonts.mono(10, 'medium'), color: Colours.faint },
  caption: { ...Fonts.mono(10.5, 'medium'), color: Colours.dim },
});
```

- [ ] **Step 4: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass (no new tests this task — presentational components), `tsc` clean.

- [ ] **Step 5: Commit**

```bash
cd deadpoint-rn && git add src/screens/calendar/PlanProgressBar.tsx src/screens/calendar/StatsPanel.tsx src/screens/calendar/Legend.tsx
git commit -m "feat(calendar): plan progress bar, stats panel, legend"
```

---

## Task 6: Screen assembly, routing, and live verification

Assembles Tasks 1-5 into the real calendar screen, wires it up as a modal route, replaces `card.tsx`'s `onTapCalendar` no-op, and verifies the whole thing live on device.

**Files:**
- Create: `deadpoint-rn/src/screens/calendar/CalendarScreen.tsx`
- Create: `deadpoint-rn/app/(main)/calendar.tsx`
- Modify: `deadpoint-rn/app/_layout.tsx` (register the modal presentation)
- Modify: `deadpoint-rn/app/(main)/card.tsx` (wire the real `onTapCalendar`)

**Interfaces:**
- Consumes everything from Tasks 1-5, plus `useSession` (`src/data/useSession.ts`), `useStore` (`src/data/useStore.ts`), `createEngine`, `PROGRAMS` (matching `card.tsx`'s own existing pattern for resolving a program from the signed-in email), `resolveColour` (`src/design/colours.ts`), `useRouter`/`router` from `expo-router`.

- [ ] **Step 1: Confirm expo-router's modal-presentation syntax against the installed version**

This plan assumes `<Stack.Screen name="..." options={{ presentation: 'modal' }} />` registered as a child of the root `<Stack>` in `app/_layout.tsx`, using the route's full group-qualified name. Confirm this against the actually-installed `expo-router` before writing Step 2:

Run: `grep -rn "presentation" deadpoint-rn/node_modules/expo-router/build/typography/../**/*.d.ts 2>/dev/null; grep -rln "'modal'" deadpoint-rn/node_modules/expo-router/build/*.d.ts deadpoint-rn/node_modules/@react-navigation/native-stack/lib/typescript/**/*.d.ts 2>/dev/null`

Expected: at least one match confirming `'modal'` is a valid `presentation` option on native-stack (the underlying navigator expo-router's `<Stack>` wraps). If the exact screen-naming convention for a route nested inside a group (`(main)/calendar` vs. `calendar`) differs from what Step 2 assumes, adjust it to match — verify live in Step 6 regardless (a wrong screen name here fails obviously: the modal simply won't be affected by the `options`, defaulting to a normal push instead — not a silent failure).

- [ ] **Step 2: Register the modal presentation**

In `app/_layout.tsx`, change the self-closing `<Stack screenOptions={{...}} />` to have a child `<Stack.Screen>` for the calendar route:

```typescript
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colours.bg } }}>
          <Stack.Screen name="(main)/calendar" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
```

- [ ] **Step 3: Write `CalendarScreen.tsx`**

Direct port of `CalendarView.swift`'s `body`/`topBar`/`monthNav`/`currentPositionLine`/`currentPhaseColour`/`projectedPhaseName`/`dayCell`'s per-cell neighbour logic (the parts not already covered by Tasks 1-5's own files). Takes everything it needs as props — no hooks of its own beyond `useState` for `visibleMonth`, matching this project's established "screen owns hooks, presentational tree doesn't" split, except this component IS effectively the screen's whole body (Decision 2 in the design spec put the actual `useSession`/`useStore`/`createEngine` calls in `app/(main)/calendar.tsx` itself, one level up, mirroring how `card.tsx` owns those same calls today).

```typescript
// src/screens/calendar/CalendarScreen.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { resolveColour } from '../../design/colours';
import type { Phase } from '../../engine/types';
import { SESSION_ORDER } from '../../engine';
import type { Days } from '../../data/useStore';
import { daysInMonthGrid, monthTitle, shiftMonth, startOfMonth } from './calendarMath';
import { computeTrendForecast, type TrendForecastEngine } from './trendForecast';
import { computeAllTimeStats, type AllTimeStatsEngine } from './allTimeStats';
import { computePlanProgress, type PlanProgressEngine } from './planProgress';
import { MonthGrid } from './MonthGrid';
import type { DayCellData } from './DayCell';
import { PlanProgressBar } from './PlanProgressBar';
import { StatsPanel } from './StatsPanel';
import { Legend } from './Legend';

/** The narrow slice of a real engine (createEngine()'s return value) this
    whole screen needs — every sub-computation's own *Engine interface
    (TrendForecastEngine, AllTimeStatsEngine, PlanProgressEngine) is a
    subset of this, so a real engine instance satisfies all of them
    structurally with no adapter. */
export interface CalendarEngine extends TrendForecastEngine, AllTimeStatsEngine, PlanProgressEngine {
  phaseNameAt(date: string): string;
}

export interface CalendarScreenProps {
  engine: CalendarEngine;
  history: Days;
  today: string;
  onDismiss: () => void;
}

/** Mirrors CalendarView.swift's projectedPhaseName(daysAhead:) — a FUTURE
    date projects through however many blocks the trend rate implies
    between today and then (continuous block-length maths, not a day-by-
    day walk), not just the next phase transition. Stopping at the first
    transition left every later month stuck on that same "next" phase
    forever — real bug, reported directly ("why does max strength not
    end"). */
function projectedPhaseName(engine: CalendarEngine, today: string, weeklyRate: number, daysAhead: number): string {
  const b = engine.block(today);
  if (weeklyRate <= 0) return engine.phaseNameAt(today);
  const calendarDaysPerTrainingDay = 7 / weeklyRate;
  const trainingDaysAhead = daysAhead / calendarDaysPerTrainingDay;
  const totalProjected = b.total + trainingDaysAhead;
  const blockLength = b.per * 4;
  if (blockLength <= 0) return engine.phaseNameAt(today);
  const blocksAhead = Math.floor(totalProjected / blockLength);
  const projectedBlock = b.b + blocksAhead;
  const idx = engine.phaseIndexAt(projectedBlock);
  const phases = engine.phases;
  if (phases.length === 0) return engine.phaseNameAt(today);
  return phases[Math.min(Math.max(idx, 0), phases.length - 1)].n;
}

function daysBetweenLocal(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function CalendarScreen({ engine, history, today, onDismiss }: CalendarScreenProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));

  const forecast = useMemo(() => computeTrendForecast(engine, history, today), [engine, history, today]);
  const allTimeStats = useMemo(
    () => computeAllTimeStats(engine, history, today, resolveColour, SESSION_ORDER),
    [engine, history, today]
  );
  const planProgress = useMemo(() => computePlanProgress(engine, today), [engine, today]);

  const currentBlock = engine.block(today);
  const currentPhaseName = engine.phaseNameAt(today);
  const phaseColourByName: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of engine.phases) out[p.n] = resolveColour(p.c);
    return out;
  }, [engine]);
  const currentPhaseColour = phaseColourByName[currentPhaseName] ?? null;
  const currentPositionLine = `${currentPhaseName.toUpperCase()} · BLOCK ${currentBlock.b} · WK ${currentBlock.w} OF 4${currentBlock.w === 4 ? ' · DELOAD' : ''}`;
  const isDeloadOngoing = currentBlock.w === 4;

  const cells: (DayCellData | null)[] = useMemo(() => {
    const rawDays = daysInMonthGrid(visibleMonth);

    // One flat phase-name array, same index scheme as rawDays — every
    // cell needs its up/down/left/right neighbours' phases, so resolve
    // the whole month up front rather than each cell re-deriving its
    // neighbours independently (matches Swift's own monthGrid comment).
    const phases: (string | null)[] = rawDays.map((date) => {
      if (date == null) return null;
      if (date <= today) return engine.phaseNameAt(date);
      const daysAhead = daysBetweenLocal(today, date);
      return projectedPhaseName(engine, today, forecast.weeklyRate, daysAhead);
    });

    return rawDays.map((date, i) => {
      if (date == null) return null;
      const dayNum = Number(date.split('-')[2]);
      const isToday = date === today;
      const isPast = date <= today;
      const entry = isPast ? history[date] : undefined;
      const loggedColour = entry ? resolveColour(engine.sessionColourVarName(entry.t)) : null;

      const isDeloadWindow = isPast
        ? engine.isDeload(date)
        : forecast.deload != null && date >= forecast.deload.start && date <= forecast.deload.end;

      const myPhase = phases[i];
      const col = i % 7;
      const sameUp = i - 7 >= 0 && phases[i - 7] === myPhase;
      const sameDown = i + 7 < phases.length && phases[i + 7] === myPhase;
      const sameLeft = col > 0 && phases[i - 1] === myPhase;
      const sameRight = col < 6 && phases[i + 1] === myPhase;
      const phaseColour = myPhase != null ? (phaseColourByName[myPhase] ?? null) : null;

      return {
        date, dayNum, isToday, isPast, loggedColour, isDeloadWindow, phaseColour,
        borderTop: !sameUp, borderBottom: !sameDown, borderLeft: !sameLeft, borderRight: !sameRight,
      };
    });
  }, [visibleMonth, today, history, engine, forecast, phaseColourByName]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBarRow}>
          <Text style={styles.title}>CALENDAR</Text>
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close calendar">
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>
        <Text style={[styles.positionLine, { color: currentPhaseColour ?? Colours.dim }]}>{currentPositionLine}</Text>

        <PlanProgressBar progress={planProgress} accent={currentPhaseColour ?? resolveColour('--gorse')} />

        <View style={styles.monthNavRow}>
          <Pressable onPress={() => setVisibleMonth(shiftMonth(visibleMonth, -1))} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Previous month">
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={styles.monthTitle}>{monthTitle(visibleMonth)}</Text>
            <Text style={styles.rateCaption}>~{forecast.weeklyRate.toFixed(1)} sessions / wk · last {forecast.windowDays}d</Text>
          </View>
          <Pressable onPress={() => setVisibleMonth(shiftMonth(visibleMonth, 1))} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Next month">
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>

        <MonthGrid cells={cells} />

        <Legend phases={engine.phases} deload={forecast.deload} isDeloadOngoing={isDeloadOngoing} resolveColour={resolveColour} />

        <StatsPanel stats={allTimeStats} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  content: { padding: 20, gap: 13 },
  topBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...Fonts.heading(26), color: '#FFFFFF' },
  closeIcon: { fontSize: 15, fontWeight: '600', color: Colours.dim },
  positionLine: { ...Fonts.mono(11, 'bold') },
  monthNavRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colours.s1, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 18, fontWeight: '700', color: Colours.dim },
  monthTitle: { ...Fonts.mono(13, 'bold'), color: '#FFFFFF' },
  rateCaption: { ...Fonts.mono(9.5, 'medium'), color: Colours.faint },
});
```

- [ ] **Step 4: Write `app/(main)/calendar.tsx`**

Owns its own session/store/program resolution — Decision 2 in the design spec, deliberately independent of `card.tsx`'s own instances rather than sharing state through a new context.

```typescript
// app/(main)/calendar.tsx
import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '../../src/data/useSession';
import { useStore } from '../../src/data/useStore';
import { createEngine } from '../../src/engine';
import { CalendarScreen } from '../../src/screens/calendar/CalendarScreen';

const PROGRAMS = require('../../src/engine/programs.js');

export default function Calendar() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const program = useMemo(() => PROGRAMS[(email ?? '').toLowerCase()] ?? PROGRAMS.default, [email]);

  const [today] = React.useState(() => createEngine(program, { sessionLog: {}, loadLog: {} }).today());
  const store = useStore(program.startDate ?? null, today, userId);
  const engine = useMemo(() => createEngine(program, { sessionLog: store.days, loadLog: {} }), [program, store.days]);

  return <CalendarScreen engine={engine} history={store.days} today={today} onDismiss={() => router.back()} />;
}
```

- [ ] **Step 5: Wire the real `onTapCalendar` in `card.tsx`**

In `app/(main)/card.tsx`, add `import { useRouter } from 'expo-router';` and `const router = useRouter();` near the top of the component, then change:
```typescript
      onTapCalendar={() => {}}
```
to:
```typescript
      onTapCalendar={() => router.push('/calendar')}
```

- [ ] **Step 6: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass (28 new tests from Tasks 1-3: 9 + 6 + 13), `tsc` clean.

- [ ] **Step 7: Verify live on a real device**

```bash
cd deadpoint-rn && export LANG=en_US.UTF-8 && export LC_ALL=en_US.UTF-8 && npx expo run:ios --device "iPhone 17"
```

Exercise, in order:
1. Tap the calendar icon in the header — confirm it opens as a modal (slides up from the bottom, not a horizontal push), showing the current month with today's cell outlined and the position line correct.
2. Confirm past logged days show their session's real accent colour, and any real deload week shows the red ring.
3. Confirm the phase-boundary border traces a continuous-looking box around however many days share a phase, with no visible gaps at cell seams (this is the one genuinely novel rendering technique this phase introduces — react-native-svg's border bleed, per `DayCell.tsx`'s own note in Task 4. If gaps ARE visible, switch to the `onLayout`-measured fallback noted there).
4. Tap the prev/next month arrows — confirm the grid, position line, and stats panel update correctly, and that a future month correctly projects a phase-boundary box through more than one phase over several months forward (the exact "why does max strength not end" bug Swift's own comment documents — verify it doesn't recur here).
5. Confirm the plan progress bar, stats tiles, and breakdown grid show sensible real numbers matching what's actually been logged on this account.
6. Tap the X (or swipe down) to dismiss — confirm it returns cleanly to the daily card with no lost state.

Fix anything genuinely broken before proceeding, following this project's established live-debugging method (reproduce via a real tap, read the full error from LogBox when available, re-verify with both `npx jest`/`npx tsc --noEmit` and a fresh device run — a full `expo run:ios` restart, not just `simctl terminate`/`launch`, which this project has already confirmed doesn't reliably refresh the bundle).

- [ ] **Step 8: Commit**

```bash
cd deadpoint-rn && git add src/screens/calendar/CalendarScreen.tsx "app/(main)/calendar.tsx" app/_layout.tsx "app/(main)/card.tsx"
git commit -m "feat(calendar): assemble calendar screen, wire modal route"
```

---

## Self-Review

**Spec coverage:** month grid + phase borders (Tasks 1, 4), deload rings (Task 4/6), stats (Task 3, 5), plan progress (Task 3, 5), trend forecast (Task 2), month navigation (Task 6), modal presentation (Task 6) — every section of `docs/superpowers/specs/2026-08-31-phase-4-calendar-design.md` has a task.

**Placeholder scan:** no TBD/TODO markers; the two "confirm against installed types" steps (Task 6 Step 1) name the exact grep to run and the concrete fallback, matching the established pattern from Phase 3's plan.

**Type consistency:** `DayCellData` (Task 4) is defined once and consumed by name in `MonthGrid.tsx` and `CalendarScreen.tsx`. `TrendForecastEngine`/`AllTimeStatsEngine`/`PlanProgressEngine` (Tasks 2-3) are each narrow interfaces a real `CalendarEngine` (Task 6) satisfies structurally — verified their method signatures match `src/engine/index.ts`'s real facade exactly (`block`, `phaseNameAt`, `isDeload`, `decide`, `addDays`, `isTraining`, `phases`, `programStartDate`, `sessionColourVarName`, `sessionInfo`, `phaseIndexAt` all cross-checked against the actual file, not assumed).

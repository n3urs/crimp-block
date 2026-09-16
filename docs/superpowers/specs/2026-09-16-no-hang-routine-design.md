# No-Hang Routine Follow-Along — Design

**Date:** 2026-09-16
**App:** Deadpoint React Native (`deadpoint-rn/`)
**Status:** Approved by Oscar

## Goal

A Crimpd-style follow-along for Emil Abrahamsson's sub-max daily fingerboard
routine ("no-hangs"): pick your board, press start, and the screen shows the
board with the hold to use lit up, names the grip and which fingers go on,
and runs the timer with beeps. For trying the routine, not for tracking it.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Flexibility | Emil's routine only, fixed. No editing, no builder. |
| Tracking | Pure follow-along. Only the chosen board is saved (on the phone). Nothing touches the plan, session log or calendar. |
| Boards | Beastmaker 1000 and Beastmaker 2000, user picks. |
| Hands | Two hands, one hold each (a pair of holds). |
| BM1000 hold | Bottom-row outer pair (~20mm, measured by Gordon Lesti). |
| BM2000 hold | Middle-row outer pair (hold "A" in the labelled photo; listed as the ~33mm big edges, position unconfirmed by a source). Chosen by Oscar. |
| Entry point | A "NO-HANG ROUTINE" card in Settings, directly under FORCE GAUGE, same style. May move later. |
| Timer | Reuse the existing repeater timer (`useIntervalTimer`) unchanged. |

## The routine (source: Emil's own follow-along video, 2023-05-24)

Every rep: **10s on / 20s rest**, feet on the floor, ~40% of max (30–50% on the
two-finger grips — estimate and go a little under 40% if unsure). Same edge
throughout. At least 6 hours between sessions. Stop or go lighter if there is
any fatigue or discomfort.

| Reps | Grip | Fingers |
|---|---|---|
| 1–6 | Half crimp | Index, middle, ring, pinky (pinky may stay open). Fingers bent ~90°. |
| 7–12 | Three-finger drag | Index, middle, ring. Open hand, hang passively. |
| 13–14 | Front two-finger drag | Index, middle |
| 15–16 | Middle two-finger drag | Middle, ring |
| 17–18 | Front two-finger half crimp | Index, middle |
| 19–20 | Middle two-finger half crimp | Middle, ring |

20 reps ≈ 10 minutes including the 5s get-ready.

## Screens

### Settings card
`NO-HANG ROUTINE` section under `FORCE GAUGE`: whole card tappable (same
pattern as the force gauge card), title "EMIL'S DAILY NO-HANG ROUTINE",
subtitle "10-minute sub-max fingerboard follow-along. Beastmaker 1000 or 2000."
Opens `/no-hang`.

### Setup (screen idle)
- Header "NO-HANG ROUTINE" + CLOSE (same header as the force gauge screen).
- Board toggle: `1000` / `2000` (segmented control). Choice saved in
  AsyncStorage and restored next time; defaults to 1000.
- Board diagram for the selected board, the routine's hold pair highlighted in
  gorse, every other hold drawn muted.
- Three rules as short lines: feet stay on the floor; ~40% effort (30–50% on
  two-finger grips); at least 6 hours between sessions.
- START button (primary gorse, bottom).

### Follow-along (timer running)
- Board diagram at the top, pair highlighted.
- Grip name large (e.g. `HALF CRIMP`) with a finger diagram under it: four
  fingers per hand, engaged fingers filled, others outlined; crimp vs drag
  shown in the label.
- Big countdown digits (timer digit font), coloured by phase using the repeater
  timer's colours: get ready = `readyC` amber, load = `go` green, rest =
  `restC` red.
- Rep counter: `REP 7 / 20`.
- During get-ready and rest the grip area shows the **upcoming** rep's grip
  labelled `NEXT`; during a load it shows the current grip.
- Controls: PAUSE/RESUME, STOP, mute toggle.
- Done state: "DONE — 20 REPS" then back to the setup view.

Leaving the screen stops the timer (the hook already clears its ticker on
unmount).

## Architecture

### `src/noHang/protocol.ts` (pure, unit tested)
- `GRIPS`: the six grip blocks in order — `{ name, reps, fingers: Finger[], style: 'crimp' | 'drag' }` where `Finger = 'index' | 'middle' | 'ring' | 'pinky'`.
- `TOTAL_REPS = 20`, `ON_SECS = 10`, `REST_SECS = 20`.
- `gripForRep(rep: number): Grip` — 1-based rep → its grip block.
- `displayedGrip(phase, set): { grip, isNext }` — which grip to show for a timer
  phase: `on` → current rep; `ready` → rep 1 as NEXT; `setrest` → rep `set + 1`
  as NEXT; `off` and `done` (only reached after rep 20) → rep 20, not NEXT.
- `BOARDS`: `{ bm1000, bm2000 }`, each with the board outline and every hold as
  a rounded rect in normalised 0–1 coordinates (measured from the official
  product photos), plus the ids of the highlighted pair.
- `TIMER_CONFIG`: `{ interval: { on: 10, off: 0, reps: 1 }, setRestSecs: 20, sets: 20 }`.

**Why `off: 0`:** with `reps: 1`, the timer's short `off` phase is only ever
reached after the final set's load (every other set goes `on → setrest`). A
0-second `off` finishes immediately instead of adding a pointless 20s rest
after the last rep. This needs no change to the shared timer logic.

### `src/noHang/BoardDiagram.tsx`
`react-native-svg` drawing of the selected board from `BOARDS`. Props:
`board`, `width`. Highlighted pair in gorse, other holds in muted `s3`, board
body `s2`. Our own schematic — no Beastmaker images ship in the app.

### `src/noHang/GripDiagram.tsx`
Two hands of four finger pills (engaged filled gorse, disengaged outlined),
sized for a glance from arm's length.

### `app/no-hang.tsx`
Modal screen registered in `app/_layout.tsx` (`presentation: 'modal'`), same
pattern as `force-gauge`. Owns board choice (load/save via a small
`src/noHang/boardPref.ts` AsyncStorage wrapper) and calls
`useIntervalTimer().start(TIMER_CONFIG.interval, TIMER_CONFIG.setRestSecs, TIMER_CONFIG.sets, 'No-hang routine')`.
Renders setup when the timer state is `null`, follow-along otherwise.

### `app/settings.tsx`
New `NO-HANG ROUTINE` section under `FORCE GAUGE`.

## Error handling / edge cases
- AsyncStorage read fails or returns junk → default to `bm1000`.
- Screen closed mid-routine → timer cleared by the hook's unmount effect; no
  stray beeps.
- Pause during rest keeps showing the NEXT grip; resume continues from the same
  second.

## Testing
- `__tests__/noHangProtocol.test.ts`:
  - grip counts sum to 20 and `gripForRep` returns the right block at every
    boundary (1, 6, 7, 12, 13, 14, 15, 16, 17, 18, 19, 20);
  - `displayedGrip` for `ready`, `on`, and `setrest` (including the rest after
    rep 6 showing three-finger drag as NEXT);
  - driving `advancePhase` from `intervalTimerLogic.ts` with `TIMER_CONFIG`
    yields exactly 20 `on` phases and finishes straight after the 20th
    (via a 0s `off`), with 19 `setrest` phases between.
- Visual check in the Simulator of setup, follow-along (load + rest) and done
  states for both boards.

## Out of scope
Logging sessions, reminders or the 6-hour countdown, editing the routine, other
boards, force gauge integration, moving the entry point out of Settings.

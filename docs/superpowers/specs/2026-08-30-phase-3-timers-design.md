# Phase 3 — Timers: Design

**Status:** Approved by Oscar (2026-08-30), ready for `writing-plans`.

## Context

The Phase 0-2 plan (`docs/superpowers/plans/2026-08-29-react-native-rebuild.md`) explicitly deferred phases 3-8 to their own plans, "because the component patterns established [in Phase 2] are what those plans should follow." Phase 2 is now not just code-complete but **real-device-verified** — a full session of live testing on an iPhone 17 simulator found and fixed 6 instances of the uncaught-promise-rejection bug class, a missing `GestureHandlerRootView`, an un-worklet'd swipe-carousel function, and a missing safe-area setup. Those fixes are what "the patterns are proven" now concretely means, and this design follows them.

This phase ports the rest timer and the interval ("repeater") timer: the two pieces of `DailyCardView.swift` that Task 7 (Phase 2) explicitly left as no-ops (`ExerciseRow.tsx`'s `onTapRest`/`onStartInterval` props already exist, wired to nothing).

## Swift source of truth

| File | Lines | Role |
|---|---|---|
| `ios/Shared/RestTimerController.swift` | 91 | Rest timer's `@Observable` state (`endDate`, `totalSeconds`, `label`) + Live Activity + local-notification lifecycle |
| `ios/CrimpBlock/RestTimerOverlay.swift` | 110 | Bottom bar: 3px progress strip, "REST", big countdown, "STOP" |
| `ios/Shared/IntervalTimerController.swift` | 185 | Repeater timer's `ready→on→off→setrest→done` state machine |
| `ios/CrimpBlock/IntervalTimerView.swift` | 147 | Full-screen overlay: traffic-light background, huge countdown, pause/resume/stop/mute |
| `ios/Shared/IntervalTonePlayer.swift` | 119 | 4 runtime-synthesized tone cues (ready/go/stop/done) via `AVAudioEngine` |
| `ios/Shared/TimerActivity.swift`, `ios/CrimpBlockWidget/RestTimerLiveActivity.swift` | 133 | Live Activity / Dynamic Island — **out of scope**, see Risk Register item 1 in the Phase 0-2 plan. Not read for this design beyond confirming they're skippable. |

## Scope

**In scope**, matching the Phase 0-2 plan's own roadmap row ("3. Timers — Rest timer, interval timer, audio cues, notifications"):
- Rest timer: bottom-bar overlay, countdown, stop, completion tone, completion local notification.
- Interval/repeater timer: full-screen overlay, the `ready/on/off/setrest/done` state machine, pause/resume/mute, per-phase tones.
- The 4 tone cues (ready/go/stop/done), pre-rendered (see Decision 1 below).
- Wiring `ExerciseRow`'s existing `onTapRest`/`onStartInterval` props to real handlers in `card.tsx`.

**Out of scope** (deferred to a later phase, same "no-op until its owning phase" precedent Task 12 already established for `onTapSettings`/`onTapCalendar`/`onTapGuide`):
- Live Activities / Dynamic Island / home-screen widgets — already decided out of scope for the whole RN rebuild (Phase 0-2 plan's Risk Register items 1-2). iOS keeps its native `ActivityKit`/`WidgetKit` code as-is; Android gets no equivalent.
- `autoStartRestOnTally` and `setsCounterEnabled` — both are `SettingsView`-gated `@AppStorage` toggles (confirmed via grep: only read in `SettingsView.swift` and `DailyCardView.swift`, both default `false`). No settings screen exists yet (the gear icon is still a Task-12 no-op), so these stay hardcoded off. This also means **Phase 3 does not need to solve the `prefs.ts`/MMKV-replacement problem** the Phase 0-2 plan's target file structure flagged — that's now cleanly Phase 5's concern (Settings), not this phase's.
- Tutorial spotlight signalling (`onTutorialSignal` in `RestTimerOverlay.swift`, `tutorialTarget(...)` calls) — Phase 5 (Onboarding) territory; stub as a no-op parameter, same pattern.

## Decision 1: tone cues are pre-rendered, not synthesized live

**Approved by Oscar.** `IntervalTonePlayer.swift` synthesizes 4 short piano-ish melodies at runtime via `AVAudioEngine` (fundamental + 2 harmonics, attack/decay envelope, exact frequencies/timings documented in-file). Reimplementing that with a native RN audio-synthesis library was considered and rejected: this session already hit three unbuildable native dependencies under this exact Expo SDK (`expo-av`, `react-native-mmkv`, `expo-updates`), and audio-graph synthesis libraries are a similarly exotic, less-proven category — a real risk of repeating that failure for a cosmetic feature.

Instead: a one-off Node script (not part of the app, not run at build time) reproduces `pianoish()`'s exact math — same frequencies, same per-cue note timings, same envelope — and renders each cue to a short WAV file, committed as a static asset under `assets/audio/`. Playback uses `expo-audio` (Expo's current-generation audio API; `expo-av` is deprecated and was already removed from this project as broken). This is not bit-identical to live synthesis (per the Phase 0-2 plan's own Risk Register item 3, "compare by ear before accepting" — unchanged, still applies), but matches the melody, pitches, and envelope shape exactly, and carries far less native-dependency risk than the alternative.

## Decision 2: `onTapRest`/`onStartInterval` need a small signature change

Task 7 already added these props to `ExerciseRow.tsx`:
```ts
onTapRest?: (seconds: number) => void;
onStartInterval?: (interval: IntervalConfig) => void;
```
Neither carries enough for a real handler: starting a timer also needs the exercise's `title` (the on-screen label) and, for the interval timer, `restSeconds` (used as `setRestSecs`) and `prescription` (to derive `sets`). `onTapWeight` already solved exactly this by passing the whole exercise:
```ts
onTapWeight?: (ex: RenderedExercise) => void;
```
Phase 3 changes `onTapRest`/`onStartInterval` to the same shape:
```ts
onTapRest?: (ex: RenderedExercise) => void;
onStartInterval?: (ex: RenderedExercise) => void;
```
`ExerciseRow.tsx`'s two call sites change from `onTapRest?.(ex.restSeconds as number)` / `onStartInterval?.(ex.interval as IntervalConfig)` to `onTapRest?.(ex)` / `onStartInterval?.(ex)`. `card.tsx`'s accent colour (needed by both timers) stays a closure variable, not part of the payload — it's session-level, not exercise-level, and already in scope where these handlers are defined.

## Component structure

Following the pure-function-plus-thin-hook pattern Phase 2 proved out (`useDoneFlow.ts`'s `computeDoneTap` etc., `useSwipeCarousel.ts`'s worklet split):

```
src/components/timers/
├── restTimerLogic.ts       # pure: format(seconds) -> "M:SS", fraction(remaining, total) -> number. No Date.now() inside — callers pass elapsed/remaining in.
├── useRestTimer.ts         # start(seconds, label, accent) / stop(). Owns endDate/totalSeconds/label state, a setInterval tick (200ms, matching RestTimerOverlay.swift's own tick(every:0.2)), fires the .go tone and cancels the notification on natural completion.
├── RestTimerOverlay.tsx    # bottom bar: progress strip (View width % via fraction()), "REST" label, big countdown (format()), "STOP" button
├── intervalTimerLogic.ts   # pure port of IntervalTimerController's advance() switch — computeNextPhase(phase, set, rep, sets, reps) -> {phase, set, rep} | 'finish'. Directly unit-testable, same contract as computeDoneTap in useDoneFlow.ts.
├── useIntervalTimer.ts     # wraps intervalTimerLogic in state + a 200ms tick effect (matches Swift's own Timer.scheduledTimer(withTimeInterval: 0.2)), owns phase/set/rep/remainingSeconds/isPaused/isMuted, start/pause/resume/stop
├── IntervalTimerView.tsx   # full-screen overlay: traffic-light background (Colours.readyC/go/restC — already ported, unused until now), huge countdown, status text, pause/resume/stop/mute
└── tones.ts                # loadTones() + play(cue) via expo-audio, one shared player instance (mirrors RestTimerController's own doc comment on why the tone player must outlive any single overlay: a tone triggered right as a timer ends must not get torn down mid-playback when the overlay unmounts)

assets/audio/
└── tone-{ready,go,stop,done}.wav   # committed, not generated at build/test time
```

`card.tsx` owns one `useRestTimer()` and one `useIntervalTimer()` instance (same level as `ticks`/`browsedKey` today — matches `NativeAppView.swift` keeping `restTimer`/`intervalTimer` as its own `@State`, one level above `DailyCardView`... actually confirmed directly: both controllers are `@State` on `DailyCardView.swift` itself, i.e. exactly the daily-card level, so `card.tsx` is the right RN home for them, consistent with where `ticks`/`browsedKey` already live). `card.tsx` passes real handlers into `ExerciseRow` via `DailyCard`'s existing `onTapRest`/`onStartInterval` prop slots (currently `() => {}` in Task 12's assembly), and conditionally renders `<RestTimerOverlay>` / `<IntervalTimerView>` — plain conditional renders inside `card.tsx`'s tree, not new `expo-router` routes, matching how `RestTimerOverlay` is just a conditional view inside `DailyCardView.swift`'s body and `IntervalTimerView` is a `.fullScreenCover` (an overlay, not a real navigation push) rather than a distinct screen.

`sets` for `onStartInterval` is `leadingInt(ex.prescription) ?? 1` — a direct one-line port of `DailyCardView.swift`'s own `leadingInt()` (parse the leading run of digits, same as `parseInt(s, 10)`; already has real test-worthy edge cases documented in Swift's own comment: `"5 × (10s on / 5s off × 5)" -> 5`).

## Notifications

`expo-notifications` is already an installed dependency (added in Phase 1, currently unused). Behaviour mirrors `RestTimerController.swift` exactly: schedule a local "Rest over" / `label` notification for `secs` seconds out when a rest timer starts, cancel it on manual stop, let it fire naturally on completion otherwise (same single `notificationID = "rest-timer"` re-used so a new rest timer always supersedes a stale pending one — `removePendingNotificationRequests` before scheduling, not after). Permission is requested the first time a rest timer actually starts, not on cold launch — there's no natural earlier moment where asking would make sense to the user, and this project's stance throughout (e.g. Supabase auth, camera-less design) has been to ask for platform permissions only at first genuine use.

## Testing

- `intervalTimerLogic.ts`'s `computeNextPhase` gets the same direct-unit-test treatment as `computeDoneTap`/`nextIndex` — no timers, no RN, pure input/output, covering every transition (`ready→on`, `on→off` mid-set, `on→setrest` last-rep-of-non-final-set, `setrest→on` next set, `off→setrest` fallback branch, final `off→done`).
- `restTimerLogic.ts`'s `format`/`fraction` get the same direct treatment.
- `leadingInt` gets a small table-driven test covering the documented Swift edge case above plus a no-leading-digit input.
- Hooks (`useRestTimer`, `useIntervalTimer`) and the two overlay components are exercised live on a real device during this phase's own verification round, same as every other Phase 2 component — no React Native Testing Library exists in this project (confirmed reason already on record: needs `react-dom`, doesn't belong in an RN project).

## Risks carried over from the Phase 0-2 plan, still open

- Tone fidelity: "compare by ear" once the pre-rendered files exist (Risk Register item 3, unchanged).
- New native dependency: `expo-audio` needs to actually build under this Expo SDK before this design can be trusted — first implementation task should prove this in isolation (install + play one placeholder file end-to-end) before building the rest of the timer logic on top of it, same lesson this session already paid for three times with `expo-av`/`react-native-mmkv`/`expo-updates`.

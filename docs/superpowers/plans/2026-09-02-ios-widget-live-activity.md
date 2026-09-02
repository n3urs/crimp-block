# iOS Home-Screen Widget + Rest-Timer Live Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back the two native iOS features the RN rewrite dropped: the "Today's Session" home-screen widget, and the rest-timer Live Activity (Lock Screen + Dynamic Island countdown).

**Architecture:** A WidgetKit extension target, added declaratively via the `@bacons/apple-targets` Expo config plugin so it survives `expo prebuild --clean` (which wipes `ios/` on every build-number bump — the reason this needs a plugin instead of a one-off Xcode edit). The extension's Swift UI code is a faithful, near-verbatim port of the real working Swift source that shipped in the old pure-Swift CrimpBlock app (still on `main`, never deleted). Two independent data paths feed it:
- **Widget:** JS computes the 14-day forecast (already-existing `engine.forecast(14)`) and writes it as JSON into an App-Group-shared `UserDefaults` suite via the plugin's own `ExtensionStorage` JS API — no custom native code needed for this half.
- **Live Activity:** starting/ending an `Activity<RestTimerAttributes>` can only be done by the *containing app process*, not the extension, and there is no off-the-shelf JS API for it — this half needs a small custom local Expo Module (Swift) that `useRestTimer.ts` calls into, ported from the old app's `ContentView.swift` Coordinator.

**Tech Stack:** `@bacons/apple-targets` (WidgetKit config plugin), Swift/SwiftUI/WidgetKit/ActivityKit (extension + shared types), a local Expo Module (Swift, native bridge for Live Activity lifecycle), existing `engine.forecast()` / `resolveColour()` (JS data + colour source).

## Global Constraints

- **Faithful port, not a reimplementation.** Every Swift file this plan adds is ported from real, working source already in this repo on the `main` branch (the old pure-Swift CrimpBlock app, before the RN rewrite). Read it with `git show main:<path>` — never invent new widget/Live-Activity UI. Exact source paths are given in each task.
- **App Group is fixed:** `group.uk.co.sullivanltd.crimpblock` — already used by the old app, already scoped correctly to the current bundle ID `uk.co.sullivanltd.crimpblock` (confirmed live on TestFlight, see [deadpoint-ios-archive-workflow.md] memory). Do not invent a different group id.
- **Widget extension bundle id:** `uk.co.sullivanltd.crimpblock.widget` (the `.widget` suffix shorthand `@bacons/apple-targets` supports, appended to the main app's bundle id).
- **iOS only.** Every JS call into the new native module, and the forecast-sync call, must be guarded with `Platform.OS === 'ios'` — Android has no equivalent and must silently no-op, matching the existing `keepAwake`/`allowSleep` platform-guard pattern already in this codebase (`useIntervalTimer.ts`).
- **Deployment target:** `16.4` was Task 1's starting point (matching the main app's own floor) and is correct for the *scaffolded placeholder* content. But the REAL ported source (`ios/CrimpBlockWidget/CrimpBlockWidget.swift`/`RestTimerLiveActivity.swift` on `main`) was written for those old targets' real `17.0` floor, and at least one call — `WidgetView.body`'s `.containerBackground(bg, for: .widget)` — is a genuine iOS 17.0+-only WidgetKit API with no 16.x equivalent. **If porting the real source hits a compile error over a symbol that needs iOS 17+, the correct fix is bumping ONLY `targets/widget/expo-target.config.js`'s `deploymentTarget` to `"17.0"`** — an extension target is allowed a HIGHER minimum OS than its containing app (a common, fully-supported pattern: the main app still installs and runs on older iOS, the widget/Live-Activity extension simply doesn't appear until the device is new enough) — never add `#available` availability shims to the ported Swift to work around this, and never lower the main app's own `ios.buildNumber`-adjacent 16.4 floor in `app.json` to match. Keep the ported files byte-for-byte faithful; adjust the target's deployment floor instead.
- **Reuse, don't reinvent, on the JS side:** `engine.forecast(days)` (`deadpoint-rn/src/engine/index.ts:26`, already implemented and exposed) computes the forecast; `resolveColour(varName)` (`deadpoint-rn/src/design/colours.ts`) resolves a `--variable-name` to a real hex string. Both already exist and are used throughout the app — call them, do not duplicate their logic.
- **Verification is local-build-only, never Xcode GUI.** Same rule that has held all session: build via terminal `xcodebuild` / `expo run:ios`, verify via the iOS Simulator MCP tools. Do not drive Xcode's UI with computer-use tools.
- **The `expo prebuild --platform ios --clean` env-var gotcha:** always run it with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` set, or CocoaPods' `pod install` step crashes with a `UnicodeNormalize::CompatibilityError`.
- **The `ENABLE_USER_SCRIPT_SANDBOXING` gotcha:** after any fresh prebuild, check `deadpoint-rn/ios/Deadpoint.xcodeproj/project.pbxproj` for `ENABLE_USER_SCRIPT_SANDBOXING = YES` (Xcode sometimes reintroduces it) and force it back with `sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g'` — otherwise the RN JS-bundling script phase fails with a sandbox `deny(1) file-read-data` error.
- **`ios.buildNumber` in `app.json` is decoupled from the pbxproj's `CURRENT_PROJECT_VERSION`** — verify the real build number via `/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" deadpoint-rn/ios/Deadpoint/Info.plist`, never trust the pbxproj field.
- **`NSSupportsLiveActivities` must be `true` in the main app's Info.plist** (real source has this on `main`: `git show main:ios/CrimpBlock/Info.plist` has `<key>NSSupportsLiveActivities</key><true/>`) — without it, `ActivityAuthorizationInfo().areActivitiesEnabled` is `false` on every device and `Activity.request(...)` is silently never reached, making the whole Live Activity bridge a permanent no-op with a perfectly green build (caught by Task 4's review, fixed via `app.json`'s `ios.infoPlist: { "NSSupportsLiveActivities": true }` — a plain Expo config key, no custom plugin needed). This key was missing from Task 4's original file list (an omission in this plan, not an implementer error) — flagging here so it's never lost again if this plan is ever re-read or re-run from an earlier point.
- All work happens in `deadpoint-rn/` inside this worktree (`/Users/oscarsullivan/crimp-block/.worktrees/react-native-rebuild/deadpoint-rn`), on the current branch `react-native-rebuild`. Never touch the `main` branch or the non-worktree checkout.

---

### Task 1: Scaffold the widget extension target and prove the pipeline end-to-end

**Files:**
- Modify: `deadpoint-rn/package.json` (add `@bacons/apple-targets` as a regular `dependency` — its `ExtensionStorage` JS API ships in the app bundle at runtime, this is not a build-time-only devDependency)
- Modify: `deadpoint-rn/app.json` (register the plugin, add the App Group entitlement to the main app)
- Create: `deadpoint-rn/targets/widget/` (scaffolded by the CLI — inspect and report the exact structure it produces, do not assume)
- Test: none (this task is a build-pipeline proof, not app logic — verified by a real build + simulator screenshot)

**Interfaces:**
- Produces: a working `targets/widget/` directory whose exact layout (config file name/location, `Info.plist` presence, `Sources/` folder name) later tasks depend on — report this layout precisely in the task report, it is the first real fact this whole plan has been missing.

- [ ] **Step 1: Install the plugin**

```bash
cd deadpoint-rn && npm install @bacons/apple-targets --legacy-peer-deps
```

(`--legacy-peer-deps` matches this project's existing `.npmrc`-driven install behaviour — confirm `npm ls @bacons/apple-targets` shows it installed with no `npm error` after.)

- [ ] **Step 2: Scaffold a target named `widget`**

```bash
cd deadpoint-rn && npx create-target widget
```

Read whatever this generates under `targets/widget/` (`Read`/`ls -R`). Report the exact file tree in your task report — file names, whether it wrote `expo-target.config.json` or `.js`, whether it wrote a starter `Info.plist` or `Sources/*.swift`. This scaffolder may already register the plugin in `app.json` and/or add an App Group entitlement stub — check `app.json` after running it before assuming Step 3 below still needs doing from scratch.

- [ ] **Step 3: Set the target config explicitly**

Open whatever config file Step 2 created and ensure it matches (adjust syntax to `.js` vs `.json` as the scaffolder actually produced; this is the intent, not literal file content to paste unmodified if the generated file differs in shape):

```javascript
module.exports = (config) => ({
  type: "widget",
  name: "widget",
  displayName: "Deadpoint",
  bundleIdentifier: ".widget",
  deploymentTarget: "16.4",
  entitlements: {
    "com.apple.security.application-groups": ["group.uk.co.sullivanltd.crimpblock"],
  },
});
```

- [ ] **Step 4: Add the App Group entitlement to the main app and register the plugin**

In `deadpoint-rn/app.json`, inside `expo.ios`, add:

```json
"entitlements": {
  "com.apple.security.application-groups": ["group.uk.co.sullivanltd.crimpblock"]
}
```

And add `"@bacons/apple-targets"` to the top-level `expo.plugins` array (after the existing entries, before `extra`). Confirm it isn't already there from Step 2's scaffolder before adding a duplicate.

- [ ] **Step 5: Prebuild clean and verify the extension target exists**

```bash
cd deadpoint-rn && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
```

Then check the pbxproj actually gained a widget extension target:

```bash
grep -c "widget" deadpoint-rn/ios/Deadpoint.xcodeproj/project.pbxproj
```

Expected: a non-zero count. If zero, the plugin did not run — stop and report BLOCKED with the prebuild's full output, do not proceed to Step 6 guessing.

- [ ] **Step 6: Reapply the sandbox fix**

```bash
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' deadpoint-rn/ios/Deadpoint.xcodeproj/project.pbxproj
```

- [ ] **Step 7: Build for the simulator and confirm the widget extension actually compiles and installs**

```bash
cd deadpoint-rn && npx expo run:ios --device "iPhone 17"
```

(Use whichever simulator name/device this project's existing verification runs have used previously — `iPhone 17` per this session's established calibration; substitute if that device is unavailable, and report which you used.) This must succeed with no build errors from the new widget target specifically (errors from unrelated pre-existing issues, if any, are out of scope for this task but must still be reported).

- [ ] **Step 8: Live-verify the widget appears on the simulator's home screen**

Using the iOS Simulator MCP tools: add the "Deadpoint" widget to the simulator's home screen (long-press home screen → + → search "Deadpoint"), screenshot it. At this point it will show whatever placeholder/default content the scaffolder generated (e.g. "Hello, World!") — that is the correct and expected result for this task. Do NOT attempt to make it show real app data yet; that is Tasks 2–3.

**[POST-TASK-1 UPDATE — read before starting any later task]** This step was not achievable: this simulator runs a redesigned Home Screen UI (confirmed independently by both the Task 1 implementer and the controller) where long-press → jiggle mode shows text pills "Edit"/"Done" instead of the classic "+" widget-gallery button, and neither synthetic `tap` nor `touch_path` on "Edit" (nor the bottom "Search" pill) produces any visible menu or navigation — it silently exits jiggle mode instead, reproducibly, across many attempts and two independent operators (the implementer subagent and the controller). Existing default OS widgets (Maps, Calendar) DO render correctly on this same simulator, confirming WidgetKit itself works fine in this environment — the gap is purely in reaching the "Add Widget" gallery via this session's touch-injection tooling. **Accept Step 7's build-success (0 errors, `widget.appex` compiled/signed/packaged) plus the pbxproj wiring check as sufficient verification for Task 1 and every later task that would otherwise repeat this step** — do not re-attempt the home-screen "add widget" flow unless you have a genuinely new approach not already listed in the Task 1 report's ~20 attempts (tap/touch_path at varying durations on Edit and Search, drag-off, re-entering jiggle mode, different home screen pages). If a later task's spec says to screenshot the widget live on the home screen, treat "the widget was already present on the home screen from an earlier task" as the only realistic path to that screenshot going forward — do not burn implementer time re-discovering this same blocker.

**Also correcting the brief's file-layout assumption for every later task:** the real scaffolded layout has **no `Sources/` subfolder** — every Swift file sits directly in `targets/widget/*.swift`. The `@main` entry point is `targets/widget/index.swift` (currently `struct exportWidgets: WidgetBundle`), not a new file you create. `targets/widget/widgets.swift` currently holds a placeholder `StaticConfiguration` widget ("Hello, World!") — replace its content, don't create a second file. `targets/widget/WidgetLiveActivity.swift` already exists (scaffolded, currently unused/not wired into `index.swift`) — Task 4 replaces its content rather than creating a new file. Every later task's file paths below have been corrected to match; treat any lingering `Sources/`-prefixed path elsewhere in this document as stale and use the corrected paths instead.

- [ ] **Step 9: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: scaffold widget extension target via @bacons/apple-targets"
```

---

### Task 2: Port the home-screen "Today's Session" widget (Swift, no data yet)

**Files:** (paths corrected per Task 1's real output — no `Sources/` subfolder exists; see the POST-TASK-1 UPDATE note under Task 1 Step 8)
- Create: `deadpoint-rn/targets/widget/Forecast.swift` (ported from `ios/Shared/Forecast.swift` on `main`, **unchanged** — includes the `Forecast`/`Forecast.Day`/`Forecast.Exercise` Codable structs, `Date.appDay`, `SharedStore` enum, `parseHexColour`)
- Create: `deadpoint-rn/targets/widget/CrimpBlockWidget.swift` (ported from `ios/CrimpBlockWidget/CrimpBlockWidget.swift` on `main`, with one deliberate deviation — see Step 2 below; this file holds the `Provider`/`Entry`/`WidgetView`/`CrimpBlockWidget` struct — everything from the real source EXCEPT the `@main` bundle, which belongs in `index.swift` per Step 3)
- Delete: `deadpoint-rn/targets/widget/widgets.swift` (Task 1's placeholder "Hello, World!" widget — no longer needed once `CrimpBlockWidget.swift` exists)
- Modify: `deadpoint-rn/targets/widget/index.swift` (replace its placeholder `@main` bundle content — see Step 3)

**Interfaces:**
- Consumes: nothing from earlier tasks besides the scaffolded target directory (Task 1).
- Produces: a `CrimpBlockWidget` `Widget` conformance and `SharedStore` (App-Group `UserDefaults` reader, key `"forecast.v1"`) that Task 3's JS-side writer must match exactly — key name and JSON shape are fixed by this task, Task 3 must match them, not the other way around.

- [ ] **Step 1: Pull the real source to compare against, don't retype from memory**

```bash
cd /Users/oscarsullivan/crimp-block/.worktrees/react-native-rebuild
git show main:ios/Shared/Forecast.swift
git show main:ios/CrimpBlockWidget/CrimpBlockWidget.swift
```

- [ ] **Step 2: Write `Forecast.swift` — byte-for-byte identical to `main`'s copy.**

No deviation. Copy it exactly, including every comment (they document hard-won correctness fixes — the day-start-hour boundary logic, the App Group id, the stale-cache handling — keep them verbatim).

- [ ] **Step 3: Write `CrimpBlockWidget.swift`, and move the `@main` bundle into `index.swift`**

`CrimpBlockWidget.swift` gets everything from `ios/CrimpBlockWidget/CrimpBlockWidget.swift` verbatim EXCEPT the trailing `@main` bundle struct — that belongs in `targets/widget/index.swift` instead (the target's real entry point, per Task 1; only one `@main` is allowed per target). Delete `targets/widget/widgets.swift` (Task 1's placeholder) once this file replaces it.

Replace `targets/widget/index.swift`'s current placeholder content entirely with:

```swift
import WidgetKit
import SwiftUI

// TODO(Task 4): add RestTimerLiveActivity() here — the real source's bundle
// (ios/CrimpBlockWidget/CrimpBlockWidget.swift on main) is:
//   @main
//   struct CrimpBlockWidgetBundle: WidgetBundle {
//       var body: some Widget {
//           CrimpBlockWidget()
//           RestTimerLiveActivity()
//       }
//   }
// RestTimerLiveActivity doesn't exist yet — Task 4 adds it and restores the
// second line above.
@main
struct CrimpBlockWidgetBundle: WidgetBundle {
    var body: some Widget {
        CrimpBlockWidget()
    }
}
```

- [ ] **Step 4: Prebuild and rebuild**

```bash
cd deadpoint-rn && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' ios/Deadpoint.xcodeproj/project.pbxproj
npx expo run:ios --device "iPhone 17"
```

- [ ] **Step 5: Live-verify the widget's empty state**

Since nothing has written to `SharedStore` yet (Task 3 does that), the widget must show the real empty-state copy: "CRIMP BLOCK" / "Open the app to get started" (from `WidgetView.empty` in the ported source). Screenshot it via the Simulator MCP tools and confirm this exact copy appears — this proves the Swift code compiled correctly and is reading (and correctly finding nothing in) the real `SharedStore`, not a hardcoded placeholder from Task 1's scaffold.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: port home-screen widget Swift UI (no data source yet)"
```

---

### Task 3: JS forecast bridge — write real data into the widget

**Files:**
- Create: `deadpoint-rn/src/widget/syncForecast.ts`
- Create: `deadpoint-rn/src/widget/__tests__/syncForecast.test.ts`
- Modify: `deadpoint-rn/app/(main)/card.tsx` (call `syncForecast()` from the existing `useFocusEffect` block added for the staleness fix)

**Interfaces:**
- Consumes: `engine.forecast(days: number)` → array of `{date, key, name, where, colour, logged, phase, cue, exercises: [{t, m}]}` (already implemented, `deadpoint-rn/src/engine/index.ts:26`; `colour` here is a CSS-variable name like `--gorse`, NOT a resolved hex — matches `engine-core.js`'s own documented behaviour). `resolveColour(varName: string): string` (`deadpoint-rn/src/design/colours.ts`).
- Produces: `syncForecast(engine): Promise<void>` — the only export. iOS-only; a no-op on Android (Platform.OS guard, matching `useIntervalTimer.ts`'s existing `keepAwake`/`allowSleep` guard style — read that file for the exact idiom to match before writing this).

- [ ] **Step 1: Read the installed package's real API before writing anything**

```bash
cd deadpoint-rn
cat node_modules/@bacons/apple-targets/build/ExtensionStorage.d.ts 2>/dev/null || find node_modules/@bacons/apple-targets -iname "*.d.ts" | xargs cat
```

Confirm the exact constructor signature for `ExtensionStorage` (does it take the App Group id as a constructor argument?), the exact signature of `.set(key, value)`, and the exact signature of the static `reloadWidget(name?)` — in particular whether `name` is required and, if so, what value identifies this widget (likely the `kind:` string passed to `StaticConfiguration` in `CrimpBlockWidget.swift`, i.e. `"CrimpBlockWidget"`). Do not guess this from memory of an unrelated project — read the actual installed `.d.ts`/`.js`.

- [ ] **Step 2: Write the failing test first**

```typescript
// deadpoint-rn/src/widget/__tests__/syncForecast.test.ts
import { buildForecastPayload } from '../syncForecast';

describe('buildForecastPayload', () => {
  it('matches the Forecast Codable shape the Swift widget reads', () => {
    const engine = {
      forecast: (days: number) => [
        {
          date: '2026-09-02', key: 'maxFingers', name: 'Max Fingers',
          where: 'Home · 50 min', colour: '--gorse', logged: false,
          phase: 'Base', cue: 'Submaximal — build capacity, not a top set',
          exercises: [{ t: 'Warm up', m: '15 min' }],
        },
      ],
    };
    const resolveColour = (v: string) => (v === '--gorse' ? '#F2B134' : v);

    const payload = buildForecastPayload(engine as any, resolveColour);

    expect(payload.v).toBe(1);
    expect(typeof payload.generated).toBe('string');
    expect(payload.days).toEqual([
      {
        date: '2026-09-02', key: 'maxFingers', name: 'Max Fingers',
        where: 'Home · 50 min', colour: '#F2B134', logged: false,
        phase: 'Base', cue: 'Submaximal — build capacity, not a top set',
        exercises: [{ t: 'Warm up', m: '15 min' }],
      },
    ]);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd deadpoint-rn && npx jest src/widget/__tests__/syncForecast.test.ts
```

Expected: FAIL — `buildForecastPayload` is not exported / module not found.

- [ ] **Step 4: Implement**

Write `deadpoint-rn/src/widget/syncForecast.ts`. `buildForecastPayload` is a plain, exported, pure function (this is what makes it testable without mocking the native module — same pure-logic-extraction pattern this codebase already uses for `overallBar.ts`/`planProgress.ts`/`calendarMath.ts`). `syncForecast` is the impure export that calls it and writes to native storage; it is not unit tested directly (matches this project's established stance on hooks/impure glue — verified live instead, per this task's Step 6).

The exact shape of the native write call (constructor args, `.set()` call, `reloadWidget()` call) depends on what Step 1 found in the real `.d.ts` — implement against that, not against a guess. The days-ahead window is `14` (matches the old Swift widget's own 14-day `TimelineProvider` loop in `CrimpBlockWidget.swift` — keep them in sync, the widget's timeline only ever looks as far ahead as this payload provides).

- [ ] **Step 5: Run the test again, confirm it passes**

```bash
cd deadpoint-rn && npx jest src/widget/__tests__/syncForecast.test.ts
```

- [ ] **Step 6: Wire the call site**

In `deadpoint-rn/app/(main)/card.tsx`, the existing `useFocusEffect(useCallback(() => { store.reload...; loads.reload...; profile.reload...; }, [...]))` block (commit `d7380b3`, around line 95) fires BEFORE `const engine = useMemo(...)` is declared (around line 103) — `engine` is not in scope there, and even if it were, its reloads are async, so `engine` at that point in the same callback would still reflect pre-reload state. Do not add the call inside that block.

Instead, add a new, separate effect immediately after the `engine` declaration:

```typescript
useEffect(() => {
  syncForecast(engine);
}, [engine]);
```

A plain `useEffect` (not `useFocusEffect`) is correct here, not a mistake to fix later — `engine` is a `useMemo` recomputed whenever `store.days`/`loads.byExercise` change (including the moment the focus-effect's reloads above resolve and re-render), so this fires exactly when there's genuinely new data to sync: on first mount, and again every time a reload actually changes something — whether or not the screen regained focus in between. No `Platform.OS` guard needed at the call site — `syncForecast` no-ops internally on Android. Add `import { syncForecast } from '../../src/widget/syncForecast';` to `card.tsx`'s existing import block (adjust the relative path if the file's actual location in this repo differs from `app/(main)/`).

- [ ] **Step 7: Prebuild, rebuild, run tests**

```bash
cd deadpoint-rn
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' ios/Deadpoint.xcodeproj/project.pbxproj
npx expo run:ios --device "iPhone 17"
npx jest src/widget
npx tsc --noEmit
```

- [ ] **Step 8: Live-verify real data appears on the widget**

Open the app on the simulator (this triggers `card.tsx`'s focus effect on load), background it, screenshot the home-screen widget via the Simulator MCP tools. Confirm it shows Oscar's real today's session — name, "where", accent colour banner, exercise list or DONE badge if already logged — matching what the daily card itself shows for today. This is the first point this plan produces user-visible value; call it out clearly in the task report.

- [ ] **Step 9: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: sync real forecast data into the home-screen widget"
```

---

### Task 4: Port the Live Activity (Swift) + native bridge module (Swift↔JS)

**Files:** (paths corrected per Task 1's real output — see the POST-TASK-1 UPDATE note under Task 1 Step 8)
- Create: `deadpoint-rn/targets/widget/_shared/TimerActivity.swift` (ported from `ios/Shared/TimerActivity.swift` on `main`, unchanged — the `_shared/` folder does not exist yet, you are creating it; it is compiled into BOTH the widget extension and the main app target, which is required here since the main app constructs `Activity<RestTimerAttributes>` while the extension renders it)
- Modify: `deadpoint-rn/targets/widget/WidgetLiveActivity.swift` (this file already exists from Task 1's scaffold — a working but unrelated/unwired `ActivityConfiguration` widget the scaffolder generated. Replace its entire content with the real ported `ios/CrimpBlockWidget/RestTimerLiveActivity.swift`, unchanged — do not create a differently-named file)
- Modify: `deadpoint-rn/targets/widget/index.swift` (the `// TODO(Task 4)` comment block from Task 2 — restore the second line of the real bundle so it reads `CrimpBlockWidget()` then `RestTimerLiveActivity()`)
- Create: `deadpoint-rn/modules/rest-timer-activity/expo-module.config.json`
- Create: `deadpoint-rn/modules/rest-timer-activity/index.ts`
- Create: `deadpoint-rn/modules/rest-timer-activity/ios/RestTimerActivityModule.swift`
- Modify: `deadpoint-rn/package.json` (register the local module as a dependency: `"rest-timer-activity": "file:./modules/rest-timer-activity"`)

**Interfaces:**
- Consumes: `RestTimerAttributes` (this task's own `_shared/TimerActivity.swift`).
- Produces: JS-callable `startRestActivity(secs: number, label: string, colour: string): void` and `endRestActivity(cancelNotification: boolean): void` from `deadpoint-rn/modules/rest-timer-activity/index.ts` — Task 5 imports and calls these from `useRestTimer.ts`. Both must be safe no-ops (not throw) when called on a device that doesn't support Live Activities (`ActivityAuthorizationInfo().areActivitiesEnabled == false`) or on Android (the JS wrapper should not even attempt to load the native module outside `Platform.OS === 'ios'`).

- [ ] **Step 1: Read the real source**

```bash
cd /Users/oscarsullivan/crimp-block/.worktrees/react-native-rebuild
git show main:ios/Shared/TimerActivity.swift
git show main:ios/CrimpBlockWidget/RestTimerLiveActivity.swift
git show main:ios/CrimpBlock/ContentView.swift | sed -n '95,200p'
```

The last command is the Coordinator's `restActivity`/`startRestActivity`/`endRestActivity` — the exact ActivityKit lifecycle logic to port into the native module in Step 4 below (the "end whatever's running first", the 5-minute `staleDate`, `dismissalPolicy: .immediate`).

- [ ] **Step 2: Port `TimerActivity.swift` and `RestTimerLiveActivity.swift` verbatim**

Write `targets/widget/_shared/TimerActivity.swift` (new file/directory) from `ios/Shared/TimerActivity.swift`, unchanged. Overwrite `targets/widget/WidgetLiveActivity.swift`'s entire content with `ios/CrimpBlockWidget/RestTimerLiveActivity.swift`, unchanged (its struct is named `RestTimerLiveActivity`, not `WidgetLiveActivity` — the file name staying as `WidgetLiveActivity.swift` is fine and matches Task 1's existing scaffolded name; Swift doesn't require the file name to match the type name).

- [ ] **Step 3: Wire the bundle**

In `targets/widget/index.swift`, replace the `// TODO(Task 4)` comment block so the bundle reads exactly like the real source:

```swift
@main
struct CrimpBlockWidgetBundle: WidgetBundle {
    var body: some Widget {
        CrimpBlockWidget()
        RestTimerLiveActivity()
    }
}
```

- [ ] **Step 4: Scaffold and write the native module**

```bash
cd deadpoint-rn && npx create-expo-module --local modules/rest-timer-activity
```

Report what this generates (same "read before assuming" discipline as Task 1's `create-target`). Replace the generated Swift module body with a port of `ContentView.swift`'s Coordinator ActivityKit methods, adapted from `WKScriptMessageHandler` callback style to two plain synchronous-from-JS's-perspective functions:

```swift
import ExpoModulesCore
import ActivityKit

public class RestTimerActivityModule: Module {
  private var restActivity: Activity<RestTimerAttributes>?

  public func definition() -> ModuleDefinition {
    Name("RestTimerActivity")

    Function("startRestActivity") { (secs: Int, label: String, colour: String) in
      self.endRestActivity(cancelNotification: true)

      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

      let end = Date().addingTimeInterval(TimeInterval(secs))
      let attrs = RestTimerAttributes(label: label, totalSeconds: secs, colour: colour)
      let state = RestTimerAttributes.ContentState(endDate: end)
      let stale = end.addingTimeInterval(5 * 60)

      self.restActivity = try? Activity.request(
        attributes: attrs,
        content: .init(state: state, staleDate: stale),
        pushType: nil
      )
    }

    Function("endRestActivity") { (cancelNotification: Bool) in
      self.endRestActivity(cancelNotification: cancelNotification)
    }
  }

  private func endRestActivity(cancelNotification: Bool) {
    if let activity = restActivity {
      Task { await activity.end(nil, dismissalPolicy: .immediate) }
      restActivity = nil
    }
  }
}
```

(`cancelNotification` is accepted for interface parity with the old Coordinator's signature and Task 5's caller, but does nothing in this module — completion-notification scheduling already lives entirely in `useRestTimer.ts`/`expo-notifications` on the JS side, ported separately from this Swift bridge; do not duplicate it here.)

Write `deadpoint-rn/modules/rest-timer-activity/index.ts`:

```typescript
import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

const NativeModule = Platform.OS === 'ios' ? requireNativeModule('RestTimerActivity') : null;

export function startRestActivity(secs: number, label: string, colour: string): void {
  NativeModule?.startRestActivity(secs, label, colour);
}

export function endRestActivity(cancelNotification: boolean): void {
  NativeModule?.endRestActivity(cancelNotification);
}
```

- [ ] **Step 5: Register the local module and prebuild**

Add to `deadpoint-rn/package.json`'s `dependencies`: `"rest-timer-activity": "file:./modules/rest-timer-activity"`. Run `npm install` (in `deadpoint-rn/`) so the symlink is created, then prebuild:

```bash
cd deadpoint-rn && npm install
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' ios/Deadpoint.xcodeproj/project.pbxproj
npx expo run:ios --device "iPhone 17"
```

**No `--clean` here, deliberately — this is a change from earlier tasks.** Task 3 discovered live that a `--clean` prebuild's full `ios/` regeneration causes the next simulator install to wipe the app's signed-in session (Keychain-backed Supabase session lost, landing back on the sign-in gate) — likely because entitlements/provisioning are being treated as changed, triggering a fresh container. This task adds a new local native module but does not change any entitlement, App Group, or bundle identifier — a non-`--clean` `expo prebuild` regenerates the config-plugin-managed files (registering the new module) without the full wipe, and should preserve whatever signed-in session is already on the simulator. If the build fails specifically because the new native module isn't being picked up (not a compile error in your own ported code), THEN fall back to `--clean` as a last resort and accept the session will need to be signed back in again — but try without it first.

Confirm the build succeeds — this is a build-only verification for this task (Task 5 wires the actual JS call site that exercises this module live; there is no UI trigger for it yet).

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: port rest-timer Live Activity + native start/end bridge module"
```

---

### Task 5: Wire the rest timer to the Live Activity, live-verify on simulator

**Files:**
- Modify: `deadpoint-rn/src/components/timers/useRestTimer.ts`

**Interfaces:**
- Consumes: `startRestActivity`/`endRestActivity` from `deadpoint-rn/modules/rest-timer-activity` (Task 4).

- [ ] **Step 1: Add the calls**

In `useRestTimer.ts`'s `start` callback, alongside the existing `scheduleCompletionNotification` call, add a call to `startRestActivity(seconds, label, accent)` (import from `'../../../modules/rest-timer-activity'` — adjust the relative path to match this file's real location). In `stop`, alongside `cancelCompletionNotification`, add `endRestActivity(true)` (matches the old Coordinator's `cancelNotification: true` on an explicit stop). In the natural-completion branch inside the `setInterval` tick (where `remainingSeconds <= 0`), add `endRestActivity(false)` (matches the old Coordinator: natural completion does NOT cancel the already-fired notification — same reasoning the existing comment there already documents for the notification half; mirror it for the activity-end call, don't cancel-notification twice).

No `Platform.OS` guard needed at this call site — the module's own `index.ts` already no-ops on Android (Task 4).

- [ ] **Step 2: Prebuild, rebuild**

```bash
cd deadpoint-rn
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' ios/Deadpoint.xcodeproj/project.pbxproj
npx expo run:ios --device "iPhone 17"
```

No `--clean` here either, same reasoning as Task 4 Step 5 — this task only touches `useRestTimer.ts` (pure JS), nothing native-config-shaped changes, and this task's own live verification (Steps 3–5 below) absolutely requires a signed-in session to reach the daily card and start a real rest timer. If a signed-in session isn't already present on the simulator from earlier work, this is the point to stop and ask a human to sign in once — do not attempt to sign in yourself, and do not skip Steps 3–5 silently if you can't reach a signed-in state.

- [ ] **Step 3: Live-verify — start**

On the simulator: open the app, start any exercise's rest timer. Background the app (Home button) and check the Lock Screen for the Live Activity banner (label, countdown, progress bar in the session's accent colour). If the simulator model supports it, also check the Dynamic Island region. Screenshot both.

- [ ] **Step 4: Live-verify — natural completion**

Let a short rest timer (or manually start one with a short duration if the UI allows editing it, otherwise wait out a real one) run to completion. Confirm the Live Activity disappears from the Lock Screen on its own and no stale countdown is left showing.

- [ ] **Step 5: Live-verify — explicit stop and restart**

Start a rest timer, manually skip/stop it from within the app before it finishes. Confirm the Live Activity is dismissed immediately. Then start a second rest timer for a different exercise; confirm only ONE Live Activity is ever showing at a time (the "end whatever's running first" guarantee ported from the old Coordinator) — no duplicate/stacked activities.

- [ ] **Step 6: Run the full test suite**

```bash
cd deadpoint-rn && npx jest && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "feat: wire rest timer to start/end the Live Activity"
```

---

### Task 6: Full clean-prebuild regression — prove the config plugin actually survives what broke this before

**Files:** none new — this task edits nothing except `deadpoint-rn/app.json`'s `ios.buildNumber` at the very end.

**Interfaces:** none — pure verification task, the reason this whole plan needed a config plugin instead of a one-off Xcode edit.

- [ ] **Step 1: Bump the build number**

In `deadpoint-rn/app.json`, bump `ios.buildNumber` by one from its current value (check the current real value first via `PlistBuddy` per the Global Constraints note, not the pbxproj, in case they've drifted).

- [ ] **Step 2: Full clean prebuild from a blank slate**

```bash
cd deadpoint-rn
rm -rf ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' ios/Deadpoint.xcodeproj/project.pbxproj
```

This is the exact scenario that made the widget disappear from the RN rewrite in the first place (`ios/` wiped on every build-number bump) — if the widget extension target, the App Group entitlements, and both Swift sources are NOT regenerated correctly from a totally deleted `ios/`, this plan has not actually solved the problem it set out to solve. Confirm the widget target exists again via the same `grep -c "widget" ios/Deadpoint.xcodeproj/project.pbxproj` check as Task 1 Step 5.

- [ ] **Step 3: Rebuild and re-verify both features from scratch**

```bash
npx expo run:ios --device "iPhone 17"
```

Repeat Task 3 Step 8 (widget shows real data) and Task 5 Steps 3–5 (Live Activity starts/completes/stops/restarts correctly) against this freshly-regenerated build. Screenshot both. If anything regressed, diagnose and fix here — do not report this task DONE with a known regression.

- [ ] **Step 4: Commit**

```bash
cd deadpoint-rn && git add -A && git commit -m "chore: bump build number, verify widget + Live Activity survive a clean prebuild"
```

---

## Known follow-up, out of scope for this plan

The real Dynamic Island *pill* rendering (the hardware notch cutout on Pro-model iPhones) can only be fully confirmed on Pro-model hardware or a Pro-model simulator — if the simulator used throughout this plan (`iPhone 17`, non-Pro) doesn't have one, the compact/expanded Dynamic Island states are still exercisable via the Simulator's own Live Activity inspection but the true pill shape is not. Flag this to Oscar as a real-device confirmation he should do himself once this plan ships to TestFlight — not a task in this plan.

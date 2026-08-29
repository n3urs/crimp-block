# Deadpoint React Native Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Deadpoint's SwiftUI iOS app as a single React Native codebase that ships pixel-identical UI to both iOS and Android, reuses the existing JavaScript training engine untouched, and supports over-the-air updates.

**Architecture:** The training logic (`engine-core.js` + programs/templates/resolvers, 2,143 lines) is already dependency-free JavaScript. React Native runs JavaScript as its native runtime, so that entire layer transfers with **zero porting** — and the 625 lines of JavaScriptCore marshalling that currently bridge it into Swift (`EngineBridge.swift`, `RehabBridge.swift`) are **deleted, not rewritten**. Likewise the hand-rolled 314-line REST client (`SupabaseClient.swift`) is replaced wholesale by the official `supabase-js`. What genuinely gets rebuilt is the UI layer: ~6,000 lines of SwiftUI views become React Native components, matched detail-for-detail against the Swift source.

**Tech Stack:** Expo (SDK 54+, resolved to 57.0.18 in practice) with EAS Build and `expo-updates` for OTA · TypeScript · `react-native-reanimated` **v4** (bundled with the New Architecture Expo 57 enables by default; corrected during Task 1's review from an initial v3 pin that predated checking what SDK 54+ actually resolves to — v4's worklets are the same UI-thread mechanism the swipe carousel needs, not a step backward) + `react-native-gesture-handler` v2 (UI-thread gestures/animation — non-negotiable for the swipe carousel) · `react-native-svg` (calendar phase borders, celebration particles) · `@supabase/supabase-js` · `expo-secure-store` · `expo-av` · `expo-notifications` · `react-native-iap`

---

## Global Constraints

- **Visual parity is the acceptance bar.** Every colour, font size, corner radius, padding, and animation duration below is copied verbatim from the current Swift source. Deviation is a bug, not a judgement call.
- **The JS engine files are copied byte-identical.** `engine-core.js`, `programs.js`, `templates.js`, `template-resolver.js`, `rehab-templates.js`, `rehab-resolver.js` are never edited during the port. If the engine needs a change, it changes in the shared source and both apps inherit it.
- **The existing SwiftUI app stays live on TestFlight until RN reaches parity.** Nothing in `ios/` is deleted by this plan.
- **Do not "improve" behaviour during the port.** Many oddities in the Swift source are deliberate fixes for reported bugs, documented in their own comments. Port the behaviour, keep the comment.
- **Supabase schema is unchanged.** Tables `sessions` (`date`, `type`, `load`, `sub`), `exercise_loads`, `profiles`, `templates`. RLS keyed on `user_id`. Auth is email OTP.
- **Minimum targets:** iOS 17.0 (matches current `IPHONEOS_DEPLOYMENT_TARGET`), Android 8.0 / API 26.

### Design tokens — exact values from `ios/Shared/SessionColours.swift`

| Token | Hex | Token | Hex |
|---|---|---|---|
| `bg` | `#181B22` | `fg` | `#EDEBE5` |
| `s1` | `#1E222B` | `dim` | `#9AA0AE` |
| `s2` | `#272C37` | `faint` | `#666C7A` |
| `s3` | `#333947` | `go` | `#1FA24A` |
| `s4` | `#454C5C` | `restC` | `#D6383D` |
| | | `readyC` | `#D69A1F` |

Named session/phase colours (referenced by name from `programs.js`):

| Name | Hex | Name | Hex |
|---|---|---|---|
| `--gorse` | `#F2B134` | `--heather` | `#C9739B` |
| `--tidepool` | `#4FB3A5` | `--grey` | `#5A6069` |
| `--slate` | `#7B93E0` | | |

Unrecognised names fall back to `--gorse`.

### Typography — exact, from `ios/Shared/AppFonts.swift`

All four are open-licensed Google Fonts already present as TTFs in `ios/CrimpBlock/Fonts/` and are copied verbatim into the RN app:

- `ArchivoBlack-Regular.ttf` — the single heading role
- `RobotoMono-Bold.ttf` / `RobotoMono-Medium.ttf` — all mono text (bold used for weights `semibold`/`bold`/`heavy`/`black`; medium otherwise)
- `SpaceMono-Bold.ttf` — timer countdown digits **only**

### Motion constants — exact, from `DailyCardView.swift`

| Interaction | Value |
|---|---|
| Swipe gesture activation | `minimumDistance: 10` |
| Horizontal claim threshold | `abs(dx) > 12 && abs(dx) > abs(dy) * 1.5` |
| Swipe commit threshold | `abs(dragOffset) > containerWidth * 0.3` |
| Swipe completion | `easeOut`, `0.2s` |
| Swipe spring-back | `interactiveSpring(response: 0.32, dampingFraction: 0.82)` |
| Tick collapse | `easeInOut`, `0.2s` |
| Info-toggle expand | `easeInOut`, `0.15s` |
| Sets-tally long-press undo | `0.45s` |
| Logged stamp: delay before show | `1.0s` |
| Logged stamp: fade in | `easeInOut`, `0.25s` |
| Logged stamp: hold | `2.5s` |
| Logged stamp: fade out | `easeInOut`, `0.4s` |
| Rest-timer overlay slide | `easeInOut`, `0.2s` |
| Rest-timer overlay refresh tick | `0.2s` |
| Interval-timer refresh tick | `0.05s` |

---

## Complete inventory of the current app

Every Swift file, what it does, and its fate in the port. **9,678 lines across 45 files.**

### Deleted outright — no RN equivalent needed (625 lines)

| File | Lines | Why it disappears |
|---|---:|---|
| `Shared/EngineBridge.swift` | 464 | Pure JavaScriptCore marshalling. In RN, `engine-core.js` is imported directly; every `bridge.decide(date:)` becomes `engine.decide(date)`. Its 30-method public API becomes a thin typed facade instead. |
| `Shared/RehabBridge.swift` | 161 | Same — wraps `rehab-resolver.js`. |

### Replaced by a library (360 lines)

| File | Lines | Replacement |
|---|---:|---|
| `Shared/SupabaseClient.swift` | 314 | `@supabase/supabase-js` — auth, REST, session refresh, all of it. Note the 90s request timeout added for the known slow OTP endpoint must be reproduced in the client config. |
| `Shared/Keychain.swift` | 46 | `expo-secure-store` |

### UI to rebuild — the real work (~6,000 lines)

| File | Lines | Notes for the port |
|---|---:|---|
| `DailyCardView.swift` | 1,482 | **The beast.** Swipe carousel with live finger-tracked peek layer, exercise rows (tick/collapse/sets-tally/long-press-undo/weight badge/info toggle/rest+interval buttons), header, session dots, next-up chip, logged stamp, card message, footer. Split into ~6 RN components. |
| `CalendarView.swift` | 774 | Month grid, zigzag phase-boundary borders (`PartialBorder` shape → `react-native-svg`), deload rings, all-time stats panel, plan-progress bar, trend forecast. |
| `NativeAppView.swift` | 657 | The app-level state machine: welcome → sign-in → quiz → tutorial → paywall → daily card / rehab card, plus all Supabase read/write orchestration. |
| `IntakeQuizView.swift` | 452 | Multi-step onboarding quiz. Pairs with `QuizModel.swift`. |
| `Shared/TutorialSpotlight.swift` | 420 | Anchor-based spotlight overlay using SwiftUI `PreferenceKey`/`Anchor<CGRect>`. RN equivalent: `onLayout`/`measureInWindow` into a context, masked overlay via SVG. |
| `RehabCardView.swift` | 323 | Rehab-track daily card. |
| `SettingsView.swift` | 317 | Account, sets-counter prefs, track switcher, delete account. |
| `Shared/QuizModel.swift` | 276 | Quiz answer model + result → template mapping. Mostly pure logic, ports cleanly. |
| `TutorialDemoCardView.swift` | 274 | Scripted tutorial card. |
| `Shared/NativeProfile.swift` | 238 | `profiles` table access. Becomes a hook. |
| `ContentView.swift` | 230 | Debug menu + the legacy `WebView` shell. **The WebView path can be dropped entirely.** |
| `NativeSignInView.swift` | 227 | Email OTP two-step, resend cooldown, friendly error copy. |
| `PlanSheetView.swift` | 200 | Phase/block plan sheet with progress bar. |
| `PaywallView.swift` | 194 | StoreKit paywall → `react-native-iap`. |
| `Shared/IntervalTimerController.swift` | 185 | Interval timer state machine. |
| `IntervalTimerView.swift` | 147 | Full-screen interval timer UI, 0.05s tick. |
| `WeekStripView.swift` | 136 | 7-day strip + `DayPickerView`. |
| `RehabTutorialView.swift` | 122 | Rehab-specific walkthrough. |
| `NativeEngineDemoView.swift` | 122 | Sample-data debug harness. Port last, or drop. |
| `Shared/Forecast.swift` | 118 | Widget payload model + `appDay` (3am day-start) logic. **`appDay` must port exactly** — it's shared with the engine's own day boundary. |
| `RestTimerOverlay.swift` | 110 | Bottom rest-timer bar. |
| `Shared/NativeStore.swift` | 97 | `sessions` table, optimistic write + rollback. Becomes a hook. |
| `Shared/RestTimerController.swift` | 91 | Rest timer state + Live Activity + notification scheduling. |
| `QuizDemoView.swift` | 92 | Debug harness. Drop or port last. |
| `MaxProgramPreviewView.swift` | 81 | Debug harness. Drop or port last. |
| `Shared/NativeLoads.swift` | 77 | `exercise_loads` table. Becomes a hook. |
| `CelebrationOverlay.swift` | 77 | Particle burst + checkmark on log. |
| `WeightEditView.swift` | 71 | Weight stepper sheet. |
| `SessionGuideView.swift` | 50 | Board Session Guide reference page. |
| `WelcomeView.swift` | 46 | First-run splash. |
| `Shared/AppFonts.swift` | 27 | → `src/design/fonts.ts` |
| `Shared/SessionColours.swift` | 58 | → `src/design/colours.ts` |
| `CrimpBlockApp.swift` | 12 | → Expo Router root layout |

### Platform-specific — needs per-platform work (563 lines)

| File | Lines | iOS | Android |
|---|---:|---|---|
| `CrimpBlockWidget/CrimpBlockWidget.swift` | 311 | WidgetKit home-screen widget | **Decided: not ported.** iOS keeps this native widget as-is; Android ships with no home-screen widget. |
| `Shared/SubscriptionManager.swift` | 122 | StoreKit 2 entitlements | `react-native-iap` covers both, but Google Play Billing products must be created and the entitlement check rewritten. |
| `Shared/IntervalTonePlayer.swift` | 119 | Synthesises "piano-ish" tones at runtime via `AVAudioEngine` (fundamental + 2nd harmonic at 0.28 gain, per-note envelopes) | **Runtime synthesis is impractical in RN.** Pre-render each cue to a `.wav`/`.m4a` at build time and play via `expo-av`. Must A/B against the current tones. |
| `CrimpBlockWidget/RestTimerLiveActivity.swift` | 111 | ActivityKit Live Activity (Dynamic Island + lock screen) | **Decided: not ported.** iOS keeps this as-is; Android gets no equivalent, not even a notification stand-in. |
| `Shared/TimerActivity.swift` | 22 | ActivityKit attributes | As above. |

### Tests to port (225 lines)

`CrimpBlockTests/EngineBridgeTests.swift` (133), `RehabBridgeTests.swift` (55), `AppFontsTests.swift` (37). The engine tests become the **parity harness** — see Task 4.

---

## Risk register — read before starting

1. **Live Activities — decided, out of scope.** The rest timer's Dynamic Island / lock-screen presence has no Android counterpart. iOS keeps the existing native `ActivityKit` implementation as-is (`RestTimerLiveActivity.swift`, `TimerActivity.swift` are not ported); Android gets no equivalent at all, not even a notification stand-in. Not revisited by this plan.
2. **Home-screen widgets — decided, out of scope.** Nothing in RN unifies WidgetKit and Android App Widgets. iOS keeps its existing native `CrimpBlockWidget.swift` as-is; Android ships with no home-screen widget. Not revisited by this plan.
3. **Audio tones will not be bit-identical.** Pre-rendered files replace runtime synthesis. Compare by ear against the current build before accepting.
4. **The swipe carousel is the highest-risk UI element.** It must run on the UI thread via Reanimated worklets. A JS-thread implementation will feel laggy — which is precisely the complaint the current Swift implementation was rewritten to fix.
5. **This replaces the shipping iOS app.** Do not remove the SwiftUI target until RN has passed a side-by-side parity review on a real device.
6. **In-app purchase products must be recreated for Google Play**, including a new subscription SKU and its own review cycle.

---

## Target file structure

```
deadpoint-rn/
├── app/                              # expo-router
│   ├── _layout.tsx                   # root: fonts, providers, theme
│   ├── index.tsx                     # router state machine (NativeAppView.swift:63-198)
│   ├── welcome.tsx
│   ├── sign-in.tsx
│   ├── quiz.tsx
│   ├── paywall.tsx
│   └── (main)/
│       ├── card.tsx                  # daily card host
│       ├── calendar.tsx
│       └── rehab.tsx
├── src/
│   ├── engine/
│   │   ├── engine-core.js            # COPIED VERBATIM — never edited
│   │   ├── programs.js               # COPIED VERBATIM
│   │   ├── templates.js              # COPIED VERBATIM
│   │   ├── template-resolver.js      # COPIED VERBATIM
│   │   ├── rehab-templates.js        # COPIED VERBATIM
│   │   ├── rehab-resolver.js         # COPIED VERBATIM
│   │   ├── index.ts                  # typed facade (replaces EngineBridge.swift)
│   │   └── types.ts
│   ├── design/
│   │   ├── colours.ts                # SessionColours.swift
│   │   ├── fonts.ts                  # AppFonts.swift
│   │   └── motion.ts                 # the motion constants table above
│   ├── data/
│   │   ├── supabase.ts               # client + 90s timeout config
│   │   ├── useSession.ts             # auth (SupabaseClient.swift auth half)
│   │   ├── useStore.ts               # NativeStore.swift
│   │   ├── useLoads.ts               # NativeLoads.swift
│   │   └── useProfile.ts             # NativeProfile.swift
│   ├── components/
│   │   ├── daily-card/
│   │   │   ├── DailyCard.tsx
│   │   │   ├── CardHeader.tsx
│   │   │   ├── SessionDots.tsx
│   │   │   ├── ExerciseRow.tsx
│   │   │   ├── SetsTally.tsx
│   │   │   ├── LoggedStamp.tsx
│   │   │   ├── WeekStrip.tsx
│   │   │   └── useSwipeCarousel.ts
│   │   ├── calendar/
│   │   ├── timers/
│   │   ├── tutorial/
│   │   └── ui/                       # Pill, Divider, StatTile
│   └── state/
│       └── prefs.ts                  # AppStorage → MMKV
├── assets/fonts/                     # the 4 TTFs, copied verbatim
└── __tests__/
    └── engine-parity.test.ts
```

---

## Phase roadmap

Each phase produces working, testable software on its own.

| Phase | Delivers | Detailed tasks |
|---|---|---|
| **0. Foundation** | Expo app boots on both platforms with real fonts, colours, and the engine imported and proven identical to Swift's output | **In this plan** |
| **1. Data layer** | Real Supabase auth + session/loads/profile reads and writes, verified against the live database | **In this plan** |
| **2. Daily card** | The full daily card — swipe, ticks, tally, weights — running on real data on both platforms | **In this plan** |
| 3. Timers | Rest timer, interval timer, audio cues, notifications | Own plan |
| 4. Calendar | Month grid, phase borders, stats, plan progress | Own plan |
| 5. Onboarding | Welcome, sign-in, quiz, tutorial spotlight, paywall | Own plan |
| 6. Rehab track | Rehab card + rehab tutorial | Own plan |
| 7. Platform extras | IAP for both stores (widgets/Live Activity are decided out of scope — see Risk Register) | Own plan |
| 8. Ship | Parity review, OTA pipeline, Play Store listing | Own plan |

Phases 3–8 get their own plans written once Phase 2 lands, because the component patterns established there (how a Swift view maps to an RN component, how motion constants are applied, how parity is verified) are what those plans should follow. Writing them now would be guessing at those patterns.

---

## Phase 0 — Foundation

### Task 1: Scaffold the Expo project

**Files:**
- Create: `deadpoint-rn/` (Expo TypeScript template)
- Create: `deadpoint-rn/app.json`
- Create: `deadpoint-rn/tsconfig.json`

**Interfaces:**
- Produces: a running Expo app on iOS Simulator and Android emulator.

- [ ] **Step 1: Create the project**

```bash
cd /Users/oscarsullivan/crimp-block
npx create-expo-app@latest deadpoint-rn --template expo-template-blank-typescript
cd deadpoint-rn
```

- [ ] **Step 2: Install the core dependencies**

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens \
  react-native-reanimated react-native-gesture-handler react-native-svg \
  expo-secure-store expo-av expo-notifications expo-updates expo-font
npm install @supabase/supabase-js react-native-mmkv
```

- [ ] **Step 3: Verify it boots on iOS**

Run: `npx expo start --ios`
Expected: simulator opens, default Expo screen renders, no red screen.

- [ ] **Step 4: Verify it boots on Android**

Run: `npx expo start --android`
Expected: emulator opens, same screen, no red screen.

- [ ] **Step 5: Commit**

```bash
git add deadpoint-rn
git commit -m "feat(rn): scaffold Expo project for the React Native rebuild"
```

---

### Task 2: Port the design tokens

**Files:**
- Create: `deadpoint-rn/src/design/colours.ts`
- Create: `deadpoint-rn/src/design/motion.ts`
- Test: `deadpoint-rn/__tests__/colours.test.ts`
- Reference: `ios/Shared/SessionColours.swift`

**Interfaces:**
- Produces: `Colours` (const object of hex strings), `resolveColour(name: string): string`, `Motion` (const object of durations/easings).

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/colours.test.ts
import { Colours, resolveColour } from '../src/design/colours';

test('base palette matches SessionColours.swift exactly', () => {
  expect(Colours.bg).toBe('#181B22');
  expect(Colours.s1).toBe('#1E222B');
  expect(Colours.s2).toBe('#272C37');
  expect(Colours.s3).toBe('#333947');
  expect(Colours.s4).toBe('#454C5C');
  expect(Colours.fg).toBe('#EDEBE5');
  expect(Colours.dim).toBe('#9AA0AE');
  expect(Colours.faint).toBe('#666C7A');
  expect(Colours.go).toBe('#1FA24A');
  expect(Colours.restC).toBe('#D6383D');
  expect(Colours.readyC).toBe('#D69A1F');
});

test('named colours resolve like SessionColours.resolve', () => {
  expect(resolveColour('--gorse')).toBe('#F2B134');
  expect(resolveColour('--tidepool')).toBe('#4FB3A5');
  expect(resolveColour('--slate')).toBe('#7B93E0');
  expect(resolveColour('--heather')).toBe('#C9739B');
  expect(resolveColour('--grey')).toBe('#5A6069');
});

test('unknown names fall back to --gorse, matching Swift', () => {
  expect(resolveColour('--nonsense')).toBe('#F2B134');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/colours.test.ts`
Expected: FAIL — `Cannot find module '../src/design/colours'`

- [ ] **Step 3: Implement**

```typescript
// src/design/colours.ts
/** Direct port of ios/Shared/SessionColours.swift. Values must stay
    byte-identical to that file — it is the source of truth shared with
    the still-shipping SwiftUI app. */
export const Colours = {
  bg: '#181B22',
  s1: '#1E222B',
  s2: '#272C37',
  s3: '#333947',
  s4: '#454C5C',
  fg: '#EDEBE5',
  dim: '#9AA0AE',
  faint: '#666C7A',
  go: '#1FA24A',
  restC: '#D6383D',
  readyC: '#D69A1F',
} as const;

const NAMED: Record<string, string> = {
  '--gorse': '#F2B134',
  '--tidepool': '#4FB3A5',
  '--slate': '#7B93E0',
  '--heather': '#C9739B',
  '--grey': '#5A6069',
};

/** Falls back to --gorse for anything unrecognised, exactly as
    SessionColours.resolve(_:) does. */
export function resolveColour(variableName: string): string {
  return NAMED[variableName] ?? NAMED['--gorse'];
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/colours.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the motion constants**

```typescript
// src/design/motion.ts
/** Every value copied verbatim from DailyCardView.swift. These are not
    taste calls — several were tuned against direct user feedback about
    the card feeling laggy or abrupt. Changing one is a behaviour change. */
export const Motion = {
  swipe: {
    minimumDistance: 10,
    horizontalClaimDx: 12,
    horizontalClaimRatio: 1.5,
    commitFraction: 0.3,
    completeDurationMs: 200,
    springBack: { response: 0.32, dampingFraction: 0.82 },
  },
  tickCollapseMs: 200,
  infoToggleMs: 150,
  setsTallyLongPressMs: 450,
  loggedStamp: {
    delayBeforeShowMs: 1000,
    fadeInMs: 250,
    holdMs: 2500,
    fadeOutMs: 400,
  },
  restOverlaySlideMs: 200,
  restOverlayTickMs: 200,
  intervalTickMs: 50,
} as const;
```

- [ ] **Step 6: Commit**

```bash
git add deadpoint-rn/src/design deadpoint-rn/__tests__/colours.test.ts
git commit -m "feat(rn): port SessionColours and motion constants with parity tests"
```

---

### Task 3: Bundle the real fonts

**Files:**
- Create: `deadpoint-rn/assets/fonts/` (4 TTFs copied from `ios/CrimpBlock/Fonts/`)
- Create: `deadpoint-rn/src/design/fonts.ts`
- Modify: `deadpoint-rn/app/_layout.tsx`
- Reference: `ios/Shared/AppFonts.swift`

**Interfaces:**
- Produces: `Fonts.heading(size)`, `Fonts.mono(size, weight?)`, `Fonts.timerDigits(size)` — each returning `{ fontFamily, fontSize }`.

- [ ] **Step 1: Copy the exact TTFs already in the repo**

```bash
mkdir -p deadpoint-rn/assets/fonts
cp ios/CrimpBlock/Fonts/*.ttf deadpoint-rn/assets/fonts/
ls deadpoint-rn/assets/fonts/
```

Expected output: `ArchivoBlack-Regular.ttf  RobotoMono-Bold.ttf  RobotoMono-Medium.ttf  SpaceMono-Bold.ttf`

- [ ] **Step 2: Write the failing test**

```typescript
// __tests__/fonts.test.ts
import { Fonts } from '../src/design/fonts';

test('heading uses Archivo Black, matching AppFonts.heading', () => {
  expect(Fonts.heading(32)).toEqual({ fontFamily: 'ArchivoBlack-Regular', fontSize: 32 });
});

test('mono picks the bold cut for bold-ish weights, matching AppFonts.mono', () => {
  // AppFonts.boldWeights = [.bold, .heavy, .black, .semibold]
  expect(Fonts.mono(12, 'bold').fontFamily).toBe('RobotoMono-Bold');
  expect(Fonts.mono(12, 'semibold').fontFamily).toBe('RobotoMono-Bold');
  expect(Fonts.mono(12, 'medium').fontFamily).toBe('RobotoMono-Medium');
});

test('mono defaults to bold, matching the Swift default parameter', () => {
  expect(Fonts.mono(12).fontFamily).toBe('RobotoMono-Bold');
});

test('timer digits use Space Mono', () => {
  expect(Fonts.timerDigits(48).fontFamily).toBe('SpaceMono-Bold');
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx jest __tests__/fonts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// src/design/fonts.ts
/** Direct port of ios/Shared/AppFonts.swift, using the same four TTFs.
    Archivo Black for the one heading role, Roboto Mono for everything
    else monospaced, Space Mono for timer countdown digits only — all
    picked in a live side-by-side against the real card, not chosen blind. */
type MonoWeight = 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';

/** Mirrors AppFonts.boldWeights exactly: a static TTF has no continuous
    weight axis, so this is an explicit allowlist, not a threshold. */
const BOLD_WEIGHTS: ReadonlySet<string> = new Set(['bold', 'heavy', 'black', 'semibold']);

export const Fonts = {
  heading(fontSize: number) {
    return { fontFamily: 'ArchivoBlack-Regular', fontSize };
  },
  mono(fontSize: number, weight: MonoWeight = 'bold') {
    return {
      fontFamily: BOLD_WEIGHTS.has(weight) ? 'RobotoMono-Bold' : 'RobotoMono-Medium',
      fontSize,
    };
  },
  timerDigits(fontSize: number) {
    return { fontFamily: 'SpaceMono-Bold', fontSize };
  },
};
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx jest __tests__/fonts.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Migrate the scaffold's entry point to expo-router**

Task 1 scaffolded with `expo-template-blank-typescript` (classic `App.tsx` +
`index.ts` entry) and installed `expo-router` as a dependency, but never
switched the project over to router's file-based `app/` directory — there
is no `deadpoint-rn/app/` yet. `app.json`'s `plugins` array already lists
`"expo-router"` (added automatically by `npx expo install expo-router` in
Task 1), so only the entry point and the directory itself are missing.
This is a one-time migration; do it now because this is the first task
that needs `app/_layout.tsx` to exist, and it will be needed by every task
after this one.

1. In `deadpoint-rn/package.json`, change `"main": "index.ts"` to
   `"main": "expo-router/entry"`.
2. Delete `deadpoint-rn/index.ts` and `deadpoint-rn/App.tsx` — expo-router
   replaces both.
3. Create `deadpoint-rn/app/` (new directory).

- [ ] **Step 7: Load the fonts at app start**

```tsx
// app/_layout.tsx
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { Colours } from '../src/design/colours';

export default function RootLayout() {
  const [loaded] = useFonts({
    'ArchivoBlack-Regular': require('../assets/fonts/ArchivoBlack-Regular.ttf'),
    'RobotoMono-Bold': require('../assets/fonts/RobotoMono-Bold.ttf'),
    'RobotoMono-Medium': require('../assets/fonts/RobotoMono-Medium.ttf'),
    'SpaceMono-Bold': require('../assets/fonts/SpaceMono-Bold.ttf'),
  });

  // Holding on the app's own background colour rather than white avoids
  // a light flash on launch against this dark UI.
  if (!loaded) return <View style={{ flex: 1, backgroundColor: Colours.bg }} />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colours.bg } }} />;
}
```

- [ ] **Step 8: Add a temporary index route so the layout has something to render**

expo-router's `<Stack>` needs at least one matched route or it shows its
own "Unmatched Route" screen instead of app content. Task 12 replaces this
file with the real `app/(main)/card.tsx` daily card screen — this is
scaffolding to prove fonts load, not a permanent screen.

```tsx
// app/index.tsx
import { Text, View } from 'react-native';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';

export default function TempFontCheck() {
  return (
    <View style={{ flex: 1, backgroundColor: Colours.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: Colours.fg, ...Fonts.heading(32) }}>Deadpoint</Text>
    </View>
  );
}
```

- [ ] **Step 9: Verify the fonts render on device**

Run: `npx expo start --ios`, then `npx expo start --android`
Expected: "Deadpoint" renders in Archivo Black's distinctive heavy
grotesque, **not** the system font, on both platforms.

If no simulator/emulator is available in the current environment, it is
acceptable to defer this literal device check to controller level (verify
once real UI exists to check, e.g. after Task 12) — do not substitute a
different check silently; state plainly in your report that this step was
deferred and why.

- [ ] **Step 10: Commit**

```bash
git add deadpoint-rn/assets deadpoint-rn/src/design/fonts.ts deadpoint-rn/app deadpoint-rn/__tests__/fonts.test.ts \
        deadpoint-rn/package.json
git rm deadpoint-rn/index.ts deadpoint-rn/App.tsx
git commit -m "feat(rn): bundle the four app fonts, port AppFonts, migrate to expo-router"
```

---

### Task 4: Import the engine and prove parity with Swift

This is the single most important task in the plan. It proves the core premise — that the engine transfers untouched — and it produces the harness every later phase leans on.

**Files:**
- Create: `deadpoint-rn/src/engine/*.js` (6 files copied verbatim)
- Create: `deadpoint-rn/src/engine/index.ts`
- Create: `deadpoint-rn/src/engine/types.ts`
- Test: `deadpoint-rn/__tests__/engine-parity.test.ts`
- Reference: `ios/Shared/EngineBridge.swift`, `ios/CrimpBlockTests/EngineBridgeTests.swift`

**Interfaces:**
- Produces: `createEngine(program, data)` returning a typed facade with `today()`, `addDays()`, `decide()`, `block()`, `phaseNameAt()`, `isDeload()`, `isReturning()`, `isTraining()`, `upNext()`, `forecast()`, `phases`, `phaseIndexAt()`, `sessionInfo()`, `resolveExercises()`, `sessionColourVarName()`, `programStartDate()` — the same surface `EngineBridge.swift` exposes.
- Produces: `SESSION_ORDER` — `['maxFingers','hangboard','pull','climbHard','outdoorHard','climbEasy','rest']` (from `EngineBridge.order`).

- [ ] **Step 1: Copy the engine files verbatim**

```bash
mkdir -p deadpoint-rn/src/engine
cp engine-core.js programs.js templates.js template-resolver.js \
   rehab-templates.js rehab-resolver.js deadpoint-rn/src/engine/
```

- [ ] **Step 2: Confirm they are byte-identical**

```bash
for f in engine-core.js programs.js templates.js template-resolver.js rehab-templates.js rehab-resolver.js; do
  diff -q "$f" "deadpoint-rn/src/engine/$f" && echo "OK $f"
done
```

Expected: `OK` for all six, no diff output.

- [ ] **Step 3: Write the failing parity test**

These expectations are the *real* values from Oscar's account, already verified against the live engine during the calendar work. If RN's engine disagrees with any of them, the port is broken.

```typescript
// __tests__/engine-parity.test.ts
import { createEngine, SESSION_ORDER } from '../src/engine';
const PROGRAMS = require('../src/engine/programs.js');

/** Oscar's real logged history, 7–28 Aug 2026, fetched from Supabase.
    Used because its expected outputs were independently verified against
    the live JS engine while building the calendar. */
const HISTORY: Record<string, { t: string }> = {
  '2026-08-07': { t: 'maxFingers' }, '2026-08-08': { t: 'climbHard' },
  '2026-08-09': { t: 'outdoorHard' }, '2026-08-10': { t: 'rest' },
  '2026-08-11': { t: 'hangboard' },  '2026-08-12': { t: 'pull' },
  '2026-08-13': { t: 'rest' },       '2026-08-14': { t: 'rest' },
  '2026-08-15': { t: 'maxFingers' }, '2026-08-16': { t: 'rest' },
  '2026-08-17': { t: 'hangboard' },  '2026-08-18': { t: 'pull' },
  '2026-08-19': { t: 'maxFingers' }, '2026-08-20': { t: 'rest' },
  '2026-08-21': { t: 'outdoorHard' },'2026-08-22': { t: 'pull' },
  '2026-08-23': { t: 'maxFingers' }, '2026-08-24': { t: 'climbHard' },
  '2026-08-25': { t: 'rest' },       '2026-08-26': { t: 'maxFingers' },
  '2026-08-27': { t: 'pull' },       '2026-08-28': { t: 'rest' },
};

const engine = () =>
  createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: HISTORY, loadLog: {} });

test('session order matches EngineBridge.order exactly', () => {
  expect(SESSION_ORDER).toEqual([
    'maxFingers', 'hangboard', 'pull', 'climbHard', 'outdoorHard', 'climbEasy', 'rest',
  ]);
});

test('block() on 2026-08-29 matches the verified Swift output', () => {
  expect(engine().block('2026-08-29')).toMatchObject({ b: 1, w: 4, per: 4, total: 12 });
});

test('isDeload agrees with block().w === 4', () => {
  expect(engine().isDeload('2026-08-29')).toBe(true);
});

test('phaseNameAt returns the real phase', () => {
  expect(engine().phaseNameAt('2026-08-29')).toBe('Base');
});

test('decide() reproduces the deload hard-day cap verbatim', () => {
  // Verified live: 4 hard days in the trailing window, cap is 3 in a deload week.
  const d = engine().decide('2026-08-29');
  expect(d.k).toBe('rest');
  expect(d.why).toContain('deload week');
});

test('a gap on a real rest day still recommends rest (streak logic depends on this)', () => {
  const withGap = { ...HISTORY };
  delete withGap['2026-08-20'];
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: withGap, loadLog: {} });
  expect(e.decide('2026-08-20').k).toBe('rest');
});

test('a gap on a real workout day does NOT recommend rest', () => {
  const withGap = { ...HISTORY };
  delete withGap['2026-08-19'];
  const e = createEngine(PROGRAMS['oscar@sullivanltd.co.uk'], { sessionLog: withGap, loadLog: {} });
  expect(e.decide('2026-08-19').k).toBe('maxFingers');
});

test('programStartDate is the program anchor, not the earliest log', () => {
  // Deliberately differs: earliest log is 07 Aug, program starts 10 Aug.
  expect(engine().programStartDate()).toBe('2026-08-10');
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx jest __tests__/engine-parity.test.ts`
Expected: FAIL — `Cannot find module '../src/engine'`

- [ ] **Step 5: Write the typed facade**

```typescript
// src/engine/index.ts
/** Replaces ios/Shared/EngineBridge.swift entirely. That file existed only
    to marshal values across JavaScriptCore; in React Native the engine IS
    native, so this is a thin typed wrapper over the same calls rather than
    a bridge. Method names deliberately match EngineBridge's so the Swift
    source stays a readable reference during the port. */
const core = require('./engine-core.js');

export const SESSION_ORDER = core.ORDER as readonly string[];

export interface BlockInfo { b: number; w: number; done: number; per: number; total: number; wIdx: number; over: boolean; }
export interface Decision { k: string; why: string; }
export interface Phase { n: string; from: number; c: string; d: string; }

export function createEngine(program: any, data: { sessionLog: any; loadLog: any }) {
  const e = core.createEngine(program, data);
  return {
    today: (): string => core.today(),
    addDays: (date: string, n: number): string => core.addDays(date, n),
    decide: (date: string): Decision => e.decide(date),
    block: (date: string): BlockInfo => e.block(date),
    phaseNameAt: (date: string): string => e.phaseNameAt(date),
    isDeload: (date: string): boolean => e.isDeload(date),
    isReturning: (date: string): boolean => e.isReturning(date),
    isTraining: (type: string): boolean => e.isTraining(type),
    upNext: () => e.upNext(),
    forecast: (days: number) => e.forecast(days),
    phaseIndexAt: (b: number): number => e.phaseIndexAt(b),
    get phases(): Phase[] { return program.phases ?? []; },
    programStartDate: (): string | undefined => program.startDate,
    sessionColourVarName: (key: string): string => program.sessions?.[key]?.c ?? '--gorse',
    sessionInfo: (key: string) => program.sessions?.[key],
    resolveExercises: (key: string, date: string, phaseName: string): RenderedExercise[] =>
      resolveExercises(e, program, key, date, phaseName),
  };
}

export interface IntervalConfig { on: number; off: number; reps: number; }
export interface RenderedExercise {
  id: string; title: string; prescription: string; phaseAdjusted: boolean;
  description?: string; restSeconds?: number; weightKg?: number;
  weightIsBump: boolean; hasWeightTracking: boolean; step: number;
  interval?: IntervalConfig;
}

/** Faithful port of EngineBridge.resolveExercises(for:date:phaseName:).
    Note how much of the Swift version was pure JSValue marshalling — here
    it is ordinary property access, which is the whole point of the move.
    Two behaviours are easy to lose and both matter:
      · `phaseAdjusted` compares the BASE prescription against the resolved
        one, and is what tints a phase-overridden prescription in the accent
        colour instead of grey.
      · `hasWeightTracking` is "the exercise has an id", NOT "it has a
        weight" — an exercise with no history yet has no target() result but
        must still show the dashed "SET kg" badge, or a brand-new account
        can never record a first weight. */
function resolveExercises(e: any, program: any, key: string, date: string, phaseName: string): RenderedExercise[] {
  const raw = program.sessions?.[key]?.x;
  if (!Array.isArray(raw)) return [];

  const out: RenderedExercise[] = [];
  for (const base of raw) {
    const resolved = e.resolveEx(base, key, date, phaseName);
    if (resolved == null) continue;

    const ex = resolved.e;
    const m: string = resolved.m ?? '';
    const title: string = ex?.t ?? '?';
    const hasWeightTracking = ex?.id != null;

    let weightKg: number | undefined;
    let weightIsBump = false;
    let step = 2.5;
    if (hasWeightTracking) {
      if (ex.step != null) step = ex.step;
      const tg = e.target(ex, date);
      if (tg != null) { weightKg = tg.kg; weightIsBump = tg.bump ?? false; }
    }

    const iv = ex?.interval;
    const interval: IntervalConfig | undefined =
      iv?.on != null && iv?.off != null && iv?.reps != null
        ? { on: iv.on, off: iv.off, reps: iv.reps }
        : undefined;

    out.push({
      id: hasWeightTracking ? String(ex.id) : title,
      title,
      prescription: m,
      phaseAdjusted: base.m != null && base.m !== m,
      description: ex?.d ?? undefined,
      restSeconds: ex?.r ?? undefined,
      weightKg, weightIsBump, hasWeightTracking, step, interval,
    });
  }
  return out;
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npx jest __tests__/engine-parity.test.ts`
Expected: PASS, 8 tests. If `decide()` or `block()` disagree, **stop** — the engine copy or the facade is wrong, and everything downstream inherits the error.

- [ ] **Step 7: Commit**

```bash
git add deadpoint-rn/src/engine deadpoint-rn/__tests__/engine-parity.test.ts
git commit -m "feat(rn): import the JS engine verbatim and prove parity against verified Swift outputs"
```

---

## Phase 1 — Data layer

### Task 5: Supabase client and auth

**Files:**
- Create: `deadpoint-rn/src/data/supabase.ts`
- Create: `deadpoint-rn/src/data/useSession.ts`
- Reference: `ios/Shared/SupabaseClient.swift`, `ios/CrimpBlock/NativeSignInView.swift`

**Interfaces:**
- Produces: `supabase` client instance; `useSession()` → `{ session, sendOTP(email), verifyOTP(email, token), signOut() }`.

- [ ] **Step 1: Create the client with the 90s timeout**

```typescript
// src/data/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/** expo-secure-store replaces ios/Shared/Keychain.swift. The access token is
    a bearer credential — AsyncStorage (plain, unencrypted) is the wrong place. */
const SecureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/** Not a secret: already embedded in the public web bundle (app.js) by
    design, same value, confirmed there. RLS on user_id is what actually
    protects data, same as on web — see SupabaseClient.swift's doc comment
    for the live confirmation that an unauthenticated GET returns [], not
    other people's rows. Hardcoded rather than an env var for the same
    reason app.js hardcodes it: there is nothing to keep out of the bundle. */
const SUPABASE_URL = 'https://lbhsgkadlhcqqnlbfswr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiaHNna2FkbGhjcXFubGJmc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNTg2NzMsImV4cCI6MjEwMTkzNDY3M30.3Df2BW9YVfJYZVSalLWGsx54iY_RvnZdln71Kehljug';

/** 90s, not the default — confirmed live against the real endpoint:
    auth/v1/otp takes 60-65s to respond even with custom SMTP (Resend)
    configured, so the default timeout was racing it and reporting a
    slow-but-successful send as a hard failure. See SupabaseClient.swift. */
const TIMEOUT_MS = 90_000;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { storage: SecureStorageAdapter, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
    },
  },
});
```

- [ ] **Step 2: Verify the client and its timeout wrapper without touching the live project**

Do NOT run a real `signInWithOtp` in this step — it sends an actual email
through Oscar's real Supabase project (`SUPABASE_URL` above), which is a
live production side effect on someone else's inbox and, per the account's
own known ~60s send latency (see the `TIMEOUT_MS` comment above), a
plausible source of real support load if triggered unattended. That
verification requires Oscar present to receive and confirm the code — it
is explicitly **not** something to automate here. Instead, verify what
this step actually owns: the client constructs without throwing, and the
90s abort wrapper genuinely aborts.

```typescript
// __tests__/supabase-timeout.test.ts
/** Exercises the exact same abort-wiring supabase.ts's `global.fetch`
    override uses, in isolation, against a fetch that never resolves —
    the one behaviour worth testing here (a hung request must not hang
    forever). Not imported from supabase.ts because that file's fetch
    override is an inline closure passed straight into createClient, not
    an exported function — duplicating its four lines here is simpler and
    more honest than exporting a function for the sole purpose of testing
    it. If Step 1's wrapper logic ever changes, update this copy too. */
function timeoutWrappedFetch(realFetch: typeof fetch, timeoutMs: number): typeof fetch {
  return ((url: any, options: any = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return realFetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }) as typeof fetch;
}

test('a hung request is aborted once the timeout elapses, not left hanging', async () => {
  jest.useFakeTimers();
  const hangingFetch = jest.fn(
    (_url: any, options: any) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      })
  ) as unknown as typeof fetch;

  const wrapped = timeoutWrappedFetch(hangingFetch, 90_000);
  const result = wrapped('https://example.invalid');
  const assertion = expect(result).rejects.toThrow('aborted');

  jest.advanceTimersByTime(90_000);
  await assertion;

  jest.useRealTimers();
});

test('a request that resolves well within the timeout is not affected', async () => {
  jest.useFakeTimers();
  const fastFetch = jest.fn(async () => new Response('ok')) as unknown as typeof fetch;
  const wrapped = timeoutWrappedFetch(fastFetch, 90_000);

  await expect(wrapped('https://example.invalid')).resolves.toBeInstanceOf(Response);

  jest.useRealTimers();
});

test('supabase client constructs without throwing, and exposes the auth methods this task needs', () => {
  const { supabase } = require('../src/data/supabase');
  expect(supabase).toBeTruthy();
  expect(typeof supabase.auth.signInWithOtp).toBe('function');
  expect(typeof supabase.auth.verifyOtp).toBe('function');
  expect(typeof supabase.auth.signOut).toBe('function');
});
```

Run: `npx jest __tests__/supabase-timeout.test.ts`
Expected: PASS, 3 tests.

The real end-to-end check — a live `sendOTP` actually delivering a working
code to Oscar's inbox within the known ~60-65s window — happens once,
manually, with Oscar present to check his email, the first time the sign-in
screen exists to drive it (the not-yet-written Phase 3 auth-screen plan).
Note this explicitly in your report as deferred, not skipped.

- [ ] **Step 3: Write `useSession`, the auth hook**

```typescript
// src/data/useSession.ts
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Thin wrapper over the real supabase-js auth API — there is no hand-rolled
    REST client here the way there is in SupabaseClient.swift, because unlike
    iOS there IS a real JS SDK on this platform, and it already owns session
    persistence, refresh, and the auth-state stream SupabaseClient.swift had
    to hand-write (see its own doc comment on `@Observable` for exactly the
    class of bug — a mutation nobody re-renders on — that a live
    `onAuthStateChange` subscription avoids by construction). Throws on
    error rather than swallowing it, same contract as sendOTP/verifyOTP in
    SupabaseClient.swift being `async throws` — turning an error into
    user-facing copy (SupabaseClient.friendlyMessage's job) is a UI-layer
    concern for the not-yet-written sign-in screen, not this hook's. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return {
    session,
    /** Mirrors sb.auth.signInWithOtp in app.js / sendOTP(email:) in
        SupabaseClient.swift — same code-entry flow, no magic-link redirect
        to configure (see NativeSignInView.swift's doc comment for why a
        typed code beats a link: a link opens a browser with separate
        storage from this app). */
    sendOTP: async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
    },
    verifyOTP: async (email: string, token: string) => {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add deadpoint-rn/src/data/supabase.ts deadpoint-rn/src/data/useSession.ts \
        deadpoint-rn/__tests__/supabase-timeout.test.ts
git commit -m "feat(rn): Supabase client with secure session storage, the 90s OTP timeout, and the auth hook"
```

---

### Task 6: Session, loads, and profile hooks

**Files:**
- Create: `deadpoint-rn/src/data/useStore.ts`
- Create: `deadpoint-rn/src/data/useLoads.ts`
- Create: `deadpoint-rn/src/data/useProfile.ts`
- Test: `deadpoint-rn/__tests__/store.test.ts`
- Reference: `ios/Shared/NativeStore.swift`, `NativeLoads.swift`, `NativeProfile.swift`

**Interfaces:**
- Produces: `useStore()` → `{ days, get(date), set(date, type, sub?), clear(date), reload() }` — the `sub` column carries `"board"`/`"climb"` for climbHard days.
- Produces: `useLoads()` → `{ byExercise, history(id), on(id, date), set(date, id, kg), all(), reload() }`.
- Produces: `useProfile()` → `{ row, reload(), create(templateId, startDate, modifiers), assignRehab(injuryArea, startingPhaseIndex?), switchToStandard(), advanceRehabPhase(phaseIndex), markTutorialCompleted() }`.

- [ ] **Step 1: Write the failing test for optimistic-write rollback**

```typescript
// __tests__/store.test.ts
import { applyOptimisticSet, rollback } from '../src/data/useStore';

test('an optimistic set writes locally before the network call', () => {
  const days = {};
  const next = applyOptimisticSet(days, '2026-08-29', 'pull', null);
  expect(next['2026-08-29']).toEqual({ t: 'pull', l: null, sub: null });
});

test('a failed write rolls back to the previous entry, not to empty', () => {
  const before = { '2026-08-29': { t: 'rest', l: null, sub: null } };
  const optimistic = applyOptimisticSet(before, '2026-08-29', 'pull', null);
  expect(rollback(optimistic, '2026-08-29', before['2026-08-29'])).toEqual(before);
});

test('climbHard carries its board/climb sub-type', () => {
  const next = applyOptimisticSet({}, '2026-08-29', 'climbHard', 'board');
  expect(next['2026-08-29'].sub).toBe('board');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the optimistic helpers and the hook**

```typescript
// src/data/useStore.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Entry { t: string; l: number | null; sub: string | null; }
export type Days = Record<string, Entry>;

/** Pure helpers, exported for test. Mirrors NativeStore.swift's contract:
    write locally FIRST, then fire the network call, and roll the local
    state back on failure — a failed write must never look identical to a
    success. The app has to stay usable at the crag with no signal. */
export function applyOptimisticSet(days: Days, date: string, type: string, sub: string | null): Days {
  return { ...days, [date]: { t: type, l: null, sub } };
}

export function rollback(days: Days, date: string, previous: Entry | undefined): Days {
  const next = { ...days };
  if (previous) next[date] = previous; else delete next[date];
  return next;
}

export function useStore(startDate: string | null, today: string) {
  const [days, setDays] = useState<Days>({});

  const reload = useCallback(async () => {
    if (!startDate) return;
    // Window reaches back to startDate AND a 60-day buffer before it —
    // block progression counts every training day since day one, and
    // backdating pre-start days is normal. See NativeStore.load().
    const back = new Date(today); back.setDate(back.getDate() - 60);
    const from = back.toISOString().slice(0, 10) < startDate ? back.toISOString().slice(0, 10) : startDate;
    const { data, error } = await supabase.from('sessions').select('date,type,load,sub').gte('date', from);
    if (error) throw error;
    setDays(Object.fromEntries((data ?? []).map(r => [r.date, { t: r.type, l: r.load, sub: r.sub }])));
  }, [startDate, today]);

  useEffect(() => { reload(); }, [reload]);

  const set = useCallback(async (date: string, type: string, sub: string | null = null) => {
    const previous = days[date];
    setDays(d => applyOptimisticSet(d, date, type, sub));
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('sessions')
      .upsert({ user_id: user!.id, date, type, sub }, { onConflict: 'user_id,date' });
    if (error) { setDays(d => rollback(d, date, previous)); throw error; }
  }, [days]);

  const clear = useCallback(async (date: string) => {
    const previous = days[date];
    setDays(d => rollback(d, date, undefined));
    const { error } = await supabase.from('sessions').delete().eq('date', date);
    if (error) { setDays(d => ({ ...d, [date]: previous! })); throw error; }
  }, [days]);

  return { days, get: (date: string) => days[date], set, clear, reload };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/store.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing test for `useLoads`'s optimistic helpers**

`NativeLoads.swift`'s own doc comment says it plainly: "Same optimistic-write/rollback contract as NativeStore." Same shape of test as Step 1, one level deeper (per-exercise arrays, newest-first, matching `Loads._d`'s ordering in app.js — `engine-core.js`'s `target()`/`loadHistory()` assume `past[0]` is the most recent entry).

```typescript
// __tests__/loads.test.ts
import { applyOptimisticLoad, rollbackLoad } from '../src/data/useLoads';

test('a new date for an exercise is appended and kept newest-first', () => {
  const before = { 'osc-pinch': [{ date: '2026-08-20', kg: 20 }] };
  const next = applyOptimisticLoad(before, 'osc-pinch', '2026-08-27', 22.5);
  expect(next['osc-pinch']).toEqual([{ date: '2026-08-27', kg: 22.5 }, { date: '2026-08-20', kg: 20 }]);
});

test('re-logging the same date updates that entry in place, not a duplicate', () => {
  const before = { 'osc-pinch': [{ date: '2026-08-27', kg: 22.5 }, { date: '2026-08-20', kg: 20 }] };
  const next = applyOptimisticLoad(before, 'osc-pinch', '2026-08-27', 25);
  expect(next['osc-pinch']).toEqual([{ date: '2026-08-27', kg: 25 }, { date: '2026-08-20', kg: 20 }]);
});

test('a failed write rolls back to the previous array for that exercise only', () => {
  const before = { 'osc-pinch': [{ date: '2026-08-20', kg: 20 }], 'osc-pickup-half': [{ date: '2026-08-19', kg: 15 }] };
  const optimistic = applyOptimisticLoad(before, 'osc-pinch', '2026-08-27', 22.5);
  expect(rollbackLoad(optimistic, 'osc-pinch', before['osc-pinch'])).toEqual(before);
});
```

Run: `npx jest __tests__/loads.test.ts` — expect FAIL (module not found), then implement Step 6 below and re-run to confirm PASS, 3 tests.

- [ ] **Step 6: Implement `useLoads`**

```typescript
// src/data/useLoads.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface LoadEntry { date: string; kg: number; }
export type LoadsByExercise = Record<string, LoadEntry[]>;

/** Pure helpers, exported for test. Same optimistic-write/rollback contract
    as useStore.ts's applyOptimisticSet/rollback (see NativeLoads.swift's
    own doc comment). Entries stay newest-first per exercise. */
export function applyOptimisticLoad(byExercise: LoadsByExercise, id: string, date: string, kg: number): LoadsByExercise {
  const entries = byExercise[id] ?? [];
  const idx = entries.findIndex(e => e.date === date);
  const next = idx >= 0
    ? entries.map((e, i) => (i === idx ? { date, kg } : e))
    : [...entries, { date, kg }].sort((a, b) => (a.date > b.date ? -1 : 1));
  return { ...byExercise, [id]: next };
}

export function rollbackLoad(byExercise: LoadsByExercise, id: string, previous: LoadEntry[]): LoadsByExercise {
  return { ...byExercise, [id]: previous };
}

export function useLoads() {
  const [byExercise, setByExercise] = useState<LoadsByExercise>({});

  /** Not date-filtered, same reasoning as NativeLoads.load(): "what did I
      lift last time" has to survive a long layoff, and the table is small
      enough that loading all of it costs nothing. */
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('exercise_loads').select('date,ex,kg').order('date', { ascending: false });
    if (error) {
      // Genuinely missing table (migration not run yet) must not take the
      // app down — weights just don't appear, same as NativeLoads.load()'s
      // narrowed PGRST205 catch. Any other error still throws.
      if (error.code === 'PGRST205') { setByExercise({}); return; }
      throw error;
    }
    const grouped: LoadsByExercise = {};
    for (const r of (data ?? []) as { date: string; ex: string; kg: number }[]) {
      (grouped[r.ex] ??= []).push({ date: r.date, kg: r.kg });
    }
    setByExercise(grouped);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const history = (id: string): LoadEntry[] => byExercise[id] ?? [];
  const on = (id: string, date: string): LoadEntry | undefined => byExercise[id]?.find(e => e.date === date);

  const set = useCallback(async (date: string, id: string, kg: number) => {
    const previous = byExercise[id] ?? [];
    setByExercise(b => applyOptimisticLoad(b, id, date, kg));
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('exercise_loads')
      .upsert({ user_id: user!.id, date, ex: id, kg }, { onConflict: 'user_id,date,ex' });
    if (error) { setByExercise(b => rollbackLoad(b, id, previous)); throw error; }
  }, [byExercise]);

  /** Matches NativeLoads.all() — the exact shape createEngine's `loadLog`
      argument (Task 4) expects: exercise id -> {date,kg}[]. */
  const all = useCallback((): LoadsByExercise => byExercise, [byExercise]);

  return { byExercise, history, on, set, all, reload };
}
```

- [ ] **Step 7: Implement `useProfile`**

`NativeProfile.swift` does **not** use the optimistic-write/rollback contract Step 3 and Step 6 do — worth stating explicitly since it would be easy to assume every hook in this task follows the same pattern. Every one of its write methods updates local state only **after** its network call has already succeeded (see e.g. `create()`: the `row = Row(...)` line runs only once `client.upsert()` has returned without throwing). A failure before that point just throws, leaving `row` exactly as it was — there is nothing to roll back to. This port keeps that same after-success-only contract.

```typescript
// src/data/useProfile.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Mirrors NativeProfile.Row field-for-field (see NativeProfile.swift's
    CodingKeys for the camelCase<->snake_case mapping this hook performs
    by hand at the query boundary, same translation Swift's Codable does
    automatically). `modifiers` is a free-form JSON object (equipment/
    injuryFlags/weaknesses/tripDate/daysPerWeek — see template-resolver.js)
    — plain `Record<string, unknown>` here needs no Swift-style AnyCodable
    wrapper, since JSON round-trips through JS objects natively. */
export interface ProfileRow {
  assignedTemplateId: string | null;
  programStartDate: string;
  modifiers: Record<string, unknown>;
  tier: string;
  quizCompletedAt: string | null;
  tutorialCompletedAt: string | null;
  trackType: string;
  rehabInjuryArea: string | null;
  rehabPhaseIndex: number | null;
}

interface ProfileDbRow {
  assigned_template_id: string | null;
  program_start_date: string;
  modifiers: Record<string, unknown> | null;
  tier: string;
  quiz_completed_at: string | null;
  tutorial_completed_at: string | null;
  track_type: string;
  rehab_injury_area: string | null;
  rehab_phase_index: number | null;
}

function fromDbRow(r: ProfileDbRow): ProfileRow {
  return {
    assignedTemplateId: r.assigned_template_id,
    programStartDate: r.program_start_date,
    modifiers: r.modifiers ?? {},
    tier: r.tier,
    quizCompletedAt: r.quiz_completed_at,
    tutorialCompletedAt: r.tutorial_completed_at,
    trackType: r.track_type,
    rehabInjuryArea: r.rehab_injury_area,
    rehabPhaseIndex: r.rehab_phase_index,
  };
}

const PROFILE_COLUMNS =
  'assigned_template_id,program_start_date,modifiers,tier,quiz_completed_at,tutorial_completed_at,track_type,rehab_injury_area,rehab_phase_index';

export function useProfile() {
  const [row, setRow] = useState<ProfileRow | null>(null);

  /** null `row` afterward means genuinely no profile yet (a real new user
      who hasn't done the quiz) — distinct from a network/decode failure,
      which throws instead of silently leaving `row` null, so the caller
      doesn't mistake "couldn't check" for "definitely new." */
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).maybeSingle();
    if (error) throw error;
    setRow(data ? fromDbRow(data as ProfileDbRow) : null);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /** Called once, right after the quiz's standard branch — creates (or
      re-creates, for someone switching back into standard who's never had
      a standard assignment before) the profile that makes this a
      template-assigned Standard-tier user from then on. */
  const create = useCallback(async (templateId: string, startDate: string, modifiers: Record<string, unknown>) => {
    const { data: { user } } = await supabase.auth.getUser();
    const quizCompletedAt = new Date().toISOString();
    const { error } = await supabase.from('profiles').upsert({
      user_id: user!.id,
      assigned_template_id: templateId,
      program_start_date: startDate,
      modifiers,
      tier: 'standard',
      track_type: 'standard',
      quiz_completed_at: quizCompletedAt,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    setRow(r => ({
      assignedTemplateId: templateId, programStartDate: startDate, modifiers,
      tier: 'standard', quizCompletedAt, tutorialCompletedAt: r?.tutorialCompletedAt ?? null,
      trackType: 'standard', rehabInjuryArea: null, rehabPhaseIndex: null,
    }));
  }, []);

  /** Assigns (or first-assigns) the rehab track. Deliberately omits
      assigned_template_id/program_start_date/modifiers from the write
      when a profile row already exists — upsert's merge-duplicates only
      touches columns present in the payload, so any existing standard
      assignment is left completely untouched underneath the rehab track,
      ready to restore instantly via switchToStandard() once rehab
      finishes. A brand-new user (no row yet) has no prior assignment to
      preserve, so this also supplies today's date for program_start_date's
      NOT NULL constraint in that case only — unused while trackType stays
      "rehab". */
  const assignRehab = useCallback(async (injuryArea: string, startingPhaseIndex = 0) => {
    const { data: { user } } = await supabase.auth.getUser();
    const quizCompletedAt = new Date().toISOString();
    const existing = row;
    const payload: Record<string, unknown> = {
      user_id: user!.id,
      track_type: 'rehab',
      rehab_injury_area: injuryArea,
      rehab_phase_index: startingPhaseIndex,
      quiz_completed_at: quizCompletedAt,
    };
    if (!existing) payload.program_start_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
    setRow(existing
      ? { ...existing, trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex }
      : {
          assignedTemplateId: null, programStartDate: payload.program_start_date as string,
          modifiers: {}, tier: 'standard', quizCompletedAt, tutorialCompletedAt: null,
          trackType: 'rehab', rehabInjuryArea: injuryArea, rehabPhaseIndex: startingPhaseIndex,
        });
  }, [row]);

  /** Restores the Standard track using whatever assignment already exists
      on this profile — the "instant" path for someone who's finished
      rehab, no requiz. PATCH (`.update`), not upsert — see
      NativeProfile.switchToStandard()'s own comment: a partial upsert here
      would fail program_start_date's NOT NULL check the same way
      markTutorialCompleted's used to. */
  const switchToStandard = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('profiles').update({ track_type: 'standard' }).eq('user_id', user!.id);
    if (error) throw error;
    setRow(r => (r ? { ...r, trackType: 'standard' } : r));
  }, []);

  /** Persists a new rehab phase index once every self-report criterion for
      the current phase has been checked and the user confirms they're
      ready to move on. */
  const advanceRehabPhase = useCallback(async (phaseIndex: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('profiles').update({ rehab_phase_index: phaseIndex }).eq('user_id', user!.id);
    if (error) throw error;
    setRow(r => (r ? { ...r, rehabPhaseIndex: phaseIndex } : r));
  }, []);

  const markTutorialCompleted = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await supabase.from('profiles').update({ tutorial_completed_at: now }).eq('user_id', user!.id);
    if (error) throw error;
    setRow(r => (r ? { ...r, tutorialCompletedAt: now } : r));
  }, []);

  return { row, reload, create, assignRehab, switchToStandard, advanceRehabPhase, markTutorialCompleted };
}
```

- [ ] **Step 8: Run the full test suite**

Run: `npx jest`
Expected: PASS, everything from Tasks 1-6 combined (21 from Task 5 + the 3 new `loads.test.ts` tests = 24).

- [ ] **Step 9: Live database verification — deferred, not run here**

Do NOT sign in and write real rows as part of this task. `useStore`/
`useLoads`/`useProfile` all write to Oscar's real `sessions`/
`exercise_loads`/`profiles` tables — a bug in the optimistic-write or
rollback logic run unattended could leave real training history
corrupted (e.g. a botched rollback deleting a real logged session, or a
malformed `profiles` upsert clobbering `track_type`/`rehab_injury_area`,
which drives what the engine actually recommends). It also is not
actually executable right now regardless: it requires a signed-in
session, and Task 5's real sign-in flow is itself deferred pending a
human present to receive a live OTP (see Task 5's Step 2). Note in your
report that this step is deferred to the same later, human-supervised
checkpoint as Task 5's live OTP confirmation — the first point both a
real session and a real UI exist together to drive it end-to-end
(Task 12 or the sign-in screen, whichever lands first).

- [ ] **Step 10: Commit**

```bash
git add deadpoint-rn/src/data deadpoint-rn/__tests__/store.test.ts deadpoint-rn/__tests__/loads.test.ts
git commit -m "feat(rn): port NativeStore/NativeLoads/NativeProfile as hooks with optimistic writes"
```

---

## Phase 2 — The daily card

The largest single piece. `DailyCardView.swift` is 1,482 lines; it becomes ~6 focused components. Build them bottom-up so each is independently reviewable.

### Task 7: `ExerciseRow` — tick, collapse, info toggle, weight badge

**Files:**
- Create: `deadpoint-rn/src/components/daily-card/ExerciseRow.tsx`
- Reference: `ios/CrimpBlock/DailyCardView.swift:1100-1311` (`ExerciseRowView`)

**Interfaces:**
- Consumes: `resolveExercises()` output from Task 4; `Colours`, `Fonts`, `Motion`.
- Produces: `<ExerciseRow ex accent accentVarName isTicked onToggleTick onTapWeight onTapRest onStartInterval />`

Exact spec from the Swift source — every value is load-bearing:

| Element | Spec |
|---|---|
| Row padding (vertical) | `16` unticked → `11` ticked, animated `easeInOut 200ms` |
| Checkbox | `26×26`, corner radius `3`, border `1.5` in `s4`; ticked fills `accent` with a `bg`-coloured checkmark at size 13 bold |
| Title | `15.5` bold, white; ticked → `faint` + strikethrough |
| Info icon | `12`, `faint`, toggles description with `easeInOut 150ms` |
| Description | `12.5`, `dim` |
| Prescription | `Fonts.mono(12, 'medium')`, `faint` — or `accent` when `phaseAdjusted` |
| Weight badge (has a value) | `${kg}kg` (0-2 decimal places, trailing zeros trimmed — e.g. `22.5kg`, `20kg`, not `20.00kg`), `Fonts.mono(12, 'bold')`, `s3` background, radius `4`, padding `6/2`; text colour `accent` when `weightIsBump`, else `dim` |
| Weight badge (no value yet, `hasWeightTracking`) | `SET kg` label, same font/padding, `faint` text, **dashed** `1px s4` border instead of a filled background — this is the only way to open the weight editor on a brand-new exercise with no history, so it must render even with nothing to show (see `resolveExercises`' own doc comment in Task 4 on why `hasWeightTracking` ≠ "has a weight") |
| Rest button | `Fonts.mono(10.5, 'medium')`, `dim`, `1px s3` border, radius `3`, padding `10/6`; label `Rest M:SS` (e.g. `Rest 3:00` for 180s, seconds zero-padded) |
| START button (interval) | `Fonts.mono(10.5, 'semibold')`, `bg` text colour on `accent` background, radius `3`, padding `10/6`; label literally `START` |
| Ticked row | hides prescription, weight, description, tally, and timer buttons entirely |

**Explicitly out of scope for this task** (do not build stubs or placeholders for these — just leave the relevant prop/behaviour out entirely):
- **The sets tally** (the pip row between the prescription and the timer buttons, and its tap-to-add/long-press-to-undo behaviour) — that is Task 8's `SetsTally` component in full; this task's spec table's "Ticked row" line already accounts for hiding it once it exists.
- **Real rest-timer / interval-timer behaviour.** In the Swift source, tapping Rest/START calls into `RestTimerController`/`IntervalTimerController` (see the file inventory's Global Constraints section) — neither exists yet in this plan; timers are a later, not-yet-written phase. Render the two buttons to the exact visual spec above (a real rest session's prescription always carries either `restSeconds` or an `interval`, so the buttons must be genuinely present, not TODO comments), but wire them to the two new optional callback props instead of a real controller: `onTapRest?: (seconds: number) => void` (called with `ex.restSeconds` when the Rest button is pressed) and `onStartInterval?: (interval: IntervalConfig) => void` (called with `ex.interval` — the `IntervalConfig` type from Task 4's `src/engine/types.ts` — when START is pressed). A future timers task supplies real implementations of both; until then, treat an absent callback as a normal, no-op case (the button still renders and is tappable, it just does nothing) — do not disable or hide the button when the callback is undefined, that would be a visible behaviour gap of its own the moment this ships.
- **Tutorial-target signalling** (`onTutorialSignal`, `tutorialTarget` in the Swift source, driving the not-yet-built onboarding tour) — omit entirely, not a stub prop.

- [ ] **Step 1: Port `clarifySets` with its test**

```typescript
// __tests__/clarifySets.test.ts
import { clarifySets } from '../src/components/daily-card/clarifySets';

test('labels an unambiguous leading set count', () => {
  expect(clarifySets('3 × 8')).toBe('3 sets × 8');
});

test('leaves a duration-first prescription alone', () => {
  // "10s × 5" is a hold duration first — labelling it "10 sets" would be wrong.
  expect(clarifySets('10s × 5')).toBe('10s × 5');
});

test('leaves a cycle description alone', () => {
  expect(clarifySets('5 min on / 5 min off × 3')).toBe('5 min on / 5 min off × 3');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/clarifySets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/components/daily-card/clarifySets.ts
/** Direct port of clarifySets() in DailyCardView.swift. Prescription text is
    free-form across templates.js/programs.js, and a blind "first number is
    sets" transform is actively wrong for real entries ("10s × 5" is a hold
    duration first; "5 min on / 5 min off × 3" has no leading set count).
    Only the one unambiguous pattern is touched: a plain leading integer
    followed by "×" with nothing but whitespace between. */
export function clarifySets(s: string): string {
  if (!/^\d+\s*×/.test(s)) return s;
  const count = s.match(/^\d+/)![0];
  const rest = s.slice(s.indexOf('×') + 1);
  return `${count} sets ×${rest}`;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/clarifySets.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Build `ExerciseRow.tsx` to the spec table above**

Use `Animated`/Reanimated `withTiming(…, { duration: Motion.tickCollapseMs })` on the container padding and on description opacity.

- [ ] **Step 6: Verify against the Swift build side by side — deferred**

This isn't runnable yet regardless of who attempts it: `ExerciseRow` has no screen to render it standalone until Task 12 assembles `DailyCard`, and a real RN-side comparison needs a custom dev client build (Task 3's Step 9 finding — Expo Go can't load `react-native-worklets`), not just `expo start`. If no simulator/emulator/dev-client build is available in the current environment, do not fake this check or substitute something else silently — state plainly in your report that it's deferred and why, per the same handling as Task 3's Step 9. Real side-by-side visual parity (Max Fingers session, row height/checkbox/font weights/collapse animation, 1× and 2× zoom, both platforms) happens once at controller level after Task 12, when there is an actual screen to compare against the Swift build.

- [ ] **Step 7: Commit**

```bash
git add deadpoint-rn/src/components/daily-card deadpoint-rn/__tests__/clarifySets.test.ts
git commit -m "feat(rn): port ExerciseRow with tick collapse, info toggle and clarifySets"
```

---

### Task 8: `SetsTally` — tap to add, long-press to undo

**Files:**
- Create: `deadpoint-rn/src/components/daily-card/SetsTally.tsx`
- Reference: `ios/CrimpBlock/DailyCardView.swift:1316-1400`

**Interfaces:**
- Consumes: `ex.prescription`/`ex.interval` shape from Task 4's `RenderedExercise`; `accent`; `Colours`, `Motion`.
- Produces: `<SetsTally totalSets completedSets onTap onLongPressUndo />` — a fully **controlled** presentational component. It owns none of the business logic below; it just renders `completedSets`-of-`totalSets` pips and reports raw gesture intent.

Spec: pips are `20×20` circles, spacing `7`, unlit `1.5` border in `s4`, lit filled `accent`. One tap zone covers the whole row — **not** one per pip (an earlier per-pip version was explicitly reverted). Long-press `450ms` removes the last completed set. Padding: `top 2`, `bottom 6` (the bottom gap was widened specifically to stop mis-taps landing on the Rest/START button below).

**What this task does NOT include, and why:** in the real Swift source, `completedSets` state, the "filling the last pip auto-ticks the row" rule, and the `autoStartRestOnTally` behaviour all live directly inside `ExerciseRowView` (there is no separate Swift view for the tally — `setsTally()` is just a private method on it). The plan's RN decomposition deliberately splits the pip UI into its own reusable `SetsTally` component, which means that business logic has to live in whichever component actually renders `<SetsTally>` and owns `completedSets` — not in `SetsTally` itself. That integration is **not yet possible to build correctly**: `setsCounterEnabled`/`autoStartRestOnTally` are persisted user settings (Swift's `@AppStorage`), and the plan's own target file structure names the file that should carry their RN equivalent (`src/data/prefs.ts` — `AppStorage → MMKV`, `react-native-mmkv` already installed since Task 1) but no task from 1 through 12 actually creates it. Do not invent a settings/prefs module as part of this task — that is a real gap in the plan worth surfacing (noted in this task's completion record), not something to silently patch here. Build `SetsTally.tsx` as a complete, correctly-designed, fully-tested component in isolation; wiring it into `ExerciseRow` (adding `completedSets` state, the fill→`onToggleTick` rule, and the rest-on-tally behaviour) is deferred to whichever future task actually integrates it — most likely Task 12's `DailyCard` assembly, or a dedicated settings task if Oscar wants `prefs.ts` built first.

- [ ] **Step 1: Write the failing test for `totalSets` detection**

```typescript
// __tests__/setsTally.test.ts
import { totalSetsFor } from '../src/components/daily-card/SetsTally';

test('detects "N ×" as a set count', () => {
  expect(totalSetsFor({ prescription: '3 × 8', interval: null })).toBe(3);
});

test('detects bare "N sets" and "N supersets"', () => {
  expect(totalSetsFor({ prescription: '3 sets', interval: null })).toBe(3);
  expect(totalSetsFor({ prescription: '3 supersets', interval: null })).toBe(3);
});

test('does NOT treat "15 min" as 15 sets', () => {
  // A live bug this exact guard was added to fix: a 15-minute warm-up
  // rendered a 15-pip tally.
  expect(totalSetsFor({ prescription: '15 min', interval: null })).toBeNull();
});

test('does NOT tally a range like "4–5 sets"', () => {
  expect(totalSetsFor({ prescription: '4–5 sets', interval: null })).toBeNull();
});

test('never tallies an interval exercise', () => {
  expect(totalSetsFor({ prescription: '3 × 8', interval: { on: 7, off: 3, reps: 6 } })).toBeNull();
});

test('does not tally a single set', () => {
  expect(totalSetsFor({ prescription: '1 × 8', interval: null })).toBeNull();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/setsTally.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `totalSetsFor`**

```typescript
// src/components/daily-card/SetsTally.tsx (helper export)
/** Port of ExerciseRowView.totalSets in DailyCardView.swift. Only two
    leading-number phrasings in the template library are unambiguously a
    set count: "N × ..." and bare "N sets"/"N supersets". A range ("4–5
    sets") deliberately does not match — there is no single right pip
    count for a range. Interval exercises are excluded because they get
    their own full-screen set tracking. */
export function totalSetsFor(ex: { prescription: string; interval: unknown }): number | null {
  if (ex.interval) return null;
  if (!/^\d+\s*(?:×|(?:super)?sets?\b)/.test(ex.prescription)) return null;
  const n = parseInt(ex.prescription.match(/^\d+/)![0], 10);
  return n > 1 ? n : null;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/setsTally.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Build the pip row with tap + long-press**

Render `completedSets` filled pips and `totalSets - completedSets` unfilled ones, per the spec above. Confirmed available in the installed `react-native-gesture-handler@2.32.0`: `Gesture.Exclusive(...)` — "the first gesture has higher priority" per its own doc comment, so `Gesture.Exclusive(Gesture.LongPress().minDuration(Motion.setsTallyLongPressMs), Gesture.Tap())` (long-press listed first) correctly gives the long-press priority over the tap, matching Swift's `.simultaneousGesture` + a guard flag approach in spirit (recognize both independently, but resolve which one actually fired).

Reproduce the `suppressNextTap` guard **inside this component** (it is purely about gesture-recognizer coordination, not the business logic excluded above): when the long-press branch fires, call `onLongPressUndo()` and set an internal flag; when the tap branch fires immediately after (the same finger-lift that ends the long-press also completes as a tap), consume that flag and skip calling `onTap()` for that one release. A genuine follow-up tap after the flag is consumed calls `onTap()` normally.

`onTap` and `onLongPressUndo` take no arguments and return nothing — the caller (not built in this task, see above) is what decides whether an `onTap` should actually increment anything, whether it fills the tally, and whether to auto-start a rest timer.

- [ ] **Step 6: Verify — deferred**

This can't be meaningfully verified in isolation yet: there is no integration wiring `SetsTally` into a real `ExerciseRow` instance in this task, so "tap through a 4-set exercise... confirm the row auto-ticks" isn't something this component alone can demonstrate (that behaviour lives in the not-yet-built caller). State this plainly in your report rather than fabricating a demo. What IS verifiable now: the `totalSetsFor` unit tests (Step 4) and — if you want extra confidence — a component-level test asserting `onTap`/`onLongPressUndo` fire the right number of times for a simulated tap/long-press-then-release sequence, using `react-native-gesture-handler`'s own test utilities if the project has them set up, or noted as a further gap in your report if it doesn't. Real end-to-end verification (tap-through, auto-tick, auto-rest) happens once the integration task exists.

- [ ] **Step 7: Commit**

```bash
git add deadpoint-rn/src/components/daily-card/SetsTally.tsx deadpoint-rn/__tests__/setsTally.test.ts
git commit -m "feat(rn): port SetsTally with tap-to-add and long-press undo"
```

---

### Task 9: `useSwipeCarousel` — the finger-tracked session swipe

The highest-risk element in the port. It **must** run on the UI thread.

**Files:**
- Create: `deadpoint-rn/src/components/daily-card/useSwipeCarousel.ts`
- Reference: `ios/CrimpBlock/DailyCardView.swift:919-969` (`swipeGesture`), `:212-238` (`commit`), `:179-191` (`animatedBrowse`)

**Interfaces:**
- Consumes: `SESSION_ORDER`, `Motion.swipe`. Also, as of this correction, `displayKey` (the caller's real, authoritative current session key — Swift's `effectiveDisplayKey`) and `onBrowse(key)` (asks the caller to actually switch sessions — Swift's `onBrowse` callback prop). The original draft of this interface omitted both, which would have made `commit()`/`animatedBrowse()`'s real behaviour (actually changing the displayed session, and knowing when the real state has caught up so the peek can clear without a flash) impossible to implement — checked directly against `DailyCardView.swift:191-238`, both are genuinely load-bearing, not optional extras.
- Produces: `{ panGesture, translateX, peekKey, animateTo(key) }` — unchanged from the original interface shape; `displayKey`/`onBrowse`/`scrollRef`/`containerWidth` become the hook's **input** parameters instead.

- [ ] **Step 1: Write the failing test for the wrap-around index maths**

```typescript
// __tests__/carousel.test.ts
import { nextIndex } from '../src/components/daily-card/useSwipeCarousel';

test('stepping forward from the last session wraps to the first', () => {
  // rest (6) -> maxFingers (0)
  expect(nextIndex(6, -1, 7)).toBe(0);
});

test('stepping back from the first session wraps to the last', () => {
  // maxFingers (0) -> rest (6). Swift's % returns -1 here, so the raw
  // index must be pushed positive before the modulo.
  expect(nextIndex(0, 1, 7)).toBe(6);
});

test('ordinary steps are unaffected', () => {
  expect(nextIndex(2, -1, 7)).toBe(3);
  expect(nextIndex(2, 1, 7)).toBe(1);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/carousel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/components/daily-card/useSwipeCarousel.ts
/** dx < 0 (swiping left) advances; dx > 0 goes back. Wraps at both ends
    rather than clamping — an earlier version stopped dead at either end
    and was reverted on explicit feedback: a carousel that keeps going is
    what was wanted. `+ count` before the modulo is required because
    JS (like Swift) returns a negative result for a negative operand. */
export function nextIndex(from: number, direction: -1 | 1, count: number): number {
  return ((direction === -1 ? from + 1 : from - 1) + count) % count;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/carousel.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the missing motion constant**

`Motion.swipe` (Task 2) covers the live-swipe commit animation (`completeDurationMs: 200`, `Easing.out`) but is missing a second, genuinely different value: `animatedBrowse()` (`DailyCardView.swift:198`) — the tap-driven equivalent used when browsing via a dot or NEXT rather than a live touch — uses `.easeInOut(duration: 0.3)`, a different duration AND a different curve, not a reuse of the swipe's own commit timing. Add it to `deadpoint-rn/src/design/motion.ts`:

```typescript
// src/design/motion.ts — add this one field inside the existing `swipe` object
    animatedBrowseDurationMs: 300, // NOT the same as completeDurationMs (200) — animatedBrowse() uses a distinct duration+curve (easeInOut) from the live-swipe commit (easeOut)
```

- [ ] **Step 6: Build the Reanimated pan gesture and `animateTo`**

This is the highest-risk step in the whole plan — read it fully before writing any code. The full implementation, verified line-by-line against `DailyCardView.swift:919-969` (`swipeGesture`), `:191-203` (`animatedBrowse`), and `:224-238` (`commit`):

```typescript
// src/components/daily-card/useSwipeCarousel.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SESSION_ORDER } from '../../engine';
import { Motion } from '../../design/motion';

/** dx < 0 (swiping left) advances; dx > 0 goes back. Wraps at both ends
    rather than clamping — an earlier version stopped dead at either end
    and was reverted on explicit feedback: a carousel that keeps going is
    what was wanted. `+ count` before the modulo is required because
    JS (like Swift) returns a negative result for a negative operand. */
export function nextIndex(from: number, direction: -1 | 1, count: number): number {
  return ((direction === -1 ? from + 1 : from - 1) + count) % count;
}

interface UseSwipeCarouselParams {
  /** The caller's real, authoritative current session key — Swift's
      `effectiveDisplayKey`. This hook never mutates it directly; it only
      reads it and calls `onBrowse` to ask the caller to change it. */
  displayKey: string;
  containerWidth: number;
  /** Swift's `onBrowse` callback prop — actually performs the session
      switch on whatever owns real app state. */
  onBrowse: (key: string) => void;
  /** The inner exercise-list scroll view, so the pan gesture never
      competes with it (Swift's reason for `.simultaneousGesture`).
      Optional because this hook can be built and unit-tested (Steps 1-4)
      before Task 12 has a real scroll view to pass in. */
  scrollRef?: RefObject<React.Component | null>;
}

export function useSwipeCarousel({ displayKey, containerWidth, onBrowse, scrollRef }: UseSwipeCarouselParams) {
  const translateX = useSharedValue(0);
  const [peekKey, setPeekKeyState] = useState<string | null>(null);

  // Shared-value mirror of peekKey, readable synchronously from worklets.
  // React state set via setState during a gesture is NOT safe to read
  // back from the same gesture's worklet: the closure a gesture callback
  // runs with is captured when the gesture object was (re)created on the
  // JS thread, and does not see a same-gesture state update — only a
  // FUTURE gesture (after the next render) would. Shared values are the
  // correct cross-thread-synchronized primitive for exactly this.
  const peekTargetKey = useSharedValue<string | null>(null);
  const horizontalClaimed = useSharedValue(false);

  // The key a completed swipe/animateTo actually committed to, kept until
  // `displayKey` (the caller's real state) catches up to it.
  const pendingKey = useRef<string | null>(null);

  const setPeek = useCallback((key: string | null) => setPeekKeyState(key), []);

  const clearPeek = useCallback(() => {
    setPeekKeyState(null);
    pendingKey.current = null;
  }, []);

  const commit = useCallback((key: string) => {
    pendingKey.current = key;
    onBrowse(key);
  }, [onBrowse]);

  // Mirrors Swift's settleOnRealUpdate(): the peek is only cleared once
  // the caller's own displayKey has genuinely caught up to what was
  // committed — clearing it any earlier causes a one-frame flash back to
  // the old session (see DailyCardView.swift's commit() doc comment,
  // which this bug and fix are ported directly from).
  useEffect(() => {
    if (pendingKey.current !== null && displayKey === pendingKey.current) {
      translateX.value = 0;
      peekTargetKey.value = null;
      clearPeek();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- translateX/peekTargetKey are stable shared-value refs, not reactive deps
  }, [displayKey, clearPeek]);

  const panGesture = Gesture.Pan()
    .minDistance(Motion.swipe.minimumDistance)
    .simultaneousWithExternalGesture(...(scrollRef ? [scrollRef] : []))
    .onUpdate((e) => {
      if (!horizontalClaimed.value) {
        // Ambiguous small movements are left alone (no offset applied
        // yet) so an ordinary vertical scroll attempt never gets grabbed
        // as a swipe partway through it.
        const claims =
          Math.abs(e.translationX) > Motion.swipe.horizontalClaimDx &&
          Math.abs(e.translationX) > Math.abs(e.translationY) * Motion.swipe.horizontalClaimRatio;
        if (!claims) return;
        horizontalClaimed.value = true;
        const from = SESSION_ORDER.indexOf(displayKey);
        if (from !== -1) {
          const toIndex = nextIndex(from, e.translationX < 0 ? -1 : 1, SESSION_ORDER.length);
          const key = SESSION_ORDER[toIndex];
          peekTargetKey.value = key;
          runOnJS(setPeek)(key);
        }
      }
      // Follows the finger 1:1, no animation — this is the fix for "a
      // delay between swiping and it moving".
      translateX.value = e.translationX;
    })
    .onEnd(() => {
      if (!horizontalClaimed.value) return;
      horizontalClaimed.value = false;
      const key = peekTargetKey.value;
      const pastThreshold = key !== null && Math.abs(translateX.value) > containerWidth * Motion.swipe.commitFraction;
      if (pastThreshold && key !== null) {
        const goingNext = translateX.value < 0;
        translateX.value = withTiming(
          goingNext ? -containerWidth : containerWidth,
          { duration: Motion.swipe.completeDurationMs, easing: Easing.out(Easing.ease) },
          (finished) => {
            if (finished) runOnJS(commit)(key);
          }
        );
      } else {
        // Spring-back constants are SwiftUI's `response`/`dampingFraction`
        // names, not Reanimated's own `duration`/`dampingRatio` — the two
        // physics models are not numerically identical (SwiftUI's
        // `response` is a specific-fraction-of-motion time constant;
        // Reanimated's `duration` is a perceptual-duration heuristic on a
        // differently-parameterized spring), so this is a considered
        // starting approximation, not a byte-exact port — real feel
        // parity is part of Step 8's device verification, not
        // guaranteed by this formula alone.
        const startedWithKey = key;
        translateX.value = withSpring(
          0,
          {
            duration: Motion.swipe.springBack.response * 1000,
            dampingRatio: Motion.swipe.springBack.dampingFraction,
          },
          (finished) => {
            // Guards against a new swipe already having started before
            // this spring-back settles — mirrors Swift's own
            // capturedKey/peekKey equality check in the same spot.
            if (finished && peekTargetKey.value === startedWithKey) {
              peekTargetKey.value = null;
              runOnJS(clearPeek)();
            }
          }
        );
      }
    });

  /** Mirror of dragOffset for the INCOMING session's stamp: one full
      Tap-driven browsing (a WeekStrip dot, NEXT) — plays the exact same
      slide-and-settle the swipe gesture does, just driven programmatically
      instead of by a live touch, so the two ways of changing session never
      look or feel like two different features. Ported from
      `animatedBrowse(to:)`. */
  const animateTo = useCallback(
    (key: string) => {
      if (key === displayKey) return;
      const from = SESSION_ORDER.indexOf(displayKey);
      const to = SESSION_ORDER.indexOf(key);
      if (from === -1 || to === -1) return;
      const goingNext = to >= from; // matches Swift exactly — NOT the same sign rule the live swipe gesture uses
      peekTargetKey.value = key;
      setPeek(key);
      translateX.value = withTiming(
        goingNext ? -containerWidth : containerWidth,
        { duration: Motion.swipe.animatedBrowseDurationMs, easing: Easing.inOut(Easing.ease) },
        (finished) => {
          if (finished) runOnJS(commit)(key);
        }
      );
    },
    [displayKey, containerWidth, commit, setPeek, translateX, peekTargetKey]
  );

  return { panGesture, translateX, peekKey, animateTo };
}
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx jest` (expect the pre-existing suite plus the 3 `nextIndex` tests from Step 1, all passing) and `npx tsc --noEmit` from inside `deadpoint-rn/` (expect clean — strict mode is on).

- [ ] **Step 8: Verify feel on a real device, both platforms — deferred**

This cannot be verified without a real device/dev-client build (Task 3's Step 9 finding still applies, and is even more binding here: worklets specifically do not run correctly in Expo Go). If no simulator/emulator/dev-client build is available, state this plainly in your report — do not fake it. What the report SHOULD verify instead, as a partial substitute: that the file compiles through the project's real `babel.config.js` (`babel-preset-expo`, fixed just before this task — see the ledger) with the reanimated worklet transform actually active. Confirm this directly rather than assuming it: compile `useSwipeCarousel.ts` with `require('@babel/core').transformFileSync(...)` (default config resolution, no inline overrides) and check the output for `__workletHash`/`__pluginVersion` markers on the `.onUpdate`/`.onEnd` callback bodies, the same check the controller used to find and fix the babel config bug this task's own risk warning called for. If those markers are absent, STOP and report BLOCKED — that means the gesture callbacks would run on the JS thread in a real build, silently defeating this entire task's purpose, and is not something to route around with a different verification method.

Real on-device feel verification (swipe through all 7 sessions both directions including the wrap, attempt a vertical scroll mid-list and confirm it's never hijacked, spring-back feel matched against the Swift build) happens once at controller level after Task 12, alongside the other deferred device checks.

- [ ] **Step 9: Commit**

```bash
git add deadpoint-rn/src/components/daily-card/useSwipeCarousel.ts deadpoint-rn/__tests__/carousel.test.ts deadpoint-rn/src/design/motion.ts
git commit -m "feat(rn): port the swipe carousel as a UI-thread Reanimated gesture"
```

---

### Task 10: `SessionDots`, `CardHeader`, `WeekStrip`

**Files:**
- Create: `deadpoint-rn/src/components/daily-card/SessionDots.tsx`
- Create: `deadpoint-rn/src/components/daily-card/CardHeader.tsx`
- Create: `deadpoint-rn/src/components/daily-card/WeekStrip.tsx`
- Reference: `DailyCardView.swift:733-796` (dots + next-up), `:978-1036` (header), `ios/CrimpBlock/WeekStripView.swift`

Exact spec:

- **Session dots:** inner circle `14×14`, `1.5` border; outline-only by default, filled `accent` when current. The recommendation ring is a **separate** `22×22` circle with a `1.5` border in the session's colour. Row spacing `9`; `10` between the dots group and the next-up chip. "Current" and "recommended" are independent signals.
- **Next-up chip:** stacked (`NEXT` label + 7px dot above, name below, right-aligned, max 2 lines) — it shares a row with 7 dots and was truncating names when laid out inline.
- **Header:** phase badge is an **outlined** pill (`s1` background, `1px s3` border, capsule) reading `PHASE · WK n` plus ` · DELOAD` on week 4, in `Fonts.mono(12, 'bold')` tinted `accent`, with an 8px chevron. Right side: date in `Fonts.mono(10.5, 'medium')` `faint` uppercase, formatted `EEE, d MMM` (en-GB), then optional calendar icon, then the settings gear — both `17`, `dim`, `8pt` left padding each.

- [ ] **Step 1: Build all three components to the spec above**

- [ ] **Step 2: Verify side by side against the Swift build**

Expected: dot sizes, ring offsets, badge padding, and date format all match.

- [ ] **Step 3: Commit**

```bash
git add deadpoint-rn/src/components/daily-card
git commit -m "feat(rn): port SessionDots, CardHeader and WeekStrip"
```

---

### Task 11: `LoggedStamp` and the Done flow

**Files:**
- Create: `deadpoint-rn/src/components/daily-card/LoggedStamp.tsx`
- Modify: `deadpoint-rn/src/components/daily-card/DailyCard.tsx`
- Reference: `DailyCardView.swift:807-836` (stamp), `:684-718` (timing), `:246-280` (`handleDoneTap`)

Spec: card max width `300`, padding `28/24`, `s1` background, radius `16`, `1.5` border in `accent` at 45% opacity, shadow `black 35% / radius 16 / y 6`. Contents: `LOGGED` in `Fonts.heading(38)` white, "Nice work today." at `14` `dim`, then a `1px s3` divider, `TOMORROW` in `Fonts.mono(10, 'bold')` `faint` with `1.2` letter-spacing, and tomorrow's session name at `17` bold in its own colour.

Timing chain, exactly: `celebrationTrigger` fires → wait `1000ms` → fade in over `250ms` → hold `2500ms` → fade out over `400ms`. The dismiss timer must be **cancellable** — an undo immediately followed by a re-log would otherwise let the first timer kill the second card early.

The Done button also owns two confirmation dialogs, in this order:
1. **Swap confirm** — only when something else is already logged today and this is not it.
2. **Climb-type confirm** — only for a *fresh* `climbHard` log: "Board session, or just a hard climb?" → writes `sub: 'board' | 'climb'`.

A swap onto `climbHard` must chain into the climb-type prompt *after* the swap confirms, not instead of it.

- [ ] **Step 1: Build `LoggedStamp` with the cancellable timing chain**

- [ ] **Step 2: Wire the two dialogs into the Done button**

- [ ] **Step 3: Verify on device**

Log a session → confirm the 1s delay, fade in, 2.5s hold, fade out, then the small persistent "LOGGED" text remains. Undo and immediately re-log → confirm the second card is not cut short. Log a Hard Climb → confirm the board/climb prompt appears and writes `sub`.

- [ ] **Step 4: Commit**

```bash
git add deadpoint-rn/src/components/daily-card
git commit -m "feat(rn): port LoggedStamp timing chain and the Done confirmation flow"
```

---

### Task 12: Assemble `DailyCard` and ship Phase 2

**Files:**
- Create: `deadpoint-rn/src/components/daily-card/DailyCard.tsx`
- Create: `deadpoint-rn/app/(main)/card.tsx`
- Reference: `DailyCardView.swift:355-492` (body layout)

Layout: outer padding `20`, `VStack` spacing `18`. Order: week strip (with `10pt` extra bottom padding) → header → session dots → title block → scrolling exercise list. Only the exercise list scrolls; header, dots, and title stay pinned. Title is `Fonts.heading(32)` white; the `where` line is `Fonts.mono(13, 'medium')` in `accent`; the optional Guide pill sits below in `Fonts.mono(11, 'bold')`. Scroll indicators hidden. Reserve `64` of clearance at the list bottom for the floating Done button.

- [ ] **Step 1: Assemble the components into `DailyCard.tsx`**

- [ ] **Step 2: Wire it to real data in `app/(main)/card.tsx`**

Use `useStore`/`useLoads`/`useProfile` from Task 6 and `createEngine` from Task 4.

- [ ] **Step 3: Verify full parity on both platforms**

Sign in as the real account. Compare against the Swift build screen by screen: every session via swipe, tick and untick, sets tally, weight badge, Done and Undo.
Expected: no visual or behavioural difference beyond the known platform divergences in the Risk Register.

- [ ] **Step 4: Commit**

```bash
git add deadpoint-rn/src/components/daily-card/DailyCard.tsx deadpoint-rn/app
git commit -m "feat(rn): assemble the daily card on real data — Phase 2 complete"
```

---

## What is deliberately *not* in this plan

- **Phases 3–8 task breakdowns.** They get their own plans, written once Phase 2 proves the component-mapping patterns. Writing them now would be guessing.
- **Deleting the SwiftUI app.** It stays on TestFlight until RN passes a device parity review.
- **Android widget and Live Activity replacements.** Scoped in Phase 7 with their divergences already recorded in the Risk Register.

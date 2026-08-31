# Phase 5 — Onboarding: Design

**Status:** Written and self-reviewed autonomously (Oscar stepped away with an explicit "keep going intil out of usage" instruction, continuing from Phase 4). This is the largest, most architecturally significant phase since Phase 0-2 — every judgment call below is flagged explicitly for his later review.

## Context

Per the roadmap, this phase delivers "Welcome, sign-in, quiz, tutorial spotlight, paywall." It is also the first phase that has to introduce a **real root routing state machine** — every phase through 4 has assumed a signed-in user with an already-resolved program; this phase is what actually gets a brand-new user from "just installed the app" to "looking at their own daily card."

## Swift source of truth

| File | Lines | Role |
|---|---|---|
| `ios/CrimpBlock/WelcomeView.swift` | 46 | First-ever screen, once per install |
| `ios/CrimpBlock/NativeSignInView.swift` | 227 | Email + OTP code, two-step |
| `ios/CrimpBlock/IntakeQuizView.swift` | 452 | 8-step standard track / 3-step rehab track quiz |
| `ios/Shared/QuizModel.swift` | 276 | Quiz answer types, template-id derivation, display copy |
| `ios/Shared/TutorialSpotlight.swift` | 420 | Reusable spotlight/coach-mark overlay system |
| `ios/CrimpBlock/TutorialDemoCardView.swift` | 274 | The real post-quiz walkthrough, hosting a staged daily card |
| `ios/CrimpBlock/PaywallView.swift` | 194 | Subscription paywall (StoreKit-backed in Swift) |
| `ios/CrimpBlock/NativeAppView.swift` (relevant sections) | ~150 | The root gating state machine this phase has to port |

**Explicitly excluded** (confirmed by reading their own headers): `ios/CrimpBlock/QuizDemoView.swift` (a superseded dev-only proof-of-concept, not the real flow) and `ios/CrimpBlock/RehabTutorialView.swift` (122 lines — Phase 6's "rehab tutorial," a genuinely different walkthrough for a screen — `RehabCardView` — that doesn't exist in this RN rebuild yet).

## What already exists and needs zero new work

Confirmed by reading the actual files, not assumed:
- `src/data/useSession.ts` already has `sendOTP`/`verifyOTP` matching `NativeSignInView`'s exact two-call flow.
- `src/data/useProfile.ts` already has `create` (standard quiz completion), `assignRehab` (rehab quiz completion), `switchToStandard`, `advanceRehabPhase`, `markTutorialCompleted` — every write this whole phase needs, all built in Phase 1 before this phase's UI ever needed them.
- `src/engine/template-resolver.js` already exports `resolveTemplate(template, {startDate, modifiers})`, returning a program object in exactly the shape `createEngine()` already expects — copied verbatim in Phase 0, unused until now.
- `react-native-svg` (proven in Phase 4) is the natural tool for the spotlight overlay's cutout mask, mirroring Swift's own even-odd `Shape` technique.

## Decision 1: scope boundary with Phase 6 (Rehab)

`IntakeQuizView` is one component with an early fork (track: standard vs. rehab) — not cleanly splittable without either porting a half-finished quiz or inventing a "coming soon" state that doesn't exist in the real app. **This phase ports the whole quiz, both branches** — `QuizResult.rehab(...)` is just as simple to capture as `.standard(...)` (a couple of enums, no new UI complexity), and `useProfile().assignRehab()` already exists.

What stays deferred to Phase 6: `RehabCardView` (the rehab-track daily card) and `RehabTutorialView` (the rehab-specific walkthrough) don't exist yet. So: **a rehab-track quiz completion is captured and persisted correctly, but the root router has nowhere real to send that user afterward yet.** The honest, minimal thing (same "no-op until its owning phase" precedent as every settings-icon/calendar-icon stub before it): the router shows a plain "Rehab track is coming soon" screen for `profile.trackType === 'rehab'` until Phase 6 lands, rather than crashing or silently misrouting into the standard card. This is a real, temporary UX gap, not swept under the rug — flagged here for Oscar's awareness, not hidden.

## Decision 2: "built-in" vs. "quiz-assigned" accounts

Confirmed directly in `programs.js`: `oscar@sullivanltd.co.uk`, `joepearce2005@icloud.com`, and `maxpamplin2000@googlemail.com` are hand-authored, hardcoded entries — real people with bespoke programs, not template output. Every other signed-in email currently falls through to `PROGRAMS.default` **silently**, with no onboarding at all — this is the actual gap Phase 5 closes.

Going forward: `isBuiltInProgram(email) = email.toLowerCase() in PROGRAMS && email.toLowerCase() !== 'default'`. A built-in account skips the quiz and paywall entirely (matches Swift's own `isBuiltInProgram` branch exactly — they're real people with a program written for them, not customers) but **still** sees the tutorial once, tracked device-locally per email (matches Swift's `hasSeenBuiltInTutorial(email:)`/`markBuiltInTutorialSeen(email:)` exactly — a hand-authored program means the program was written for them, not that they've seen this app before). Everyone else goes through quiz → tutorial → (paywall, deferred — see Decision 4).

## Decision 3: the spotlight overlay's real RN port

SwiftUI's `anchorPreference`/`overlayPreferenceValue` (a coordinate-space-aware layout preference system) has no direct RN equivalent. The RN port uses two independent pieces working together, not a single mechanism:

**Measurement**: each spotlightable element gets a `ref` (attached via a small `tutorialTarget(id)`-equivalent — a plain wrapper component or a `ref`-forwarding prop, TBD at implementation time against what each real component's outermost native element actually is) that the tutorial host calls `.measureInWindow((x, y, width, height) => ...)` on — a real, standard React Native `View`-ref API — to get the current target's on-screen rect, re-measured whenever the active step changes (Swift's own anchors are always-live; RN's `measureInWindow` is one-shot per call, so the host re-measures on every step change and once more after a short delay to catch any late layout settling, rather than attempting continuous tracking).

**Hit-testing**: RN's `pointerEvents` is rectangular-only, with nothing equivalent to SwiftUI's even-odd `contentShape` hit-testing. Rather than fight that, the overlay is built from **five separate layers**, matching what the visual result needs to be, not trying to replicate Swift's single-shape trick:
1. Four opaque, `pointerEvents="auto"` rectangles — top/bottom/left/right of the measured hole — each absorbing any tap that lands on it (`onPress={() => {}}`), sized to exactly surround the hole with no gaps and no overlap into it.
2. One `pointerEvents="none"` `react-native-svg` layer on top, purely for the dimmed-backdrop-with-rounded-cutout visual (an even-odd `<Path>`, mirroring Swift's own technique) plus the two-tone ring — visuals only, real hits pass through the (correctly unfilled) hole area straight to the real control underneath, and get absorbed by the four rectangles everywhere else.

This is a genuinely novel technique for this codebase (nothing else so far has needed measured-overlay-plus-real-tap-passthrough) — Task 1 of this phase's plan proves it against one real, simple target before anything else is built on top of it, same "prove the risky primitive first" practice already used for `expo-audio` (Phase 3) and `react-native-svg` itself (Phase 4).

## Decision 4: paywall is built, but doesn't gate anyone yet

`PaywallView.swift` is entirely StoreKit-backed (`SubscriptionManager`, real product pricing, real purchase/restore/redeem calls) — real IAP integration is already its own separate roadmap phase ("7. Platform extras — IAP for both stores"). Building real purchase logic here would be duplicated, throwaway work once Phase 7 lands with the real `react-native-iap`/`expo-in-app-purchases` wiring.

This phase builds the **screen** faithfully (copy, layout, the static "£0.99/month" fallback price Swift itself falls back to when no real product has loaded, a `START FREE TRIAL` button, `RESTORE PURCHASES`, `HAVE A CODE?`) but the root router **never actually routes anyone into it** — matching Swift's own existing `SubscriptionManager.isRunningInSandbox` bypass for exactly this "no real product configured yet" situation, not inventing a new pattern. `needsPaywall` in the RN router is hardcoded `false` for now, with a `// TODO(Phase 7)` comment marking exactly where the real gate goes back in. The screen itself stays reachable (e.g., for visual review) via a direct route, just never auto-triggered.

## Decision 5: `hasSeenWelcome` and built-in-tutorial-seen need real device-local persistence

Neither is sensitive data — `expo-secure-store` (already used for Supabase's own auth tokens) is the wrong tool for a plain boolean flag. `react-native-mmkv` was already tried and removed as broken under this Expo SDK (Phase 0-2). The correct, standard, Expo-compatible choice is **`@react-native-async-storage/async-storage`** — a new, small, well-established dependency, added specifically for this real need (not a general-purpose "prefs" system; Settings' own future toggles, if they ever need persistence, are that later phase's own decision to make, not pre-built here).

## Decision 6: root routing, adapted to expo-router's navigation model

Swift's `NativeAppView.body` is one big `if/else` chain re-evaluated on every state change, swapping which view renders in place. Expo-router doesn't work that way — screens are real routes you navigate between. The RN equivalent: `app/index.tsx` becomes a real gating component (not the placeholder redirect it's been since Task 3) that computes, on every relevant state change, which single route the user should be on, and `router.replace()`s there (never `push`, so the gate chain never builds up a back-stack someone could navigate backward through into a state they've already passed). Every other onboarding screen also ends by calling back into this same recomputation (matching Swift's `reload()` being "the one place every write funnels back through") rather than each screen deciding its own next destination.

## Scope

**In scope:** Welcome, Sign-in, the full quiz (both branches), the tutorial spotlight system + the real post-quiz walkthrough, the paywall screen (unwired), the root routing state machine, `AsyncStorage` for the two device-local flags, adding `tutorialTarget`-equivalent refs to the already-built `ExerciseRow.tsx`/`DailyCard.tsx`/`RestTimerOverlay.tsx`/`CardHeader.tsx` components (Phase 2/3's own files) so the tutorial has real things to point at.

**Out of scope:** `RehabCardView`/`RehabTutorialView` (Phase 6), real IAP (Phase 7), a real Settings screen (still a no-op `onTapSettings`, unchanged from Task 12).

## Testing

Pure logic (quiz-answers-to-template-id, the tutorial step sequence/advance rules, the router's own gating decision function) gets direct Jest tests, same rigor as every prior phase. The spotlight's actual on-screen measurement/hit-testing and the whole routing flow end-to-end are verified live on a real device — this phase's live-verification pass matters more than any before it, since it's the first time this rebuild has ever exercised a brand-new, never-signed-in account from a cold install.

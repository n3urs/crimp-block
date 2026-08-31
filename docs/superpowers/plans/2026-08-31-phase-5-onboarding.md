# Phase 5 — Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get a brand-new install from "never opened the app" to "looking at their own daily card" — welcome, sign-in, quiz, tutorial, and the real root routing state machine that ties them together.

**Architecture:** Every screen is a real expo-router route. `app/index.tsx` becomes a real gating component computing, from a pure and directly-testable function, which single route the user should be on right now, then `router.replace()`s there. The tutorial's spotlight overlay is built from a measured-ref registry (React context) plus a five-layer hit-test/visual split, proven against one real target before the rest of the system is built on it.

**Tech Stack:** `@react-native-async-storage/async-storage` (new dependency — two device-local flags), `react-native-svg` (spotlight cutout mask, proven in Phase 4), `expo-router` (new routes + the real `app/index.tsx` gate).

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-08-31-phase-5-onboarding-design.md` and every prior phase's own still-binding constraints:

- Design tokens (`Colours`, `Fonts`) via those modules only.
- Every date computation follows the established local-noon convention (`engine-core.js`'s own `addDays`/`iso`) — never `toISOString()`.
- Flat `test(...)` calls, no `describe` blocks.
- `npx jest` and `npx tsc --noEmit` clean after every task.
- No React Testing Library. Pure logic gets Jest tests; UI is verified live on device (Task 12).
- The quiz ports BOTH branches (standard and rehab) — `useProfile().assignRehab()`/`.create()` already exist, built in Phase 1. `RehabCardView`/`RehabTutorialView` do not exist yet (Phase 6) — a rehab-track quiz completion routes to a plain "coming soon" screen, not a crash or a silent misroute.
- `isBuiltInProgram(email) = email.toLowerCase() in PROGRAMS && email.toLowerCase() !== 'default'` — exactly `oscar@sullivanltd.co.uk`, `joepearce2005@icloud.com`, `maxpamplin2000@googlemail.com` today. A built-in account skips quiz and paywall, but still gets the tutorial once (device-local, per email).
- The paywall screen is built faithfully but `needsPaywall` is hardcoded `false` in the router for this phase — real IAP is Phase 7's job. Mark the exact line with `// TODO(Phase 7): real subscription gate`.
- `hasSeenWelcome` and per-email built-in-tutorial-seen use `@react-native-async-storage/async-storage`, not `expo-secure-store` (wrong tool for non-sensitive flags) or MMKV (already removed as broken in this Expo SDK).

---

## Task 1: AsyncStorage proof and the Welcome screen

Deliberately first and isolated, per this project's own established practice: prove the one new dependency actually works on device before anything else depends on it.

**Files:**
- Create: `deadpoint-rn/src/data/deviceFlags.ts`
- Create: `deadpoint-rn/__tests__/deviceFlags.test.ts`
- Create: `deadpoint-rn/app/welcome.tsx`
- Modify: `deadpoint-rn/app/_layout.tsx` (register `welcome` as a normal push route — no special presentation needed)

**Interfaces:**
- Produces: `getHasSeenWelcome(): Promise<boolean>`, `setHasSeenWelcome(): Promise<void>`, `hasSeenBuiltInTutorial(email: string): Promise<boolean>`, `markBuiltInTutorialSeen(email: string): Promise<void>`, all exported from `src/data/deviceFlags.ts`. Task 11 (root routing) imports all four.

- [ ] **Step 1: Install the dependency**

Run: `cd deadpoint-rn && npx expo install @react-native-async-storage/async-storage`

- [ ] **Step 2: Write the failing tests**

AsyncStorage's real native module can't run under plain-node Jest (same class of problem as every other native dependency in this project) — this needs a mock, following the exact established pattern (`__mocks__/react-native-safe-area-context.js` etc.).

```javascript
// __mocks__/@react-native-async-storage/async-storage.js
/** Jest mock for AsyncStorage — same class of problem as every other
    __mocks__ file here: the real native module only exists inside an
    actual iOS/Android build. An in-memory Map is a faithful enough
    stand-in for these tests, which only need get/set/persistence-
    within-a-test-run, not cross-process persistence. */
const store = new Map();
module.exports = {
  getItem: async (key) => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => { store.set(key, value); },
  removeItem: async (key) => { store.delete(key); },
  clear: async () => { store.clear(); },
};
```

Add to `jest.config.js`'s `moduleNameMapper`:
```javascript
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
```

```typescript
// __tests__/deviceFlags.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHasSeenWelcome, setHasSeenWelcome, hasSeenBuiltInTutorial, markBuiltInTutorialSeen } from '../src/data/deviceFlags';

beforeEach(async () => { await AsyncStorage.clear(); });

test('getHasSeenWelcome is false before it has ever been set', async () => {
  expect(await getHasSeenWelcome()).toBe(false);
});

test('setHasSeenWelcome persists true', async () => {
  await setHasSeenWelcome();
  expect(await getHasSeenWelcome()).toBe(true);
});

test('hasSeenBuiltInTutorial is false for an email that has never been marked', async () => {
  expect(await hasSeenBuiltInTutorial('oscar@sullivanltd.co.uk')).toBe(false);
});

test('markBuiltInTutorialSeen is keyed per email, not global', async () => {
  await markBuiltInTutorialSeen('oscar@sullivanltd.co.uk');
  expect(await hasSeenBuiltInTutorial('oscar@sullivanltd.co.uk')).toBe(true);
  expect(await hasSeenBuiltInTutorial('joepearce2005@icloud.com')).toBe(false);
});

test('email keys are case-insensitive, matching how programs.js itself keys accounts', async () => {
  await markBuiltInTutorialSeen('Oscar@SullivanLtd.co.uk');
  expect(await hasSeenBuiltInTutorial('oscar@sullivanltd.co.uk')).toBe(true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd deadpoint-rn && npx jest deviceFlags`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```typescript
// src/data/deviceFlags.ts
/** Two device-local flags with no equivalent in Supabase — see the Phase
    5 design spec's Decision 5 for why AsyncStorage, not expo-secure-store
    (wrong tool for non-sensitive booleans) or MMKV (already removed as
    broken in this Expo SDK, see Phase 0-2's Task 12).

    hasSeenWelcome: shown once ever per INSTALL, not once per sign-in —
    mirrors NativeAppView.swift's own `@AppStorage("hasSeenWelcome")`
    exactly, including the "device-level, not account-level" framing:
    a returning, already-authenticated user should never see it again
    just because they signed out and back in.

    Built-in-tutorial-seen: keyed per email (lowercased, matching how
    programs.js itself keys accounts) rather than one flag — a built-in
    account has no `profiles` row at all (the quiz is what creates one,
    and they never take it), so there's no tutorial_completed_at to
    check the way a quiz-assigned account has. Mirrors NativeAppView's
    own hasSeenBuiltInTutorial(email:)/markBuiltInTutorialSeen(email:). */
import AsyncStorage from '@react-native-async-storage/async-storage';

const HAS_SEEN_WELCOME_KEY = 'hasSeenWelcome';
const builtInTutorialKey = (email: string) => `builtInTutorialSeen:${email.toLowerCase()}`;

export async function getHasSeenWelcome(): Promise<boolean> {
  return (await AsyncStorage.getItem(HAS_SEEN_WELCOME_KEY)) === 'true';
}

export async function setHasSeenWelcome(): Promise<void> {
  await AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true');
}

export async function hasSeenBuiltInTutorial(email: string): Promise<boolean> {
  return (await AsyncStorage.getItem(builtInTutorialKey(email))) === 'true';
}

export async function markBuiltInTutorialSeen(email: string): Promise<void> {
  await AsyncStorage.setItem(builtInTutorialKey(email), 'true');
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd deadpoint-rn && npx jest deviceFlags`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the Welcome screen**

Direct port of `WelcomeView.swift`. Plain push route (no modal presentation) — Task 11's router `replace()`s here directly, there's nothing to navigate back to.

```typescript
// app/welcome.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { resolveColour } from '../src/design/colours';
import { setHasSeenWelcome } from '../src/data/deviceFlags';

export default function Welcome() {
  const router = useRouter();

  const onContinue = async () => {
    try {
      await setHasSeenWelcome();
    } catch (e) {
      // A failed write here just means this screen shows again next
      // launch — annoying, not broken. Not worth blocking navigation on.
      console.error('welcome: setHasSeenWelcome failed:', e);
    }
    router.replace('/');
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.wordmark}>DEADPOINT</Text>
        <Text style={styles.tagline}>
          Adaptive daily training for climbers — one recommended session a day, built around your own recovery.
        </Text>
      </View>
      <Pressable onPress={onContinue} style={styles.button} accessibilityRole="button" accessibilityLabel="Get started">
        <Text style={styles.buttonText}>GET STARTED</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 24, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', gap: 14 },
  wordmark: { fontSize: 44, fontWeight: '800', color: Colours.fg },
  tagline: { fontSize: 16, color: Colours.dim },
  button: {
    paddingVertical: 14, borderRadius: 8, alignItems: 'center',
    backgroundColor: resolveColour('--gorse'),
  },
  buttonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});
```

- [ ] **Step 7: Register the route**

`welcome` needs no special presentation (a plain push, matching Swift's own body-swap) — the existing bare `<Stack screenOptions={{...}} />` in `app/_layout.tsx` already handles any route with no explicit `<Stack.Screen>` entry using its own default options, so no change is needed there for `welcome` specifically. Skip this step if `app/_layout.tsx` still has no `<Stack.Screen>` children beyond the `calendar` modal entry from Phase 4 — confirm by reading the file first.

- [ ] **Step 8: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass (115 = 110 + 5 new), `tsc` clean.

- [ ] **Step 9: Commit**

```bash
cd deadpoint-rn && git add package.json package-lock.json jest.config.js "__mocks__/@react-native-async-storage" src/data/deviceFlags.ts __tests__/deviceFlags.test.ts app/welcome.tsx
git commit -m "feat(onboarding): device-local flags (AsyncStorage) and the welcome screen"
```

---

## Task 2: Sign-in screen

Direct port of `NativeSignInView.swift`, consuming `useSession()`'s already-existing `sendOTP`/`verifyOTP` (built in Phase 1, unused by any UI until now).

**Files:**
- Create: `deadpoint-rn/app/sign-in.tsx`

**Interfaces:**
- Consumes: `useSession()` from `src/data/useSession.ts` (`sendOTP(email)`, `verifyOTP(email, token)`, both already `async throws`-equivalent — reject on failure).

- [ ] **Step 1: Write the screen**

Two-step (email → code), a 30s resend cooldown, and Swift's exact 3-colour message-state rule (error red / fresh-success gold / routine dim). No `friendlyMessage`/`ClientError.http(403,_)` equivalent exists in the RN `useSession.ts` (Supabase-js's own error shape is different from Swift's hand-rolled REST client) — `error?.message` is used directly, with the SAME 403-specific copy substitution keyed off Supabase-js's own error `status` field instead of Swift's custom error enum.

```typescript
// app/sign-in.tsx
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { resolveColour } from '../src/design/colours';
import { useSession } from '../src/data/useSession';

type Step = 'email' | 'code';
const RESEND_COOLDOWN_SECONDS = 30;

function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SignIn() {
  const router = useRouter();
  const { sendOTP, verifyOTP } = useSession();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const defaultMessage = step === 'email'
    ? 'Enter your email. Each email gets its own private log.'
    : `✓ Code sent to ${email} — can take a minute to arrive, and sometimes lands in junk/spam. Check your inbox and type it below.`;

  const messageColour = isError
    ? Colours.restC
    : (step === 'code' && message == null ? resolveColour('--gorse') : Colours.dim);

  const sendButtonLabel = sending ? 'SENDING…' : resendCooldown > 0 ? `RESEND IN ${resendCooldown}s` : 'SEND CODE';

  const onEmailChange = (v: string) => {
    setEmail(v);
    // A cooldown protecting the PREVIOUS address shouldn't block sending
    // to a freshly-typed different one, e.g. fixing a typo.
    setResendCooldown(0);
  };

  const sendCode = async () => {
    setSending(true);
    setMessage(null);
    setIsError(false);
    try {
      await sendOTP(email);
      setStep('code');
      // Starts the moment a code genuinely goes out, so it also covers
      // hitting BACK then SEND CODE again right away — the exact
      // sequence that would otherwise silently invalidate an already-
      // sent, still-good code (only the newest code Supabase sent stays
      // valid).
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e: any) {
      setIsError(true);
      setMessage(`Couldn't send the code: ${e?.message ?? 'something went wrong'}`);
    } finally {
      setSending(false);
    }
  };

  const verifyFailureMessage = (e: any): string => {
    // Supabase answers a wrong code, an already-used code, and a
    // genuinely expired one all with the same 403 - matching Swift's own
    // documented finding (SupabaseClient.ClientError.http(403,_)) that
    // asserting "expired" specifically sent real debugging down the
    // wrong path once. This says what a 403 actually means instead.
    if (e?.status === 403) {
      return "That code didn't work. Each code only works once, and only for a few minutes — tap BACK and send yourself a fresh one.";
    }
    return `Couldn't sign you in: ${e?.message ?? 'something went wrong'}`;
  };

  const verifyCode = async () => {
    setSending(true);
    setIsError(false);
    setMessage(null);
    try {
      await verifyOTP(email, code.replace(/\D/g, ''));
      router.replace('/');
    } catch (e) {
      setIsError(true);
      setMessage(verifyFailureMessage(e));
    } finally {
      setSending(false);
    }
  };

  const codeDigitCount = code.replace(/\D/g, '').length;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{step === 'email' ? 'SIGN IN' : 'ENTER CODE'}</Text>
      <Text style={[styles.eyebrow, { color: resolveColour('--gorse') }]}>{step === 'email' ? 'Deadpoint' : 'Sign-in'}</Text>
      <Text style={[styles.message, { color: messageColour, fontWeight: step === 'code' && message == null ? '600' : '400' }]}>
        {message ?? defaultMessage}
      </Text>

      {step === 'email' ? (
        <>
          <TextInput
            value={email}
            onChangeText={onEmailChange}
            placeholder="you@example.com"
            placeholderTextColor={Colours.faint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable
            onPress={sendCode}
            disabled={!emailLooksValid(email) || sending || resendCooldown > 0}
            style={[styles.button, (!emailLooksValid(email) || sending || resendCooldown > 0) && styles.buttonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={sendButtonLabel}
          >
            <Text style={styles.buttonText}>{sendButtonLabel}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="code from email"
            placeholderTextColor={Colours.faint}
            keyboardType="number-pad"
            style={styles.input}
          />
          <View style={styles.row}>
            <Pressable
              onPress={() => { setStep('email'); setMessage(null); setIsError(false); }}
              style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>BACK</Text>
            </Pressable>
            <Pressable
              onPress={verifyCode}
              disabled={codeDigitCount < 4 || sending}
              style={[styles.button, { flex: 1 }, (codeDigitCount < 4 || sending) && styles.buttonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.buttonText}>{sending ? 'CHECKING…' : 'SIGN IN'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 20, gap: 18 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  eyebrow: { ...Fonts.mono(13, 'medium') },
  message: { fontSize: 14 },
  input: {
    ...Fonts.mono(16, 'medium'), color: '#FFFFFF',
    padding: 14, borderRadius: 8, backgroundColor: Colours.s2,
  },
  row: { flexDirection: 'row', gap: 10 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: resolveColour('--gorse') },
  buttonSecondary: { backgroundColor: Colours.s2 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
  buttonTextSecondary: { color: Colours.dim },
});
```

- [ ] **Step 2: Run the type check**

Run: `cd deadpoint-rn && npx tsc --noEmit`
Expected: no output. No new Jest test — this screen is verified live in Task 12 (it needs a real network round trip to Supabase to mean anything; the email-validity regex is simple enough that a unit test would just re-assert the same one-line regex).

- [ ] **Step 3: Commit**

```bash
cd deadpoint-rn && git add app/sign-in.tsx
git commit -m "feat(onboarding): sign-in screen"
```

---

## Task 3: Quiz pure logic

Direct port of `QuizModel.swift`'s data shapes and the pure `templateId`/`modifiersPayload` derivation — the highest-value tests in this phase's early tasks, since a wrong `templateId` string silently assigns someone the wrong training program.

**Files:**
- Create: `deadpoint-rn/src/screens/quiz/quizModel.ts`
- Create: `deadpoint-rn/__tests__/quizModel.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type Discipline = 'bouldering' | 'sport';
  export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
  export type Weakness = 'slopers' | 'compression';
  export type Equipment = 'hangboard' | 'pullBar' | 'gym' | 'pickupRig';
  export type InjuryFlag = 'fingerPulley' | 'bicepTendon' | 'shoulder' | 'elbow';
  export type RehabInjuryArea = 'fingerPulley' | 'elbowMedial' | 'elbowLateral' | 'shoulder' | 'bicepsTendon' | 'wristTFCC';
  export type RehabStartingPoint = 0 | 1 | 2 | 3;

  export interface QuizAnswers {
    discipline: Discipline;
    experienceLevel: ExperienceLevel;
    weaknesses: Weakness[];
    equipment: Equipment[];
    injuryFlags: InjuryFlag[];
    daysPerWeek: number;
    tripDate: string | null; // yyyy-MM-dd
  }

  export type QuizResult =
    | { kind: 'standard'; answers: QuizAnswers }
    | { kind: 'rehab'; area: RehabInjuryArea; startingPhase: RehabStartingPoint };

  export function templateId(discipline: Discipline, level: ExperienceLevel): string;
  export function modifiersPayload(answers: QuizAnswers): Record<string, unknown>;
  export function gradeRange(discipline: Discipline, level: ExperienceLevel): string;
  ```
  Plus the display-copy tables `TEMPLATE_META`, `REHAB_META` (both `Record<string, { name: string; description: string }>`), and label/subtitle lookup tables for every enum above (`DISCIPLINE_LABELS`, `EXPERIENCE_LABELS`, `WEAKNESS_LABELS`, `EQUIPMENT_LABELS`, `INJURY_FLAG_LABELS`/`INJURY_FLAG_SUBTITLES`, `REHAB_AREA_LABELS`/`REHAB_AREA_SUBTITLES`, `REHAB_STARTING_POINT_LABELS`/`REHAB_STARTING_POINT_SUBTITLES`) — Task 4/5 import all of these directly rather than re-deriving display copy.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/quizModel.test.ts
import { templateId, modifiersPayload, gradeRange, type QuizAnswers } from '../src/screens/quiz/quizModel';

test('templateId composes discipline + capitalized experience level', () => {
  expect(templateId('bouldering', 'beginner')).toBe('boulderingBeginner');
  expect(templateId('sport', 'advanced')).toBe('sportAdvanced');
  expect(templateId('bouldering', 'intermediate')).toBe('boulderingIntermediate');
});

test('gradeRange gives bouldering V-scale bands', () => {
  expect(gradeRange('bouldering', 'beginner')).toBe('Roughly V0–V2');
  expect(gradeRange('bouldering', 'advanced')).toBe('V7 and above');
});

test('gradeRange gives sport French-grade bands', () => {
  expect(gradeRange('sport', 'intermediate')).toBe('Roughly French 6a–6c');
});

const baseAnswers: QuizAnswers = {
  discipline: 'bouldering', experienceLevel: 'beginner',
  weaknesses: [], equipment: [], injuryFlags: [], daysPerWeek: 3, tripDate: null,
};

test('modifiersPayload always includes equipment/injuryFlags/weaknesses/daysPerWeek', () => {
  const payload = modifiersPayload(baseAnswers);
  expect(payload).toEqual({ equipment: [], injuryFlags: [], weaknesses: [], daysPerWeek: 3 });
});

test('modifiersPayload includes tripDate only when set', () => {
  const payload = modifiersPayload({ ...baseAnswers, tripDate: '2026-10-15' });
  expect(payload.tripDate).toBe('2026-10-15');
});

test('modifiersPayload carries real selections through unchanged', () => {
  const payload = modifiersPayload({
    ...baseAnswers,
    weaknesses: ['slopers'], equipment: ['hangboard', 'gym'], injuryFlags: ['elbow'],
  });
  expect(payload.weaknesses).toEqual(['slopers']);
  expect(payload.equipment).toEqual(['hangboard', 'gym']);
  expect(payload.injuryFlags).toEqual(['elbow']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd deadpoint-rn && npx jest quizModel`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/screens/quiz/quizModel.ts
/** Direct port of QuizModel.swift. The mapping from answers to a
    template id is intentionally trivial (discipline + experience level
    compose directly into one of the 6 keys in templates.js) - no
    separate lookup table to keep in sync as the matrix grows. */

export type Discipline = 'bouldering' | 'sport';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type Weakness = 'slopers' | 'compression';
export type Equipment = 'hangboard' | 'pullBar' | 'gym' | 'pickupRig';
export type InjuryFlag = 'fingerPulley' | 'bicepTendon' | 'shoulder' | 'elbow';
export type RehabInjuryArea = 'fingerPulley' | 'elbowMedial' | 'elbowLateral' | 'shoulder' | 'bicepsTendon' | 'wristTFCC';
export type RehabStartingPoint = 0 | 1 | 2 | 3;

export interface QuizAnswers {
  discipline: Discipline;
  experienceLevel: ExperienceLevel;
  weaknesses: Weakness[];
  equipment: Equipment[];
  injuryFlags: InjuryFlag[];
  daysPerWeek: number;
  tripDate: string | null;
}

export type QuizResult =
  | { kind: 'standard'; answers: QuizAnswers }
  | { kind: 'rehab'; area: RehabInjuryArea; startingPhase: RehabStartingPoint };

export function templateId(discipline: Discipline, level: ExperienceLevel): string {
  return discipline + level[0].toUpperCase() + level.slice(1);
}

export function modifiersPayload(answers: QuizAnswers): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    equipment: answers.equipment,
    injuryFlags: answers.injuryFlags,
    weaknesses: answers.weaknesses,
    daysPerWeek: answers.daysPerWeek,
  };
  if (answers.tripDate) payload.tripDate = answers.tripDate;
  return payload;
}

/** Draft bands, not a definitive scale - Oscar's own call to adjust, not
    derived from anything authoritative (same caveat as the Swift
    source). Bouldering uses V-scale, sport uses French grades, matching
    templates.js's own meta descriptions. */
export function gradeRange(discipline: Discipline, level: ExperienceLevel): string {
  const table: Record<Discipline, Record<ExperienceLevel, string>> = {
    bouldering: { beginner: 'Roughly V0–V2', intermediate: 'Roughly V3–V6', advanced: 'V7 and above' },
    sport: { beginner: 'Roughly up to French 6a', intermediate: 'Roughly French 6a–6c', advanced: 'French 7a and above' },
  };
  return table[discipline][level];
}

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  bouldering: 'Bouldering', sport: 'Sport climbing',
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};

export const WEAKNESS_LABELS: Record<Weakness, string> = {
  slopers: 'Slopers / open-hand strength', compression: 'Compression / pinches',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  hangboard: 'A hangboard', pullBar: 'A pull-up bar', gym: 'Regular gym access',
  pickupRig: 'A loading pin + edge/block/roller for weighted pickups',
};

export const INJURY_FLAG_LABELS: Record<InjuryFlag, string> = {
  fingerPulley: 'Finger or pulley injury history', bicepTendon: 'Bicep tendon injury history',
  shoulder: 'Shoulder injury history', elbow: 'Elbow injury history',
};
export const INJURY_FLAG_SUBTITLES: Record<InjuryFlag, string> = {
  fingerPulley: 'A2 pulley strain, tweaked finger joints',
  bicepTendon: 'Front-of-shoulder pain from gastons or compression',
  shoulder: 'Rotator cuff, impingement, general shoulder pain',
  elbow: 'Inner-elbow pain from gripping — "climber’s elbow"',
};

export const REHAB_AREA_LABELS: Record<RehabInjuryArea, string> = {
  fingerPulley: 'Finger / Pulley', elbowMedial: 'Elbow — Inner (Climber’s Elbow)',
  elbowLateral: 'Elbow — Outer (Tennis Elbow)', shoulder: 'Shoulder',
  bicepsTendon: 'Biceps Tendon', wristTFCC: 'Wrist (TFCC)',
};
export const REHAB_AREA_SUBTITLES: Record<RehabInjuryArea, string> = {
  fingerPulley: 'Sharp, localized pain at the base of a finger — a strained or torn pulley',
  elbowMedial: 'Inner-elbow pain from gripping — the most common climbing elbow injury',
  elbowLateral: 'Outer-elbow pain — less common in climbers, but real',
  shoulder: 'Rotator cuff, impingement, general shoulder pain',
  bicepsTendon: 'Front-of-shoulder pain from gastons or compression',
  wristTFCC: 'Pinky-side wrist pain, often from crimping or mantling',
};

export const REHAB_STARTING_POINT_LABELS: Record<RehabStartingPoint, string> = {
  0: 'Just happened, or it still hurts at rest', 1: 'Past the worst of it, working on movement',
  2: 'Pain-free, rebuilding strength', 3: 'Nearly back to normal, easing into climbing',
};
export const REHAB_STARTING_POINT_SUBTITLES: Record<RehabStartingPoint, string> = {
  0: 'Starts at Tissue Unload', 1: 'Starts at Mobility', 2: 'Starts at Strength', 3: 'Starts at Return to Climbing',
};

export interface TemplateMeta { name: string; description: string; }

/** Hand-mirrored from templates.js's own `meta` block per template, same
    pattern as SESSION_ORDER already mirrors engine-core.js's ORDER. KEEP
    IN SYNC with templates.js if either changes. */
export const TEMPLATE_META: Record<string, TemplateMeta> = {
  boulderingBeginner: { name: 'Bouldering — Beginner', description: 'For someone newer to bouldering who wants real structure without heavy fingerboard loading on day one.' },
  boulderingIntermediate: { name: 'Bouldering — Intermediate', description: 'For someone a couple of years into bouldering who has hit the classic V3–V4 plateau.' },
  boulderingAdvanced: { name: 'Bouldering — Advanced', description: 'For someone climbing V8 and above who has already built real finger and pull strength.' },
  sportBeginner: { name: 'Sport — Beginner', description: 'For someone newer to sport climbing — endurance, not power, is the central quality here.' },
  sportIntermediate: { name: 'Sport — Intermediate', description: 'For someone a couple of years into sport climbing ready for structured power-endurance work.' },
  sportAdvanced: { name: 'Sport — Advanced', description: 'For an established sport climber training power-endurance deliberately rather than constantly.' },
};

export const REHAB_META: Record<string, TemplateMeta> = {
  fingerPulley: { name: 'Finger / Pulley', description: 'For a strained or partially torn finger pulley — built around graded, progressive re-loading rather than prolonged rest.' },
  elbowMedial: { name: 'Elbow — Inner (Climber’s Elbow)', description: 'For pain on the inside of the elbow from gripping and pulling load — the most common elbow complaint in climbers.' },
  elbowLateral: { name: 'Elbow — Outer (Tennis Elbow)', description: 'For pain on the outside of the elbow — less common in climbers, but a real overuse injury.' },
  shoulder: { name: 'Shoulder', description: 'For general shoulder pain, impingement, or a rotator cuff strain — built around scapular control alongside rotator cuff strength.' },
  bicepsTendon: { name: 'Biceps Tendon', description: 'For front-of-shoulder pain from gastons or compression — rarely isolated, leans on scapular coordination alongside the biceps itself.' },
  wristTFCC: { name: 'Wrist (TFCC)', description: 'For pain on the pinky-side of the wrist, often from crimping or mantling — built around the wrist’s safest natural movement pattern.' },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd deadpoint-rn && npx jest quizModel`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
cd deadpoint-rn && git add src/screens/quiz/quizModel.ts __tests__/quizModel.test.ts
git commit -m "feat(onboarding): quiz answer model and template-id derivation"
```

---

## Task 4: Quiz UI — chrome and the standard branch

Direct port of `IntakeQuizView.swift`'s chrome (header/footer/step scaffolding/choice-card) and the 8 standard-branch steps.

**Files:**
- Create: `deadpoint-rn/src/screens/quiz/QuizChrome.tsx`
- Create: `deadpoint-rn/src/screens/quiz/StandardSteps.tsx`

**Interfaces:**
- Consumes: everything from `quizModel.ts` (Task 3).
- Produces: `<StepScaffold eyebrow title subtitle? children />`, `<ChoiceCard label subtitle? isSelected onPress />`, `<QuizHeader step totalSteps onCancel? />`, `<QuizFooter step totalSteps canAdvance onBack onAdvance />` from `QuizChrome.tsx`; one component per standard-branch step from `StandardSteps.tsx` (`DisciplineStep`, `ExperienceStep`, `WeaknessStep`, `EquipmentStep`, `InjuryStep`, `DaysPerWeekStep`, `TripDateStep`, `StandardSummaryStep`), each taking `answers: QuizAnswers` and an `onChange: (next: QuizAnswers) => void`. Task 5 assembles all of these plus its own rehab-branch steps into the real screen.

- [ ] **Step 1: Write `QuizChrome.tsx`**

```typescript
// src/screens/quiz/QuizChrome.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';

export function StepScaffold({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.scaffold}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle != null && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={{ marginTop: 6 }}>{children}</View>
    </View>
  );
}

export function ChoiceCard({ label, subtitle, isSelected, onPress }: { label: string; subtitle?: string; isSelected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: isSelected ? Colours.s2 : Colours.s1 }, isSelected && styles.cardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.cardLabel}>{label}</Text>
        {subtitle != null && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      </View>
      {isSelected && <Text style={styles.checkmark}>✓</Text>}
    </Pressable>
  );
}

export function QuizHeader({ step, totalSteps, onCancel }: { step: number; totalSteps: number; onCancel?: () => void }) {
  return (
    <View style={styles.header}>
      {onCancel != null ? (
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>CANCEL</Text>
        </Pressable>
      ) : <View />}
      <View style={styles.dots}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= step ? Colours.fg : Colours.s3 }]} />
        ))}
      </View>
    </View>
  );
}

export function QuizFooter({ step, totalSteps, canAdvance, onBack, onAdvance }: { step: number; totalSteps: number; canAdvance: boolean; onBack: () => void; onAdvance: () => void }) {
  return (
    <View style={styles.footerRow}>
      {step > 0 && (
        <Pressable onPress={onBack} style={[styles.button, styles.buttonSecondary, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={[styles.buttonText, { color: Colours.dim }]}>BACK</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onAdvance}
        disabled={!canAdvance}
        style={[styles.button, { flex: 1, backgroundColor: Colours.fg }, !canAdvance && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={step === totalSteps ? 'Start training' : 'Next'}
      >
        <Text style={[styles.buttonText, { color: Colours.bg }]}>{step === totalSteps ? 'START TRAINING' : 'NEXT'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  cancel: { ...Fonts.mono(11, 'bold'), color: Colours.faint },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  scaffold: { gap: 18 },
  eyebrow: { ...Fonts.mono(11, 'bold'), color: Colours.faint, letterSpacing: 1.5 },
  title: { fontSize: 28, fontWeight: '800', color: Colours.fg },
  subtitle: { fontSize: 13, color: Colours.dim },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 12, marginBottom: 10 },
  cardSelected: { borderWidth: 1.5, borderColor: 'rgba(237,235,229,0.4)' },
  cardLabel: { fontSize: 15, fontWeight: '600', color: Colours.fg },
  cardSubtitle: { fontSize: 12, color: Colours.dim, marginTop: 3 },
  checkmark: { fontSize: 16, fontWeight: '700', color: Colours.fg },
  footerRow: { flexDirection: 'row', gap: 12, paddingBottom: 8 },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  buttonSecondary: { backgroundColor: Colours.s1 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...Fonts.mono(13, 'bold') },
});
```

- [ ] **Step 2: Write `StandardSteps.tsx`**

`daysPerWeekStep`'s stepper is clamped `[2, 6]` (Swift: `max(2, ...)`/`min(6, ...)`). `tripDateStep` needs a real date picker — `@react-native-community/datetimepicker` is the standard Expo-compatible choice (not yet installed; add it in this step). Trip date defaults to 56 days out when first enabled, matching Swift's `Date().addingTimeInterval(60*60*24*56)`.

```bash
cd deadpoint-rn && npx expo install @react-native-community/datetimepicker
```

```typescript
// src/screens/quiz/StandardSteps.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { StepScaffold, ChoiceCard } from './QuizChrome';
import {
  type QuizAnswers, type Discipline, type ExperienceLevel, type Weakness, type Equipment, type InjuryFlag,
  DISCIPLINE_LABELS, EXPERIENCE_LABELS, WEAKNESS_LABELS, EQUIPMENT_LABELS, INJURY_FLAG_LABELS, INJURY_FLAG_SUBTITLES,
  gradeRange, templateId, TEMPLATE_META,
} from './quizModel';

interface StepProps { answers: QuizAnswers; onChange: (next: QuizAnswers) => void; totalSteps: number; }

function toggleIn<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function DisciplineStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`2 of ${totalSteps}`} title="What do you climb?">
      {(['bouldering', 'sport'] as Discipline[]).map((d) => (
        <ChoiceCard key={d} label={DISCIPLINE_LABELS[d]} isSelected={answers.discipline === d} onPress={() => onChange({ ...answers, discipline: d })} />
      ))}
    </StepScaffold>
  );
}

export function ExperienceStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`3 of ${totalSteps}`} title="How experienced are you?">
      {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map((level) => (
        <ChoiceCard
          key={level} label={EXPERIENCE_LABELS[level]} subtitle={gradeRange(answers.discipline, level)}
          isSelected={answers.experienceLevel === level} onPress={() => onChange({ ...answers, experienceLevel: level })}
        />
      ))}
    </StepScaffold>
  );
}

export function WeaknessStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`4 of ${totalSteps}`} title="Anything you want extra focus on?" subtitle="Optional — skip if nothing stands out.">
      {(['slopers', 'compression'] as Weakness[]).map((w) => (
        <ChoiceCard key={w} label={WEAKNESS_LABELS[w]} isSelected={answers.weaknesses.includes(w)} onPress={() => onChange({ ...answers, weaknesses: toggleIn(answers.weaknesses, w) })} />
      ))}
    </StepScaffold>
  );
}

export function EquipmentStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`5 of ${totalSteps}`} title="What do you have access to?" subtitle="Select everything that applies — this only changes which exercises show up, not the plan itself.">
      {(['hangboard', 'pullBar', 'gym', 'pickupRig'] as Equipment[]).map((e) => (
        <ChoiceCard key={e} label={EQUIPMENT_LABELS[e]} isSelected={answers.equipment.includes(e)} onPress={() => onChange({ ...answers, equipment: toggleIn(answers.equipment, e) })} />
      ))}
    </StepScaffold>
  );
}

export function InjuryStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`6 of ${totalSteps}`} title="Any injury history worth flagging?" subtitle="Optional — this adds caution notes and safety exercises, not a diagnosis. Not a substitute for real medical advice.">
      {(['fingerPulley', 'bicepTendon', 'shoulder', 'elbow'] as InjuryFlag[]).map((flag) => (
        <ChoiceCard
          key={flag} label={INJURY_FLAG_LABELS[flag]} subtitle={INJURY_FLAG_SUBTITLES[flag]}
          isSelected={answers.injuryFlags.includes(flag)} onPress={() => onChange({ ...answers, injuryFlags: toggleIn(answers.injuryFlags, flag) })}
        />
      ))}
    </StepScaffold>
  );
}

export function DaysPerWeekStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`7 of ${totalSteps}`} title="How many days a week can you train?">
      <Text style={styles.bigNumber}>{answers.daysPerWeek}</Text>
      <View style={styles.stepperRow}>
        <Pressable onPress={() => onChange({ ...answers, daysPerWeek: Math.max(2, answers.daysPerWeek - 1) })} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="Fewer days">
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <Pressable onPress={() => onChange({ ...answers, daysPerWeek: Math.min(6, answers.daysPerWeek + 1) })} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="More days">
          <Text style={styles.stepperGlyph}>+</Text>
        </Pressable>
      </View>
    </StepScaffold>
  );
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TripDateStep({ answers, onChange, totalSteps }: StepProps) {
  const wantsTripDate = answers.tripDate != null;
  return (
    <StepScaffold eyebrow={`8 of ${totalSteps}`} title="Training toward a trip?" subtitle="Optional — if you have a real date, the plan can taper toward it automatically.">
      <ChoiceCard label="No trip planned" isSelected={!wantsTripDate} onPress={() => onChange({ ...answers, tripDate: null })} />
      <ChoiceCard
        label="Yes, I have a date" isSelected={wantsTripDate}
        onPress={() => {
          if (answers.tripDate == null) {
            const d = new Date(); d.setDate(d.getDate() + 56);
            onChange({ ...answers, tripDate: isoDate(d) });
          }
        }}
      />
      {wantsTripDate && (
        <DateTimePicker
          value={answers.tripDate ? new Date(answers.tripDate) : new Date()}
          mode="date"
          onChange={(_, date) => { if (date) onChange({ ...answers, tripDate: isoDate(date) }); }}
        />
      )}
    </StepScaffold>
  );
}

function summaryRow(label: string, value: string) {
  return (
    <View key={label} style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function StandardSummaryStep({ answers }: StepProps) {
  const id = templateId(answers.discipline, answers.experienceLevel);
  const meta = TEMPLATE_META[id];
  return (
    <StepScaffold eyebrow="READY" title={meta?.name ?? id}>
      {meta != null && <Text style={styles.summaryDescription}>{meta.description}</Text>}
      <View style={styles.summaryBox}>
        {summaryRow('Days / week', String(answers.daysPerWeek))}
        {answers.weaknesses.length > 0 && summaryRow('Extra focus', answers.weaknesses.map((w) => WEAKNESS_LABELS[w]).join(', '))}
        {answers.equipment.length > 0 && summaryRow('Equipment', answers.equipment.map((e) => EQUIPMENT_LABELS[e]).join(', '))}
        {answers.injuryFlags.length > 0 && summaryRow('Flagged', answers.injuryFlags.map((f) => INJURY_FLAG_LABELS[f]).join(', '))}
        {answers.tripDate != null && summaryRow('Trip date', answers.tripDate)}
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  bigNumber: { fontSize: 64, fontWeight: '800', color: Colours.fg, ...Fonts.mono(64, 'bold'), textAlign: 'center' },
  stepperRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 24 },
  stepperButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colours.s1, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 24, fontWeight: '700', color: Colours.fg },
  summaryDescription: { fontSize: 14, color: Colours.dim, marginBottom: 14 },
  summaryBox: { backgroundColor: Colours.s1, borderRadius: 12, padding: 16, gap: 8 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryLabel: { ...Fonts.mono(10, 'bold'), color: Colours.faint, width: 100 },
  summaryValue: { fontSize: 13, color: Colours.fg, flex: 1 },
});
```

- [ ] **Step 3: Run the type check**

Run: `cd deadpoint-rn && npx tsc --noEmit`
Expected: no output. No new Jest tests — presentational, verified live in Task 12.

- [ ] **Step 4: Commit**

```bash
cd deadpoint-rn && git add package.json package-lock.json src/screens/quiz/QuizChrome.tsx src/screens/quiz/StandardSteps.tsx
git commit -m "feat(onboarding): quiz chrome and standard-branch steps"
```

---

## Task 5: Quiz UI — rehab branch and screen assembly

Direct port of the rehab-branch steps and the top-level `IntakeQuizView` state machine (track choice, step counting, `canAdvance`, `advance()`), assembled into the real route.

**Files:**
- Create: `deadpoint-rn/src/screens/quiz/RehabSteps.tsx`
- Create: `deadpoint-rn/app/quiz.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3-4.
- Produces: the real `/quiz` route, calling `onComplete: (result: QuizResult) => void` — Task 11 wires this to `useProfile().create()`/`.assignRehab()`.

- [ ] **Step 1: Write `RehabSteps.tsx`**

```typescript
// src/screens/quiz/RehabSteps.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { StepScaffold, ChoiceCard } from './QuizChrome';
import {
  type RehabInjuryArea, type RehabStartingPoint,
  REHAB_AREA_LABELS, REHAB_AREA_SUBTITLES, REHAB_STARTING_POINT_LABELS, REHAB_STARTING_POINT_SUBTITLES, REHAB_META,
} from './quizModel';

const REHAB_AREAS: RehabInjuryArea[] = ['fingerPulley', 'elbowMedial', 'elbowLateral', 'shoulder', 'bicepsTendon', 'wristTFCC'];
const STARTING_POINTS: RehabStartingPoint[] = [0, 1, 2, 3];

export function RehabAreaStep({ area, onChange, totalSteps }: { area: RehabInjuryArea | null; onChange: (a: RehabInjuryArea) => void; totalSteps: number }) {
  return (
    <StepScaffold eyebrow={`2 of ${totalSteps}`} title="What are you rehabbing?" subtitle="General guidance built from published climbing-rehab protocols — not a diagnosis, and not a substitute for a physio.">
      {REHAB_AREAS.map((a) => (
        <ChoiceCard key={a} label={REHAB_AREA_LABELS[a]} subtitle={REHAB_AREA_SUBTITLES[a]} isSelected={area === a} onPress={() => onChange(a)} />
      ))}
    </StepScaffold>
  );
}

export function RehabStartingPointStep({ startingPoint, onChange, totalSteps }: { startingPoint: RehabStartingPoint | null; onChange: (p: RehabStartingPoint) => void; totalSteps: number }) {
  return (
    <StepScaffold eyebrow={`3 of ${totalSteps}`} title="Where are you already?" subtitle="So you don't have to start over if you've been dealing with this a while.">
      {STARTING_POINTS.map((p) => (
        <ChoiceCard key={p} label={REHAB_STARTING_POINT_LABELS[p]} subtitle={REHAB_STARTING_POINT_SUBTITLES[p]} isSelected={startingPoint === p} onPress={() => onChange(p)} />
      ))}
    </StepScaffold>
  );
}

const SUMMARY_TEXT: Record<RehabStartingPoint, string> = {
  0: "Starts at the first phase — Tissue Unload. You'll move through Mobility, Strength, and Return to Climbing as you're ready, at your own pace.",
  1: "Starts at Mobility, skipping Tissue Unload — you'll move through Strength and Return to Climbing as you're ready, at your own pace.",
  2: "Starts at Strength, skipping Unload and Mobility — you'll move through Return to Climbing as you're ready, at your own pace.",
  3: "Starts at Return to Climbing, the final phase — you're already most of the way there.",
};

export function RehabSummaryStep({ area, startingPoint }: { area: RehabInjuryArea | null; startingPoint: RehabStartingPoint | null }) {
  const meta = area != null ? REHAB_META[area] : undefined;
  return (
    <StepScaffold eyebrow="READY" title={meta?.name ?? 'Rehab'}>
      {meta != null && <Text style={styles.description}>{meta.description}</Text>}
      <Text style={styles.summaryBox}>{SUMMARY_TEXT[startingPoint ?? 0]}</Text>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: 14, color: Colours.dim, marginBottom: 14 },
  summaryBox: {
    ...Fonts.mono(13, 'medium'), color: Colours.faint,
    padding: 16, backgroundColor: Colours.s1, borderRadius: 12,
  },
});
```

- [ ] **Step 2: Write `app/quiz.tsx`**

Direct port of `IntakeQuizView`'s own state machine (`track`, `step`, `totalSteps`, `canAdvance`, `advance()`). `onCancel` signs out (matches Swift's own reasoning: this is the one moment nothing has been written for a brand-new account yet, so signing out and back in with a corrected email costs nothing) — Task 11 wires the real `signOut()` in.

```typescript
// app/quiz.tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { QuizHeader, QuizFooter } from '../src/screens/quiz/QuizChrome';
import {
  DisciplineStep, ExperienceStep, WeaknessStep, EquipmentStep, InjuryStep, DaysPerWeekStep, TripDateStep, StandardSummaryStep,
} from '../src/screens/quiz/StandardSteps';
import { RehabAreaStep, RehabStartingPointStep, RehabSummaryStep } from '../src/screens/quiz/RehabSteps';
import { templateId, type QuizAnswers, type QuizResult, type RehabInjuryArea, type RehabStartingPoint } from '../src/screens/quiz/quizModel';

type Track = 'standard' | 'rehab' | null;

const DEFAULT_ANSWERS: QuizAnswers = {
  discipline: 'bouldering', experienceLevel: 'beginner',
  weaknesses: [], equipment: [], injuryFlags: [], daysPerWeek: 3, tripDate: null,
};

export default function Quiz() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  const [track, setTrack] = useState<Track>(null);
  const [answers, setAnswers] = useState<QuizAnswers>(DEFAULT_ANSWERS);
  const [rehabArea, setRehabArea] = useState<RehabInjuryArea | null>(null);
  const [rehabStartingPoint, setRehabStartingPoint] = useState<RehabStartingPoint | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const totalSteps = track === 'rehab' ? 3 : 8;

  const canAdvance =
    step === 0 ? track != null
    : track === 'rehab' && step === 1 ? rehabArea != null
    : track === 'rehab' && step === 2 ? rehabStartingPoint != null
    : true;

  const onCancel = async () => {
    try { await signOut(); } catch (e) { console.error('quiz onCancel signOut failed:', e); }
    router.replace('/');
  };

  const complete = async (result: QuizResult) => {
    setSubmitting(true);
    try {
      if (result.kind === 'standard') {
        const id = templateId(result.answers.discipline, result.answers.experienceLevel);
        const start = new Date();
        const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        const { modifiersPayload } = await import('../src/screens/quiz/quizModel');
        await profile.create(id, startDate, modifiersPayload(result.answers));
      } else {
        await profile.assignRehab(result.area, result.startingPhase);
      }
      router.replace('/');
    } catch (e) {
      console.error('quiz complete failed:', e);
      setSubmitting(false);
    }
  };

  const advance = () => {
    if (!canAdvance || submitting) return;
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else if (track === 'rehab' && rehabArea != null && rehabStartingPoint != null) {
      complete({ kind: 'rehab', area: rehabArea, startingPhase: rehabStartingPoint });
    } else if (track === 'standard') {
      complete({ kind: 'standard', answers });
    }
  };

  let body: React.ReactNode;
  if (step === 0) {
    body = (
      <View style={{ gap: 18 }}>
        <QuizHeaderTitle />
        <View>
          <ChoiceTrack label="Normal training" subtitle="A full program matched to your climbing and goals" selected={track === 'standard'} onPress={() => setTrack('standard')} />
          <ChoiceTrack label="Rehab" subtitle="For a current injury — a shorter, phase-based track focused on getting back to climbing safely" selected={track === 'rehab'} onPress={() => setTrack('rehab')} />
        </View>
      </View>
    );
  } else if (track === 'rehab') {
    body = step === 1
      ? <RehabAreaStep area={rehabArea} onChange={setRehabArea} totalSteps={totalSteps} />
      : step === 2
      ? <RehabStartingPointStep startingPoint={rehabStartingPoint} onChange={setRehabStartingPoint} totalSteps={totalSteps} />
      : <RehabSummaryStep area={rehabArea} startingPoint={rehabStartingPoint} />;
  } else {
    const stepProps = { answers, onChange: setAnswers, totalSteps };
    body = step === 1 ? <DisciplineStep {...stepProps} />
      : step === 2 ? <ExperienceStep {...stepProps} />
      : step === 3 ? <WeaknessStep {...stepProps} />
      : step === 4 ? <EquipmentStep {...stepProps} />
      : step === 5 ? <InjuryStep {...stepProps} />
      : step === 6 ? <DaysPerWeekStep {...stepProps} />
      : step === 7 ? <TripDateStep {...stepProps} />
      : <StandardSummaryStep {...stepProps} />;
  }

  return (
    <View style={styles.root}>
      <QuizHeader step={step} totalSteps={totalSteps} onCancel={onCancel} />
      <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView>
      <QuizFooter step={step} totalSteps={totalSteps} canAdvance={canAdvance && !submitting} onBack={() => setStep((s) => Math.max(0, s - 1))} onAdvance={advance} />
    </View>
  );
}

// Small inline helpers kept local to this file — the track-choice step's
// own two-option layout is used nowhere else, unlike StepScaffold/
// ChoiceCard which are shared across every real question step.
function QuizHeaderTitle() {
  const { StepScaffold } = require('../src/screens/quiz/QuizChrome');
  return <StepScaffold eyebrow="1 of 8" title="Training normally, or working through an injury?" />;
}
function ChoiceTrack({ label, subtitle, selected, onPress }: { label: string; subtitle: string; selected: boolean; onPress: () => void }) {
  const { ChoiceCard } = require('../src/screens/quiz/QuizChrome');
  return <ChoiceCard label={label} subtitle={subtitle} isSelected={selected} onPress={onPress} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 20 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 12 },
});
```

**Note on the `require(...)` calls inside `QuizHeaderTitle`/`ChoiceTrack`:** these exist only to avoid a duplicate top-level `StepScaffold`/`ChoiceCard` import already present above for the other steps — replace them with plain top-level imports of `StepScaffold, ChoiceCard` from `../src/screens/quiz/QuizChrome` instead (the same names are already imported once via `QuizHeader, QuizFooter` from that module at the top of this file; add `StepScaffold, ChoiceCard` to that same import line and delete these two helper functions' `require` calls, calling `StepScaffold`/`ChoiceCard` directly in the `step === 0` branch instead). This is a plan-authoring artifact, not a real runtime constraint — fix it directly while implementing rather than shipping the `require` workaround.

- [ ] **Step 3: Run the type check**

Run: `cd deadpoint-rn && npx tsc --noEmit`
Expected: no output. No new Jest tests — this screen orchestrates real hooks (`useSession`, `useProfile`) and is verified live in Task 12.

- [ ] **Step 4: Commit**

```bash
cd deadpoint-rn && git add src/screens/quiz/RehabSteps.tsx app/quiz.tsx
git commit -m "feat(onboarding): rehab-branch steps and the quiz screen"
```

---

## Task 6: Tutorial spotlight proof-of-concept

Deliberately isolated, per this project's own established practice: the measured-ref-registry-plus-five-layer-hit-test technique (Decision 3 in the design spec) is genuinely novel for this codebase — prove it against one real, simple target before building the full spotlight system on top of it.

**Files:**
- Create: `deadpoint-rn/src/components/tutorial/TutorialTargetContext.tsx`
- Create: `deadpoint-rn/src/components/tutorial/spotlightProof.tsx` (temporary — deleted at the end of Task 7 once the real system proves the same technique works)

**Interfaces:**
- Produces: `TutorialTargetProvider`, `useTutorialTarget(id: string | null | undefined): React.RefObject<View>`, both exported from `TutorialTargetContext.tsx`. Task 7 imports both; Task 8 imports `useTutorialTarget` into the already-built Phase 2/3 components.

- [ ] **Step 1: Write the target registry**

```typescript
// src/components/tutorial/TutorialTargetContext.tsx
/** A measured-ref registry standing in for SwiftUI's anchorPreference/
    overlayPreferenceValue system, which has no RN equivalent — see the
    Phase 5 design spec's Decision 3. Each spotlightable element calls
    useTutorialTarget(id) and attaches the returned ref to its own
    outermost native element; the tutorial host reads the registry by id
    and calls .measureInWindow() on whichever ref is currently active.

    The no-op default context value is what lets every spotlightable
    component call this hook UNCONDITIONALLY, whether or not a tutorial
    is actually running — normal (non-tutorial) rendering of
    ExerciseRow/DailyCard/etc. never sits inside a TutorialTargetProvider,
    so register/unregister are harmless no-ops there. */
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { View } from 'react-native';

export type TutorialTargetMap = Map<string, React.RefObject<View>>;

interface TutorialTargetContextValue {
  register: (id: string, ref: React.RefObject<View>) => void;
  unregister: (id: string) => void;
}

const NOOP: TutorialTargetContextValue = { register: () => {}, unregister: () => {} };
const TutorialTargetContext = createContext<TutorialTargetContextValue>(NOOP);

export function TutorialTargetProvider({ children, targetsRef }: { children: React.ReactNode; targetsRef: React.RefObject<TutorialTargetMap> }) {
  const register = useCallback((id: string, ref: React.RefObject<View>) => {
    targetsRef.current?.set(id, ref);
  }, [targetsRef]);
  const unregister = useCallback((id: string) => {
    targetsRef.current?.delete(id);
  }, [targetsRef]);
  return <TutorialTargetContext.Provider value={{ register, unregister }}>{children}</TutorialTargetContext.Provider>;
}

export function useTutorialTarget(id: string | null | undefined): React.RefObject<View> {
  const ref = useRef<View>(null);
  const { register, unregister } = useContext(TutorialTargetContext);
  useEffect(() => {
    if (!id) return;
    register(id, ref);
    return () => unregister(id);
  }, [id, register, unregister]);
  return ref;
}
```

- [ ] **Step 2: Write a throwaway spotlight-proof component**

Proves both halves of Decision 3 at once: measurement (`measureInWindow` against a real registered target) and the visual+hit-test split (an SVG evenodd cutout, `pointerEvents="none"`, plus 4 real absorbing rectangles around it).

```typescript
// src/components/tutorial/spotlightProof.tsx
// TEMPORARY — deleted once the real spotlight system (Task 7) proves the
// same technique works for real tutorial steps. Renders one real button
// and a spotlight hole around it; tapping the button should still work
// (the hole lets the tap through), tapping anywhere else should not.
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TutorialTargetProvider, useTutorialTarget, type TutorialTargetMap } from './TutorialTargetContext';

function ProofTarget({ onPress }: { onPress: () => void }) {
  const ref = useTutorialTarget('proofButton');
  return (
    <Pressable ref={ref} onPress={onPress} style={styles.target}>
      <Text style={styles.targetText}>TAP ME</Text>
    </Pressable>
  );
}

interface Rect { x: number; y: number; width: number; height: number; }

export function SpotlightProof() {
  const targetsRef = useRef<TutorialTargetMap>(new Map());
  const [tapCount, setTapCount] = useState(0);
  const [hole, setHole] = useState<Rect | null>(null);

  const measure = () => {
    const ref = targetsRef.current.get('proofButton');
    ref?.current?.measureInWindow((x, y, width, height) => setHole({ x, y, width, height }));
  };

  return (
    <View style={styles.root}>
      <TutorialTargetProvider targetsRef={targetsRef}>
        <View style={styles.stage}>
          <ProofTarget onPress={() => setTapCount((c) => c + 1)} />
        </View>
      </TutorialTargetProvider>
      <Pressable onPress={measure} style={styles.measureButton}><Text style={styles.targetText}>MEASURE + SPOTLIGHT</Text></Pressable>
      <Text style={styles.count}>Real taps registered: {tapCount}</Text>

      {hole != null && (
        <>
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path
              d={`M0,0 H${400} V${800} H0 Z M${hole.x},${hole.y} H${hole.x + hole.width} V${hole.y + hole.height} H${hole.x} Z`}
              fill="black" fillOpacity={0.75} fillRule="evenodd"
            />
          </Svg>
          {/* Four absorbing rectangles around the hole — real taps outside
              these (i.e. inside the hole) fall through to ProofTarget. */}
          <Pressable style={[styles.absorb, { top: 0, left: 0, right: 0, height: hole.y }]} onPress={() => {}} />
          <Pressable style={[styles.absorb, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} onPress={() => {}} />
          <Pressable style={[styles.absorb, { top: hole.y, height: hole.height, left: 0, width: hole.x }]} onPress={() => {}} />
          <Pressable style={[styles.absorb, { top: hole.y, height: hole.height, left: hole.x + hole.width, right: 0 }]} onPress={() => {}} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { padding: 40, alignItems: 'center' },
  target: { backgroundColor: '#F2B134', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  targetText: { fontWeight: '700' },
  measureButton: { backgroundColor: '#4FB3A5', padding: 12, margin: 20, borderRadius: 8, alignItems: 'center' },
  count: { textAlign: 'center', color: '#fff' },
  absorb: { position: 'absolute' },
});
```

Temporarily render `<SpotlightProof />` in `card.tsx` (same pattern as Phase 4 Task 1's `SvgProof`), build via `npx expo run:ios --device "iPhone 17"`, and confirm live: (1) tapping MEASURE + SPOTLIGHT dims the screen with a visible hole around TAP ME, (2) tapping TAP ME through the hole increments the counter, (3) tapping the dimmed area elsewhere does NOT increment it. Remove the temporary render from `card.tsx` immediately after confirming; `spotlightProof.tsx` itself stays until Task 7 deletes it.

If real taps don't reach the target through the hole, or the dimmed area doesn't absorb taps correctly, stop and report BLOCKED — do not build Task 7 on an unproven technique.

- [ ] **Step 3: Run the type check**

Run: `cd deadpoint-rn && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd deadpoint-rn && git add src/components/tutorial/TutorialTargetContext.tsx src/components/tutorial/spotlightProof.tsx
git commit -m "feat(onboarding): tutorial target registry + spotlight hit-test proof"
```

---

## Task 7: Tutorial spotlight system

Direct port of `TutorialSpotlight.swift`'s `TutorialStep`/`TutorialController`/overlay, using Task 6's proven technique for real.

**Files:**
- Create: `deadpoint-rn/src/components/tutorial/TutorialController.ts`
- Create: `deadpoint-rn/__tests__/tutorialController.test.ts`
- Create: `deadpoint-rn/src/components/tutorial/TutorialOverlay.tsx`
- Delete: `deadpoint-rn/src/components/tutorial/spotlightProof.tsx`

**Interfaces:**
- Consumes: `useTutorialTarget`/`TutorialTargetProvider`/`TutorialTargetMap` (Task 6).
- Produces:
  ```typescript
  export interface TutorialStep {
    targetID: string; title: string; body: string;
    showsSwipeHint?: boolean; fullScreenSwipeDemo?: boolean;
  }
  export function createTutorialController(steps: TutorialStep[]): { ... } // see Step 1 below for the exact returned shape
  ```
  `<TutorialOverlay controller={...} targetsRef={...} isActive={boolean} />`. Task 9 imports both.

- [ ] **Step 1: Write the failing tests for the controller**

```typescript
// __tests__/tutorialController.test.ts
import { computeAdvance, computeHandleTap, type TutorialStep } from '../src/components/tutorial/TutorialController';

const steps: TutorialStep[] = [
  { targetID: 'a', title: 'A', body: 'a' },
  { targetID: 'b', title: 'B', body: 'b' },
  { targetID: 'c', title: 'C', body: 'c' },
];

test('advancing from a non-final step increments the index', () => {
  expect(computeAdvance(0, steps)).toEqual({ stepIndex: 1, finished: false });
});

test('advancing from the final step finishes instead of overflowing', () => {
  expect(computeAdvance(2, steps)).toEqual({ stepIndex: 2, finished: true });
});

test('a tap on the current step\'s own target advances', () => {
  expect(computeHandleTap('a', 0, steps)).toEqual({ stepIndex: 1, finished: false });
});

test('a tap on a DIFFERENT target than the current step does nothing', () => {
  expect(computeHandleTap('c', 0, steps)).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd deadpoint-rn && npx jest tutorialController`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure controller logic + the hook wrapping it**

```typescript
// src/components/tutorial/TutorialController.ts
/** Direct port of TutorialSpotlight.swift's TutorialStep/TutorialController.
    Pure advance/handleTap logic, same directly-testable contract as
    useDoneFlow.ts's computeDoneTap — useTutorialController wraps this in
    useState. */
import { useCallback, useState } from 'react';

export interface TutorialStep {
  targetID: string;
  title: string;
  body: string;
  /** Small bouncing "‹ SWIPE ›" badge above the spotlighted target — for
      a step whose real control is a gesture rather than a tap target. */
  showsSwipeHint?: boolean;
  /** The whole screen dims (nothing masked out, the real content stays
      swipeable underneath) while a large sweeping arrow animates across
      it — for the one step whose real control is a whole-card gesture,
      not a single tappable spot. */
  fullScreenSwipeDemo?: boolean;
}

export interface AdvanceResult { stepIndex: number; finished: boolean; }

export function computeAdvance(stepIndex: number, steps: TutorialStep[]): AdvanceResult {
  return stepIndex < steps.length - 1 ? { stepIndex: stepIndex + 1, finished: false } : { stepIndex, finished: true };
}

/** Null means "ignore" — a control that fires early (or a stray tap)
    can't skip a step out of order, matching Swift's own
    `guard currentStep?.targetID == targetID else { return }`. */
export function computeHandleTap(targetID: string, stepIndex: number, steps: TutorialStep[]): AdvanceResult | null {
  if (steps[stepIndex]?.targetID !== targetID) return null;
  return computeAdvance(stepIndex, steps);
}

export function useTutorialController(steps: TutorialStep[]) {
  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const currentStep = finished ? null : (steps[stepIndex] ?? null);

  const advance = useCallback(() => {
    const result = computeAdvance(stepIndex, steps);
    setStepIndex(result.stepIndex);
    setFinished(result.finished);
  }, [stepIndex, steps]);

  const handleTap = useCallback((targetID: string) => {
    const result = computeHandleTap(targetID, stepIndex, steps);
    if (!result) return;
    setStepIndex(result.stepIndex);
    setFinished(result.finished);
  }, [stepIndex, steps]);

  const skip = useCallback(() => setFinished(true), []);

  return { steps, stepIndex, currentStep, finished, advance, handleTap, skip };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd deadpoint-rn && npx jest tutorialController`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the overlay**

Direct port of `TutorialOverlayModifier`'s `spotlight`/`orphanedStep`/`fullScreenSwipeSpotlight`/`captionCard`/`captionPosition`, using Task 6's registry + 5-layer split instead of Swift's `anchorPreference`. Re-measures the active target on every step change (a `useEffect` keyed on `controller.stepIndex`), plus once more 150ms later to catch any late layout settling (RN's `measureInWindow` is one-shot, unlike Swift's always-live anchors).

```typescript
// src/components/tutorial/TutorialOverlay.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { TutorialTargetMap } from './TutorialTargetContext';
import type { useTutorialController } from './TutorialController';

interface Rect { x: number; y: number; width: number; height: number; }

const CORNER_RADIUS = 14;
const HOLE_PADDING_X = 8;
const HOLE_PADDING_Y = 10;

export function TutorialOverlay({
  controller, targetsRef, isActive,
}: {
  controller: ReturnType<typeof useTutorialController>;
  targetsRef: React.RefObject<TutorialTargetMap>;
  isActive: boolean;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [measureFailed, setMeasureFailed] = useState(false);
  const screen = Dimensions.get('window');

  useEffect(() => {
    if (!isActive || controller.currentStep == null) { setRect(null); return; }
    const targetID = controller.currentStep.targetID;
    const measure = () => {
      const ref = targetsRef.current?.get(targetID);
      if (!ref?.current) { setMeasureFailed(true); return; }
      ref.current.measureInWindow((x, y, width, height) => {
        if (width === 0 && height === 0) { setMeasureFailed(true); return; }
        setMeasureFailed(false);
        setRect({ x: x - HOLE_PADDING_X, y: y - HOLE_PADDING_Y, width: width + HOLE_PADDING_X * 2, height: height + HOLE_PADDING_Y * 2 });
      });
    };
    measure();
    const id = setTimeout(measure, 150);
    return () => clearTimeout(id);
  }, [isActive, controller.currentStep, targetsRef]);

  if (!isActive || controller.currentStep == null) return null;
  const step = controller.currentStep;

  if (step.fullScreenSwipeDemo) {
    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <View style={[StyleSheet.absoluteFillObject, styles.dimLight]} pointerEvents="none" />
        <BigSwipeArrow screenHeight={screen.height} screenWidth={screen.width} />
        <CaptionCard
          step={step} stepIndex={controller.stepIndex} totalSteps={controller.steps.length}
          onSkip={controller.skip} screen={screen}
          anchorRect={{ x: 0, y: screen.height * 0.55, width: screen.width, height: 1 }}
        />
      </View>
    );
  }

  if (measureFailed || rect == null) {
    // The step's target isn't on screen at all — without this branch the
    // overlay would render nothing at all (no spotlight, no caption,
    // critically no SKIP), stranding the walkthrough with no way out.
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <Pressable style={[StyleSheet.absoluteFillObject, styles.dimHeavy]} onPress={controller.advance} />
        <CaptionCard
          step={step} stepIndex={controller.stepIndex} totalSteps={controller.steps.length}
          onSkip={controller.skip} screen={screen} footerOverride="Tap anywhere to continue"
          anchorRect={{ x: 0, y: screen.height * 0.32, width: screen.width, height: 1 }}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Path
          d={`M0,0 H${screen.width} V${screen.height} H0 Z M${rect.x},${rect.y} H${rect.x + rect.width} V${rect.y + rect.height} H${rect.x} Z`}
          fill="black" fillOpacity={0.75} fillRule="evenodd"
        />
        {/* Dark outer stroke behind a light inner one, so the ring stays
            visible against a bright target (a single near-white ring
            disappeared against the amber DONE button — reported directly
            in the Swift version). */}
        <Path d={roundedRectPath(rect, CORNER_RADIUS)} stroke="rgba(0,0,0,0.55)" strokeWidth={6} fill="none" />
        <Path d={roundedRectPath(rect, CORNER_RADIUS)} stroke={Colours.fg} strokeWidth={2.5} fill="none" />
      </Svg>
      {step.showsSwipeHint && <SwipeHintBadge x={rect.x + rect.width / 2} y={Math.max(30, rect.y - 30)} />}
      {/* Four absorbing rectangles around the hole — a real tap only
          reaches the actual control underneath through the hole itself. */}
      <Pressable style={[styles.absorb, { top: 0, left: 0, right: 0, height: Math.max(0, rect.y) }]} onPress={() => {}} />
      <Pressable style={[styles.absorb, { top: rect.y + rect.height, left: 0, right: 0, bottom: 0 }]} onPress={() => {}} />
      <Pressable style={[styles.absorb, { top: rect.y, height: rect.height, left: 0, width: Math.max(0, rect.x) }]} onPress={() => {}} />
      <Pressable style={[styles.absorb, { top: rect.y, height: rect.height, left: rect.x + rect.width, right: 0 }]} onPress={() => {}} />
      <CaptionCard step={step} stepIndex={controller.stepIndex} totalSteps={controller.steps.length} onSkip={controller.skip} screen={screen} anchorRect={rect} />
    </View>
  );
}

function roundedRectPath(r: Rect, radius: number): string {
  const x = r.x, y = r.y, w = r.width, h = r.height, rad = Math.min(radius, w / 2, h / 2);
  return `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`;
}

function CaptionCard({
  step, stepIndex, totalSteps, onSkip, screen, anchorRect, footerOverride,
}: {
  step: { title: string; body: string; fullScreenSwipeDemo?: boolean };
  stepIndex: number; totalSteps: number; onSkip: () => void; screen: { width: number; height: number };
  anchorRect: Rect; footerOverride?: string;
}) {
  const [height, setHeight] = useState(200);
  const cardWidth = Math.min(320, screen.width - 40);
  const gap = 12;
  const fitsBelow = anchorRect.y + anchorRect.height + gap + height < screen.height;
  const top = fitsBelow ? anchorRect.y + anchorRect.height + gap : Math.max(20, anchorRect.y - gap - height);

  return (
    <View
      style={[styles.caption, { width: cardWidth, top: Math.min(top, screen.height - height - 20), left: (screen.width - cardWidth) / 2 }]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <View style={styles.captionHeader}>
        <Text style={styles.captionCounter}>{stepIndex + 1} OF {totalSteps}</Text>
        <Pressable onPress={onSkip}><Text style={styles.captionSkip}>SKIP</Text></Pressable>
      </View>
      <Text style={styles.captionTitle}>{step.title}</Text>
      <Text style={styles.captionBody}>{step.body}</Text>
      <Text style={styles.captionFooter}>{footerOverride ?? (step.fullScreenSwipeDemo ? 'Swipe the card to continue' : 'Tap the highlighted area to continue')}</Text>
    </View>
  );
}

function BigSwipeArrow({ screenWidth, screenHeight }: { screenWidth: number; screenHeight: number }) {
  return (
    <View style={[styles.arrowRow, { top: screenHeight * 0.42 - 45, width: screenWidth }]} pointerEvents="none">
      <Text style={styles.arrowGlyph}>‹</Text>
      <Text style={styles.arrowLabel}>SWIPE</Text>
      <Text style={styles.arrowGlyph}>›</Text>
    </View>
  );
}

function SwipeHintBadge({ x, y }: { x: number; y: number }) {
  return (
    <View style={[styles.swipeBadge, { left: x - 45, top: y - 15 }]} pointerEvents="none">
      <Text style={styles.swipeBadgeText}>‹ SWIPE ›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dimHeavy: { backgroundColor: 'rgba(0,0,0,0.75)' },
  dimLight: { backgroundColor: 'rgba(0,0,0,0.35)' },
  absorb: { position: 'absolute' },
  caption: {
    position: 'absolute', padding: 16, borderRadius: 14,
    backgroundColor: Colours.s1, borderWidth: 1, borderColor: Colours.s3,
  },
  captionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  captionCounter: { ...Fonts.mono(10, 'bold'), color: Colours.faint },
  captionSkip: { ...Fonts.mono(10, 'bold'), color: Colours.faint },
  captionTitle: { fontSize: 19, fontWeight: '800', color: Colours.fg, marginBottom: 8 },
  captionBody: { fontSize: 13.5, color: Colours.dim, marginBottom: 8 },
  captionFooter: { ...Fonts.mono(10, 'semibold'), color: Colours.faint },
  arrowRow: { position: 'absolute', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, height: 90 },
  arrowGlyph: { fontSize: 46, fontWeight: '700', color: Colours.fg },
  arrowLabel: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 3 },
  swipeBadge: {
    position: 'absolute', width: 90, paddingVertical: 7, borderRadius: 999,
    backgroundColor: Colours.s1, borderWidth: 1, borderColor: 'rgba(237,235,229,0.4)', alignItems: 'center',
  },
  swipeBadgeText: { ...Fonts.mono(11, 'bold'), color: Colours.fg, letterSpacing: 1.5 },
});
```

**Note:** this file's `fullScreenSwipeDemo` early-return branch renders before the `measureFailed || rect == null` check specifically because a full-screen-swipe step never registers a real measurable target at all — it doesn't need one. Verify this ordering is preserved exactly as written; swapping it would make every swipe-demo step render as an "orphaned step" instead.

- [ ] **Step 6: Delete the Task 6 proof and run the full test suite + type check**

```bash
cd deadpoint-rn && rm src/components/tutorial/spotlightProof.tsx
npx jest && npx tsc --noEmit
```
Expected: all pass (119 = 115 + 4 new), `tsc` clean.

- [ ] **Step 7: Commit**

```bash
cd deadpoint-rn && git add src/components/tutorial/TutorialController.ts src/components/tutorial/TutorialOverlay.tsx __tests__/tutorialController.test.ts
git rm src/components/tutorial/spotlightProof.tsx
git commit -m "feat(onboarding): tutorial spotlight overlay system"
```

---

## Task 8: Tutorial-target refs in the existing daily-card components

Adds `useTutorialTarget(id)` to the already-built Phase 2/3 components so the tutorial has real things to point at. Purely additive — every change is "attach a ref that's a no-op outside a tutorial," nothing about existing behavior changes.

**Files:**
- Modify: `deadpoint-rn/src/components/daily-card/ExerciseRow.tsx` (checkbox, info icon, weight badge)
- Modify: `deadpoint-rn/src/components/daily-card/CardHeader.tsx` (settings gear)
- Modify: `deadpoint-rn/src/components/daily-card/WeekStrip.tsx` (the whole strip)
- Modify: `deadpoint-rn/src/components/daily-card/SessionDots.tsx` (the whole dots row)
- Modify: `deadpoint-rn/src/components/daily-card/DailyCard.tsx` (the Done button)
- Modify: `deadpoint-rn/src/components/timers/RestTimerOverlay.tsx` (the STOP button)

**Interfaces:**
- Consumes: `useTutorialTarget` (Task 6).
- Target IDs, matching `TutorialDemoCardView.swift`'s own step list exactly: `weekStrip`, `phaseBadge` (already exists as `onTapPhaseBadge`'s own Pressable in `CardHeader.tsx`, no new target needed there — the badge is already spotlightable via its own onPress-holding Pressable, confirm and reuse it, don't add a duplicate), `exerciseInfo`, `exerciseTick`, `weightBadge`, `restTimerButton` (already tagged — Task 3 of the Phase 3 plan's own `.tutorialTarget("restTimerButton")` note in `ExerciseRow.tsx`'s Rest button was never actually ported; add it now), `restTimerStop`, `sessionDots`, `doneButton`, `settingsGear`.

- [ ] **Step 1: Read the current content of all 6 files first**

Several of these files were last touched in Phase 3 (Rest timer wiring) or earlier — read each one's current, real content before editing (this plan cannot show a verbatim "before" diff for files another phase already modified since this plan was written; the exact current line numbers are not assumed here).

- [ ] **Step 2: Add refs**

For each file, the pattern is identical: import `useTutorialTarget` from `../tutorial/TutorialTargetContext` (adjust the relative path per each file's actual location), call it once per spotlightable element in that file, and add `ref={...}` to that element's own `Pressable`/`View`:

`ExerciseRow.tsx`:
```typescript
import { useTutorialTarget } from '../tutorial/TutorialTargetContext';
// inside the component body:
const infoRef = useTutorialTarget('exerciseInfo');
const tickRef = useTutorialTarget('exerciseTick');
const weightRef = useTutorialTarget('weightBadge');
```
Attach `ref={infoRef}` to the info-icon `Pressable`, `ref={tickRef}` to the checkbox `Pressable`, `ref={weightRef}` to whichever of `WeightBadge`/`SetWeightBadge`'s own `Pressable` is actually rendered (both need the ref — a conditional single element renders either one or the other, so attaching the same ref prop to both call sites is correct and simple, not a duplicate-registration risk since only one is ever mounted at a time). Also add `ref={useTutorialTarget('restTimerButton')}` to the Rest button's own `Pressable` — this target ID was already named in this file's own doc comment from Task 3's original build but never actually wired to anything.

`CardHeader.tsx`: `const settingsRef = useTutorialTarget('settingsGear'); const phaseBadgeRef = useTutorialTarget('phaseBadge');` — attach `ref={settingsRef}` to the settings gear's `Pressable`, `ref={phaseBadgeRef}` to the phase badge's `Pressable`.

`WeekStrip.tsx`: one `useTutorialTarget('weekStrip')` call, attached to the component's own outermost `View`.

`SessionDots.tsx`: one `useTutorialTarget('sessionDots')` call, attached to the component's own outermost `View`.

`DailyCard.tsx`: one `useTutorialTarget('doneButton')` call, attached to the Done button's own `Pressable`.

`RestTimerOverlay.tsx`: one `useTutorialTarget('restTimerStop')` call, attached to the STOP button's own `Pressable`.

- [ ] **Step 3: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass (119, unchanged — purely additive ref props, no logic changed), `tsc` clean.

- [ ] **Step 4: Commit**

```bash
cd deadpoint-rn && git add src/components/daily-card/ExerciseRow.tsx src/components/daily-card/CardHeader.tsx src/components/daily-card/WeekStrip.tsx src/components/daily-card/SessionDots.tsx src/components/daily-card/DailyCard.tsx src/components/timers/RestTimerOverlay.tsx
git commit -m "feat(onboarding): tutorial-target refs on the real daily-card controls"
```

---

## Task 9: Tutorial host screen

Direct port of `TutorialDemoCardView.swift` — the real post-quiz walkthrough, hosting a staged `DailyCard` (Tasks 6-11 of the Phase 0-2/Phase 3 plans, unmodified) against a fixed template and seeded data.

**Files:**
- Create: `deadpoint-rn/app/tutorial.tsx`

**Interfaces:**
- Consumes: `DailyCard` and everything it needs (`useDoneFlow`, `useSwipeCarousel`, `useRestTimer`, `useIntervalTimer`, `createEngine`, `resolveColour`) — the exact same wiring pattern `app/(main)/card.tsx` already uses, but with local component state standing in for `useStore`/`useLoads`/`useSession` (no real Supabase writes during the tutorial). `TutorialOverlay`, `TutorialTargetProvider`, `useTutorialController` (Tasks 6-7).
- Produces: the real `/tutorial` route, calling `onDone: () => void` — Task 11 wires this to `useProfile().markTutorialCompleted()` or `markBuiltInTutorialSeen(email)` depending on account type.

- [ ] **Step 1: Write the screen**

The 10-step sequence, copy, and target IDs are verbatim from `TutorialDemoCardView.swift`. Runs against `boulderingAdvanced` specifically (Base phase, day one, `maxFingers` session — the one guaranteed to have an active weight-tracked, timed exercise with no modifiers, per the Swift source's own reasoning) with one seeded load entry so a weight badge is genuinely on screen to spotlight.

```typescript
// app/tutorial.tsx
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { createEngine } from '../src/engine';
import { resolveColour } from '../src/design/colours';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSwipeCarousel } from '../src/components/daily-card/useSwipeCarousel';
import { useDoneFlow } from '../src/components/daily-card/useDoneFlow';
import { DailyCard, type DailyCardPeek } from '../src/components/daily-card/DailyCard';
import { useRestTimer } from '../src/components/timers/useRestTimer';
import { useIntervalTimer } from '../src/components/timers/useIntervalTimer';
import { leadingInt } from '../src/components/timers/intervalTimerLogic';
import { TutorialTargetProvider, type TutorialTargetMap } from '../src/components/tutorial/TutorialTargetContext';
import { TutorialOverlay } from '../src/components/tutorial/TutorialOverlay';
import { useTutorialController, type TutorialStep } from '../src/components/tutorial/TutorialController';
import type { RenderedExercise } from '../src/engine/types';
import type { WeekDay } from '../src/components/daily-card/WeekStrip';

const PROGRAMS = require('../src/engine/programs.js');

const STEPS: TutorialStep[] = [
  { targetID: 'weekStrip', title: 'Your last seven days', body: 'Each bar is one day, coloured by what you logged. Tap any of them to fill in a session you forgot — or to fix one you got wrong.' },
  { targetID: 'phaseBadge', title: 'The bigger picture', body: "This badge shows where you are in your training block. Tap it any time to see the full plan — phases, deload weeks, and what changes when. Close it with the button in the top left to carry on." },
  { targetID: 'exerciseInfo', title: 'Detail, out of the way', body: "Every exercise keeps the essentials up front. Tap the info icon to see the full reasoning behind it. And when an exercise's sets and reps are written in gold, it means those numbers have been tuned for the phase you're in right now — they'll change as you move through the plan." },
  { targetID: 'exerciseTick', title: 'Tick them off', body: "Check exercises off as you finish them. Ticked ones collapse out of the way, so what's left is always what's in front of you." },
  { targetID: 'weightBadge', title: 'Track your numbers', body: "Tap a weight to log what you actually lifted today. When that number turns gold, it means you've held the same weight two sessions running — the app is telling you it's time to go up." },
  { targetID: 'restTimerButton', title: 'Built-in timers', body: 'Every timed exercise has a rest timer wired in — tap to start it, right from here. It keeps running while you rest, so you can put the phone down.' },
  { targetID: 'restTimerStop', title: 'Stop anytime', body: "Rest timers count down on their own, but you're never stuck waiting — tap STOP whenever you're ready to move on." },
  { targetID: 'sessionDots', title: 'Reading the dots', body: 'One dot per session type. The filled one is what you’re looking at right now — not what you’ve done. The dot with a ring around it is what the app reckons you should do today, and it stays put even while you look around. Swipe left or right anywhere on the card to move between sessions, or tap a dot to jump straight to one.', fullScreenSwipeDemo: true },
  { targetID: 'doneButton', title: 'Then log the session', body: "When you're finished, mark the whole session done with the big button at the bottom. This is the bit that actually matters — logging is what the app reads to decide what you do next." },
  { targetID: 'settingsGear', title: 'Your settings', body: 'A sets counter that lets you tap through sets one at a time, an auto-start rest timer, and your account, all behind this gear icon.' },
];

type Stage = 'intro' | 'walkthrough' | 'outro';

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A plausible-looking week for the strip — deliberately leaves a couple
    of days blank, matching Swift's own reasoning: a strip where every
    day is filled would quietly imply daily training is required, which
    isn't how the engine actually works. */
function demoWeekDays(program: any, today: string): WeekDay[] {
  const types: (string | null)[] = ['pull', 'rest', 'maxFingers', null, 'climbHard', 'rest', null];
  const engine = createEngine(program, { sessionLog: {}, loadLog: {} });
  const out: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = engine.addDays(today, -i);
    const type = types[6 - i];
    out.push({
      id: date,
      dayLetter: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(date + 'T12:00:00')).slice(0, 1),
      colourVarName: type ? engine.sessionColourVarName(type) : null,
      isToday: i === 0,
    });
  }
  return out;
}

export default function Tutorial({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('intro');
  const today = useMemo(() => isoToday(), []);
  const program = PROGRAMS.boulderingAdvanced;

  const [loggedKey, setLoggedKey] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const [loadKg, setLoadKg] = useState<number | null>(20); // seeded, matches Swift's fixed loadLog entry
  const [browsedKey, setBrowsedKey] = useState<string | null>(null);

  const loadLog = useMemo(() => (loadKg != null ? { 'tpl-adv-maw': [{ date: today, kg: loadKg }] } : {}), [loadKg, today]);
  const engine = useMemo(() => createEngine(program, { sessionLog: {}, loadLog }), [program, loadLog]);
  const decision = engine.decide(today);
  const displayKey = browsedKey ?? 'maxFingers';
  const isLogged = loggedKey === displayKey;

  const exercises = engine.resolveExercises(displayKey, today, engine.phaseNameAt(today));
  const accentVarName = engine.sessionColourVarName(displayKey);
  const accent = resolveColour(accentVarName);
  const info = engine.sessionInfo(displayKey);

  const restTimer = useRestTimer();
  const intervalTimer = useIntervalTimer();
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);
  const scrollRef = useRef<React.Component | null>(null);
  const targetsRef = useRef<TutorialTargetMap>(new Map());
  const controller = useTutorialController(STEPS);

  const swipe = useSwipeCarousel({
    displayKey,
    containerWidth: 400,
    onBrowse: (key) => { setBrowsedKey(key); controller.handleTap('sessionDots'); },
    scrollRef,
  });

  const onToggleTick = (id: string) => {
    setTicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    controller.handleTap('exerciseTick');
  };

  const onTapWeight = (ex: RenderedExercise) => {
    if (ex.id === 'tpl-adv-maw') setLoadKg((kg) => (kg ?? 0) + 2.5);
    controller.handleTap('weightBadge');
  };

  const onLog = async () => {
    setLoggedKey((k) => (k === displayKey ? null : displayKey));
    setCelebrationTrigger((c) => c + 1);
    controller.handleTap('doneButton');
  };

  const doneFlow = useDoneFlow({ isLogged, loggedSessionKey: loggedKey, displayKey, onLog });

  const weekDays = useMemo(() => demoWeekDays(program, today), [program, today]);
  const sessionColour = (key: string) => resolveColour(engine.sessionColourVarName(key));
  const resolvedPeek: DailyCardPeek | null = useMemo(() => {
    if (swipe.peekKey == null) return null;
    const key = swipe.peekKey;
    const peekInfo = engine.sessionInfo(key);
    if (!peekInfo) return null;
    return {
      session: { name: peekInfo.n ?? '', where: peekInfo.w ?? '' },
      accent: resolveColour(engine.sessionColourVarName(key)),
      exercises: engine.resolveExercises(key, today, engine.phaseNameAt(today)),
      isLogged: loggedKey === key,
      message: peekInfo.note ?? '',
    };
  }, [swipe.peekKey, engine, today, loggedKey]);

  return (
    <View style={styles.root}>
      <TutorialTargetProvider targetsRef={targetsRef}>
        <DailyCard
          session={{ name: info?.n ?? '', where: info?.w ?? '', guide: null }}
          accent={accent}
          accentVarName={accentVarName}
          exercises={exercises}
          ticks={ticks}
          onToggleTick={onToggleTick}
          onTapWeight={onTapWeight}
          onTapRest={(ex) => { if (ex.restSeconds != null) { restTimer.start(ex.restSeconds, ex.title, accent); controller.handleTap('restTimerButton'); } }}
          onStartInterval={(ex) => { if (ex.interval != null) intervalTimer.start(ex.interval, ex.restSeconds ?? 120, Math.max(1, leadingInt(ex.prescription) ?? 1), ex.title); }}
          restTimer={restTimer}
          intervalTimer={intervalTimer}
          isLogged={isLogged}
          cardMessage={info?.note ?? ''}
          weekDays={weekDays}
          onTapDay={() => controller.handleTap('weekStrip')}
          onTapCalendar={() => {}}
          onTapSettings={() => controller.handleTap('settingsGear')}
          onTapPhaseBadge={() => controller.handleTap('phaseBadge')}
          onTapGuide={() => {}}
          phaseName={engine.phaseNameAt(today)}
          weekNumber={engine.block(today).w}
          today={today}
          recommendedKey={loggedKey != null ? null : decision.k}
          nextUp={null}
          celebrationTrigger={celebrationTrigger}
          footerNote={`Tutorial · ${today}`}
          doneFlow={doneFlow}
          panGesture={swipe.panGesture}
          translateX={swipe.translateX}
          peek={resolvedPeek}
          onTapSession={swipe.animateTo}
          sessionColour={sessionColour}
          displayKey={displayKey}
          scrollRef={scrollRef}
        />
        <TutorialOverlay controller={controller} targetsRef={targetsRef} isActive={stage === 'walkthrough'} />
      </TutorialTargetProvider>

      {stage === 'intro' && (
        <MessageCard
          title="How this works"
          body="Every day, the app tells you which session to do — worked out from what you've logged and how recovered you are, not a fixed weekly timetable. Rest days get recommended too, and they count. Log what you do and it adapts. Here's a quick look around."
          buttonLabel="START"
          onSkip={onDone}
          onPress={() => setStage('walkthrough')}
        />
      )}
      {stage === 'outro' && (
        <MessageCard title="You're set" body="That's everything. You can always revisit this from settings later." buttonLabel="GET STARTED" onPress={onDone} />
      )}
      {controller.finished && stage === 'walkthrough' && setStage('outro') as unknown as null}
    </View>
  );
}

function MessageCard({ title, body, buttonLabel, onSkip, onPress }: { title: string; body: string; buttonLabel: string; onSkip?: () => void; onPress: () => void }) {
  return (
    <View style={styles.messageBackdrop}>
      <View style={styles.messageCard}>
        <Text style={styles.messageTitle}>{title}</Text>
        <Text style={styles.messageBody}>{body}</Text>
        <Pressable onPress={onPress} style={styles.messageButton}><Text style={styles.messageButtonText}>{buttonLabel}</Text></Pressable>
        {onSkip != null && <Pressable onPress={onSkip}><Text style={styles.messageSkip}>SKIP</Text></Pressable>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  messageBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  messageCard: { width: '85%', maxWidth: 340, padding: 22, borderRadius: 16, backgroundColor: Colours.s1, gap: 14 },
  messageTitle: { fontSize: 24, fontWeight: '800', color: Colours.fg },
  messageBody: { fontSize: 14, color: Colours.dim },
  messageButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: Colours.fg },
  messageButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
  messageSkip: { ...Fonts.mono(11, 'bold'), color: Colours.faint, textAlign: 'center' },
});
```

**Fix needed before this compiles**: the `controller.finished && stage === 'walkthrough' && setStage('outro') as unknown as null` line is a placeholder for "call `setStage('outro')` once when the controller finishes, not on every render" — replace it with a real `useEffect`:
```typescript
useEffect(() => {
  if (controller.finished && stage === 'walkthrough') setStage('outro');
}, [controller.finished, stage]);
```
placed alongside the component's other hooks near the top (needs `useEffect` added to the `react` import). Calling `setState` directly inside a render body (as the placeholder line does) is a real React anti-pattern that this plan should not have shipped — fix it as part of implementing this step, not as a follow-up.

Wire `app/tutorial.tsx`'s default export to actually receive `onDone` from the router (expo-router screens take no props from their caller) — read this file's own default export signature back once written: since expo-router routes are parameterless, move `onDone` to be computed INSIDE this component instead of received as a prop, e.g. `const router = useRouter(); const onDone = async () => { /* Task 11 fills this in via the router's own gate recomputation */ router.replace('/'); };`. Task 11 is what actually supplies the real `markTutorialCompleted()`/`markBuiltInTutorialSeen()` call before that redirect — implement `onDone` as a thin local function here for now (just the redirect), and Task 11 will show exactly where to layer the real persistence call in.

- [ ] **Step 2: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass (119, unchanged), `tsc` clean.

- [ ] **Step 3: Commit**

```bash
cd deadpoint-rn && git add app/tutorial.tsx
git commit -m "feat(onboarding): tutorial host screen"
```

---

## Task 10: Paywall screen

Direct port of `PaywallView.swift`'s UI, per Decision 4: built faithfully, never actually routed into by this phase's router (Task 11).

**Files:**
- Create: `deadpoint-rn/app/paywall.tsx`

- [ ] **Step 1: Write the screen**

```typescript
// app/paywall.tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';

const FEATURES = [
  'Your quiz-assigned training plan',
  'Live progress and weight tracking',
  'Rest and interval timers, built in',
  'Home screen widget',
];

export default function Paywall() {
  const router = useRouter();
  const { signOut } = useSession();

  const onSignOut = async () => {
    try { await signOut(); } catch (e) { console.error('paywall onSignOut failed:', e); }
    router.replace('/');
  };

  // TODO(Phase 7): real subscription purchase — this button is
  // intentionally inert for now, since the root router never actually
  // routes anyone here yet (needsPaywall is hardcoded false — see
  // app/index.tsx). Built now so the screen is ready to wire up once
  // real IAP products exist.
  const onSubscribe = () => {};
  const onRestore = () => {};
  const onRedeemCode = () => {};

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>SIGN OUT</Text></Pressable>

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>DEADPOINT STANDARD</Text>
        <Text style={styles.title}>Your plan, every day</Text>
        <Text style={styles.price}>7 days free, then £0.99 a month. Cancel any time.</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={onSubscribe} style={styles.subscribeButton}>
        <Text style={styles.subscribeText}>START FREE TRIAL</Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Pressable onPress={onRestore}><Text style={styles.footerLink}>RESTORE PURCHASES</Text></Pressable>
        <Pressable onPress={onRedeemCode}><Text style={styles.footerLink}>HAVE A CODE?</Text></Pressable>
      </View>

      <Text style={styles.legal}>
        Payment is charged to your Apple ID after the trial ends unless cancelled at least 24 hours before it's up. Manage or cancel any time in Settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  content: { padding: 24, gap: 20 },
  signOut: { alignSelf: 'flex-end' },
  signOutText: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  heading: { gap: 10 },
  eyebrow: { ...Fonts.mono(11, 'bold'), color: Colours.faint, letterSpacing: 1.5 },
  title: { fontSize: 30, fontWeight: '800', color: Colours.fg },
  price: { fontSize: 15, color: Colours.dim },
  features: { gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkmark: { color: Colours.go, fontWeight: '700', fontSize: 12 },
  featureText: { fontSize: 14, color: Colours.dim },
  subscribeButton: { paddingVertical: 16, borderRadius: 10, alignItems: 'center', backgroundColor: Colours.fg },
  subscribeText: { ...Fonts.mono(14, 'bold'), color: Colours.bg },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  footerLink: { ...Fonts.mono(11, 'semibold'), color: Colours.dim },
  legal: { ...Fonts.mono(10, 'medium'), color: Colours.faint, textAlign: 'center' },
});
```

- [ ] **Step 2: Run the type check**

Run: `cd deadpoint-rn && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd deadpoint-rn && git add app/paywall.tsx
git commit -m "feat(onboarding): paywall screen (built, not yet gating - Phase 7)"
```

---

## Task 11: Root routing state machine

Direct port of `NativeAppView.swift`'s gating chain (`reload()`'s real body, `WelcomeView`/`NativeSignInView`/`IntakeQuizView`/tutorial/paywall branches at the top of `body`), as a pure, directly-testable decision function plus the real `app/index.tsx`.

**Files:**
- Create: `deadpoint-rn/src/routing/computeRoute.ts`
- Create: `deadpoint-rn/__tests__/computeRoute.test.ts`
- Modify: `deadpoint-rn/app/index.tsx`
- Modify: `deadpoint-rn/app/(main)/card.tsx` (nothing behavioral — just confirm it's still reachable as `/card`, the route this function redirects the fully-onboarded case to)

**Interfaces:**
- Produces:
  ```typescript
  export type Route = '/welcome' | '/sign-in' | '/quiz' | '/tutorial' | '/rehab-coming-soon' | '/card';
  export interface RouteInputs {
    hasSeenWelcome: boolean;
    isSignedIn: boolean;
    email: string | null;
    isBuiltInProgram: boolean;
    hasSeenBuiltInTutorial: boolean;
    quizCompletedAt: string | null;
    tutorialCompletedAt: string | null;
    trackType: string | null;
  }
  export function computeRoute(inputs: RouteInputs): Route;
  ```

- [ ] **Step 1: Write the failing tests**

Every branch of Swift's own gating chain, in the same priority order.

```typescript
// __tests__/computeRoute.test.ts
import { computeRoute, type RouteInputs } from '../src/routing/computeRoute';

const base: RouteInputs = {
  hasSeenWelcome: true, isSignedIn: true, email: 'new@example.com', isBuiltInProgram: false,
  hasSeenBuiltInTutorial: false, quizCompletedAt: null, tutorialCompletedAt: null, trackType: null,
};

test('welcome comes first, before anything else', () => {
  expect(computeRoute({ ...base, hasSeenWelcome: false })).toBe('/welcome');
});

test('sign-in comes right after welcome, before any account-specific check', () => {
  expect(computeRoute({ ...base, isSignedIn: false })).toBe('/sign-in');
});

test('a built-in account skips quiz entirely, even with no quizCompletedAt', () => {
  expect(computeRoute({ ...base, isBuiltInProgram: true, email: 'oscar@sullivanltd.co.uk' })).toBe('/card');
});

test('a built-in account still gets the tutorial once, tracked device-locally', () => {
  expect(computeRoute({ ...base, isBuiltInProgram: true, hasSeenBuiltInTutorial: false })).toBe('/tutorial');
});

test('a quiz-eligible account with no quizCompletedAt needs the quiz', () => {
  expect(computeRoute(base)).toBe('/quiz');
});

test('a quizzed account with no tutorialCompletedAt needs the tutorial', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z' })).toBe('/tutorial');
});

test('a rehab-track account past quiz+tutorial has nowhere real to go yet', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'rehab' })).toBe('/rehab-coming-soon');
});

test('a fully onboarded standard-track account reaches the real card', () => {
  expect(computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'standard' })).toBe('/card');
});

test('paywall is never routed to in this phase, even conceptually - not a reachable branch at all', () => {
  // No RouteInputs combination should ever produce '/paywall' - confirmed
  // by there being no such literal anywhere in computeRoute's return
  // type or implementation. This test exists as a marker, not a real
  // behavioral check: see Decision 4 in the design spec (needsPaywall
  // hardcoded off, real gate is Phase 7).
  const result = computeRoute({ ...base, quizCompletedAt: '2026-08-01T00:00:00Z', tutorialCompletedAt: '2026-08-01T00:00:00Z', trackType: 'standard' });
  expect(result).not.toBe('/paywall');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd deadpoint-rn && npx jest computeRoute`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure routing function**

```typescript
// src/routing/computeRoute.ts
/** Direct port of NativeAppView.swift's gating chain (body's top-level
    if/else branches, plus reload()'s own guard sequence) as one pure,
    directly-testable priority list — same "one function, same order as
    Swift's own checks" discipline every prior phase's gating logic has
    used. Adapted for expo-router: instead of swapping which view
    renders in place, this returns which single route the caller should
    router.replace() to. */

export type Route = '/welcome' | '/sign-in' | '/quiz' | '/tutorial' | '/rehab-coming-soon' | '/card';

export interface RouteInputs {
  hasSeenWelcome: boolean;
  isSignedIn: boolean;
  email: string | null;
  isBuiltInProgram: boolean;
  hasSeenBuiltInTutorial: boolean;
  quizCompletedAt: string | null;
  tutorialCompletedAt: string | null;
  trackType: string | null;
}

export function computeRoute(inputs: RouteInputs): Route {
  if (!inputs.hasSeenWelcome) return '/welcome';
  if (!inputs.isSignedIn) return '/sign-in';

  if (inputs.isBuiltInProgram) {
    // No quiz (their program is hand-authored, nothing to ask) and no
    // paywall (they aren't customers) — but the tutorial still runs. A
    // hand-authored program means the program was written for them, not
    // that they've ever seen this app before.
    return inputs.hasSeenBuiltInTutorial ? '/card' : '/tutorial';
  }

  // quizCompletedAt, not any template-assignment field, is the real
  // "has this account finished ONE of the two quiz branches" signal — a
  // rehab-only user may never get a template assignment at all.
  if (inputs.quizCompletedAt == null) return '/quiz';
  if (inputs.tutorialCompletedAt == null) return '/tutorial';

  // TODO(Phase 7): real subscription gate goes here, between the
  // tutorial check above and the track-routing below — see the Phase 5
  // design spec's Decision 4 for why it's deliberately absent for now.

  if (inputs.trackType === 'rehab') return '/rehab-coming-soon';
  return '/card';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd deadpoint-rn && npx jest computeRoute`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the real `app/index.tsx`**

Replaces the Task-3-era placeholder redirect. Resolves every `RouteInputs` field from real hooks, calls `computeRoute`, and `router.replace()`s — never `push`, so the gate chain never builds a back-stack. Also renders a plain "Rehab track is coming soon" message inline for the one route this phase can't build a real screen for yet, rather than adding a whole extra route file for a single static message.

```typescript
// app/index.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { getHasSeenWelcome, hasSeenBuiltInTutorial } from '../src/data/deviceFlags';
import { computeRoute, type Route } from '../src/routing/computeRoute';
import { Colours } from '../src/design/colours';

const PROGRAMS = require('../src/engine/programs.js');

function isBuiltInProgram(email: string | null): boolean {
  if (!email) return false;
  const key = email.toLowerCase();
  return key !== 'default' && Object.prototype.hasOwnProperty.call(PROGRAMS, key);
}

export default function Index() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  const [hasSeenWelcome, setHasSeenWelcome] = useState<boolean | null>(null);
  const [builtInSeen, setBuiltInSeen] = useState<boolean | null>(null);

  useEffect(() => {
    getHasSeenWelcome().then(setHasSeenWelcome).catch((e) => { console.error('index: getHasSeenWelcome failed:', e); setHasSeenWelcome(false); });
  }, []);

  useEffect(() => {
    if (!email) { setBuiltInSeen(false); return; }
    hasSeenBuiltInTutorial(email).then(setBuiltInSeen).catch((e) => { console.error('index: hasSeenBuiltInTutorial failed:', e); setBuiltInSeen(false); });
  }, [email]);

  const builtIn = isBuiltInProgram(email);

  useEffect(() => {
    if (hasSeenWelcome == null || (builtIn && builtInSeen == null)) return; // still loading device flags
    const route: Route = computeRoute({
      hasSeenWelcome,
      isSignedIn: session != null,
      email,
      isBuiltInProgram: builtIn,
      hasSeenBuiltInTutorial: builtInSeen ?? false,
      quizCompletedAt: profile.row?.quizCompletedAt ?? null,
      tutorialCompletedAt: profile.row?.tutorialCompletedAt ?? null,
      trackType: profile.row?.trackType ?? null,
    });
    if (route === '/rehab-coming-soon') return; // rendered inline below, not a real route
    router.replace(route as any);
  }, [hasSeenWelcome, builtInSeen, builtIn, session, email, profile.row, router]);

  const isRehabComingSoon = !builtIn && session != null && hasSeenWelcome === true
    && profile.row?.quizCompletedAt != null && profile.row?.tutorialCompletedAt != null
    && profile.row?.trackType === 'rehab';

  if (isRehabComingSoon) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Rehab track is coming soon</Text>
        <Text style={styles.body}>
          Your answers are saved — the rehab-specific daily card and walkthrough aren't built yet. Check back soon.
        </Text>
      </View>
    );
  }

  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: Colours.fg, textAlign: 'center' },
  body: { fontSize: 14, color: Colours.dim, textAlign: 'center' },
});
```

**Note on `router.replace(route as any)`**: expo-router's typed-routes feature (if enabled in this project's `app.json`/`tsconfig.json` — confirm before implementing) may reject a plain string literal in favor of its own generated route types. If `tsc` complains here, replace the cast with whatever the installed expo-router version's own typed-route helper expects (check `node_modules/expo-router`'s generated types or its own documentation on this exact point) rather than widening the cast further.

Also wire the real completion calls this task's earlier screens deferred:
- In `app/quiz.tsx` (Task 5), no change needed — `profile.create()`/`.assignRehab()` already set `quizCompletedAt`, and `router.replace('/')` already re-triggers this file's own gating logic on the next render.
- In `app/tutorial.tsx` (Task 9), replace the placeholder `onDone` (just `router.replace('/')`) with the real completion call first:
  ```typescript
  const onDone = async () => {
    try {
      if (isBuiltInProgram(email)) {
        if (email) await markBuiltInTutorialSeen(email);
      } else {
        await profile.markTutorialCompleted();
      }
    } catch (e) {
      console.error('tutorial onDone failed:', e);
    }
    router.replace('/');
  };
  ```
  (needs `useRouter` from `expo-router`, `markBuiltInTutorialSeen` from `../src/data/deviceFlags`, and either duplicating this file's own small `isBuiltInProgram` check or importing a shared one — since `isBuiltInProgram` as written in this task's `app/index.tsx` is a 3-line pure function with no dependencies, move it into `src/routing/computeRoute.ts` as a named export in this same task rather than duplicating it, and import it from both files.)

- [ ] **Step 6: Run the full test suite and type check**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: all pass (127 = 119 + 8 new), `tsc` clean.

- [ ] **Step 7: Commit**

```bash
cd deadpoint-rn && git add src/routing/computeRoute.ts __tests__/computeRoute.test.ts app/index.tsx app/tutorial.tsx
git commit -m "feat(onboarding): root routing state machine"
```

---

## Task 12: Live device verification

First real device run of the ENTIRE onboarding flow — welcome through to a real daily card, for a brand-new account this rebuild has never actually tested end-to-end before.

- [ ] **Step 1: Run the full test suite and type check one more time**

Run: `cd deadpoint-rn && npx jest && npx tsc --noEmit`
Expected: 127 tests, `tsc` clean.

- [ ] **Step 2: Verify live on a real device**

```bash
cd deadpoint-rn && export LANG=en_US.UTF-8 && export LC_ALL=en_US.UTF-8 && npx expo run:ios --device "iPhone 17"
```

This needs a genuinely fresh account to test the real new-user path — either sign in with an email that has never completed the quiz on this Supabase project before, or (if reusing a test account) manually delete its `profiles` row first so `quizCompletedAt` is null again. Exercise, in order:

1. Fresh install (or `hasSeenWelcome` cleared) shows the Welcome screen; GET STARTED moves to sign-in.
2. Sign in with a real email; confirm the OTP flow (send code, resend cooldown counts down, wrong code shows the specific 403 copy, correct code signs in).
3. A never-quizzed account lands on the quiz. Complete the STANDARD branch once (pick bouldering/beginner, skip the optional steps, confirm the summary shows "Bouldering — Beginner" and the right day count) — confirm it lands on the tutorial afterward, not the card directly.
4. Walk through all 10 tutorial steps in order: confirm each spotlight hole actually surrounds the right real control, each REQUIRES a real tap/swipe on that control (not the caption's own "next" — there is no such button except SKIP), the full-screen swipe step (`sessionDots`) has no mask and responds to an actual swipe, and finishing step 10 shows the outro card, then GET STARTED lands on the real daily card (Phase 0-4's own, unmodified).
5. Confirm the account now goes straight to the daily card on a fresh app restart (both `quizCompletedAt` and `tutorialCompletedAt` are set, matches the "no re-onboarding" expectation).
6. Sign out, sign back in with `oscar@sullivanltd.co.uk` (a built-in account) — confirm it skips the quiz entirely; if this device has never seen the built-in tutorial for this email, confirm it still shows the tutorial once, then goes straight to the card on the next launch.
7. Test the REHAB branch once with a fresh account: choose Rehab at step 0, pick an injury area and starting point, confirm the summary text matches the chosen starting point, confirm completing it lands on the "Rehab track is coming soon" screen (not a crash, not the standard card).
8. Confirm `/paywall` renders correctly if navigated to directly (e.g. temporarily via a manual `router.push('/paywall')` in a scratch edit, reverted after) but is never reached through normal use.

Fix anything genuinely broken before proceeding, following this project's established live-debugging method (reproduce via a real tap, read the full error from LogBox when available, re-verify with both `npx jest`/`npx tsc --noEmit` and a fresh device run — a full `expo run:ios` restart, not just `simctl terminate`/`launch`).

- [ ] **Step 3: Commit any live-verification fixes**

```bash
cd deadpoint-rn && git add -A
git commit -m "fix(onboarding): live-device fixes from Task 12 verification"
```
(Only if fixes were actually needed — if the whole flow works cleanly first try, there is nothing to commit here.)

---

## Self-Review

**Spec coverage:** Welcome (Task 1), sign-in (Task 2), quiz both branches (Tasks 3-5), tutorial spotlight system (Tasks 6-7), tutorial-target wiring into existing components (Task 8), the real tutorial screen (Task 9), paywall built-not-gating (Task 10), root routing (Task 11), live verification (Task 12) — every section of `docs/superpowers/specs/2026-08-31-phase-5-onboarding-design.md` has a task.

**Placeholder scan:** the two flagged spots (Task 5's `require(...)` workaround, Task 9's `setState`-in-render placeholder) are each called out explicitly with the exact real fix to apply while implementing, not left as an actual TBD in the shipped code — both are plan-authoring artifacts from composing this document, named and resolved rather than silently shipped.

**Type consistency:** `QuizAnswers`/`QuizResult`/`RehabInjuryArea`/`RehabStartingPoint` (Task 3) are defined once and consumed by name in Tasks 4-5 and 11. `TutorialStep`/`useTutorialController`'s return shape (Task 7) matches what Task 9 destructures exactly. `RouteInputs`/`Route` (Task 11) are the single source of truth for every gating decision, tested exhaustively in Task 11's own suite before `app/index.tsx` ever calls the real function.

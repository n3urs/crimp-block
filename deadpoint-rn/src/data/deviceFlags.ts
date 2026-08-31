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

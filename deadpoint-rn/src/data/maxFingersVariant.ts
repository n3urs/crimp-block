/** Device-local persistence for Oscar's Max Fingers lift/hangboard toggle
    (card.tsx, gated to his account only — see resolveExercises' `variant`
    param in engine/index.ts and programs.js's `xAlt`). Same reasoning and
    same keyed-by-date pattern as tickStorage.ts: keying by `today` means a
    genuinely new day always starts back on the default ('lift', i.e. the
    lifting pin/plates content that was already there before this toggle
    existed) rather than silently carrying yesterday's choice forward
    forever, while still surviving a browse-away-and-back or an app
    close/reopen on the SAME day. Only ever read/written for one account,
    so unlike tickStorage.ts there's no second key dimension for session —
    Max Fingers is the only session this toggle applies to. */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MaxFingersVariant = 'lift' | 'hangboard';

const key = (today: string): string => `maxFingersVariant:${today}`;

export async function getStoredMaxFingersVariant(today: string): Promise<MaxFingersVariant> {
  const raw = await AsyncStorage.getItem(key(today));
  return raw === 'hangboard' ? 'hangboard' : 'lift';
}

export async function setStoredMaxFingersVariant(today: string, variant: MaxFingersVariant): Promise<void> {
  await AsyncStorage.setItem(key(today), variant);
}

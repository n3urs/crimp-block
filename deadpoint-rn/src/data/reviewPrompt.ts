// src/data/reviewPrompt.ts
/** In-app rating prompt. shouldAskForReview is the pure rule (tested);
    maybeAskForReview is the thin wiring around the OS's own review sheet.

    Called right after a session is logged: a moment the user just felt
    good about. Nothing is offered in return for rating (App Store
    guideline 3.2.2(x)), and the OS additionally rate-limits the sheet, so
    a call here can silently show nothing — that's expected. Any failure
    is swallowed: a broken rating prompt must never break logging. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

export const MIN_LOGGED_DAYS = 6;
export const MIN_GAP_DAYS = 90;
const DAY_MS = 86_400_000;
const KEY = 'reviewPromptedAt';
/** Let the "logged" celebration finish before covering it with a sheet. */
const DELAY_MS = 2500;

export function shouldAskForReview(loggedDays: number, lastAskedAtMs: number | null, nowMs: number): boolean {
  if (loggedDays < MIN_LOGGED_DAYS) return false;
  if (lastAskedAtMs == null) return true;
  const sinceMs = nowMs - lastAskedAtMs;
  return sinceMs < 0 || sinceMs >= MIN_GAP_DAYS * DAY_MS;
}

export async function maybeAskForReview(loggedDays: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const last = raw == null ? null : Number.parseInt(raw, 10);
    const now = Date.now();
    if (!shouldAskForReview(loggedDays, Number.isFinite(last) ? last : null, now)) return;
    if (!(await StoreReview.isAvailableAsync())) return;
    await AsyncStorage.setItem(KEY, String(now));
    setTimeout(() => { StoreReview.requestReview().catch(() => {}); }, DELAY_MS);
  } catch {
    // best effort — see the header comment
  }
}

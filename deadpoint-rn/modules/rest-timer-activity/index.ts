import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

const NativeModule = Platform.OS === 'ios' ? requireNativeModule('RestTimerActivity') : null;

// Both calls are wrapped defensively — unlike every other side effect in
// useRestTimer.ts (the notification calls are all `.catch()`'d), a throw
// from this native module had no handler anywhere on the call path, so it
// would surface as an uncaught JS exception. React Native treats an
// uncaught exception as fatal in production and crashes the app for it —
// exactly the shape of the "tab back into the app after the timer fires,
// it crashes" report, though the actual JS error text isn't captured
// anywhere (no crash-reporting SDK, and the native crash log doesn't carry
// it) so this couldn't be confirmed as THE root cause, only ruled in as a
// real gap worth closing regardless.
export function startRestActivity(secs: number, label: string, colour: string): void {
  try {
    NativeModule?.startRestActivity(secs, label, colour);
  } catch (e) {
    console.error('startRestActivity failed:', e);
  }
}

export function endRestActivity(cancelNotification: boolean): void {
  try {
    NativeModule?.endRestActivity(cancelNotification);
  } catch (e) {
    console.error('endRestActivity failed:', e);
  }
}

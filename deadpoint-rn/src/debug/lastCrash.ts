// src/debug/lastCrash.ts
/** Temporary diagnostic for the "crash on tabbing back into the app after
    the rest timer fires" report: this app has no crash-reporting SDK
    wired in, and the native .ips crash log React Native produces for an
    uncaught-JS-exception fatal never carries the actual JS message/stack
    (confirmed against 4 real device crash logs) — only that
    RCTExceptionsManager reported one. This wraps RN's own global error
    handler to persist the last FATAL error's text to AsyncStorage before
    delegating to the original handler unchanged, so RN's normal
    production behaviour (crash) still happens exactly as before. On the
    next launch, if a crash was recorded, it's surfaced via Alert (long-
    press to copy) and cleared. Remove once the underlying bug is found. */
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lastFatalJsError';

const errorUtils = (global as { ErrorUtils?: { setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void; getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void } }).ErrorUtils;

if (__DEV__ && errorUtils) {
  const original = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      const e = error as { message?: string; stack?: string } | undefined;
      const text = `${e?.message ?? String(error)}\n\n${e?.stack ?? ''}`;
      AsyncStorage.setItem(KEY, text).catch(() => {});
    }
    original(error, isFatal);
  });
}

if (__DEV__) {
  AsyncStorage.getItem(KEY)
    .then((text) => {
      if (!text) return;
      AsyncStorage.removeItem(KEY).catch(() => {});
      Alert.alert('Last crash (debug)', text);
    })
    .catch(() => {});
}

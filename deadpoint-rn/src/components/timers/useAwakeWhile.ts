// src/components/timers/useAwakeWhile.ts
/** Keeps the screen on while `active` is true and releases it the moment it
    isn't (or the screen unmounts). Each caller passes its own `tag`, so two
    things wanting the screen on at once don't cancel each other out.

    Added after a repeaters user on Android had the screen switch off
    mid-set: nothing in the app held it awake while a timer ran (Android's
    screen timeout is often as short as 30s, and a set outlasts that).
    Failures are swallowed on purpose — a device that refuses the request
    just falls back to its normal screen timeout, which is the old behaviour
    and must never break a timer. Thin wiring, untested like the other
    native-wrapper hooks here; the rule for WHEN (holdsScreenAwake) is the
    tested part. */
import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export function useAwakeWhile(active: boolean, tag: string): void {
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(tag).catch(() => {});
    return () => { deactivateKeepAwake(tag).catch(() => {}); };
  }, [active, tag]);
}

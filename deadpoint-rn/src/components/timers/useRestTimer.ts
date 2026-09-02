/** Thin wrapper around a countdown + the .go completion tone + a local
    "Rest over" notification + the rest-timer Live Activity — direct port
    of RestTimerController.swift. Not unit tested directly (see this
    plan's Global Constraints on hooks) — verified live on device in
    Task 5/6. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Motion } from '../../design/motion';
import { play } from './tones';
import { startRestActivity, endRestActivity } from '../../../modules/rest-timer-activity';

export interface RestTimerState {
  remainingSeconds: number;
  totalSeconds: number;
  label: string;
  accent: string;
}

const NOTIFICATION_ID = 'rest-timer';
const ANDROID_CHANNEL_ID = 'rest-timer';

let didEnsurePermission = false;

/** Requested the first time a rest timer actually starts, not on cold
    launch — there's no earlier moment where asking would make sense to
    the user (matches this project's existing stance of asking for
    platform permissions only at first genuine use, e.g. Supabase auth). */
async function ensurePermission(): Promise<void> {
  if (didEnsurePermission) return;
  didEnsurePermission = true;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Rest timer',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.requestPermissionsAsync();
}

async function scheduleCompletionNotification(seconds: number, label: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title: 'Rest over', body: label, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
    },
  });
}

async function cancelCompletionNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
}

export function useRestTimer() {
  const [state, setState] = useState<RestTimerState | null>(null);
  const endMsRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current != null) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const stop = useCallback(() => {
    clearTick();
    endMsRef.current = null;
    setState(null);
    endRestActivity(true);
    cancelCompletionNotification().catch((e) => console.error('useRestTimer.stop cancel failed:', e));
  }, [clearTick]);

  const start = useCallback((seconds: number, label: string, accent: string) => {
    clearTick(); // never leave a stale timer running under a new one, matches RestTimerController.start()'s own end(cancelNotification: true) at its top
    endMsRef.current = Date.now() + seconds * 1000;
    setState({ remainingSeconds: seconds, totalSeconds: seconds, label, accent });

    ensurePermission()
      .then(() => scheduleCompletionNotification(seconds, label))
      .catch((e) => console.error('useRestTimer.start notification failed:', e));

    startRestActivity(seconds, label, accent);

    tickRef.current = setInterval(() => {
      const end = endMsRef.current;
      if (end == null) return;
      const remaining = Math.max(0, (end - Date.now()) / 1000);
      if (remaining <= 0) {
        play('go');
        clearTick();
        endMsRef.current = null;
        setState(null);
        // Natural completion — the notification already fired on its own
        // schedule, so unlike stop() above this does NOT cancel it. Same
        // reasoning applies to the Live Activity: don't cancel-notification twice.
        endRestActivity(false);
      } else {
        setState((s) => (s ? { ...s, remainingSeconds: remaining } : s));
      }
    }, Motion.restOverlayTickMs);
  }, [clearTick]);

  // Belt-and-braces cleanup if the owning screen ever unmounts mid-rest —
  // card.tsx is a persistent top-level screen today so this shouldn't
  // fire in practice, but a leaked interval is a real bug class to guard
  // against regardless, and the same goes for a Live Activity left showing
  // on the Lock Screen with nothing to clear it. An unmount is an abnormal
  // exit like stop(), not a natural completion, so cancel the notification too.
  useEffect(() => () => {
    clearTick();
    endRestActivity(true);
  }, [clearTick]);

  return { state, start, stop };
}

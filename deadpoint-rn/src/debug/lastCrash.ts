// src/debug/lastCrash.ts
/** Opt-in crash report, imported for its side effects from app/_layout.tsx.

    After a fatal JS error the record is written down before the app
    dies (crashReport.ts's installCrashRecorder — see it for why the
    order matters), and on the NEXT launch the customer is asked whether
    to email the details. Only "Send details" does anything: it opens
    their own mail app with a pre-filled message. There is no SDK and no
    automatic upload, which is what keeps this consistent with the
    privacy policy's "no analytics or crash-reporting SDKs".

    Replaces the earlier version of this file, which was a developer
    diagnostic that showed a raw stack trace in an Alert to whoever
    launched the app next — fine while chasing one bug, wrong in front of
    a paying customer, and it shipped in every store build. */
import { Alert, Linking, Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { buildCrashReportShareText, buildCrashReportUrl, installCrashRecorder, parseCrashRecord } from './crashReport';

const KEY = 'lastFatalJsError';

const errorUtils = (global as {
  ErrorUtils?: Parameters<typeof installCrashRecorder>[0];
}).ErrorUtils;

if (errorUtils) {
  installCrashRecorder(errorUtils, (record) => AsyncStorage.setItem(KEY, JSON.stringify(record)));
}

AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return;
    // Cleared before asking, not after answering: one crash gets one
    // prompt, even if the app is killed again with the alert still up.
    AsyncStorage.removeItem(KEY).catch(() => {});
    const record = parseCrashRecord(raw);
    const ctx = {
      appVersion: Application.nativeApplicationVersion ?? 'unknown',
      build: Application.nativeBuildVersion ?? 'unknown',
      os: `${Platform.OS} ${Platform.Version}`,
    };
    Alert.alert(
      'Deadpoint closed unexpectedly',
      'Want to email the details so it can be fixed? Nothing is sent unless you tap Send — it opens a pre-filled email you can read first.',
      [
        { text: 'No thanks', style: 'cancel' },
        {
          text: 'Send details',
          onPress: () => {
            // Falls back to the share sheet when there's no mail app to
            // open — otherwise this button would silently do nothing on
            // a phone where Mail has been removed and nothing replaced it.
            Linking.openURL(buildCrashReportUrl(record, ctx)).catch(() => {
              Share.share({ message: buildCrashReportShareText(record, ctx) })
                .catch((e) => console.error('crash report: could not share:', e));
            });
          },
        },
      ],
    );
  })
  .catch(() => {});

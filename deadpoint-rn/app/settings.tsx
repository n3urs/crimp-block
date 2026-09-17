// app/settings.tsx
/** Direct port of SettingsView.swift — the gear-icon sheet consolidating
    account, training-track, help, and exercise-tracking preferences.
    Reached via router.push('/settings') from card.tsx's gear icon and
    registered in app/_layout.tsx with `presentation: 'modal'`, the same
    pattern as day-picker.tsx/weight-edit.tsx/calendar.tsx. Like
    day-picker.tsx, this screen resolves its OWN session/profile,
    independent of card.tsx's — it must not assume it shares React state
    with the screen that pushed it. Unlike day-picker.tsx it needs no
    store/engine/PROGRAMS at all: nothing here touches session-log data.

    Account deletion (SettingsView.swift's DELETE ACCOUNT row) is ported:
    the ACCOUNT section below has a destructive DELETE ACCOUNT control
    backed by the `delete-account` Supabase Edge Function
    (supabase/functions/delete-account/index.ts), confirmed via
    Alert.alert the same way DailyCard.tsx confirms its own two dialogs —
    required for App Store review, Guideline 5.1.1(v) (account creation
    without in-app account deletion is a guaranteed rejection). */
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Purchases from 'react-native-purchases';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useProfile, type ProfileRow } from '../src/data/useProfile';
import { usePrefs, setSetsCounterEnabled, setAutoStartRestOnTally } from '../src/data/prefs';
import { SettingsGroup, SettingsRow } from '../src/components/settings/SettingsList';
import { useEntitlement } from '../src/data/subscription';
import { isBuiltInProgram } from '../src/routing/computeRoute';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '../src/data/legal';
import { TEMPLATE_META, REHAB_META, DISCIPLINE_LABELS, EXPERIENCE_LABELS, parseTemplateId } from '../src/screens/quiz/quizModel';

// Swift hardcodes this same array inline (SettingsView.swift:240) rather
// than sharing a constant elsewhere in the codebase — matched here rather
// than inventing a new shared export for one caller.
const PHASE_NAMES = ['Tissue Unload', 'Mobility', 'Strength', 'Return to Climbing'];

/** Port of SettingsView.swift's `trackSummaryText` computed property
    (SettingsView.swift:236-247). */
function trackSummaryText(row: ProfileRow): string {
  if (row.trackType === 'rehab') {
    const areaName = REHAB_META[row.rehabInjuryArea ?? '']?.name ?? row.rehabInjuryArea ?? 'Rehab';
    const phaseName = PHASE_NAMES[row.rehabPhaseIndex ?? 0] ?? PHASE_NAMES[0];
    return `Rehab — ${areaName}, ${phaseName}`;
  }
  const name = TEMPLATE_META[row.assignedTemplateId ?? '']?.name ?? row.assignedTemplateId ?? 'Standard';
  return `Standard — ${name}`;
}

/** One-line summary for the new PREFERENCES section below — the same
    "discipline, experience, days/week" shape StandardSummaryStep shows
    at the end of the quiz, condensed to a single row. Null for a rehab-
    only account (no standard template ever assigned): Preferences is
    still reachable there (this screen doesn't gate it on trackType —
    see the section's own doc comment), but there's nothing real to
    summarize yet, so the row just invites setting preferences instead
    of showing a fake "Bouldering — Intermediate" default no one chose. */
function preferencesSummaryText(row: ProfileRow): string | null {
  if (row.assignedTemplateId == null) return null;
  const parsed = parseTemplateId(row.assignedTemplateId);
  if (parsed == null) return null;
  const days = row.modifiers.daysPerWeek;
  const daysPart = typeof days === 'number' ? `, ${days} days/week` : '';
  return `${DISCIPLINE_LABELS[parsed.discipline]} — ${EXPERIENCE_LABELS[parsed.experienceLevel]}${daysPart}`;
}

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut, deleteAccount } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);
  const prefs = usePrefs();
  const entitlement = useEntitlement();

  // Mirrors day-picker.tsx's own busy/error pattern exactly — shared by
  // the one async action this screen performs (RESTORE INSTANTLY).
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error` above: that one renders inside TRAINING TRACK's
  // own body, gated on `row != null`. Sharing it would mean a delete
  // failure could render twice (once where it belongs, once under a
  // section it has nothing to do with) or not at all when `row` is null —
  // this renders only in ACCOUNT, right below the control it belongs to.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onSignOut = async () => {
    // Final-review Fix 1 (Critical): this screen is reached via
    // router.push('/settings') from card.tsx — the stack is
    // [(main)/card, settings] by the time this runs, breaking every gate
    // screen's own "never push, stack never grows past depth 1" invariant
    // (see app/index.tsx's top doc comment). Without unwinding first,
    // router.replace('/') below only replaces the TOP entry (settings),
    // leaving stack [(main)/card, index]; index's own gate then replaces
    // ITSELF with /sign-in for a signed-out session, leaving
    // [(main)/card, sign-in] — a stale, still-fully-functional card screen
    // one back-swipe away, and card.tsx has no signed-out guard of its own
    // (it falls back to PROGRAMS[''] ?? PROGRAMS.default rather than
    // redirecting). dismissAll() pops back to the single screen that
    // pushed this modal (whatever it is — matches this screen's own "must
    // not assume it shares state with its caller" doc comment above,
    // rather than hardcoding '/card' as the pushed-from href) BEFORE
    // sign-out runs, so nothing stale survives underneath.
    router.dismissAll();
    // Same pattern as quiz.tsx's own onCancel: a failed sign-out still
    // sends the user back to '/' rather than stranding them here.
    try { await signOut(); } catch (e) { console.error('settings onSignOut failed:', e); }
    router.replace('/');
  };

  // Matches the existing Alert.alert confirmation shape from
  // DailyCard.tsx (cancel + one named action button, no new dialog style)
  // rather than a custom modal — this is destructive and irreversible, so
  // the copy says so plainly and there is no "default" button a mis-tap
  // could land on: Cancel and Delete Account are the only two options,
  // and only the destructive one calls deleteAccount().
  const onDeleteAccount = () => {
    Alert.alert(
      'Delete Account?',
      'This permanently deletes your account and all training history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setDeleteError(null);
            try {
              await deleteAccount();
              // Same stack-unwind requirement as onSignOut above:
              // deleteAccount() ends in a signed-out session too, so this
              // must dismiss back to the single screen this modal was
              // pushed from BEFORE navigating, or a stale card screen
              // survives underneath — see onSignOut's own doc comment for
              // the full mechanics.
              router.dismissAll();
              router.replace('/');
            } catch (e: any) {
              // The exact failure mode an App Store reviewer will hit if
              // this silently did nothing — a real message, not just a
              // console.error, and the screen stays put so it's visible.
              setDeleteError(`Couldn't delete account: ${e?.message ?? 'something went wrong'}`);
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const onReplayTutorial = () => {
    // Final-review Fix 2 (Critical, same root cause as Fix 1): tutorial.tsx's
    // only other real caller (app/index.tsx) reaches it via
    // router.replace(route) off its own single-entry stack, so tutorial's
    // own completion-path router.replace('/') always lands back on a clean
    // depth-1 stack. Pushing straight to /tutorial from here instead left
    // [(main)/card, settings, tutorial]; tutorial's replace('/') then only
    // replaced itself, orphaning the modal `settings` mid-stack. Match the
    // real call site's shape: dismiss back to the single screen this modal
    // was pushed from, then replace it with /tutorial, so tutorial starts
    // from — and its own replace('/') lands back on — a genuine depth-1
    // stack, same as every other real entry into it.
    router.dismissAll();
    router.replace('/tutorial');
  };

  // Subscribers go to the store's own manage/cancel screen; everyone else
  // sees the plans. Built-in accounts aren't customers, so the row is hidden
  // for them below.
  const onSubscription = () => {
    if (!entitlement.hasActiveSubscription) {
      router.push({ pathname: '/paywall', params: { from: 'settings' } });
    } else if (Platform.OS === 'ios') {
      Purchases.showManageSubscriptions().catch((e) => console.error('settings: showManageSubscriptions failed:', e));
    } else {
      Linking.openURL('https://play.google.com/store/account/subscriptions?package=uk.co.sullivanltd.deadpoint')
        .catch((e) => console.error('settings: opening Play subscriptions failed:', e));
    }
  };

  const onRestoreStandard = async () => {
    setBusy(true);
    setError(null);
    try {
      await profile.switchToStandard();
      await profile.reload();
      router.back();
    } catch (e: any) {
      setError(`Couldn't restore: ${e?.message ?? 'something went wrong'}`);
      setBusy(false);
    }
  };

  const row = profile.row;
  const restoreName = row?.assignedTemplateId != null
    ? TEMPLATE_META[row.assignedTemplateId]?.name ?? row.assignedTemplateId
    : null;

  const prefsSummary = row != null ? preferencesSummaryText(row) : null;
  const gorse = resolveColour('--gorse');
  const tidepool = resolveColour('--tidepool');
  const slate = resolveColour('--slate');

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 32 + insets.bottom }]}>
        {/* Final-review Fix 3 (Critical root cause, addressed by removal):
            SWITCH TRACK used to push /quiz from TRAINING. quiz.tsx's
            onCancel is `await signOut(); router.replace('/')` — correct for
            first-time onboarding, wrong for an already-signed-in user
            reached via Settings, who'd be silently signed out by the quiz's
            own CANCEL button. Bring SWITCH TRACK back only once that is
            fixed. RESTORE INSTANTLY is unaffected: it never touches /quiz.

            PREFERENCES isn't gated on row.trackType: a rehab-only account
            has never been asked any of these, and opening the editor there
            is a real first assignment (see preferencesSummaryText). */}
        {email != null && !isBuiltInProgram(email) && (
          <SettingsGroup title="SUBSCRIPTION">
            <SettingsRow
              icon="card"
              tint={gorse}
              title="Deadpoint Standard"
              subtitle={entitlement.hasActiveSubscription ? 'Active · manage or cancel' : 'View plans and pricing'}
              trailing="chevron"
              onPress={onSubscription}
              accessibilityLabel={entitlement.hasActiveSubscription ? 'Manage subscription' : 'View subscription plans'}
            />
          </SettingsGroup>
        )}

        {row != null && (
          <SettingsGroup
            title="TRAINING"
            footer={
              <>
                {error != null && <Text style={styles.error}>{error}</Text>}
                <Text style={styles.footnote}>Changing preferences never resets your progress.</Text>
              </>
            }
          >
            <SettingsRow icon="target" tint={tidepool} title="Training track" subtitle={trackSummaryText(row)} />
            {row.trackType === 'rehab' && restoreName != null && (
              <SettingsRow
                icon="restore"
                tint={tidepool}
                title={`Restore “${restoreName}”`}
                subtitle="Switch back to your standard plan instantly"
                trailing="chevron"
                onPress={onRestoreStandard}
                disabled={busy}
                accessibilityLabel={`Restore ${restoreName} instantly`}
              />
            )}
            <SettingsRow
              icon="sliders"
              tint={tidepool}
              title="Preferences"
              subtitle={prefsSummary ?? 'Days, equipment, weaknesses and injuries'}
              trailing="chevron"
              onPress={() => router.push('/preferences-edit')}
              accessibilityLabel="Edit preferences"
            />
          </SettingsGroup>
        )}

        <SettingsGroup title="EXERCISE TRACKING">
          <SettingsRow
            icon="hash"
            tint={slate}
            title="Sets counter"
            subtitle="Tap through a tally of sets. Only on exercises with a clear set count."
            trailing={
              <Switch
                value={prefs.setsCounterEnabled}
                // The setters return AsyncStorage's Promise — handled here so a
                // failed write isn't an unhandled rejection.
                onValueChange={(v) => { setSetsCounterEnabled(v).catch((e) => console.error('settings: setSetsCounterEnabled failed:', e)); }}
                trackColor={{ false: Colours.s3, true: gorse }}
                accessibilityLabel="Sets counter"
              />
            }
          />
          {prefs.setsCounterEnabled && (
            <SettingsRow
              icon="clock"
              tint={slate}
              title="Auto-start rest timer"
              subtitle="Each tally tap also starts that exercise's rest timer."
              trailing={
                <Switch
                  value={prefs.autoStartRestOnTally}
                  onValueChange={(v) => { setAutoStartRestOnTally(v).catch((e) => console.error('settings: setAutoStartRestOnTally failed:', e)); }}
                  trackColor={{ false: Colours.s3, true: gorse }}
                  accessibilityLabel="Auto-start rest timer"
                />
              }
            />
          )}
        </SettingsGroup>

        <SettingsGroup title="TOOLS">
          <SettingsRow
            icon="activity"
            tint={gorse}
            title="Force gauge"
            subtitle="Live force, peak and graph over Bluetooth"
            trailing="chevron"
            onPress={() => router.push('/force-gauge')}
            accessibilityLabel="Connect to force gauge"
          />
          <SettingsRow
            icon="hangboard"
            tint={gorse}
            title="No-hang routine"
            subtitle="Emil's 10-minute daily follow-along"
            trailing="chevron"
            onPress={() => router.push('/no-hang')}
            accessibilityLabel="Open the no-hang routine"
          />
        </SettingsGroup>

        <SettingsGroup title="HELP & LEGAL">
          <SettingsRow
            icon="play"
            tint={Colours.dim}
            title="Replay tutorial"
            subtitle="The daily card walkthrough, from the start"
            trailing="chevron"
            onPress={onReplayTutorial}
          />
          <SettingsRow
            icon="shield"
            tint={Colours.dim}
            title="Privacy policy"
            trailing="external"
            accessibilityRole="link"
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch((e) => console.error('settings: opening privacy policy failed:', e))}
          />
          <SettingsRow
            icon="file"
            tint={Colours.dim}
            title="Terms of use"
            trailing="external"
            accessibilityRole="link"
            onPress={() => Linking.openURL(TERMS_OF_USE_URL).catch((e) => console.error('settings: opening terms of use failed:', e))}
          />
        </SettingsGroup>

        {email != null && (
          <SettingsGroup
            title="ACCOUNT"
            footer={deleteError != null ? <Text style={styles.error}>{deleteError}</Text> : undefined}
          >
            <SettingsRow icon="mail" tint={Colours.dim} title={email} subtitle="Signed in" />
            <SettingsRow icon="logout" tint={Colours.restC} title="Sign out" destructive onPress={onSignOut} />
            <SettingsRow
              icon="trash"
              tint={Colours.restC}
              title="Delete account"
              subtitle="Permanently removes your account and training history"
              destructive
              onPress={onDeleteAccount}
              disabled={busy}
            />
          </SettingsGroup>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  list: { padding: 20, paddingTop: 4, gap: 28 },
  footnote: { fontSize: 12, color: Colours.dim, paddingHorizontal: 4 },
  error: { fontSize: 12, color: Colours.restC, paddingHorizontal: 4 },
});

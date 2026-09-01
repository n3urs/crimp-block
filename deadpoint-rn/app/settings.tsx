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

    Account deletion is explicitly out of scope for this port (see the
    task brief, and the existing `// TODO(Phase 7)` precedent on the
    Paywall screen) — no Supabase Edge Function for account deletion
    exists anywhere in this project. Only email + SIGN OUT survive from
    Swift's ACCOUNT section; DELETE ACCOUNT and its confirmation dialog
    are deliberately not ported. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useProfile, type ProfileRow } from '../src/data/useProfile';
import { usePrefs, setSetsCounterEnabled, setAutoStartRestOnTally } from '../src/data/prefs';
import { TEMPLATE_META, REHAB_META } from '../src/screens/quiz/quizModel';

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

/** Port of Swift's `section(_:content:)` helper — an all-caps faint
    title above a rounded, `Colours.s1`-backed content box. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** Port of Swift's `toggleRow(title:subtitle:isOn:)` helper. */
function ToggleRow({
  title, subtitle, value, onValueChange,
}: {
  title: string; subtitle: string; value: boolean; onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleRowHeader}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: Colours.s3, true: resolveColour('--gorse') }}
        />
      </View>
      <Text style={styles.toggleSubtitle}>{subtitle}</Text>
    </View>
  );
}

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);
  const prefs = usePrefs();

  // Mirrors day-picker.tsx's own busy/error pattern exactly — shared by
  // the one async action this screen performs (RESTORE INSTANTLY).
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 20 + insets.bottom }]}>
        {email != null && (
          <Section title="ACCOUNT">
            <View style={styles.accountBody}>
              <Text style={styles.accountEmail}>{email}</Text>
              <Pressable onPress={onSignOut} accessibilityRole="button" accessibilityLabel="Sign out">
                <Text style={styles.signOutText}>SIGN OUT</Text>
              </Pressable>
            </View>
          </Section>
        )}

        {row != null && (
          <Section title="TRAINING TRACK">
            <View style={styles.trackBody}>
              <Text style={styles.trackSummary}>{trackSummaryText(row)}</Text>
              {/* Final-review Fix 3 (Critical root cause, addressed by
                  removal): SWITCH TRACK used to push /quiz here. Two
                  separate real bugs, found together, need fixing together
                  before this comes back:
                  1) quiz.tsx's onCancel is `await signOut(); router.replace
                     ('/')` — correct for its ONLY other caller (first-time
                     onboarding, no real account to sign out of yet), but
                     wrong here: an already-signed-in user reached via
                     Settings who taps the quiz's own visible CANCEL button
                     (rendered on every step — see QuizChrome.tsx's
                     QuizHeader) gets silently signed out.
                  2) Even on success it did nothing visible: card.tsx picks
                     its program via `PROGRAMS[email] ?? PROGRAMS.default`
                     and never reads `row.trackType`/`row.assignedTemplateId`
                     at all, so completing the quiz from here changed
                     nothing the user could see.
                  Same "never show a control that does nothing" principle
                  this screen's own (unported) DELETE ACCOUNT section
                  followed in Swift. Tracked as a real follow-up, not a
                  silent deletion — bring this back only once both (1) and
                  (2) are actually fixed. RESTORE INSTANTLY below is
                  unaffected: it never touches /quiz, and its own visible
                  effect (escaping the /rehab-coming-soon routing gate —
                  see src/routing/computeRoute.ts) is real regardless of
                  card.tsx's own indifference to trackType. */}
              {row.trackType === 'rehab' && restoreName != null && (
                <Pressable
                  onPress={onRestoreStandard}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${restoreName} instantly`}
                >
                  <Text style={styles.restoreAction}>RESTORE “{restoreName}” INSTANTLY</Text>
                </Pressable>
              )}
              {error != null && <Text style={styles.error}>{error}</Text>}
            </View>
          </Section>
        )}

        <Section title="HELP">
          <View style={styles.helpBody}>
            <Pressable
              onPress={onReplayTutorial}
              accessibilityRole="button"
              accessibilityLabel="Replay tutorial"
            >
              <Text style={styles.helpAction}>REPLAY TUTORIAL</Text>
            </Pressable>
            <Text style={styles.helpSubtitle}>The walkthrough of the daily card, from the beginning.</Text>
          </View>
        </Section>

        <Section title="EXERCISE TRACKING">
          <View style={styles.exerciseBody}>
            <ToggleRow
              title="SETS COUNTER"
              subtitle="Tap through a tally of sets on each exercise, instead of ticking it off all at once. Only shows up where the set count is unambiguous in the prescription text."
              value={prefs.setsCounterEnabled}
              onValueChange={(v) => {
                // Fix 4 (minor): setSetsCounterEnabled/setAutoStartRestOnTally
                // return a Promise (the underlying AsyncStorage.setItem call)
                // — passing the setter directly as onValueChange discarded
                // it, so a rejected write was an unhandled rejection with the
                // UI already diverged from storage. Matches the house
                // .catch(console.error(...)) pattern (useSession.ts,
                // useProfile.ts, app/index.tsx).
                setSetsCounterEnabled(v).catch((e) => console.error('settings: setSetsCounterEnabled failed:', e));
              }}
            />
            {prefs.setsCounterEnabled && (
              <>
                <View style={styles.toggleDivider} />
                <ToggleRow
                  title="AUTO-START REST TIMER"
                  subtitle="Every tally tap also starts that exercise's rest timer, so you don't have to tap Rest separately."
                  value={prefs.autoStartRestOnTally}
                  onValueChange={(v) => {
                    setAutoStartRestOnTally(v).catch((e) => console.error('settings: setAutoStartRestOnTally failed:', e));
                  }}
                />
              </>
            )}
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  list: { padding: 20, paddingTop: 0, gap: 28 },

  section: { gap: 12 },
  sectionTitle: { ...Fonts.mono(11, 'bold'), color: Colours.faint, letterSpacing: 1.2 },
  sectionBody: { padding: 16, borderRadius: 10, backgroundColor: Colours.s1 },

  accountBody: { gap: 14 },
  accountEmail: { ...Fonts.mono(13, 'medium'), color: Colours.dim },
  signOutText: { ...Fonts.mono(12, 'bold'), color: Colours.restC },

  trackBody: { gap: 14 },
  trackSummary: { fontSize: 14, fontWeight: '600', color: Colours.fg },
  restoreAction: { ...Fonts.mono(11, 'medium'), color: Colours.faint },

  helpBody: { gap: 6 },
  helpAction: { ...Fonts.mono(12, 'bold'), color: Colours.fg },
  helpSubtitle: { fontSize: 11, color: Colours.faint },

  exerciseBody: { gap: 18 },
  // Fix 5 (minor): matches SettingsView.swift's EXERCISE TRACKING section
  // (`Rectangle().fill(SessionColours.s3).frame(height: 1)`, drawn between
  // SETS COUNTER and AUTO-START REST TIMER when both are visible) — same
  // `{ height: 1, backgroundColor: <colour> }` shape already used for every
  // other divider in this codebase (DailyCard.tsx, StatsPanel.tsx,
  // LoggedStamp.tsx), just with Colours.s3 as Swift's own choice for this
  // specific section.
  toggleDivider: { height: 1, backgroundColor: Colours.s3 },
  toggleRow: { gap: 6 },
  toggleRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: Colours.fg },
  toggleSubtitle: { fontSize: 12, color: Colours.faint },

  error: { fontSize: 11, color: Colours.restC },
});

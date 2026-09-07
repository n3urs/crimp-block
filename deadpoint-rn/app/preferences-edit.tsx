// app/preferences-edit.tsx
/** Lets an already-onboarded standard-track user change any of their
    original quiz answers — discipline, experience level, equipment,
    weaknesses, injury flags, days/week, trip date — without redoing the
    quiz or resetting anything. Reached via router.push('/preferences-edit')
    from settings.tsx's new PREFERENCES section, registered in
    app/_layout.tsx with `presentation: 'modal'`, same pattern as every
    other pushed screen here (day-picker.tsx/weight-edit.tsx/settings.tsx).

    Genuinely a "preferences" screen, not a second quiz: reuses the exact
    same step components app/quiz.tsx uses (DisciplineStep..TripDateStep,
    StandardSummaryStep), stacked in one scrollable page instead of a
    swiped wizard with per-step Next/Back — there's no "step X of Y"
    progression to gate here, every field already has a valid answer
    (it's being edited, not answered for the first time), so nothing
    needs a canAdvance-style guard. Each step component hardcodes its own
    "N of totalSteps" eyebrow text internally (see StandardSteps.tsx) in
    exactly this same 1-7 order, so passing TOTAL_STEPS=7 and rendering
    them in that order reads correctly here too, for free.

    Saving calls useProfile's updatePreferences(), which only ever
    touches assigned_template_id/modifiers — programStartDate, trackType,
    tier, and every session already logged are completely untouched.
    resolveUserProgram.ts reads those two fields fresh every time a
    screen resolves a program, so the very next time the user opens the
    daily card, calendar, or plan screen, it already reflects whatever
    they just changed — including a full discipline switch (e.g.
    pivoting to Sport ahead of a trip), with their block/week progress
    carrying on exactly where it was, not reset to day one. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import {
  DisciplineStep, ExperienceStep, WeaknessStep, EquipmentStep, InjuryStep, DaysPerWeekStep, TripDateStep, StandardSummaryStep,
} from '../src/screens/quiz/StandardSteps';
import { templateId, parseTemplateId, modifiersPayload, type QuizAnswers } from '../src/screens/quiz/quizModel';

const TOTAL_STEPS = 7;

/** Seeds a full QuizAnswers from whatever the profile actually has —
    the mirror image of quizModel's modifiersPayload()/templateId(),
    which only ever go the other direction (answers -> stored fields).
    Falls back to sane defaults (bouldering/intermediate/3 days, nothing
    else selected) only for a profile with no template ever assigned
    (a rehab-only account that's never touched standard) — this screen
    is still reachable there (Settings doesn't gate it on trackType), and
    hitting Save in that state is a real, intentional first assignment,
    not a bug. */
function answersFromProfile(row: { assignedTemplateId: string | null; modifiers: Record<string, unknown> } | null): QuizAnswers {
  const parsed = row?.assignedTemplateId != null ? parseTemplateId(row.assignedTemplateId) : null;
  const m = row?.modifiers ?? {};
  return {
    discipline: parsed?.discipline ?? 'bouldering',
    experienceLevel: parsed?.experienceLevel ?? 'intermediate',
    weaknesses: Array.isArray(m.weaknesses) ? (m.weaknesses as QuizAnswers['weaknesses']) : [],
    equipment: Array.isArray(m.equipment) ? (m.equipment as QuizAnswers['equipment']) : [],
    injuryFlags: Array.isArray(m.injuryFlags) ? (m.injuryFlags as QuizAnswers['injuryFlags']) : [],
    daysPerWeek: typeof m.daysPerWeek === 'number' ? m.daysPerWeek : 3,
    tripDate: typeof m.tripDate === 'string' ? m.tripDate : null,
    maxFingersMethod: m.maxFingersMethod === 'hangboard' || m.maxFingersMethod === 'pickup' ? m.maxFingersMethod : null,
    priorTraining: typeof m.priorTraining === 'boolean' ? m.priorTraining : null,
  };
}

export default function PreferencesEdit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  // Seeded ONCE, from whatever the profile has when this screen mounts —
  // not kept in sync with profile.row afterwards. Same "independent,
  // doesn't assume it shares state with its caller" rule every other
  // pushed modal here follows (see day-picker.tsx's own doc comment) —
  // here it also means a background profile.reload() elsewhere can't
  // yank the form out from under someone mid-edit.
  const [answers, setAnswers] = useState<QuizAnswers>(() => answersFromProfile(profile.row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await profile.updatePreferences(templateId(answers.discipline, answers.experienceLevel), modifiersPayload(answers));
      router.back();
    } catch (e: any) {
      setError(`Couldn't save: ${e?.message ?? 'something went wrong'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <Text style={styles.headerTitle}>PREFERENCES</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>CANCEL</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <DisciplineStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />
        <ExperienceStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />
        <WeaknessStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />
        <EquipmentStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />
        <InjuryStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />
        <DaysPerWeekStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />
        <TripDateStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />
        <StandardSummaryStep answers={answers} onChange={setAnswers} totalSteps={TOTAL_STEPS} />

        {error != null && <Text style={styles.error}>{error}</Text>}

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Save preferences"
        >
          <Text style={styles.saveButtonText}>{saving ? 'SAVING…' : 'SAVE'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 12,
  },
  headerTitle: { ...Fonts.mono(13, 'bold'), color: Colours.faint, letterSpacing: 1 },
  cancel: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  content: { paddingHorizontal: 24, gap: 32 },
  error: { fontSize: 12, color: Colours.restC, textAlign: 'center' },
  saveButton: { paddingVertical: 16, borderRadius: 10, alignItems: 'center', backgroundColor: resolveColour('--gorse') },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...Fonts.mono(14, 'bold'), color: Colours.bg },
});

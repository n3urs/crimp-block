// app/quiz.tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../src/design/colours';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { QuizHeader, QuizFooter } from '../src/screens/quiz/QuizChrome';
import {
  DisciplineStep, ExperienceStep, WeaknessStep, EquipmentStep, InjuryStep, DaysPerWeekStep, TripDateStep, StandardSummaryStep,
} from '../src/screens/quiz/StandardSteps';
import { RehabAreaStep, RehabStartingPointStep, RehabSummaryStep } from '../src/screens/quiz/RehabSteps';
import { templateId, modifiersPayload, type QuizAnswers, type QuizResult, type RehabInjuryArea, type RehabStartingPoint } from '../src/screens/quiz/quizModel';

// Rehab intentionally left out for now (Oscar's call, not deleted —
// the quiz step that let someone choose it is gone, but everything
// downstream (RehabAreaStep/RehabStartingPointStep/RehabSummaryStep,
// profile.assignRehab, the rehab-coming-soon route) is untouched and
// still works if `track` is ever set back to 'rehab'; nothing in the
// UI does that anymore, so it's dormant rather than reachable.
// `track` is a plain constant rather than state for the same reason —
// there's no longer a user action that changes it.
type Track = 'standard' | 'rehab';
const track: Track = 'standard';

// 'beginner' removed from ExperienceLevel entirely (see quizModel.ts) —
// intermediate is the new floor, so that's the only sane default here.
const DEFAULT_ANSWERS: QuizAnswers = {
  discipline: 'bouldering', experienceLevel: 'intermediate',
  weaknesses: [], equipment: [], injuryFlags: [], daysPerWeek: 3, tripDate: null,
  maxFingersMethod: null, priorTraining: null,
};

export default function Quiz() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  const [answers, setAnswers] = useState<QuizAnswers>(DEFAULT_ANSWERS);
  const [rehabArea, setRehabArea] = useState<RehabInjuryArea | null>(null);
  const [rehabStartingPoint, setRehabStartingPoint] = useState<RehabStartingPoint | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Was `track === 'rehab' ? 3 : 8` — the track-choice step (formerly
  // step 0) is gone, so standard drops from 8 answerable steps to 7;
  // rehab's own 3 is untouched dead code, kept in case it comes back.
  const totalSteps = track === 'rehab' ? 3 : 7;

  // Was step===0 ? track!=null : ... — with no track-choice step left,
  // every standard step already has a valid default answer, so this
  // collapses to the rehab-only checks plus the same `true` fallback
  // the standard branch always resolved to.
  const canAdvance =
    track === 'rehab' && step === 0 ? rehabArea != null
    : track === 'rehab' && step === 1 ? rehabStartingPoint != null
    : true;

  const onCancel = async () => {
    try { await signOut(); } catch (e) { console.error('quiz onCancel signOut failed:', e); }
    router.replace('/');
  };

  const complete = async (result: QuizResult) => {
    setSubmitting(true);
    try {
      if (result.kind === 'standard') {
        const id = templateId(result.answers.discipline, result.answers.experienceLevel);
        const start = new Date();
        const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        await profile.create(id, startDate, modifiersPayload(result.answers));
      } else {
        await profile.assignRehab(result.area, result.startingPhase);
      }
      router.replace('/');
    } catch (e) {
      console.error('quiz complete failed:', e);
      setSubmitting(false);
    }
  };

  const advance = () => {
    if (!canAdvance || submitting) return;
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else if (track === 'rehab' && rehabArea != null && rehabStartingPoint != null) {
      complete({ kind: 'rehab', area: rehabArea, startingPhase: rehabStartingPoint });
    } else if (track === 'standard') {
      complete({ kind: 'standard', answers });
    }
  };

  // Track-choice step (the old step 0, "Training normally, or working
  // through an injury?") is gone — rehab is left out for now, see the
  // Track/track doc comment above. Discipline is the real first step.
  let body: React.ReactNode;
  if (track === 'rehab') {
    // Dead code today (track can't actually be 'rehab' — see above),
    // kept working and renumbered to match the removed step-0 shift so
    // it's ready to wire back up rather than needing to be re-derived.
    body = step === 0
      ? <RehabAreaStep area={rehabArea} onChange={setRehabArea} totalSteps={totalSteps} />
      : step === 1
      ? <RehabStartingPointStep startingPoint={rehabStartingPoint} onChange={setRehabStartingPoint} totalSteps={totalSteps} />
      : <RehabSummaryStep area={rehabArea} startingPoint={rehabStartingPoint} />;
  } else {
    const stepProps = { answers, onChange: setAnswers, totalSteps };
    body = step === 0 ? <DisciplineStep {...stepProps} />
      : step === 1 ? <ExperienceStep {...stepProps} />
      : step === 2 ? <WeaknessStep {...stepProps} />
      : step === 3 ? <EquipmentStep {...stepProps} />
      : step === 4 ? <InjuryStep {...stepProps} />
      : step === 5 ? <DaysPerWeekStep {...stepProps} />
      : step === 6 ? <TripDateStep {...stepProps} />
      : <StandardSummaryStep {...stepProps} />;
  }

  return (
    <View style={[styles.root, { paddingTop: 20 + insets.top, paddingBottom: 20 + insets.bottom }]}>
      <QuizHeader step={step} totalSteps={totalSteps} onCancel={onCancel} />
      <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView>
      <QuizFooter step={step} totalSteps={totalSteps} canAdvance={canAdvance && !submitting} onBack={() => setStep((s) => Math.max(0, s - 1))} onAdvance={advance} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 20 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 12 },
});

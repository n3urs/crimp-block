// app/quiz.tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../src/design/colours';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { QuizHeader, QuizFooter, StepScaffold, ChoiceCard } from '../src/screens/quiz/QuizChrome';
import {
  DisciplineStep, ExperienceStep, WeaknessStep, EquipmentStep, InjuryStep, DaysPerWeekStep, TripDateStep, StandardSummaryStep,
} from '../src/screens/quiz/StandardSteps';
import { RehabAreaStep, RehabStartingPointStep, RehabSummaryStep } from '../src/screens/quiz/RehabSteps';
import { templateId, modifiersPayload, type QuizAnswers, type QuizResult, type RehabInjuryArea, type RehabStartingPoint } from '../src/screens/quiz/quizModel';

type Track = 'standard' | 'rehab' | null;

const DEFAULT_ANSWERS: QuizAnswers = {
  discipline: 'bouldering', experienceLevel: 'beginner',
  weaknesses: [], equipment: [], injuryFlags: [], daysPerWeek: 3, tripDate: null,
};

export default function Quiz() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  const [track, setTrack] = useState<Track>(null);
  const [answers, setAnswers] = useState<QuizAnswers>(DEFAULT_ANSWERS);
  const [rehabArea, setRehabArea] = useState<RehabInjuryArea | null>(null);
  const [rehabStartingPoint, setRehabStartingPoint] = useState<RehabStartingPoint | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const totalSteps = track === 'rehab' ? 3 : 8;

  const canAdvance =
    step === 0 ? track != null
    : track === 'rehab' && step === 1 ? rehabArea != null
    : track === 'rehab' && step === 2 ? rehabStartingPoint != null
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

  let body: React.ReactNode;
  if (step === 0) {
    body = (
      <StepScaffold eyebrow="1 of 8" title="Training normally, or working through an injury?">
        <ChoiceCard label="Normal training" subtitle="A full program matched to your climbing and goals" isSelected={track === 'standard'} onPress={() => setTrack('standard')} />
        <ChoiceCard label="Rehab" subtitle="For a current injury — a shorter, phase-based track focused on getting back to climbing safely" isSelected={track === 'rehab'} onPress={() => setTrack('rehab')} />
      </StepScaffold>
    );
  } else if (track === 'rehab') {
    body = step === 1
      ? <RehabAreaStep area={rehabArea} onChange={setRehabArea} totalSteps={totalSteps} />
      : step === 2
      ? <RehabStartingPointStep startingPoint={rehabStartingPoint} onChange={setRehabStartingPoint} totalSteps={totalSteps} />
      : <RehabSummaryStep area={rehabArea} startingPoint={rehabStartingPoint} />;
  } else {
    const stepProps = { answers, onChange: setAnswers, totalSteps };
    body = step === 1 ? <DisciplineStep {...stepProps} />
      : step === 2 ? <ExperienceStep {...stepProps} />
      : step === 3 ? <WeaknessStep {...stepProps} />
      : step === 4 ? <EquipmentStep {...stepProps} />
      : step === 5 ? <InjuryStep {...stepProps} />
      : step === 6 ? <DaysPerWeekStep {...stepProps} />
      : step === 7 ? <TripDateStep {...stepProps} />
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

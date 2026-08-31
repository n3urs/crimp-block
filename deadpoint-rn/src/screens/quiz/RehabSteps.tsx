// src/screens/quiz/RehabSteps.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { StepScaffold, ChoiceCard } from './QuizChrome';
import {
  type RehabInjuryArea, type RehabStartingPoint,
  REHAB_AREA_LABELS, REHAB_AREA_SUBTITLES, REHAB_STARTING_POINT_LABELS, REHAB_STARTING_POINT_SUBTITLES, REHAB_META,
} from './quizModel';

const REHAB_AREAS: RehabInjuryArea[] = ['fingerPulley', 'elbowMedial', 'elbowLateral', 'shoulder', 'bicepsTendon', 'wristTFCC'];
const STARTING_POINTS: RehabStartingPoint[] = [0, 1, 2, 3];

export function RehabAreaStep({ area, onChange, totalSteps }: { area: RehabInjuryArea | null; onChange: (a: RehabInjuryArea) => void; totalSteps: number }) {
  return (
    <StepScaffold eyebrow={`2 of ${totalSteps}`} title="What are you rehabbing?" subtitle="General guidance built from published climbing-rehab protocols — not a diagnosis, and not a substitute for a physio.">
      {REHAB_AREAS.map((a) => (
        <ChoiceCard key={a} label={REHAB_AREA_LABELS[a]} subtitle={REHAB_AREA_SUBTITLES[a]} isSelected={area === a} onPress={() => onChange(a)} />
      ))}
    </StepScaffold>
  );
}

export function RehabStartingPointStep({ startingPoint, onChange, totalSteps }: { startingPoint: RehabStartingPoint | null; onChange: (p: RehabStartingPoint) => void; totalSteps: number }) {
  return (
    <StepScaffold eyebrow={`3 of ${totalSteps}`} title="Where are you already?" subtitle="So you don't have to start over if you've been dealing with this a while.">
      {STARTING_POINTS.map((p) => (
        <ChoiceCard key={p} label={REHAB_STARTING_POINT_LABELS[p]} subtitle={REHAB_STARTING_POINT_SUBTITLES[p]} isSelected={startingPoint === p} onPress={() => onChange(p)} />
      ))}
    </StepScaffold>
  );
}

const SUMMARY_TEXT: Record<RehabStartingPoint, string> = {
  0: "Starts at the first phase — Tissue Unload. You'll move through Mobility, Strength, and Return to Climbing as you're ready, at your own pace.",
  1: "Starts at Mobility, skipping Tissue Unload — you'll move through Strength and Return to Climbing as you're ready, at your own pace.",
  2: "Starts at Strength, skipping Unload and Mobility — you'll move through Return to Climbing as you're ready, at your own pace.",
  3: "Starts at Return to Climbing, the final phase — you're already most of the way there.",
};

export function RehabSummaryStep({ area, startingPoint }: { area: RehabInjuryArea | null; startingPoint: RehabStartingPoint | null }) {
  const meta = area != null ? REHAB_META[area] : undefined;
  return (
    <StepScaffold eyebrow="READY" title={meta?.name ?? 'Rehab'}>
      {meta != null && <Text style={styles.description}>{meta.description}</Text>}
      <Text style={styles.summaryBox}>{SUMMARY_TEXT[startingPoint ?? 0]}</Text>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: 14, color: Colours.dim, marginBottom: 14 },
  summaryBox: {
    ...Fonts.mono(13, 'medium'), color: Colours.faint,
    padding: 16, backgroundColor: Colours.s1, borderRadius: 12,
  },
});

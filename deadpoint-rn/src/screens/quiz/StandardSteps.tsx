// src/screens/quiz/StandardSteps.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { StepScaffold, ChoiceCard } from './QuizChrome';
import {
  type QuizAnswers, type Discipline, type ExperienceLevel, type Weakness, type Equipment, type InjuryFlag,
  DISCIPLINE_LABELS, EXPERIENCE_LABELS, WEAKNESS_LABELS, EQUIPMENT_LABELS, INJURY_FLAG_LABELS, INJURY_FLAG_SUBTITLES,
  gradeRange, templateId, TEMPLATE_META,
} from './quizModel';

interface StepProps { answers: QuizAnswers; onChange: (next: QuizAnswers) => void; totalSteps: number; }

function toggleIn<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function DisciplineStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`2 of ${totalSteps}`} title="What do you climb?">
      {(['bouldering', 'sport'] as Discipline[]).map((d) => (
        <ChoiceCard key={d} label={DISCIPLINE_LABELS[d]} isSelected={answers.discipline === d} onPress={() => onChange({ ...answers, discipline: d })} />
      ))}
    </StepScaffold>
  );
}

export function ExperienceStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`3 of ${totalSteps}`} title="How experienced are you?">
      {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map((level) => (
        <ChoiceCard
          key={level} label={EXPERIENCE_LABELS[level]} subtitle={gradeRange(answers.discipline, level)}
          isSelected={answers.experienceLevel === level} onPress={() => onChange({ ...answers, experienceLevel: level })}
        />
      ))}
    </StepScaffold>
  );
}

export function WeaknessStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`4 of ${totalSteps}`} title="Anything you want extra focus on?" subtitle="Optional — skip if nothing stands out.">
      {(['slopers', 'compression'] as Weakness[]).map((w) => (
        <ChoiceCard key={w} label={WEAKNESS_LABELS[w]} isSelected={answers.weaknesses.includes(w)} onPress={() => onChange({ ...answers, weaknesses: toggleIn(answers.weaknesses, w) })} />
      ))}
    </StepScaffold>
  );
}

export function EquipmentStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`5 of ${totalSteps}`} title="What do you have access to?" subtitle="Select everything that applies — this only changes which exercises show up, not the plan itself.">
      {(['hangboard', 'pullBar', 'gym', 'pickupRig'] as Equipment[]).map((e) => (
        <ChoiceCard key={e} label={EQUIPMENT_LABELS[e]} isSelected={answers.equipment.includes(e)} onPress={() => onChange({ ...answers, equipment: toggleIn(answers.equipment, e) })} />
      ))}
    </StepScaffold>
  );
}

export function InjuryStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`6 of ${totalSteps}`} title="Any injury history worth flagging?" subtitle="Optional — this adds caution notes and safety exercises, not a diagnosis. Not a substitute for real medical advice.">
      {(['fingerPulley', 'bicepTendon', 'shoulder', 'elbow'] as InjuryFlag[]).map((flag) => (
        <ChoiceCard
          key={flag} label={INJURY_FLAG_LABELS[flag]} subtitle={INJURY_FLAG_SUBTITLES[flag]}
          isSelected={answers.injuryFlags.includes(flag)} onPress={() => onChange({ ...answers, injuryFlags: toggleIn(answers.injuryFlags, flag) })}
        />
      ))}
    </StepScaffold>
  );
}

export function DaysPerWeekStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`7 of ${totalSteps}`} title="How many days a week can you train?">
      <Text style={styles.bigNumber}>{answers.daysPerWeek}</Text>
      <View style={styles.stepperRow}>
        <Pressable onPress={() => onChange({ ...answers, daysPerWeek: Math.max(2, answers.daysPerWeek - 1) })} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="Fewer days">
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <Pressable onPress={() => onChange({ ...answers, daysPerWeek: Math.min(6, answers.daysPerWeek + 1) })} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="More days">
          <Text style={styles.stepperGlyph}>+</Text>
        </Pressable>
      </View>
    </StepScaffold>
  );
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TripDateStep({ answers, onChange, totalSteps }: StepProps) {
  const wantsTripDate = answers.tripDate != null;
  return (
    <StepScaffold eyebrow={`8 of ${totalSteps}`} title="Training toward a trip?" subtitle="Optional — if you have a real date, the plan can taper toward it automatically.">
      <ChoiceCard label="No trip planned" isSelected={!wantsTripDate} onPress={() => onChange({ ...answers, tripDate: null })} />
      <ChoiceCard
        label="Yes, I have a date" isSelected={wantsTripDate}
        onPress={() => {
          if (answers.tripDate == null) {
            const d = new Date(); d.setDate(d.getDate() + 56);
            onChange({ ...answers, tripDate: isoDate(d) });
          }
        }}
      />
      {wantsTripDate && (
        <DateTimePicker
          value={answers.tripDate ? new Date(answers.tripDate) : new Date()}
          mode="date"
          onChange={(_, date) => { if (date) onChange({ ...answers, tripDate: isoDate(date) }); }}
        />
      )}
    </StepScaffold>
  );
}

function summaryRow(label: string, value: string) {
  return (
    <View key={label} style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function StandardSummaryStep({ answers }: StepProps) {
  const id = templateId(answers.discipline, answers.experienceLevel);
  const meta = TEMPLATE_META[id];
  return (
    <StepScaffold eyebrow="READY" title={meta?.name ?? id}>
      {meta != null && <Text style={styles.summaryDescription}>{meta.description}</Text>}
      <View style={styles.summaryBox}>
        {summaryRow('Days / week', String(answers.daysPerWeek))}
        {answers.weaknesses.length > 0 && summaryRow('Extra focus', answers.weaknesses.map((w) => WEAKNESS_LABELS[w]).join(', '))}
        {answers.equipment.length > 0 && summaryRow('Equipment', answers.equipment.map((e) => EQUIPMENT_LABELS[e]).join(', '))}
        {answers.injuryFlags.length > 0 && summaryRow('Flagged', answers.injuryFlags.map((f) => INJURY_FLAG_LABELS[f]).join(', '))}
        {answers.tripDate != null && summaryRow('Trip date', answers.tripDate)}
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  bigNumber: { ...Fonts.mono(64, 'bold'), fontWeight: '800', color: Colours.fg, textAlign: 'center' },
  stepperRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 24 },
  stepperButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colours.s1, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 24, fontWeight: '700', color: Colours.fg },
  summaryDescription: { fontSize: 14, color: Colours.dim, marginBottom: 14 },
  summaryBox: { backgroundColor: Colours.s1, borderRadius: 12, padding: 16, gap: 8 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryLabel: { ...Fonts.mono(10, 'bold'), color: Colours.faint, width: 100 },
  summaryValue: { fontSize: 13, color: Colours.fg, flex: 1 },
});

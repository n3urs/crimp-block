// src/screens/quiz/StandardSteps.tsx
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { StepScaffold, ChoiceCard } from './QuizChrome';
import {
  type QuizAnswers, type Discipline, type ExperienceLevel, type Weakness, type Equipment, type InjuryFlag,
  DISCIPLINE_LABELS, EXPERIENCE_LABELS, WEAKNESS_LABELS, EQUIPMENT_LABELS, INJURY_FLAG_LABELS, INJURY_FLAG_SUBTITLES,
  gradeRange, templateId, TEMPLATE_META, deriveMaxFingersMethod,
} from './quizModel';

interface StepProps { answers: QuizAnswers; onChange: (next: QuizAnswers) => void; totalSteps: number; }

function toggleIn<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function DisciplineStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`1 of ${totalSteps}`} title="What do you climb?">
      {(['bouldering', 'sport'] as Discipline[]).map((d) => (
        <ChoiceCard key={d} label={DISCIPLINE_LABELS[d]} isSelected={answers.discipline === d} onPress={() => onChange({ ...answers, discipline: d })} />
      ))}
    </StepScaffold>
  );
}

export function ExperienceStep({ answers, onChange, totalSteps }: StepProps) {
  // Switching away from intermediate clears priorTraining — the follow-up
  // below is only ever shown there (nobody reaches the advanced grade
  // bands without having trained already), so a stale answer left behind
  // after switching would just sit unused in modifiersPayload. Same
  // reasoning as EquipmentStep's pickupRig/maxFingersMethod reset.
  const onSelectLevel = (level: ExperienceLevel) => {
    onChange({ ...answers, experienceLevel: level, priorTraining: level === 'intermediate' ? answers.priorTraining : null });
  };

  return (
    <StepScaffold
      eyebrow={`2 of ${totalSteps}`} title="How experienced are you?"
      subtitle="New to climbing? Structured strength training isn't the right starting point yet — go climb a lot first, and come back to this once you've got a couple of years on the wall."
    >
      {(['intermediate', 'advanced'] as ExperienceLevel[]).map((level) => (
        <ChoiceCard
          key={level} label={EXPERIENCE_LABELS[level]} subtitle={gradeRange(answers.discipline, level)}
          isSelected={answers.experienceLevel === level} onPress={() => onSelectLevel(level)}
        />
      ))}
      {answers.experienceLevel === 'intermediate' && (
        <View style={styles.followUp}>
          <Text style={styles.followUpLabel}>DONE STRUCTURED HANGBOARD OR STRENGTH TRAINING BEFORE?</Text>
          <ChoiceCard
            label="Yes, I've trained before" subtitle="Already know what a near-max hang feels like"
            isSelected={answers.priorTraining === true}
            onPress={() => onChange({ ...answers, priorTraining: true })}
          />
          <ChoiceCard
            label="No, this is my first structured block" subtitle="The first phase eases in a bit gentler"
            isSelected={answers.priorTraining === false}
            onPress={() => onChange({ ...answers, priorTraining: false })}
          />
        </View>
      )}
    </StepScaffold>
  );
}

export function WeaknessStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`3 of ${totalSteps}`} title="Anything you want extra focus on?" subtitle="Optional — skip if nothing stands out.">
      {(['slopers', 'compression'] as Weakness[]).map((w) => (
        <ChoiceCard key={w} label={WEAKNESS_LABELS[w]} isSelected={answers.weaknesses.includes(w)} onPress={() => onChange({ ...answers, weaknesses: toggleIn(answers.weaknesses, w) })} />
      ))}
    </StepScaffold>
  );
}

export function EquipmentStep({ answers, onChange, totalSteps }: StepProps) {
  const hasPickupRig = answers.equipment.includes('pickupRig');
  const hasHangboard = answers.equipment.includes('hangboard');

  // Recomputed from the FULL resulting equipment set on every toggle
  // (not just pickupRig's own) — see deriveMaxFingersMethod's own doc
  // comment for why this needs to react to hangboard changing too, not
  // only pickupRig.
  const onToggleEquipment = (e: Equipment) => {
    const equipment = toggleIn(answers.equipment, e);
    const maxFingersMethod = deriveMaxFingersMethod(equipment, answers.maxFingersMethod);
    onChange({ ...answers, equipment, maxFingersMethod });
  };

  return (
    <StepScaffold eyebrow={`4 of ${totalSteps}`} title="What do you have access to?" subtitle="Select everything that applies — this only changes which exercises show up, not the plan itself.">
      {(['hangboard', 'pullBar', 'gym', 'pickupRig'] as Equipment[]).map((e) => (
        <ChoiceCard key={e} label={EQUIPMENT_LABELS[e]} isSelected={answers.equipment.includes(e)} onPress={() => onToggleEquipment(e)} />
      ))}
      {hasPickupRig && hasHangboard && (
        <View style={styles.followUp}>
          <Text style={styles.followUpLabel}>MAX FINGERS: HANGBOARD OR YOUR EDGE?</Text>
          <ChoiceCard
            label="Hangboard" subtitle="Static hangs — the usual way"
            isSelected={answers.maxFingersMethod === 'hangboard'}
            onPress={() => onChange({ ...answers, maxFingersMethod: 'hangboard' })}
          />
          <ChoiceCard
            label="Weighted pickups on my edge" subtitle="Dynamic lift-and-lower reps instead of a held hang"
            isSelected={answers.maxFingersMethod === 'pickup'}
            onPress={() => onChange({ ...answers, maxFingersMethod: 'pickup' })}
          />
        </View>
      )}
    </StepScaffold>
  );
}

export function InjuryStep({ answers, onChange, totalSteps }: StepProps) {
  return (
    <StepScaffold eyebrow={`5 of ${totalSteps}`} title="Any injury history worth flagging?" subtitle="Optional — this adds caution notes and safety exercises, not a diagnosis. Not a substitute for real medical advice.">
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
    <StepScaffold eyebrow={`6 of ${totalSteps}`} title="How many days a week can you train?">
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

  // On Android, DateTimePicker isn't a persistent inline widget the way it is on
  // iOS — it's an imperative one-shot dialog opener triggered from a `useEffect`
  // that depends on `value` (see the library's README, "Android imperative api").
  // Leaving it mounted unconditionally means picking a date changes `value`,
  // which re-fires that effect and reopens the dialog immediately after every
  // pick. Gating its mount behind `showPicker` — and clearing that flag as soon
  // as `onChange` fires — lets it unmount (closing the dialog) after exactly one
  // open, with a pressable date button to reopen it for later changes. iOS's
  // picker genuinely is an inline widget, so it stays mounted unconditionally
  // there, matching the original always-visible behaviour.
  const [showPicker, setShowPicker] = useState(false);
  const showInlinePicker = wantsTripDate && (Platform.OS !== 'android' || showPicker);

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'set' && date) onChange({ ...answers, tripDate: isoDate(date) });
  };

  return (
    <StepScaffold eyebrow={`7 of ${totalSteps}`} title="Training toward a trip?" subtitle="Optional — if you have a real date, the plan can taper toward it automatically.">
      <ChoiceCard
        label="No trip planned" isSelected={!wantsTripDate}
        onPress={() => { setShowPicker(false); onChange({ ...answers, tripDate: null }); }}
      />
      <ChoiceCard
        label="Yes, I have a date" isSelected={wantsTripDate}
        onPress={() => {
          if (answers.tripDate == null) {
            const d = new Date(); d.setDate(d.getDate() + 56);
            onChange({ ...answers, tripDate: isoDate(d) });
          }
          if (Platform.OS === 'android') setShowPicker(true);
        }}
      />
      {wantsTripDate && Platform.OS === 'android' && !showPicker && (
        <Pressable onPress={() => setShowPicker(true)} style={styles.dateButton} accessibilityRole="button" accessibilityLabel="Change trip date">
          <Text style={styles.dateButtonText}>{answers.tripDate}</Text>
        </Pressable>
      )}
      {showInlinePicker && <DateTimePicker value={answers.tripDate ? new Date(answers.tripDate) : new Date()} mode="date" onChange={handleDateChange} />}
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
        {answers.maxFingersMethod != null && summaryRow('Max Fingers', answers.maxFingersMethod === 'pickup' ? 'Weighted pickups on your edge' : 'Hangboard')}
        {answers.priorTraining != null && summaryRow('Trained before', answers.priorTraining ? 'Yes' : 'No — easing in')}
        {answers.injuryFlags.length > 0 && summaryRow('Flagged', answers.injuryFlags.map((f) => INJURY_FLAG_LABELS[f]).join(', '))}
        {answers.tripDate != null && summaryRow('Trip date', answers.tripDate)}
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  followUp: { marginTop: 20, gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colours.s3 },
  followUpLabel: { ...Fonts.mono(11, 'bold'), color: Colours.faint, letterSpacing: 0.6 },
  bigNumber: { ...Fonts.mono(64, 'bold'), fontWeight: '800', color: Colours.fg, textAlign: 'center' },
  dateButton: { padding: 16, borderRadius: 12, backgroundColor: Colours.s1, alignItems: 'center' },
  dateButtonText: { fontSize: 15, fontWeight: '600', color: Colours.fg },
  stepperRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 24 },
  stepperButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colours.s1, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 24, fontWeight: '700', color: Colours.fg },
  summaryDescription: { fontSize: 14, color: Colours.dim, marginBottom: 14 },
  summaryBox: { backgroundColor: Colours.s1, borderRadius: 12, padding: 16, gap: 8 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryLabel: { ...Fonts.mono(10, 'bold'), color: Colours.faint, width: 100 },
  summaryValue: { fontSize: 13, color: Colours.fg, flex: 1 },
});

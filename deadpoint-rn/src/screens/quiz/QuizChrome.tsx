// src/screens/quiz/QuizChrome.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';

export function StepScaffold({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.scaffold}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle != null && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={{ marginTop: 6 }}>{children}</View>
    </View>
  );
}

export function ChoiceCard({ label, subtitle, isSelected, onPress }: { label: string; subtitle?: string; isSelected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: isSelected ? Colours.s2 : Colours.s1 }, isSelected && styles.cardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.cardLabel}>{label}</Text>
        {subtitle != null && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      </View>
      {isSelected && <Text style={styles.checkmark}>✓</Text>}
    </Pressable>
  );
}

export function QuizHeader({ step, totalSteps, onCancel }: { step: number; totalSteps: number; onCancel?: () => void }) {
  return (
    <View style={styles.header}>
      {onCancel != null ? (
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>CANCEL</Text>
        </Pressable>
      ) : <View />}
      <View style={styles.dots}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= step ? Colours.fg : Colours.s3 }]} />
        ))}
      </View>
    </View>
  );
}

export function QuizFooter({ step, totalSteps, canAdvance, onBack, onAdvance }: { step: number; totalSteps: number; canAdvance: boolean; onBack: () => void; onAdvance: () => void }) {
  return (
    <View style={styles.footerRow}>
      {step > 0 && (
        <Pressable onPress={onBack} style={[styles.button, styles.buttonSecondary, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={[styles.buttonText, { color: Colours.dim }]}>BACK</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onAdvance}
        disabled={!canAdvance}
        style={[styles.button, { flex: 1, backgroundColor: Colours.fg }, !canAdvance && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={step === totalSteps ? 'Start training' : 'Next'}
      >
        <Text style={[styles.buttonText, { color: Colours.bg }]}>{step === totalSteps ? 'START TRAINING' : 'NEXT'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  cancel: { ...Fonts.mono(11, 'bold'), color: Colours.faint },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  scaffold: { gap: 18 },
  eyebrow: { ...Fonts.mono(11, 'bold'), color: Colours.faint, letterSpacing: 1.5 },
  title: { fontSize: 28, fontWeight: '800', color: Colours.fg },
  subtitle: { fontSize: 13, color: Colours.dim },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 12, marginBottom: 10 },
  cardSelected: { borderWidth: 1.5, borderColor: 'rgba(237,235,229,0.4)' },
  cardLabel: { fontSize: 15, fontWeight: '600', color: Colours.fg },
  cardSubtitle: { fontSize: 12, color: Colours.dim, marginTop: 3 },
  checkmark: { fontSize: 16, fontWeight: '700', color: Colours.fg },
  footerRow: { flexDirection: 'row', gap: 12, paddingBottom: 8 },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  buttonSecondary: { backgroundColor: Colours.s1 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...Fonts.mono(13, 'bold') },
});

// app/paywall.tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';

const FEATURES = [
  'Your quiz-assigned training plan',
  'Live progress and weight tracking',
  'Rest and interval timers, built in',
  'Home screen widget',
];

export default function Paywall() {
  const router = useRouter();
  const { signOut } = useSession();

  const onSignOut = async () => {
    try { await signOut(); } catch (e) { console.error('paywall onSignOut failed:', e); }
    router.replace('/');
  };

  // TODO(Phase 7): real subscription purchase — this button is
  // intentionally inert for now, since the root router never actually
  // routes anyone here yet (needsPaywall is hardcoded false — see
  // app/index.tsx). Built now so the screen is ready to wire up once
  // real IAP products exist.
  const onSubscribe = () => {};
  const onRestore = () => {};
  const onRedeemCode = () => {};

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>SIGN OUT</Text></Pressable>

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>DEADPOINT STANDARD</Text>
        <Text style={styles.title}>Your plan, every day</Text>
        <Text style={styles.price}>7 days free, then £0.99 a month. Cancel any time.</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={onSubscribe} style={styles.subscribeButton}>
        <Text style={styles.subscribeText}>START FREE TRIAL</Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Pressable onPress={onRestore}><Text style={styles.footerLink}>RESTORE PURCHASES</Text></Pressable>
        <Pressable onPress={onRedeemCode}><Text style={styles.footerLink}>HAVE A CODE?</Text></Pressable>
      </View>

      <Text style={styles.legal}>
        Payment is charged to your Apple ID after the trial ends unless cancelled at least 24 hours before it's up. Manage or cancel any time in Settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  content: { padding: 24, gap: 20 },
  signOut: { alignSelf: 'flex-end' },
  signOutText: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  heading: { gap: 10 },
  eyebrow: { ...Fonts.mono(11, 'bold'), color: Colours.faint, letterSpacing: 1.5 },
  title: { fontSize: 30, fontWeight: '800', color: Colours.fg },
  price: { fontSize: 15, color: Colours.dim },
  features: { gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkmark: { color: Colours.go, fontWeight: '700', fontSize: 12 },
  featureText: { fontSize: 14, color: Colours.dim },
  subscribeButton: { paddingVertical: 16, borderRadius: 10, alignItems: 'center', backgroundColor: Colours.fg },
  subscribeText: { ...Fonts.mono(14, 'bold'), color: Colours.bg },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  footerLink: { ...Fonts.mono(11, 'semibold'), color: Colours.dim },
  legal: { ...Fonts.mono(10, 'medium'), color: Colours.faint, textAlign: 'center' },
});

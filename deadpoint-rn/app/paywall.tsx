// app/paywall.tsx
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Purchases from 'react-native-purchases';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { purchaseStandard, restorePurchases } from '../src/data/subscription';

const FEATURES = [
  'Your quiz-assigned training plan',
  'Live progress and weight tracking',
  'Rest and interval timers, built in',
  'Home screen widget',
];

export default function Paywall() {
  const router = useRouter();
  const { signOut } = useSession();
  const [subscribing, setSubscribing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const onSignOut = async () => {
    try { await signOut(); } catch (e) { console.error('paywall onSignOut failed:', e); }
    router.replace('/');
  };

  // purchaseStandard() already swallows a user cancelling the purchase
  // sheet (resolves normally rather than throwing — see its own doc
  // comment in subscription.ts), so this doesn't need to special-case
  // that outcome: router.replace('/') just hands control back to the
  // root, which re-checks entitlement itself once Task 4 wires that
  // check up — a cancelled purchase means the root finds no entitlement
  // and lands the user right back here. Only a real error needs surfacing.
  const onSubscribe = async () => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      await purchaseStandard();
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Purchase failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        router.replace('/');
      } else {
        Alert.alert('Nothing to restore', 'No previous purchase was found for this Apple ID.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // iOS only (confirmed against node_modules/react-native-purchases/dist/
  // purchases.d.ts:690's own doc comment) and the app only ships on iOS
  // today anyway (same scope call as configureRevenueCat in
  // subscription.ts) — gated below at render time so a non-iOS build
  // never shows a control that couldn't do anything, rather than showing
  // one that silently no-ops.
  const onRedeemCode = async () => {
    try {
      await Purchases.presentCodeRedemptionSheet();
    } catch (e: any) {
      Alert.alert('Could not open code redemption', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

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

      <Pressable
        onPress={onSubscribe}
        disabled={subscribing}
        style={[styles.subscribeButton, subscribing && styles.subscribeButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Start free trial"
      >
        <Text style={styles.subscribeText}>{subscribing ? 'STARTING…' : 'START FREE TRIAL'}</Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Pressable onPress={onRestore} disabled={restoring}>
          <Text style={styles.footerLink}>{restoring ? 'RESTORING…' : 'RESTORE PURCHASES'}</Text>
        </Pressable>
        {Platform.OS === 'ios' && (
          <Pressable onPress={onRedeemCode}><Text style={styles.footerLink}>HAVE A CODE?</Text></Pressable>
        )}
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
  subscribeButtonDisabled: { opacity: 0.6 },
  subscribeText: { ...Fonts.mono(14, 'bold'), color: Colours.bg },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  footerLink: { ...Fonts.mono(11, 'semibold'), color: Colours.dim },
  legal: { ...Fonts.mono(10, 'medium'), color: Colours.faint, textAlign: 'center' },
});

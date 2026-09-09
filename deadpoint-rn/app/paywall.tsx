// app/paywall.tsx
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { purchaseStandard, restorePurchases, trialLabel, trialLengthLabel, useOfferings } from '../src/data/subscription';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '../src/data/legal';

const FEATURES = [
  'Your quiz-assigned training plan',
  'Live progress and weight tracking',
  'Rest and interval timers, built in',
  'Home screen widget',
];

type Tier = 'monthly' | 'annual';

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const { monthly, annual } = useOfferings();
  // Defaults to monthly — matches the trial-focused heading copy below.
  const [selectedTier, setSelectedTier] = useState<Tier>('monthly');
  const [subscribing, setSubscribing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Array-driven, same convention as FEATURES.map below. Each row is
  // disabled on its own if RevenueCat hasn't returned that package yet
  // (Offering not fully configured — true of Oscar's current placeholder
  // setup — or still loading) rather than blocking the whole screen.
  // badge is derived from each package's own real introPrice (see
  // trialLabel above) rather than hardcoded per tier — whichever tier
  // actually has a trial configured shows one, and neither does if
  // neither has one.
  const tiers: { tier: Tier; label: string; badge: string | null; pkg: PurchasesPackage | null }[] = [
    { tier: 'monthly', label: 'Monthly', badge: trialLabel(monthly), pkg: monthly },
    { tier: 'annual', label: 'Annual', badge: trialLabel(annual), pkg: annual },
  ];
  const selectedPackage = selectedTier === 'monthly' ? monthly : annual;
  const selectedTrial = trialLabel(selectedPackage);

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
    if (subscribing || !selectedPackage) return;
    setSubscribing(true);
    try {
      await purchaseStandard(selectedPackage);
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
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: 24 + insets.top }]}>
      <Pressable onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>SIGN OUT</Text></Pressable>

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>DEADPOINT STANDARD</Text>
        <Text style={styles.title}>Your plan, every day</Text>
        <Text style={styles.price}>Choose your plan below. Cancel any time.</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tiers}>
        {tiers.map(({ tier, label, badge, pkg }) => {
          const isSelected = selectedTier === tier;
          const isDisabled = !pkg;
          return (
            <Pressable
              key={tier}
              onPress={() => pkg && setSelectedTier(tier)}
              disabled={isDisabled}
              style={[styles.tierRow, isSelected && styles.tierRowSelected, isDisabled && styles.tierRowDisabled]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: isDisabled }}
              accessibilityLabel={`${label} plan${pkg ? `, ${pkg.product.priceString}` : ', currently unavailable'}`}
            >
              <View>
                <Text style={styles.tierLabel}>{label}</Text>
                {badge != null && <Text style={styles.tierBadge}>{badge}</Text>}
              </View>
              <Text style={styles.tierPrice}>{pkg ? pkg.product.priceString : '—'}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={onSubscribe}
        disabled={subscribing || !selectedPackage}
        style={[styles.subscribeButton, (subscribing || !selectedPackage) && styles.subscribeButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={selectedTrial ? 'Start free trial' : `Subscribe ${selectedTier}`}
      >
        <Text style={styles.subscribeText}>
          {subscribing ? 'STARTING…' : selectedTrial ? 'START FREE TRIAL' : 'SUBSCRIBE'}
        </Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Pressable onPress={onRestore} disabled={restoring}>
          <Text style={styles.footerLink}>{restoring ? 'RESTORING…' : 'RESTORE PURCHASES'}</Text>
        </Pressable>
        {Platform.OS === 'ios' && (
          <Pressable onPress={onRedeemCode}><Text style={styles.footerLink}>HAVE A CODE?</Text></Pressable>
        )}
      </View>

      {/* Guideline 3.1.2(c) rejection, 2026-09-09 (submission 30bb0320):
          this said payment would be "charged after the trial ends"
          without ever stating the trial's actual length or the amount —
          both were only inferable from the tier badge above, which Apple
          read as the purchase flow itself failing to disclose its own
          terms. Now states the length, the exact post-trial price and
          billing period, and the renewal cutoff in one sentence, reusing
          the same priceString/tier data already shown on the tier row
          rather than restating it as a separate hardcoded claim. */}
      <Text style={styles.legal}>
        {selectedTrial && selectedPackage
          ? `${trialLengthLabel(selectedPackage)} free, then ${selectedPackage.product.priceString} per ${selectedTier === 'monthly' ? 'month' : 'year'}, billed to your Apple ID. Cancel any time in Settings — at least 24 hours before renewal to avoid being charged.`
          : selectedPackage
          ? `${selectedPackage.product.priceString} per ${selectedTier === 'monthly' ? 'month' : 'year'}, billed to your Apple ID immediately. Manage or cancel any time in Settings.`
          : 'Manage or cancel any time in Settings.'}
      </Text>

      {/* Point-of-purchase disclosure Apple's subscription rules expect
          alongside the terms above — added after a 3.1.2 rejection over
          the App Description missing an EULA link (see src/data/legal.ts).
          That fix alone was metadata-only; this is the in-app half. */}
      <View style={styles.legalLinks}>
        <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch((e) => console.error('paywall: opening privacy policy failed:', e))}>
          <Text style={styles.legalLink}>PRIVACY POLICY</Text>
        </Pressable>
        <Text style={styles.legalLinkDivider}>·</Text>
        <Pressable onPress={() => Linking.openURL(TERMS_OF_USE_URL).catch((e) => console.error('paywall: opening terms of use failed:', e))}>
          <Text style={styles.legalLink}>TERMS OF USE</Text>
        </Pressable>
      </View>
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
  tiers: { gap: 10 },
  tierRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderRadius: 12, backgroundColor: Colours.s1,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  tierRowSelected: { backgroundColor: Colours.s2, borderColor: 'rgba(237,235,229,0.4)' },
  tierRowDisabled: { opacity: 0.4 },
  tierLabel: { fontSize: 15, fontWeight: '700', color: Colours.fg },
  tierBadge: { ...Fonts.mono(10, 'bold'), color: Colours.go, marginTop: 3, letterSpacing: 0.5 },
  tierPrice: { ...Fonts.mono(15, 'bold'), color: Colours.fg },
  subscribeButton: { paddingVertical: 16, borderRadius: 10, alignItems: 'center', backgroundColor: Colours.fg },
  subscribeButtonDisabled: { opacity: 0.6 },
  subscribeText: { ...Fonts.mono(14, 'bold'), color: Colours.bg },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  footerLink: { ...Fonts.mono(11, 'semibold'), color: Colours.dim },
  legal: { ...Fonts.mono(10, 'medium'), color: Colours.faint, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  legalLink: { ...Fonts.mono(10, 'semibold'), color: Colours.dim, textDecorationLine: 'underline' },
  legalLinkDivider: { ...Fonts.mono(10, 'medium'), color: Colours.faint },
});

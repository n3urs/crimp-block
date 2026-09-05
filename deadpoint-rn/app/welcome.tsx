import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { resolveColour } from '../src/design/colours';
import { setHasSeenWelcome } from '../src/data/deviceFlags';

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onContinue = async () => {
    try {
      await setHasSeenWelcome();
    } catch (e) {
      // A failed write here just means this screen shows again next
      // launch — annoying, not broken. Not worth blocking navigation on.
      console.error('welcome: setHasSeenWelcome failed:', e);
    }
    router.replace('/');
  };

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.wordmark}>DEADPOINT</Text>
        <Text style={styles.tagline}>
          Adaptive daily training for climbers — one recommended session a day, built around your own recovery.
        </Text>
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerLabel}>BEFORE YOU START</Text>
          <Text style={styles.disclaimer}>
            This app tells you what to do, not how to do it safely — it doesn't teach exercise technique. Learn proper form for hangboarding, weighted pull-ups, and any movement here from a qualified source before you load it, especially anything finger-specific.
          </Text>
        </View>
      </View>
      <Pressable onPress={onContinue} style={styles.button} accessibilityRole="button" accessibilityLabel="Get started">
        <Text style={styles.buttonText}>GET STARTED</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 24, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', gap: 20 },
  wordmark: { fontSize: 44, fontWeight: '800', color: Colours.fg },
  tagline: { fontSize: 16, color: Colours.dim },
  // A real safety notice, not fine print — bordered and given its own
  // labelled box so it reads as a distinct, important thing to notice
  // on the very first screen, not a trailing caption under the tagline.
  disclaimerBox: {
    borderWidth: 1, borderColor: Colours.s3, borderRadius: 8,
    backgroundColor: Colours.s1, padding: 14, gap: 6,
  },
  disclaimerLabel: { ...Fonts.mono(11, 'bold'), color: resolveColour('--gorse'), letterSpacing: 0.6 },
  disclaimer: { fontSize: 13.5, color: Colours.dim, lineHeight: 19 },
  button: {
    paddingVertical: 14, borderRadius: 8, alignItems: 'center',
    backgroundColor: resolveColour('--gorse'),
  },
  buttonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});

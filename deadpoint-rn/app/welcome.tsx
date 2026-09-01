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
      </View>
      <Pressable onPress={onContinue} style={styles.button} accessibilityRole="button" accessibilityLabel="Get started">
        <Text style={styles.buttonText}>GET STARTED</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 24, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', gap: 14 },
  wordmark: { fontSize: 44, fontWeight: '800', color: Colours.fg },
  tagline: { fontSize: 16, color: Colours.dim },
  button: {
    paddingVertical: 14, borderRadius: 8, alignItems: 'center',
    backgroundColor: resolveColour('--gorse'),
  },
  buttonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});

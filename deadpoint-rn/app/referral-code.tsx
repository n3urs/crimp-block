// app/referral-code.tsx
/** Settings → "Referral code". Real modal route, same pattern as
    weight-edit.tsx: pushed via router.push() and registered in
    app/_layout.tsx with `presentation: 'modal'`. Reached only while
    profile.row.referredBy is null — Settings itself hides the row's onPress
    once a code is set, and useProfile's setReferredBy() is a second,
    real enforcement of the same one-way-door rule, not just hidden UI.

    Deliberately just a text field: no lookup against a list of real
    codes (none exists — see setReferredBy's own doc comment), no deep
    link, no separate landing page. A friend tells someone a word, they
    type it in here once. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';

export default function ReferralCode() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await profile.setReferredBy(code);
      router.back();
    } catch (e: any) {
      setError(`Couldn't save: ${e?.message ?? 'something went wrong'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>CANCEL</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Referral code</Text>
      <Text style={styles.body}>
        If a friend gave you a code, enter it below. This can only be set once.
      </Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="e.g. joe"
        placeholderTextColor={Colours.faint}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      {error != null && <Text style={styles.error}>{error}</Text>}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={onSave}
        disabled={saving || code.trim().length === 0}
        style={[styles.saveButton, (saving || code.trim().length === 0) && styles.saveButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Save"
      >
        <Text style={styles.saveButtonText}>{saving ? 'SAVING…' : 'SAVE'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  cancel: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  title: { fontSize: 22, fontWeight: '800', color: Colours.fg, marginBottom: 8 },
  body: { fontSize: 14, color: Colours.dim, marginBottom: 20, lineHeight: 20 },
  input: {
    ...Fonts.mono(16, 'medium'), color: '#FFFFFF',
    padding: 14, borderRadius: 8, backgroundColor: Colours.s2,
  },
  error: { fontSize: 12, color: Colours.restC, textAlign: 'center', marginTop: 16 },
  saveButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: resolveColour('--gorse') },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { resolveColour } from '../src/design/colours';
import { useSession } from '../src/data/useSession';

type Step = 'email' | 'code';
const RESEND_COOLDOWN_SECONDS = 30;

function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SignIn() {
  const router = useRouter();
  const { sendOTP, verifyOTP } = useSession();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const defaultMessage = step === 'email'
    ? 'Enter your email. Each email gets its own private log.'
    : `✓ Code sent to ${email} — can take a minute to arrive, and sometimes lands in junk/spam. Check your inbox and type it below.`;

  const messageColour = isError
    ? Colours.restC
    : (step === 'code' && message == null ? resolveColour('--gorse') : Colours.dim);

  const sendButtonLabel = sending ? 'SENDING…' : resendCooldown > 0 ? `RESEND IN ${resendCooldown}s` : 'SEND CODE';

  const onEmailChange = (v: string) => {
    setEmail(v);
    // A cooldown protecting the PREVIOUS address shouldn't block sending
    // to a freshly-typed different one, e.g. fixing a typo.
    setResendCooldown(0);
  };

  const sendCode = async () => {
    setSending(true);
    setMessage(null);
    setIsError(false);
    try {
      await sendOTP(email);
      setStep('code');
      // Starts the moment a code genuinely goes out, so it also covers
      // hitting BACK then SEND CODE again right away — the exact
      // sequence that would otherwise silently invalidate an already-
      // sent, still-good code (only the newest code Supabase sent stays
      // valid).
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e: any) {
      setIsError(true);
      setMessage(`Couldn't send the code: ${e?.message ?? 'something went wrong'}`);
    } finally {
      setSending(false);
    }
  };

  const verifyFailureMessage = (e: any): string => {
    // Supabase answers a wrong code, an already-used code, and a
    // genuinely expired one all with the same 403 - matching Swift's own
    // documented finding (SupabaseClient.ClientError.http(403,_)) that
    // asserting "expired" specifically sent real debugging down the
    // wrong path once. This says what a 403 actually means instead.
    // Confirmed against node_modules/@supabase/auth-js/src/lib/errors.ts:
    // signInWithOtp/verifyOtp reject with a real AuthError (or its
    // AuthApiError subclass), both of which carry this same `status`
    // field directly on the error object, so accessing it here needs no
    // adjustment from the brief's assumption.
    if (e?.status === 403) {
      return "That code didn't work. Each code only works once, and only for a few minutes — tap BACK and send yourself a fresh one.";
    }
    return `Couldn't sign you in: ${e?.message ?? 'something went wrong'}`;
  };

  const verifyCode = async () => {
    setSending(true);
    setIsError(false);
    setMessage(null);
    try {
      await verifyOTP(email, code.replace(/\D/g, ''));
      router.replace('/');
    } catch (e) {
      setIsError(true);
      setMessage(verifyFailureMessage(e));
    } finally {
      setSending(false);
    }
  };

  const codeDigitCount = code.replace(/\D/g, '').length;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{step === 'email' ? 'SIGN IN' : 'ENTER CODE'}</Text>
      <Text style={[styles.eyebrow, { color: resolveColour('--gorse') }]}>{step === 'email' ? 'Deadpoint' : 'Sign-in'}</Text>
      <Text style={[styles.message, { color: messageColour, fontWeight: step === 'code' && message == null ? '600' : '400' }]}>
        {message ?? defaultMessage}
      </Text>

      {step === 'email' ? (
        <>
          <TextInput
            value={email}
            onChangeText={onEmailChange}
            placeholder="you@example.com"
            placeholderTextColor={Colours.faint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable
            onPress={sendCode}
            disabled={!emailLooksValid(email) || sending || resendCooldown > 0}
            style={[styles.button, (!emailLooksValid(email) || sending || resendCooldown > 0) && styles.buttonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={sendButtonLabel}
          >
            <Text style={styles.buttonText}>{sendButtonLabel}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="code from email"
            placeholderTextColor={Colours.faint}
            keyboardType="number-pad"
            style={styles.input}
          />
          <View style={styles.row}>
            <Pressable
              onPress={() => { setStep('email'); setMessage(null); setIsError(false); }}
              style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>BACK</Text>
            </Pressable>
            <Pressable
              onPress={verifyCode}
              disabled={codeDigitCount < 4 || sending}
              style={[styles.button, { flex: 1 }, (codeDigitCount < 4 || sending) && styles.buttonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.buttonText}>{sending ? 'CHECKING…' : 'SIGN IN'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, padding: 20, gap: 18 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  eyebrow: { ...Fonts.mono(13, 'medium') },
  message: { fontSize: 14 },
  input: {
    ...Fonts.mono(16, 'medium'), color: '#FFFFFF',
    padding: 14, borderRadius: 8, backgroundColor: Colours.s2,
  },
  row: { flexDirection: 'row', gap: 10 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', backgroundColor: resolveColour('--gorse') },
  buttonSecondary: { backgroundColor: Colours.s2 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
  buttonTextSecondary: { color: Colours.dim },
});

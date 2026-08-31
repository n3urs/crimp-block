/** Task 11: the real root gate, replacing Task 3's temporary font-check
    placeholder redirect. Resolves every `computeRoute()` input from real
    hooks/device flags, then `router.replace()`s to the result — never
    `push`, so the gate chain never builds a back-stack (matching every
    other post-flow screen in this app: welcome.tsx, sign-in.tsx,
    quiz.tsx, tutorial.tsx all `router.replace('/')` back through here on
    completion, letting this file re-decide the next hop each time).

    expo-router's typed-routes experiment is NOT enabled anywhere in this
    project (confirmed against app.json: no `experiments.typedRoutes`
    entry) and no `ExpoRouter.__routes` augmentation exists anywhere in
    this codebase either (confirmed against
    node_modules/expo-router/build/typed-routes/types.d.ts: with that
    interface left empty, `Href` collapses to plain `string | HrefObject`
    — the exact same permissive type every other screen's own
    `router.replace('/quiz')`/`router.replace('/card')`/`router.push
    ('/calendar')` calls already rely on). So `computeRoute()`'s `Route`
    return type (a union of string literals) is assignable to `Href`
    as-is — no `as any` cast needed, unlike the brief's own hedge on this
    exact point.

    Two adaptations from the plan's draft, both about not routing off a
    value that hasn't genuinely settled yet:

    1) `useSession()` exposes no "has the initial getSession() resolved"
       signal of its own — `session` starts (and, for a genuinely
       signed-out device, STAYS) at null, so `session != null` alone
       can't tell "still loading" apart from "definitely signed out".
       The draft computed `isSignedIn: session != null` with no gate on
       this at all, which would misroute an already-signed-in returning
       user to /sign-in for one frame on every cold launch, any time
       hasSeenWelcome's own AsyncStorage read happens to resolve before
       auth does. Fixed here by subscribing to the same
       `onAuthStateChange` stream useSession.ts's own effect already
       subscribes to (rather than an extra parallel `getSession()` call,
       which would race the hook's own call with no ordering
       guarantee): supabase-js notifies every registered listener for a
       given event in one synchronous loop, so this listener and
       useSession's fire together, and with React's batching land in the
       same render — by the time `authReady` is true, `session` already
       reflects the real value in that same pass.

    2) The brief's own draft never reset `builtInSeen` back to `null`
       when `email` changes from null to a real address, so a built-in
       account signing in would briefly compute its route against the
       STALE `false` left over from the signed-out state (set by the
       `!email` branch below) instead of waiting for the real per-email
       AsyncStorage read — risking one incorrect flash to /tutorial for
       an account that's actually already seen it. Fixed by resetting to
       `null` (a real "unknown, loading" state) whenever `email` changes,
       before kicking off the new read.

    Known residual gap, not fixed here (see Task 11 report): `useProfile`
    exposes no "has the initial fetch settled" signal either — `row`
    stays `null` both before its Supabase fetch resolves and for a
    genuinely brand-new user, and nothing about the version of that hook
    handed to this task distinguishes the two from outside it. A real
    signed-in, fully-onboarded user could briefly compute this file's
    route against `quizCompletedAt: null`/`tutorialCompletedAt: null`
    before their real profile row loads, bouncing through /quiz or
    /tutorial for a moment before correcting itself once it does. Fixing
    this needs a "loaded" flag added to useProfile.ts itself, which this
    task's scope (app/index.tsx, app/tutorial.tsx, and the new routing
    module only) doesn't cover — flagged in the report rather than
    silently patched around, or silently left unmentioned. */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { getHasSeenWelcome, hasSeenBuiltInTutorial } from '../src/data/deviceFlags';
import { supabase } from '../src/data/supabase';
import { computeRoute, isBuiltInProgram, type Route } from '../src/routing/computeRoute';
import { Colours } from '../src/design/colours';

export default function Index() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  // See doc comment above (adaptation 1): flips true the first time the
  // real auth state is known, in sync with useSession's own `session`
  // update rather than racing it.
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(() => setAuthReady(true));
    return () => listener.subscription.unsubscribe();
  }, []);

  const [hasSeenWelcome, setHasSeenWelcome] = useState<boolean | null>(null);
  useEffect(() => {
    getHasSeenWelcome().then(setHasSeenWelcome).catch((e) => { console.error('index: getHasSeenWelcome failed:', e); setHasSeenWelcome(false); });
  }, []);

  const builtIn = isBuiltInProgram(email);

  const [builtInSeen, setBuiltInSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!email) { setBuiltInSeen(false); return; }
    // See doc comment above (adaptation 2): reset to "unknown" before the
    // real per-email read, so the loading gate below correctly re-engages
    // instead of computing against a stale value left over from before
    // this email was known.
    setBuiltInSeen(null);
    hasSeenBuiltInTutorial(email).then(setBuiltInSeen).catch((e) => { console.error('index: hasSeenBuiltInTutorial failed:', e); setBuiltInSeen(false); });
  }, [email]);

  useEffect(() => {
    // Still loading: auth state, the welcome flag, or (for a built-in
    // account only — a non-built-in account has no per-email flag to
    // wait on) the device-local built-in-tutorial-seen flag.
    if (!authReady || hasSeenWelcome == null || (builtIn && builtInSeen == null)) return;
    const route: Route = computeRoute({
      hasSeenWelcome,
      isSignedIn: session != null,
      email,
      isBuiltInProgram: builtIn,
      hasSeenBuiltInTutorial: builtInSeen ?? false,
      quizCompletedAt: profile.row?.quizCompletedAt ?? null,
      tutorialCompletedAt: profile.row?.tutorialCompletedAt ?? null,
      trackType: profile.row?.trackType ?? null,
    });
    if (route === '/rehab-coming-soon') return; // rendered inline below, not a real route file
    router.replace(route);
  }, [authReady, hasSeenWelcome, builtInSeen, builtIn, session, email, profile.row, router]);

  const isRehabComingSoon = authReady && hasSeenWelcome === true && session != null && !builtIn
    && profile.row?.quizCompletedAt != null && profile.row?.tutorialCompletedAt != null
    && profile.row?.trackType === 'rehab';

  if (isRehabComingSoon) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Rehab track is coming soon</Text>
        <Text style={styles.body}>
          Your answers are saved — the rehab-specific daily card and walkthrough aren't built yet. Check back soon.
        </Text>
      </View>
    );
  }

  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: Colours.fg, textAlign: 'center' },
  body: { fontSize: 14, color: Colours.dim, textAlign: 'center' },
});

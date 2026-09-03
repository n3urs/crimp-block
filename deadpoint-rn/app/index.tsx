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

    Adaptations from the plan's draft, all about not routing off a value
    that hasn't genuinely settled yet:

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
       which would race the hook's own call with no ordering guarantee).

       IMPORTANT — the REAL reason this is safe (corrected from an
       earlier, factually wrong version of this comment): it is NOT
       because supabase-js broadcasts to every subscriber in one
       synchronous loop. On a cold launch the event that actually fires
       is `INITIAL_SESSION`, and `GoTrueClient.onAuthStateChange`
       (node_modules/@supabase/auth-js/src/GoTrueClient.ts) emits that
       PER SUBSCRIBER, asynchronously, via its own `_emitInitialSession`
       call inside a fresh `(async () => { ... })()` kicked off right
       when that subscriber registers — this does NOT go through the
       synchronous `_notifyAllSubscribers` broadcast loop at all (that
       path only ever handles `SIGNED_IN`/`SIGNED_OUT`/`TOKEN_REFRESHED`,
       i.e. events after the initial one). Two independent subscribers
       each get their own independent async chain for `INITIAL_SESSION`.

       The actual safety guarantee is HOOK DECLARATION ORDER:
       `useSession()` is called above, before the effect below that sets
       `authReady`, so React registers useSession's `onAuthStateChange`
       listener (and therefore kicks off ITS `_emitInitialSession` chain)
       strictly before this file's own listener registers and kicks off
       its chain. That ordering is what makes it safe to assume `session`
       already reflects the real value by the time `authReady` flips —
       NOT any synchronous-broadcast property of the client.

       THIS IS AN ORDERING DEPENDENCY A FUTURE EDITOR MUST NOT BREAK: if
       `useSession()` is ever called AFTER the `authReady`-setting effect
       below (or moved into a different effect that runs later), this
       safety guarantee breaks silently — `authReady` could flip true
       before `session` has caught up, reintroducing the one-frame
       misroute-to-/sign-in bug described above, with no type error or
       test failure to catch it. Do not reorder these two hooks.

       (A more robust fix would derive readiness from something intrinsic
       to useSession()/the auth client itself, so this file didn't depend
       on hook order at all — not done here, since restructuring
       useSession.ts's public shape is bigger-surface-area change than
       this bug-fix pass's scope justifies; flagged as a possible follow-
       up rather than risked under time pressure.)

    2) A built-in account's per-email "have they seen the built-in
       tutorial" flag (`builtInSeen`) is now stored KEYED to the email it
       was computed for — `{ email, value } | null` — rather than a bare
       `boolean | null` with a separate reset-on-email-change effect. An
       earlier version of this file used a bare boolean plus
       `setBuiltInSeen(null)` whenever `email` changed, but that did NOT
       actually close the race: the reset effect and the routing effect
       below can run in the SAME commit with the SAME stale render's
       closure value, so whenever `session`+`authReady` land together (the
       normal cold-launch case for an already-signed-in built-in account),
       the routing effect could still see the OLD `builtInSeen` value from
       before the reset was even scheduled. Keying the stored value to its
       own email closes this structurally: the derived `builtInSeen` below
       compares the CURRENT render's `email` against the email the stored
       value was actually computed for, so a stale `{email: oldEmail}`
       for a NEW `email` is correctly treated as "not ready for this
       email" the instant `email` changes, in the very same render — no
       separate reset effect, and nothing for it to race against.

    Also fixed here (Task 11 bug-fix pass): `useProfile` now exposes a
    real `loaded` signal (see src/data/useProfile.ts's own doc comment).
    Previously `row` stayed `null` both before the Supabase fetch resolved
    and for a genuinely brand-new user, so a real signed-in, fully-
    onboarded returning user could have their route computed against
    `quizCompletedAt: null`/`tutorialCompletedAt: null` before their real
    profile loaded — sending them to /quiz on every cold launch, with no
    live component left to correct it once `router.replace()` unmounts
    this screen (quiz.tsx's own completion/cancel paths both
    `router.replace('/')`, which only makes a FRESH Index/useProfile, not
    a corrected one). The routing effect below now waits on
    `profile.loaded` for every account EXCEPT a built-in one — proven by
    direct reading of computeRoute.ts's `isBuiltInProgram` branch to never
    read any profile field at all, so gating a built-in account's route on
    a Supabase round trip it doesn't need would just be needless latency. */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { getHasSeenWelcome, hasSeenBuiltInTutorial } from '../src/data/deviceFlags';
import { supabase } from '../src/data/supabase';
import { computeRoute, isBuiltInProgram, isRouteReady, type Route } from '../src/routing/computeRoute';
import { PAYWALL_ENABLED, useEntitlement } from '../src/data/subscription';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';

export default function Index() {
  const router = useRouter();
  // Hook order matters here — see the top doc comment's adaptation (1):
  // useSession() must be called before the authReady-setting effect below.
  // Do not reorder.
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);

  // Task 4: always called (rules of hooks — its result must not be
  // conditional on PAYWALL_ENABLED), but its answer only ever reaches
  // computeRoute() when PAYWALL_ENABLED is true — see hasActiveSubscription
  // below. With the flag false (its current, shipped value) this hook's
  // fetch still runs in the background but nothing waits on or branches
  // on its result: isRouteReady's own paywallEnabled/entitlementLoaded
  // handling guarantees cold launch never blocks on it either.
  const entitlement = useEntitlement();

  // See top doc comment (adaptation 1): flips true the first time the
  // real auth state is known, in sync with useSession's own `session`
  // update rather than racing it. Safety depends on useSession() above
  // being called before this effect — see that comment for why.
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

  // See top doc comment (adaptation 2 / Fix 2a): keyed to the email it
  // was computed for, so a stale value left over from a previous email
  // is structurally distinguishable from a current one — no separate
  // reset effect, and nothing for one to race against.
  const [builtInSeenState, setBuiltInSeenState] = useState<{ email: string; value: boolean } | null>(null);
  useEffect(() => {
    if (!email) return; // no per-email flag to fetch — builtIn is always false with no email anyway
    hasSeenBuiltInTutorial(email)
      .then((value) => setBuiltInSeenState({ email, value }))
      .catch((e) => { console.error('index: hasSeenBuiltInTutorial failed:', e); setBuiltInSeenState({ email, value: false }); });
  }, [email]);
  const builtInSeen = builtInSeenState?.email === email ? builtInSeenState.value : null;

  // Task 11 round 4: `useProfile` now tracks its fetch-settlement state as
  // one atomic discriminated union (src/data/useProfile.ts) instead of
  // separate `loadedFor`/`error`/`row` slots that had to agree with each
  // other by convention. `profile.loaded` and `profile.hasError` are
  // derived from that single slot and are mutually exclusive by
  // construction — there is no possible state where both are true, unlike
  // round 2's `loadedFor === userId` + independent `error` boolean, which
  // is exactly what let a retry's `setError(false)` outrun `loadedFor`
  // still pointing at the failed attempt. A non-built-in account whose
  // profile fetch genuinely THREW (network failure, RLS denial, etc. —
  // this app is explicitly meant to be usable with poor/no signal at a
  // crag, so this is not a narrow edge case) settles `hasError: true`,
  // distinct from a genuinely brand-new user (`loaded: true, row: null`).
  // Without this check, computeRoute() can't tell those apart and would
  // silently send a returning user with a real profile into /quiz,
  // risking a destructive profile.create() overwrite of their real
  // program data if they interact with the quiz before realizing
  // something is wrong. A built-in account never needs this guard — its
  // route never reads any profile field at all (confirmed directly
  // against computeRoute.ts's isBuiltInProgram branch).
  const profileFetchFailed = !builtIn && profile.hasError;

  // Task 4: the whole "provably inert until the flag flips" guarantee
  // lives in this one line. With PAYWALL_ENABLED false (its current,
  // shipped value) this is unconditionally `true` — full stop, short-
  // circuiting before entitlement.hasActiveSubscription is ever read — so
  // computeRoute() structurally cannot return '/paywall' no matter what
  // RevenueCat reports. There is no other code path that computes this
  // value; both the readiness check below and the computeRoute() call
  // further down consume this same single derivation, so they can't
  // disagree with each other.
  const hasActiveSubscription = !PAYWALL_ENABLED || entitlement.hasActiveSubscription;

  // Fix 3 (cont'd): computed ONCE per render, from the same readiness gate
  // and the same computeRoute() call — both the router.replace() effect
  // below and isRehabComingSoon's inline render decision derive from this
  // single value, so they can't independently drift out of sync with each
  // other or with computeRoute()'s own branches as those evolve (e.g.
  // Phase 7's real paywall gate).
  //
  // Task 11 round 5 (Fix 2): this used to be an inline boolean expression
  // with no test of its own — extracted to src/routing/computeRoute.ts's
  // isRouteReady() (see its own doc comment) so the actual gating logic
  // used at runtime here IS the tested function, not a parallel copy that
  // could silently drift from it. __tests__/computeRoute.test.ts covers
  // this directly, including the signed-out case round 4's regression
  // missed.
  let route: Route | null = null;
  if (
    isRouteReady({
      authReady,
      hasSeenWelcome,
      isSignedIn: session != null,
      isBuiltInProgram: builtIn,
      builtInSeen,
      profileLoaded: profile.loaded,
      profileFetchFailed,
      paywallEnabled: PAYWALL_ENABLED,
      entitlementLoaded: entitlement.loaded,
      entitlementFetchFailed: entitlement.failed,
    })
  ) {
    route = computeRoute({
      // Non-null assertion is safe here, not a suppressed bug: isRouteReady()
      // above already required `hasSeenWelcome != null` to reach this block
      // (see its own doc comment) — TS just can't narrow the type across
      // that function-call boundary the way it could when the same check
      // was inlined directly in this `if`'s condition.
      hasSeenWelcome: hasSeenWelcome!,
      isSignedIn: session != null,
      email,
      isBuiltInProgram: builtIn,
      hasSeenBuiltInTutorial: builtInSeen ?? false,
      quizCompletedAt: profile.row?.quizCompletedAt ?? null,
      tutorialCompletedAt: profile.row?.tutorialCompletedAt ?? null,
      trackType: profile.row?.trackType ?? null,
      hasActiveSubscription,
    });
  }

  useEffect(() => {
    if (route == null || route === '/rehab-coming-soon') return; // rendered inline below, not a real route file
    router.replace(route);
  }, [route, router]);

  const isRehabComingSoon = route === '/rehab-coming-soon';

  if (profileFetchFailed) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Couldn't load your account</Text>
        <Text style={styles.body}>Check your connection and try again.</Text>
        <Pressable
          onPress={() => { profile.reload().catch((e) => console.error('index: retry reload failed:', e)); }}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>TRY AGAIN</Text>
        </Pressable>
      </View>
    );
  }

  // Gated on PAYWALL_ENABLED for the same reason hasActiveSubscription and
  // isRouteReady's own check are: with the flag off (its current, shipped
  // value) this must stay unreachable, not merely unlikely — entitlement
  // .failed genuinely IS true today (the placeholder RevenueCat key can't
  // reach real servers), and showing this screen unconditionally would be
  // a real regression Task 4's whole "byte for byte identical while
  // PAYWALL_ENABLED is false" proof was built to rule out.
  if (PAYWALL_ENABLED && entitlement.failed) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Couldn't check your subscription</Text>
        <Text style={styles.body}>Check your connection and try again.</Text>
        <Pressable
          onPress={() => { entitlement.refresh().catch((e) => console.error('index: retry entitlement refresh failed:', e)); }}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>TRY AGAIN</Text>
        </Pressable>
      </View>
    );
  }

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

  // Reached while genuinely still waiting: the very first cold-launch
  // fetch, OR — the review's "blank screen during retry" gap — the moment
  // right after tapping TRY AGAIN, when `profile.hasError` has already
  // flipped false (state moved atomically to `loading` in that same
  // update) but the retried fetch hasn't resolved yet, so `profileFetchFailed`
  // is false here too and the block above no longer matches. Previously
  // this fell through to a bare empty `<View>` — a jarring blank flash
  // between the retry screen disappearing and the app either routing
  // somewhere or the retry screen reappearing on a second failure. Now
  // that `profile.isLoading` is a real, readable signal (not derivable at
  // all under the old `loadedFor`/`error` split), show a spinner instead
  // so there is always something on screen, not just during retries but
  // on every cold launch too.
  return (
    <View style={styles.root}>
      <ActivityIndicator color={resolveColour('--gorse')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: Colours.fg, textAlign: 'center' },
  body: { fontSize: 14, color: Colours.dim, textAlign: 'center' },
  // Matches app/sign-in.tsx's own button styling for a consistent look.
  button: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, alignItems: 'center', backgroundColor: resolveColour('--gorse'), marginTop: 8 },
  buttonText: { ...Fonts.mono(13, 'bold'), color: Colours.bg },
});

/** Task 3's temporary font-check screen, replaced now that a real
    destination exists (Task 12). Placeholder redirect, not real
    auth-gated routing — the not-yet-written Phase 3 sign-in/onboarding
    plan will very likely replace this with a real `/` that branches on
    session state.

    href is "/card", not "/(main)/card" — expo-router strips parenthesised
    route-group segments from the actual URL path, confirmed directly
    against the installed package's own stripGroupSegmentsFromPath before
    this was written. */
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/card" />;
}

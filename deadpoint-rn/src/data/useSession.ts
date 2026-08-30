import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Thin wrapper over the real supabase-js auth API — there is no hand-rolled
    REST client here the way there is in SupabaseClient.swift, because unlike
    iOS there IS a real JS SDK on this platform, and it already owns session
    persistence, refresh, and the auth-state stream SupabaseClient.swift had
    to hand-write (see its own doc comment on `@Observable` for exactly the
    class of bug — a mutation nobody re-renders on — that a live
    `onAuthStateChange` subscription avoids by construction). Throws on
    error rather than swallowing it, same contract as sendOTP/verifyOTP in
    SupabaseClient.swift being `async throws` — turning an error into
    user-facing copy (SupabaseClient.friendlyMessage's job) is a UI-layer
    concern for the not-yet-written sign-in screen, not this hook's. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Same bug class as useStore.ts/useLoads.ts/useProfile.ts, found
    // afterward on the same real device: a real getSession() failure
    // (a genuine possibility — e.g. the underlying SecureStorageAdapter
    // read failing) would otherwise be a true uncaught promise
    // rejection, since a bare `.then` with no `.catch` on a fire-and-
    // forget call inside a synchronous effect body leaves nothing to
    // handle it. `.catch` doesn't hide a real failure, it just stops it
    // from crashing/toasting as unhandled — `session` simply stays null,
    // same as any other not-signed-in state.
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch((e) => console.error('useSession.getSession failed:', e));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return {
    session,
    /** Mirrors sb.auth.signInWithOtp in app.js / sendOTP(email:) in
        SupabaseClient.swift — same code-entry flow, no magic-link redirect
        to configure (see NativeSignInView.swift's doc comment for why a
        typed code beats a link: a link opens a browser with separate
        storage from this app). */
    sendOTP: async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
    },
    verifyOTP: async (email: string, token: string) => {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };
}

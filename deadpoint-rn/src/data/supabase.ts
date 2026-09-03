import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/** expo-secure-store replaces ios/Shared/Keychain.swift. The access token is
    a bearer credential — AsyncStorage (plain, unencrypted) is the wrong place. */
const SecureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/** Not a secret: already embedded in the public web bundle (app.js) by
    design, same value, confirmed there. RLS on user_id is what actually
    protects data, same as on web — see SupabaseClient.swift's doc comment
    for the live confirmation that an unauthenticated GET returns [], not
    other people's rows. Hardcoded rather than an env var for the same
    reason app.js hardcodes it: there is nothing to keep out of the bundle. */
// Exported so callDeleteAccount (src/data/deleteAccount.ts) can reuse the
// same values via useSession, instead of a second file duplicating the
// literals and silently drifting the day this project points at a
// different Supabase instance.
export const SUPABASE_URL = 'https://lbhsgkadlhcqqnlbfswr.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiaHNna2FkbGhjcXFubGJmc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNTg2NzMsImV4cCI6MjEwMTkzNDY3M30.3Df2BW9YVfJYZVSalLWGsx54iY_RvnZdln71Kehljug';

/** 90s, not the default — confirmed live against the real endpoint:
    auth/v1/otp takes 60-65s to respond even with custom SMTP (Resend)
    configured, so the default timeout was racing it and reporting a
    slow-but-successful send as a hard failure. See SupabaseClient.swift. */
const TIMEOUT_MS = 90_000;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { storage: SecureStorageAdapter, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
    },
  },
});

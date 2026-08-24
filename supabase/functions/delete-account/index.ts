// Deletes the CALLING user's own account — nothing else. Exists because
// deleting an auth.users row requires the service_role key, and that key
// never leaves the server (see SUPABASE.md: "it never leaves the server,
// and never goes in this repo"). The app only ever carries the anon key,
// which cannot delete a user — so a Postgres role can't do this on its
// own, and a server-side function is the only correct place for it.
//
// Every table that matters — sessions, loads, profiles — already has
// `user_id ... references auth.users(id) on delete cascade` in the
// schema (SUPABASE.md). Deleting the auth user is therefore the WHOLE
// job: Postgres removes every dependent row on its own, no manual
// per-table cleanup needed here, and nothing can drift out of sync with
// a manual list that forgets a table added later.
//
// Required for App Store review — Guideline 5.1.1(v): any app that
// offers account creation must offer in-app account deletion, not just
// sign-out. This is that requirement's server half; NativeAppView.swift
// / SettingsView.swift are the client half.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Scoped to the CALLER's own JWT, anon-level permissions only — this
  // client's one job is answering "who is making this request," never
  // deleting anything itself. Whoever the token belongs to is exactly
  // and only who gets deleted below.
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // A SEPARATE client carrying the service_role key — the only thing in
  // this whole system capable of an admin deleteUser call. Read from the
  // function's own environment (set via `supabase secrets set`), never
  // passed in by the caller and never present in the app itself.
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

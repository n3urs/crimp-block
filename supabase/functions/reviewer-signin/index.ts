// Lets Google Play's app reviewer sign in with a fixed, reusable code
// instead of a real one-time email OTP. Deadpoint's only sign-in method
// is passwordless email OTP (useSession.ts) — but Play Console's Sign-in
// details form explicitly asks for "reusable sign-in details that do not
// require you to provide a one-time PIN," and a live-relayed code (Oscar
// reading an inbox on demand) fails that guidance and risks rejection.
//
// The reviewer types a fixed 6-digit code at the exact same "Enter code"
// screen every other user sees — useSession.ts's sendOTP/verifyOTP route
// here only when the email matches REVIEWER_EMAIL, see that file's own
// comment. Under the hood this mints a real, one-time Supabase magic-link
// token via the admin API and redeems it immediately, server-side, so the
// reviewer gets a genuine session without a real random OTP ever needing
// to reach an inbox. Same "service_role never leaves the server" rule as
// delete-account/index.ts.
//
// Self-bootstrapping: the reviewer's auth.users row is created on first
// call, not as a separate manual setup step — see the createUser fallback
// below. Safe to call repeatedly forever after that.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { email, code } = await req.json().catch(() => ({}));
  const reviewerEmail = Deno.env.get("REVIEWER_EMAIL");
  const reviewerCode = Deno.env.get("REVIEWER_CODE");

  // Same generic failure either way — this endpoint has nothing worth
  // telling a wrong guess apart from a wrong email.
  if (!email || !code || email !== reviewerEmail || code !== reviewerCode) {
    return new Response(JSON.stringify({ error: "Invalid email or code" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let link = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    // First call ever for this address: no auth.users row yet. 'magiclink'
    // needs an existing user, so create one and retry — every call after
    // this one takes the generateLink branch above directly.
    const created = await adminClient.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) {
      return new Response(JSON.stringify({ error: created.error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    link = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
  }
  const emailOtp = link.data?.properties?.email_otp;
  if (link.error || !emailOtp) {
    return new Response(JSON.stringify({ error: link.error?.message ?? "Could not generate sign-in link" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Plain anon-level client to redeem it — same verifyOtp call and same
  // type: "email" a real user's device makes in useSession.ts's normal
  // branch, just fed the admin-generated code instead of one mailed out.
  // (An earlier version used token_hash + type: "magiclink" here, which
  // GoTrue rejected with "Email link is invalid or has expired" — this
  // email_otp + type: "email" pairing is what generateLink's own code
  // actually verifies against.)
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await anonClient.auth.verifyOtp({ email, token: emailOtp, type: "email" });
  if (error || !data.session) {
    return new Response(JSON.stringify({ error: error?.message ?? "Could not verify sign-in link" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

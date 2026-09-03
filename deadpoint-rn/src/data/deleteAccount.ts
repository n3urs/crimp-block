/** Pure-ish POST to the delete-account Edge Function, extracted the same
    way overallBar.ts/cardMessage.ts extract pure logic out of a hook or
    component — injecting `fetcher` is what makes this testable without
    mocking global fetch.

    See supabase/functions/delete-account/index.ts for the server half:
    it expects exactly this shape (POST, `Authorization: Bearer <jwt>`,
    `apikey: <anon key>`) and returns {success: true} or {error: string}.
    Required for App Store review, Guideline 5.1.1(v) — this is the
    client half; useSession.ts's `deleteAccount` is the only caller. */
// Deliberately narrower than `typeof fetch`'s real (overloaded, URL |
// RequestInfo) signature: this is the whole slice of it actually used, and
// it's what lets a plain `(url: string, init) => {ok, json}` test double be
// passed with no `as unknown as typeof fetch` cast. The real `fetch` still
// satisfies this type as the default value (its params are a superset,
// its return type a substructure of {ok, json}).
type Fetcher = (url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<any> }>;

export async function callDeleteAccount(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const res = await fetcher(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });
  if (!res.ok) {
    // The function always returns JSON, but a non-JSON body (a proxy
    // timeout page, a cold-start 502 from the platform in front of it)
    // must still surface SOME usable error rather than throwing out of
    // res.json() itself and leaving the caller with a raw parse error.
    const body: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Could not delete your account.');
  }
}

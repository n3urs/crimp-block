# Admin dashboard

Private page for seeing who has signed up, who is actually training, and what
they are doing. Not something athletes ever see.

**Lives at `getdeadpoint.co.uk/admin`.** It sits inside `website/` so it ships
with the marketing site's existing Cloudflare deploy (`wrangler.toml` points at
`./website`) — one deploy, one branch, no second project or DNS record. It
replaces the old copy at `n3urs.github.io/crimp-block/admin/`, which is served
from the retiring PWA on `main`.

## How it is actually private

Not by the URL being unlisted — anyone can load the file. Every read it makes
goes through a `SECURITY DEFINER` Postgres function that checks `is_admin()`
(the signed-in JWT's own email claim) as its first line and raises before
touching a row otherwise. Signing in with any other account renders a
"Not authorised" state and nothing else. RLS on the underlying tables is
untouched; this is a second narrow door, not a hole in the first one.

`noindex, nofollow` is set so it never turns up in search, but that is
tidiness, not the security boundary.

## What it reads

Two existing RPCs, both defined in the root `SUPABASE.md` on the
`react-native-rebuild` branch under "Admin dashboard":

- `admin_user_summary()` — one row per account. Called once.
- `admin_user_sessions(target_user_id)` — one account's full history. Called
  only for accounts the summary already says have logged something, in
  parallel. That is ~5 calls today, not one per account.

If the roster ever grows past a few dozen *active* accounts, replace that
fan-out with a single all-sessions RPC rather than widening it.

## Reading the funnel

Every stage is a strict subset of the one above it:

| Stage | Derived from |
|---|---|
| Accounts created | every row in `auth.users` |
| Signed in at least once | `last_sign_in_at is not null` |
| Finished setup | has a `profiles` row with the quiz completed |
| Logged a session | has any row in `sessions` |
| Trained in the last 7 days | most recent session within 7 days |

**"Signed in at least once" is the number that matters, not "accounts
created".** An account with no `last_sign_in_at` is one nobody was ever behind:
a typo'd address, a crawler, or a test row. Those are listed separately at the
bottom of the page rather than inflating the headline — at the time of writing
that was 8 of 18 accounts, including three variants of the same misspelling and
`you@example.com`, the placeholder from the old admin sign-in form itself.

## Optional: richer profile fields

The page works as-is against the currently deployed functions. Two of its
fields only light up once the SQL below is applied, and it degrades quietly
without them:

- **Rehab-track users** show as "No plan yet" instead of their injury area,
  because a rehab profile never gets an `assigned_template_id`.
- **"Finished setup"** falls back to counting `assigned_template_id`, which
  undercounts by exactly the rehab users.
- **Climb sub-type** (board vs. plain climb) is not shown in a person's recent
  sessions.

Run in the Supabase dashboard → SQL Editor. Both are `create or replace`, so
they are safe to run repeatedly and safe to skip entirely.

```sql
-- Adds the profile columns the dashboard reads for track/rehab/setup state.
-- Every column is cast explicitly to exactly what RETURNS TABLE declares:
-- plpgsql's RETURN QUERY demands an exact type match, not a compatible one,
-- and this function has already shipped one production failure from that
-- (auth.users.email is varchar(255), not text).
create or replace function public.admin_user_summary()
returns table (
  user_id uuid,
  email text,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  tier text,
  assigned_template_id text,
  sessions_logged bigint,
  last_session_date date,
  last_session_type text,
  quiz_completed_at timestamptz,
  track_type text,
  rehab_injury_area text,
  modifiers jsonb
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    u.id::uuid,
    u.email::text,
    u.created_at::timestamptz,
    u.last_sign_in_at::timestamptz,
    p.tier::text,
    p.assigned_template_id::text,
    coalesce(s.cnt, 0)::bigint,
    s.last_date::date,
    s.last_type::text,
    p.quiz_completed_at::timestamptz,
    p.track_type::text,
    p.rehab_injury_area::text,
    p.modifiers::jsonb
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  -- sessions aliased to `sess`, and the subquery's output column to `uid`
  -- rather than `user_id`: RETURNS TABLE's `user_id` is a plpgsql variable
  -- in scope for the WHOLE body, so a bare `user_id` here is genuinely
  -- ambiguous to Postgres. This shipped broken once already.
  -- cnt excludes 'rest' — a logged rest day is real engagement (which is why
  -- last_date/last_type below still count it) but is not a TRAINING session.
  left join (
    select
      sess.user_id as uid,
      count(*) filter (where sess.type != 'rest') as cnt,
      max(sess.date) as last_date,
      (array_agg(sess.type order by sess.date desc))[1] as last_type
    from public.sessions sess
    group by sess.user_id
  ) s on s.uid = u.id
  order by u.created_at desc;
end;
$$;
grant execute on function public.admin_user_summary() to authenticated;

-- Adds the climb sub-type (board vs. plain climb) to the drill-down.
create or replace function public.admin_user_sessions(target_user_id uuid)
returns table (date date, type text, load numeric, sub text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select s.date::date, s.type::text, s.load::numeric, s.sub::text
    from public.sessions s
    where s.user_id = target_user_id
    order by s.date desc;
end;
$$;
grant execute on function public.admin_user_sessions(uuid) to authenticated;
```

## Session colours

Session keys come from three different program families and the page colours
each with that program's own `c` value, never an invented one:

- **Climbing** (`programs.js`, `templates.js`) — maxFingers, hangboard, pull,
  climbHard, outdoorHard, climbEasy
- **Powerbuilding** (`isaacProgram.ts`) — pushHeavy, pushSecondary, pushSpeed,
  pullHeavy, pullSpeed, legs
- **Rehab** (`rehab-templates.js`)

Anything unrecognised falls back to grey and displays its raw key rather than
guessing a label, so a new session type shows up as obviously new instead of
silently miscoloured.

## Local preview

The page cannot be viewed signed-out, and signing in needs a real one-time code
from the admin inbox. To work on the layout without that, stub the Supabase
client: replace the `<script src="…supabase-js@2">` tag with a fake exposing
`auth.getSession()` and `rpc()`, feed it real rows pulled with the service-role
key, and serve `website/` over plain HTTP. Never commit the stub.

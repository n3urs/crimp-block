# Moving storage to Supabase

Do this when you want the log on both phone and laptop, or when you want the
weekly AI review. Not before — localStorage is fine for a fortnight and the
thing most likely to be wrong right now is the rule thresholds, not the storage.

## 1. Schema

Supabase dashboard → SQL Editor → run:

```sql
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  type        text not null,
  load        numeric,
  created_at  timestamptz default now(),
  unique (user_id, date)
);

alter table sessions enable row level security;

create policy "own rows" on sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

The unique constraint on `(user_id, date)` is what makes upsert work — one
session per day, same as the local version.

### Per-exercise working weights

Added later, for the weight each exercise is being trained at. Run this too:

```sql
create table exercise_loads (
  user_id  uuid not null references auth.users(id) on delete cascade,
  date     date not null,
  ex       text not null,
  kg       numeric not null,
  primary key (user_id, date, ex)
);

alter table exercise_loads enable row level security;

create policy "own rows" on exercise_loads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This is deliberately NOT a column on `sessions`. Writing a weight must not
mark the day as trained — you set a weight at the start of a session, and if
that logged the day the card would flip to "Undo" before you had done
anything and the engine would count a session you have not had yet. Separate
table, separate meaning.

`ex` is the exercise's `id` from PROGRAMS in app.js, not its title — titles
get reworded and that would orphan the history. Never reuse or rename an id
once it has data behind it.

The app degrades gracefully if this table is missing: `Loads.load()` logs a
warning and weights simply do not appear. Nothing else breaks.

## 2. Client

Add to `index.html` before `app.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

## 3. Replace the Store object in app.js

Everything else in the file stays exactly as it is. Two things change:
the methods become async, and `render()` needs `await Store.load()` once at boot.

```js
var SUPABASE_URL  = 'https://YOUR-PROJECT.supabase.co';
var SUPABASE_ANON = 'YOUR-ANON-KEY';   // safe in client code — RLS is what protects you

var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var Store = {
  _d:{},
  async load(){
    var since = new Date(Date.now() - 60*86400000).toISOString().slice(0,10);
    var res = await sb.from('sessions').select('date,type,load').gte('date', since);
    this._d = {};
    (res.data||[]).forEach(r => { this._d[r.date] = {t:r.type, l:r.load}; });
  },
  all(){ return this._d; },
  get(date){ return this._d[date] || null; },
  async set(date, type, load){
    this._d[date] = load ? {t:type, l:load} : {t:type};       // optimistic
    var u = (await sb.auth.getUser()).data.user;
    await sb.from('sessions').upsert(
      {user_id:u.id, date, type, load: load ?? null},
      {onConflict:'user_id,date'}
    );
  },
  async clear(date){
    delete this._d[date];
    await sb.from('sessions').delete().eq('date', date);
  }
};
```

Then at the bottom of `app.js`, replace `render();` with:

```js
sb.auth.getSession().then(async ({data}) => {
  if(!data.session){ await sb.auth.signInWithOtp({email:'you@example.com'}); return; }
  await Store.load();
  render();
});
```

Keep writes optimistic — update `_d` first, then fire the network call. The app
must stay usable at the crag with no signal.

## 4. Later: the weekly review

The Anthropic key must never go in the static site. Put it in a Supabase Edge
Function, which reads the last month of `sessions` and returns a short paragraph.
Ask me for that when you get there — it's about forty lines.

## Anon key vs service role

The `anon` key is designed to sit in public client code; RLS is what stops
anyone reading anyone else's rows. The `service_role` key bypasses RLS entirely
— it never leaves the server, and never goes in this repo.

## Admin dashboard

Backs `admin/index.html` — a separate, private page for seeing who's
signed up and whether they're actually training, not something athletes
ever see. Everything else in this file so far relies on plain per-row RLS
("you can only see your own rows"), which is exactly what an admin view
can't use — it needs to see EVERYONE's rows. Rather than loosening RLS on
`sessions`/`exercise_loads`/`profiles` with an "OR you're the admin"
clause (easy to get subtly wrong, and every future policy change on those
tables would have to remember it's there), every admin read goes through
a `SECURITY DEFINER` function that checks admin status itself before
touching anything. RLS on the underlying tables is untouched — this is a
second, narrow door, not a hole in the first one.

Run in the Supabase dashboard → SQL Editor, in order:

```sql
-- Checks the signed-in JWT's own email claim, so it needs no extra
-- table/row to go stale — change the email here (or extend to an IN
-- list) if who counts as admin ever changes.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'oscar@sullivanltd.co.uk';
$$;

-- Idempotent guard: safe to run whether or not Phase C's `profiles`
-- table above has already been created. admin_user_summary() joins
-- against it, and CREATE FUNCTION validates that referenced tables
-- exist at creation time — so this can't be skipped even for accounts
-- (Oscar's, Joe's) that will never actually have a profiles row, since
-- they're built-in-program users, not template-assigned ones.
create table if not exists profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  assigned_template_id text,
  program_start_date  date not null,
  modifiers           jsonb not null default '{}'::jsonb,
  tier                text not null default 'standard',
  quiz_completed_at   timestamptz,
  tutorial_completed_at timestamptz,
  created_at          timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists "own row" on profiles;
create policy "own row" on profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One row per signed-up account: auth.users isn't reachable through
-- PostgREST at all normally (it's outside the `public` schema on
-- purpose) — SECURITY DEFINER is what lets this specific, gated query
-- reach it. sessions_logged/last_session_date/last_session_type answer
-- "are they actually training", not just "did they sign up".
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
  last_session_type text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  -- Every column explicitly cast to exactly what RETURNS TABLE above
  -- declares. plpgsql's RETURN QUERY demands an exact type match, not a
  -- compatible one, and auth.users.email is varchar(255) rather than
  -- text — which failed with "structure of query does not match
  -- function result type" on the real database. Casting all of them,
  -- not just that one, so no other column can fail the same way later.
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
    s.last_type::text
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  -- sessions aliased to `sess`, and the subquery's own output column
  -- to `uid` rather than `user_id` — RETURNS TABLE's `user_id` becomes
  -- a plpgsql variable in scope for the WHOLE function body, so a bare
  -- `user_id` here is genuinely ambiguous to Postgres (is it that
  -- variable, or sessions.user_id?), not just a style nit. Caught live:
  -- this shipped once with a bare reference and every sign-in on the
  -- real admin page failed with "column reference user_id is
  -- ambiguous" until this was fixed.
  -- cnt excludes 'rest' — a logged rest day is real app engagement
  -- (which is exactly why last_date/last_type below still count it, so
  -- "last active" stays honest) but isn't a TRAINING session, and
  -- counting it toward sessions_logged just inflates the number with
  -- no training behind it. Reported directly: "not sure how I have 13".
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

-- Per-user history for the drill-down view (the calendar-style grid) —
-- same admin gate, scoped to one account at a time rather than
-- returning everyone's full history in the summary call above.
create or replace function public.admin_user_sessions(target_user_id uuid)
returns table (date date, type text, load numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select s.date, s.type, s.load
    from public.sessions s
    where s.user_id = target_user_id
    order by s.date desc;
end;
$$;
grant execute on function public.admin_user_sessions(uuid) to authenticated;
```

**Why `SECURITY DEFINER` is safe here, not a foot-gun**: the function runs
with the privileges of whoever created it (bypassing RLS entirely), which
is exactly what you don't want unless the function is airtight about who
it lets in. Every one of the three functions above either does nothing
privileged (`is_admin()` only reads the caller's own JWT) or checks
`is_admin()` as its very first line and raises before touching a single
row otherwise — there's no code path that reaches the privileged query
without that check passing first.

**Subscription status is a known gap, not an oversight**: Phase D's
entitlement check is client-side only (`Transaction.currentEntitlements`
— see the plan), so there's no row anywhere in Supabase recording who's
actually paying. The admin page shows "Built-in" for Oscar/Joe (accurate
— `isBuiltInProgram` skips the paywall entirely) and leaves it blank for
anyone else rather than guessing. Real subscriber numbers live in App
Store Connect until/unless a server-side receipt sync gets built.

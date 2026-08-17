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

## Phase C: templates & profiles

Not run yet — this is the schema `template-resolver.js` and the native intake
quiz are designed against, for when template-assigned (Standard-tier) users
are introduced alongside Oscar's and Joe's hand-authored programs. Run this
when Phase C's quiz/onboarding UI is ready to actually write somewhere real.

```sql
create table templates (
  id               text primary key,        -- e.g. 'boulderingBeginner', matches TEMPLATES key in templates.js
  name             text not null,
  discipline       text not null,           -- 'bouldering' | 'sport'
  experience_level text not null,           -- 'beginner' | 'advanced'
  goal_focus       text not null default 'general',
  program          jsonb not null,          -- {perWeek, phases, sessions} — same shape as a programs.js entry, minus startDate
  is_custom        boolean not null default false,  -- true for a one-off Custom-tier program Oscar entered by hand (Phase F)
  created_at       timestamptz default now()
);

-- Templates are read by every signed-in user (to resolve their own program)
-- but never written by them — only Oscar, via the dashboard or a future
-- admin tool, ever inserts/updates a row here.
alter table templates enable row level security;

create policy "anyone signed in can read" on templates
  for select
  using (auth.role() = 'authenticated');

create table profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  assigned_template_id text references templates(id),
  program_start_date  date not null,        -- becomes the resolved program's startDate — NOT the same as quiz-completion instant, in case that ever needs backdating
  modifiers           jsonb not null default '{}'::jsonb,  -- {equipment:[...], injuryFlags:[...], weaknesses:[...], tripDate:'YYYY-MM-DD'|null, daysPerWeek:n}
  tier                text not null default 'standard',    -- 'standard' | 'custom'
  quiz_completed_at   timestamptz,
  tutorial_completed_at timestamptz,
  created_at          timestamptz default now()
);

alter table profiles enable row level security;

create policy "own row" on profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

At load time, a template-assigned user's program is built as:

```
profile   = select * from profiles where user_id = auth.uid()
template  = select * from templates where id = profile.assigned_template_id
program   = TemplateResolver.resolveTemplate(template.program, {
              startDate: profile.program_start_date,
              modifiers: profile.modifiers
            })
```

— then `program` goes into `createEngine()` exactly like a `programs.js` entry
does today. Oscar's and Joe's programs are **not** migrated onto this —
they keep loading straight from `programs.js` as they always have, per the
plan's explicit call to leave a working thing alone.

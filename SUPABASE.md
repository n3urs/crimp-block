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

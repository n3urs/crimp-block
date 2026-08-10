# Crimp Block

A six-month climbing training scheduler. No fixed weekdays — it works from
rolling seven-day quotas plus recovery gaps, so a spontaneous day at the crag
reshuffles the week instead of breaking it.

Open it, see one session, tap Done. That's the whole app.

## Deploy

```bash
cd crimp-block
git init
git add .
git commit -m "Crimp Block"
git branch -M main
git remote add origin https://github.com/n3urs/crimp-block.git
git push -u origin main
```

Create the repo first at https://github.com/new (public, no README).
Then Settings → Pages → Source: `main`, folder `/ (root)`.

Live at `https://n3urs.github.io/crimp-block/` after a minute or two.

On your phone: open it, Share → **Add to Home Screen**. It runs full-screen and
works offline, which matters at the crag.

## Before you start

Edit one line at the top of `app.js`:

```js
var START_DATE = '2026-08-10';   // Monday of week 1
```

That drives the block and week counter and the deload flag on every fourth week.

## How it decides

Priority order, first thing that isn't blocked wins:

| Session | Cap per 7 days | Gate |
|---|---|---|
| Max Fingers | 1 | 3 days since the last one, and yesterday light on fingers |
| Hangboard | 1 | 2 days since any finger session |
| Pull | 1 | 2 days since the last one — ignores finger fatigue |
| Climbing | 4 | — |

Forced rest after 3 consecutive loaded days, or 5 hard days in 7.

Max Fingers goes first because it's the session that moves your weakness and the
one most easily crowded out. Pull ignores finger load, which is what makes it the
natural fallback the day after hard granite.

## Changing the rules

Everything lives in `decide()` in `app.js`. The thresholds are the numbers most
likely to need tuning once you've used it — if three days between Max Fingers
turns out to be too cautious, it's a one-character change.

Session content is in the `T` object above it. `finger` and `pull` are load
scores from 0–3 and are what the engine actually reasons about.

## Storage

`localStorage`, on the device. The `Store` object at the top of `app.js` is the
only code that touches persistence — see `SUPABASE.md` to move it off-device.

## Files

- `index.html` — markup and styles
- `app.js` — rules engine, rendering, storage
- `sw.js` — offline cache (bump `CACHE` when you change a file)
- `manifest.json`, `icon.svg` — home-screen install

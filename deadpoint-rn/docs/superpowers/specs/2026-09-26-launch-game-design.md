# Launch — a max-pull force gauge game

Agreed with Oscar 26 Sep 2026. Second force-gauge game next to Flappy Bird:
one big pull fires the bird straight up through the sky and out into space;
the harder the pull, the higher he goes.

## Round

1. **Ready** — bird on a launch pad on the grass. Instructions: one arm on
   the 20 mm edge, pull as hard as you can, let go to launch.
2. **Charge** — a pull over 2 kg starts a 3 s window. Score = the **peak kg**
   inside the window (lightly smoothed, same trailing average as Flappy, so
   one noisy sample can't set it). Live kg, the held peak, a power meter
   marked with the landmarks, and a draining 3 s timer are all on screen;
   the bird squashes down and shakes harder the harder you pull.
3. **Launch** — the moment you let go (under 1 kg), or when the 3 s run out.
4. **Flight** — the camera follows him up; sky fades blue → navy → black,
   stars fade in, landmarks pass on the way (with a ding and a banner each),
   speed lines and a smoke/fire trail while he's fast. He eases to a stop at
   the height for the peak kg: a gold ring, a fanfare, and a "TO THE MOON"
   card pinned at the top.
5. **The fall** (added the same day at Oscar's request) — after a moment at
   the top he falls all the way back down, nose-first and flapping, past
   everything again; a parachute pops open around rooftop height and he
   drifts onto the pad with a puff of dust.
6. **Result** — only once he's landed: "TO THE MOON" (the highest landmark
   passed), altitude big, kg under it ("58.2 KG · ONE ARM"), personal/week
   best. Gym station: name prompt if it makes the board, back to the waiting
   screen after 12 s. Another round needs a release and a fresh pull, and
   the result stays up at least 1.5 s.

**Board lines.** Each person on this week's board (gym station) — or the
player's own best (personal) — is a pink dashed line across the sky at the
height their pull reached, name and kg on it. Passing one on the way up
(strictly higher; a tie isn't a win) turns it green and pops a "YOU BEAT
ISAAC!" banner.

## Height ladder (one arm, top at 100 kg, open-ended to 120)

World position = kg, so landmarks are evenly spaced on screen. Altitude
shown = log-interpolated between anchors:

| kg | landmark | altitude |
|---|---|---|
| 5 | rooftops | 10 m |
| 10 | treetops | 30 m |
| 15 | hot-air balloons | 1 km |
| 20 | clouds | 3 km |
| 25 | Everest | 8,849 m |
| 30 | planes | 11 km |
| 35 | stratosphere | 30 km |
| 40 | edge of space | 100 km |
| 50 | ISS | 408 km |
| 60 | satellites | 20,200 km |
| 70 | the Moon | 384,400 km |
| 80 | Mars | 225 million km |
| 90 | Jupiter | 778 million km |
| 95 | Saturn | 1.4 billion km |
| 100 | edge of the solar system | 24 billion km |
| 110 | the next star | 4.2 light years |
| 120 | another galaxy | 2.5 million light years |

## Where

- **Gym station** (`app/gym.tsx`): FLAPPY BIRD / LAUNCH switch above the
  game (hidden mid-round); pull starts the selected game. Launch has its own
  weekly top 5 (`launchBoard` key, same one-per-name rules). Staff reset
  clears both.
- **Personal** (`app/force-gauge.tsx`): PLAY FLAPPY BIRD / PLAY LAUNCH.
  Personal best height kept on the device only.

## Scores and stats

Board/stat score for Launch = peak kg × 10 (integer). `gym_events` gains a
`game` column ('flappy' default | 'launch') and a wider score range for
launch; `admin_gym_stats()` splits Flappy and Launch; the admin page shows
both. SQL in SUPABASE.md, run by Oscar.

## Build

- `launchPhysics.ts` — pure, tested: ladder, altitude, phrases, formatting,
  flight curve, charge state machine.
- `useLaunchGame.ts` — gauge → state machine wiring (like useFlappyBird).
- `LaunchGame.tsx` + `LaunchScenery.tsx` — the scene. Flight runs on the UI
  thread (Reanimated): one clock drives camera, sky colour, stars, speed
  lines, trail and bird; React only re-renders on phase changes and HUD
  text. Landmarks are memoised SVG pieces in a translated world layer.
- Bird drawing shared with Flappy (`BirdSprite.tsx`).
- New game cues: charge tick, launch whoosh, landmark ding, landing fanfare.

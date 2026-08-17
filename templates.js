/* ============================================================
   TEMPLATES
   Phase C's template library — same job as PROGRAMS in programs.js
   (plain data, no logic, same seven session keys engine-core.js
   requires), but keyed by template id instead of a hardcoded email,
   and missing `startDate` (assigned per-user by template-resolver.js
   at quiz-completion time, not baked into the template itself).

   THIS FILE CONTAINS DRAFT TEMPLATES, DELIBERATELY, ONE AT A TIME.
   Per the commercial-relaunch plan, the template matrix (discipline x
   experience-level, 6 cells minimum, each further tuned by a
   goal-focus/equipment/injury modifier layer rather than more grid
   cells — see template-resolver.js) is real content-authoring work
   that belongs to Oscar's coaching judgement, not something to
   generate wholesale. Every template below is a first, reviewable
   draft, checked against real published sources (cited inline per
   template, not just generic "coaching literature" hand-waving —
   `boulderingBeginner`'s Foundation phase was corrected once after
   the first draft turned out to be too aggressive on fingerboard
   timing versus what those sources actually say) and the same
   structural shape as Oscar's and Joe's own programs, NOT copied from
   any specific paid program's proprietary content. Treat every number
   and exercise choice as a starting point to correct, not a finished
   product — none of this has been run past a real athlete the way
   Oscar's and Joe's programs have.
   ------------------------------------------------------------ */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TEMPLATES = factory();
})(typeof self !== 'undefined' ? self : this, function(){
"use strict";
return {
  boulderingBeginner: {
    meta: {
      name: 'Bouldering — Beginner',
      discipline: 'bouldering',
      experienceLevel: 'beginner',
      goalFocus: 'general',
      description: 'For someone newer to bouldering who wants real structure without heavy fingerboard loading on day one. Technique and volume carry the first month; finger-specific work is introduced gradually once general strength and movement are established.'
    },
    perWeek: 3,
    phases: [
      {n:'Foundation', from:1, c:'--tidepool', cue:'Movement and general strength — fingers stay light', d:'Four weeks of pure foundation. Bouldering volume and general strength build the base everything else sits on, while finger-specific loading stays deliberately light — tendons and pulleys adapt slower than muscle does, so this month is about giving them a head start rather than rushing to a heavy fingerboard session you are not ready for yet.'},
      {n:'Base Strength', from:2, c:'--gorse', cue:'Progressive — building real finger and pull strength', d:'The main block, and the longest — twelve weeks. Finger conditioning and pull work step up gradually now that the foundation month is behind you. Still nowhere near a real "max" session — that is a later-phase, more-experienced-athlete thing — but real, structured progression.'},
      {n:'Performance', from:5, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back and climbing takes over. One finger-conditioning session and one general-strength session a week to hold what you built; the rest of your sessions are projecting and mileage.'}
    ],
    sessions:{
      maxFingers:{n:'Finger Conditioning', w:'Home/Gym · 30 min', c:'--gorse', finger:1, pull:0, note:'This is deliberately light, not a top-set day — the point right now is teaching your fingers to tolerate load consistently, not finding your ceiling. During Foundation, edge-specific work is skipped entirely and this session is general grip only — several sources (Lattice Training included) are clear that even light edge loading is worth deferring until some base fitness and climbing-specific tissue tolerance exists, not just introduced lighter from day one.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then two progressively firmer two-hand jug hangs before touching an edge.'},
          {t:'Open-hand hang — largest comfortable edge',m:'4 × 8s',ph:{'Foundation':'skip — see the note above this session; edge-specific loading starts once Base Strength does','Base Strength':'5 × 8s — one more set now the foundation month is done','Performance':'3 × 8s — maintain only'},d:'Two hands, open-hand (no crimp), an edge size you can hold for the full 8 seconds without your form breaking down. If you don’t have a hangboard, a doorway pull-up bar edge or a thick towel over a bar both work fine at this stage.',r:90},
          {t:'Light half-crimp hang',m:'3 × 5s',ph:{'Foundation':'skip — open-hand only this phase, half-crimp is more load than the first month needs','Performance':'3 × 5s — maintain only'},d:'Introduced once Base Strength starts. A comfortably larger edge than the open-hand one above — this is about pattern, not load.',r:90},
          {t:'Dead hang or top-of-pull-up hold',m:'3 × 10s',d:'Jug or bar, whichever you have — general grip and shoulder conditioning, nothing finger-specific yet.',r:60}
        ]},
      hangboard:{n:'Repeaters', w:'Home/Gym · 25 min', c:'--slate', finger:1, pull:0, note:'Light, submaximal repeaters — around the intensity you could hold a conversation through, not a grind. Skipped entirely during Foundation — see Finger Conditioning\'s note on why edge-specific loading waits until Base Strength.',
        x:[
          {t:'Warm up',m:'8 min',d:'Pulse raise, then a couple of easy jug hangs.'},
          {t:'Repeaters — largest comfortable edge',id:'tpl-rep',m:'3 sets',interval:{on:7,off:3,reps:5},ph:{'Foundation':'skip — edge-specific loading starts once Base Strength does','Base Strength':'4 sets','Performance':'2–3 sets — maintain only'},d:'7s on / 3s off. Should feel moderate throughout — if the last couple of reps in a set are genuinely maximal, size up the edge next session rather than pushing through. Press Start below and just hang.',r:120}
        ]},
      pull:{n:'General Strength', w:'Home/Gym · 35 min', c:'--tidepool', finger:0, pull:2, note:'No finger loading in this session by design — spend the grip you have on climbing days, not here.',
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts and scap pulls before anything weighted.'},
          {t:'Pull-ups (or assisted/negatives)',m:'4 × 6',ph:{'Foundation':'4 × 4 (or negatives) — building toward this','Base Strength':'4 × 8','Performance':'3 × 6 — maintain only'},d:'Full range. If a clean pull-up isn’t there yet, use a band, an assisted machine, or slow negatives from the top — same slot, whichever version is honest for where you are.',r:120},
          {t:'Push-ups or bench press',m:'3 × 10',d:'General pushing strength — climbing is pull-dominant enough that this matters for shoulder balance.',r:90},
          {t:'Core — hanging knee raises or plank',m:'3 sets',d:'Hanging knee raises if you can hang comfortably; a hard plank progression otherwise.',r:60},
          {t:'Antagonists',m:'2 supersets',d:'Reverse wrist curls 2×15 · finger extensors 2×15 (a rubber band round the fingertips, opening the hand against it). Cheap insurance while you’re building finger load elsewhere in the week.'}
        ]},
      climbHard:{n:'Bouldering Session', w:'Gym · 75 min', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Warm up',m:'15 min',d:'Easy, easy, then moderate — do not jump straight to your limit.'},
          {t:'Volume bouldering',m:'45 min',ph:{'Foundation':'60 min — this phase leans on volume more than anything else','Performance':'projecting — no fixed time'},d:'A wide spread of styles and angles rather than repeating what you’re already good at — this is where the actual climbing-specific adaptation happens.'},
          {t:'A few near-limit attempts',m:'15 min',ph:{'Foundation':'skip — pure volume this phase, no limit attempts yet'},d:'Once the foundation month is behind you: a small number of genuinely hard tries, fully rested between them.'},
          {t:'Cool down',m:'10 min',d:'Easy traversing.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Outdoor holds and cold rock are less forgiving than a gym — do not skip this.'},
          {t:'Climb within yourself',m:'—',d:'Outdoor grades and gym grades rarely match at first — treat today as calibration, not a number to hit.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit — footwork and reading movement, actively resting the effort you spent on your hard day.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Full rest matters more early on than it will later — this is exactly the tissue-adaptation window this whole plan is designed around.', x:[]}
    }
  },

  /* boulderingIntermediate — for someone roughly a couple of years
     into climbing who has hit the well-documented V3-V4 plateau:
     technique gains from pure volume have slowed, and real
     specific-strength work now pays off in a way it doesn't for a
     true beginner. Checked against real sources BEFORE drafting this
     time (see boulderingBeginner's history above for why that order
     matters):
       - Max hangs are appropriate now ("works best for intermediate
         climbers with a couple years of climbing behind them" —
         strengthclimbing.com's write-up of Eva López's protocol),
         using her margin-before-failure approach: pick a load/edge
         where your true max would be about 3s longer than the
         prescribed hang time, not a true 1RM attempt every session.
       - Repeaters stay in the standard 7s-on/3s-off x6 protocol,
         lower relative load than max hangs, primed with a light
         30-40%-max warm-up set first.
       - Lattice Training: strength work belongs in a base period
         (slowest to adapt, sets up power later), power work gets
         introduced 2-6 weeks before a goal, and even in-season only
         2 strength/power sessions a week are needed — more isn't
         better here.
       - Lattice explicitly cautions intermediates against jumping
         into campus board training without a coach's direct
         guidance — this template deliberately uses explosive
         pull-ups for power conversion instead, not campus moves.
       - The plateau itself is often as much about technique and
         session structure (consistent 3-4x/week, dedicated bouldering
         AND climbing-volume sessions rather than undifferentiated
         "just climbing") as it is about raw strength — kept the
         Bouldering Session's own volume/limit-attempt split rather
         than making this purely a strength-and-hangboard plan. */
  boulderingIntermediate: {
    meta: {
      name: 'Bouldering — Intermediate',
      discipline: 'bouldering',
      experienceLevel: 'intermediate',
      goalFocus: 'general',
      description: 'For someone a couple of years into bouldering who has hit the classic V3–V4 plateau — pure volume has stopped moving the needle, and real structured finger and power work is now appropriate in a way it isn\'t for a true beginner.'
    },
    perWeek: 4,
    phases: [
      {n:'Strength Base', from:1, c:'--gorse', cue:'Build real strength — this is where the slow adaptations happen', d:'Eight weeks establishing real finger and pull strength. Strength training takes the longest to produce adaptations of anything in this plan, which is exactly why it goes first and gets the most time — everything in the Power phase depends on the base built here.'},
      {n:'Power', from:3, c:'--heather', cue:'Convert strength into speed — introduced 2–6 weeks before it matters most', d:'Same lifts, less load, moved faster — converting the strength you just built into the explosiveness that actually breaks a plateau. Contact strength on the fingers rather than long holds; explosive pulling rather than grinding reps.'},
      {n:'Performance', from:5, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'One strength session and one power-conversion session a week to hold what you built (Lattice\'s own guidance: even in-season, two sessions a week is enough) — the rest of your training is climbing itself.'}
    ],
    sessions:{
      maxFingers:{n:'Max Hangs', w:'Home/Gym · 35 min', c:'--gorse', finger:2, pull:0, note:'Margin-before-failure, not a true 1-rep max — pick a load or edge where your absolute limit would be a few seconds past the prescribed time, not exactly at it.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier hangs on a jug before touching a smaller edge — never load a cold tendon.'},
          {t:'Weighted or edge max hang',id:'tpl-int-maxhang',m:'4 × 8s',ph:{'Power':'5 × 5s — shorter, sharper, contact-focused rather than time-under-tension','Performance':'skip — hold what you built, repeaters only'},d:'Half-crimp or open-hand, whichever you climb more on. Add weight if the edge alone isn\'t enough to hit the target time near your limit; take it off an edge size instead if it is. Full 3–5 minutes between efforts — this is near-max work and stops being near-max without real rest.',r:210},
          {t:'Secondary position hang',m:'3 × 6s',ph:{'Power':'skip — one hang variation is enough intensity work this phase'},d:'Whichever grip position you didn\'t just train above (open-hand if you did half-crimp, or vice versa) — submaximal, this is coverage, not the main event.',r:120}
        ]},
      hangboard:{n:'Repeaters', w:'Home/Gym · 25 min', c:'--slate', finger:2, pull:0, note:'Lower load than the Max Hangs session by design — prime with an easy warm-up set at 30–40% before your first working set.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then one light priming set of repeaters at roughly 30–40% of what you expect your working load to be.'},
          {t:'Repeaters',id:'tpl-int-rep',m:'4 sets',interval:{on:7,off:3,reps:6},ph:{'Power':'2 sets — reduced, priority is the contact-strength work in Max Hangs this phase','Performance':'2–3 sets — maintain only'},d:'7s on / 3s off × 6 = one set. Moderate load — if the last couple of reps in a set are genuinely maximal, the load is too high for this protocol, size down. Press Start below and just hang.',r:120}
        ]},
      pull:{n:'Pull & Power', w:'Home/Gym · 40 min', c:'--tidepool', finger:0, pull:2, note:'Deliberately not campus board work — Lattice\'s own guidance is that intermediate climbers trying campus training should get a trusted coach\'s direct guidance first. Explosive pull-ups get a similar power-conversion stimulus without that specific risk.',
        x:[
          {t:'Warm up',m:'8 min',d:'Band pull-aparts and scap pulls before anything weighted or explosive.'},
          {t:'Pull-ups',m:'4 × 6',ph:{'Strength Base':'4 × 6','Power':'4 × 4 — lower reps, save the effort for the explosive set below','Performance':'3 × 6 — maintain only'},d:'Weighted if 6 clean reps is comfortable at bodyweight; bodyweight otherwise. Full range, controlled — this is the strength half of the session, not the power half.',r:150},
          {t:'Explosive pull-ups',m:'skip — Strength Base phase, save this for Power',ph:{'Power':'4 × 3 — explosive, as much height as you can generate cleanly','Performance':'skip — maintain phase, standard pull-ups above cover this'},d:'As much upward speed as you can generate without losing form — the power-conversion piece of this phase. Full rest between reps, this is quality over quantity.',r:150},
          {t:'Core — front lever progression or hanging leg raises',m:'4 sets',d:'Whichever you\'re closer to holding cleanly — straight into failure on the harder one, or higher volume on the easier one.',r:75},
          {t:'Antagonists',m:'2 supersets',d:'Reverse wrist curls 3×15 · finger extensors 3×15 · external rotation 2×12. Cheap insurance while everything else in this program loads the fingers and pulling muscles hard.'}
        ]},
      climbHard:{n:'Bouldering Session', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Warm up',m:'20 min',d:'Full pyramid — easy, moderate, then a couple of hard-but-not-limit problems before anything at your ceiling.'},
          {t:'Limit bouldering',m:'40 min',ph:{'Strength Base':'50 min — volume-leaning, this phase blends strength work with still-substantial mileage','Power':'25 min — fewer attempts, full power between each one','Performance':'projecting — no fixed time'},d:'At or near your limit, on steep/overhanging terrain specifically — this is where climbing-specific power actually transfers, and where a plateau built on flat-wall volume tends to break.',r:180},
          {t:'Volume on a new style',m:'20 min',ph:{'Power':'skip — this phase is about quality attempts, not added volume'},d:'Whatever style you gravitate away from — slopers if you\'re a crimper, compression if you\'re a slab climber. The plateau is as often a style gap as a strength gap.'},
          {t:'Cool down',m:'10 min',d:'Easy traversing.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold rock and cold tendons is how the injuries in this phase of training actually happen.'},
          {t:'Project',m:'—',d:'Pick something that pushes you — outdoor grades rarely match gym grades directly, treat the first attempt as calibration.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit — actively resting the effort spent on your hard days, not adding more of it.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Two structured strength/power sessions a week is the target here, not more — Lattice\'s own guidance is that additional volume past that point doesn\'t buy you more adaptation, just more fatigue.', x:[]}
    }
  },

  /* boulderingAdvanced — for someone climbing V8+ who has already built
     real finger strength and is chasing the smaller gains that remain.
     Researched before drafting (same discipline as the other two):
       - Eva Lopez's 8-week MaxHangs cycle (4 weeks MAW - Maximum
         Additional Weight - then 4 weeks MED - Minimum Edge Depth)
         is reported to yield real strength gains in this population,
         with 48h between sessions being sufficient recovery
         (strengthclimbing.com's write-up).
       - A peer-reviewed RCT (Nature Scientific Reports, 2021) studied
         hangboard training specifically in advanced climbers -
         confirming this population is exactly who structured max-hang
         protocols are validated for, unlike beginners/intermediates.
       - Campus board training has real prerequisites before it's
         appropriate even at this level - commonly cited gate: a
         one-arm hang around 20mm for ~20s, and 10 strict pull-ups
         (climbmaxxing.today's protocol writeup). Gated behind an
         explicit note here, not assumed.
       - Real caution worth taking seriously: at V8+, connective
         tissue is already stiff and recruitment is already high, so
         the remaining gains are smaller and the risk/reward of
         chasing them with more max-intensity loading gets worse, not
         better (CAMP4 Human Performance's writeup on the advanced
         plateau) - reflected in the Power phase note below.
       - Lattice's own base->strength->power->deload cycle and
         2-sessions/week strength-or-power cap apply here too, same
         as the intermediate template. */
  boulderingAdvanced: {
    meta: {
      name: 'Bouldering — Advanced',
      discipline: 'bouldering',
      experienceLevel: 'advanced',
      goalFocus: 'general',
      description: 'For someone climbing V8 and above who has already built real finger and pull strength. The gains left at this level are smaller and the risk of chasing them carelessly is higher — this leans on established protocols (Eva López’s MaxHangs cycle, gated campus work) rather than just adding more load.'
    },
    perWeek: 4,
    phases: [
      {n:'Base', from:1, c:'--tidepool', cue:'Short and submaximal — a reset, not a rebuild', d:'Four weeks, deliberately short — you’re not rebuilding from nothing the way a beginner or intermediate template would be. This is a capacity reset before the MaxHangs cycle below, not a new foundation.'},
      {n:'Max Strength — MAW', from:2, c:'--gorse', cue:'Added weight, comfortable edge — the first half of Eva López’s 8-week cycle', d:'Four weeks of Maximum Additional Weight hangs: a comfortable edge with weight added to hit near-max effort. The first half of López’s two-block MaxHangs cycle — the edge size stays constant here, only the added weight changes session to session.'},
      {n:'Max Strength — MED', from:3, c:'--gorse', cue:'Minimum edge depth, bodyweight only — the second half of the cycle', d:'Four weeks of Minimum Edge Depth hangs: drop the added weight, drop the edge size instead — same near-max effort, the other lever. This is what makes it an 8-week CYCLE rather than one protocol repeated for two months straight.'},
      {n:'Power', from:4, c:'--heather', cue:'Contact strength and campus work — gated, not assumed', d:'Four weeks converting strength into speed. Campus board work is included here on the assumption you already meet the standard prerequisites (a comfortable one-arm hang around 20mm for ~20s, 10 strict pull-ups) — if you don’t, swap it for more limit bouldering and revisit campus once you do. At this level the remaining strength gains are small and the injury risk of chasing them with more raw load is real — this phase is about applying what you have faster, not finding a new ceiling.'},
      {n:'Performance', from:5, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'One strength and one power-conversion session a week to hold what you built — the rest of your training is climbing itself.'}
    ],
    sessions:{
      maxFingers:{n:'Max Hangs', w:'Home/Gym · 40 min', c:'--gorse', finger:3, pull:0, note:'48 hours between sessions is enough recovery for this protocol — more isn’t automatically better here.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier hangs on a jug before touching a smaller edge.'},
          {t:'MAW hang — added weight',id:'tpl-adv-maw',m:'skip — see Max Strength — MAW / MED phases above for this cycle',ph:{'Base':'4 × 8s — lighter, this phase is a reset','Max Strength — MAW':'5 × 7s — half-crimp, comfortable edge, weight added to reach near-max effort'},d:'Half-crimp, a comfortable edge with weight added to hit near-max at 7s. Full 3–5 minutes between efforts. Active only during the MAW phase — once Max Strength — MED starts, this one stops and the exercise below takes over.',r:210},
          {t:'MED hang — minimum edge',id:'tpl-adv-med',m:'skip — Max Strength — MED phase only, see MAW hang above',ph:{'Max Strength — MED':'4 × 7s — smallest edge you can hold bodyweight for the full time, no added weight'},d:'Active only during Max Strength — MED: drop the added weight, drop the edge size instead. Same time-under-tension target as the MAW phase, different lever.',r:210},
          {t:'Recruitment pulls',m:'skip — Power phase only',ph:{'Power':'6 × 3s — fast, hard pull onto the edge, held briefly then released','Performance':'skip — Power phase only, standard repeaters below cover maintenance'},d:'Speed and intensity of contraction rather than sustained load — teaching the nervous system to fire everything quickly, not just hold on longer. Full recovery between reps.',r:150}
        ]},
      hangboard:{n:'Repeaters', w:'Home/Gym · 25 min', c:'--slate', finger:2, pull:0, note:'Capacity work — kept in the program year-round even while Max Hangs is the main event, because repeaters and max hangs train different qualities.',
        x:[
          {t:'Warm up',m:'8 min',d:'Light priming set at 30–40% before working sets.'},
          {t:'Repeaters',m:'4 sets',interval:{on:7,off:3,reps:6},ph:{'Power':'2 sets — reduced, priority is recruitment pulls and campus this phase','Performance':'2–3 sets — maintain only'},d:'7s on / 3s off × 6 = one set. Moderate-heavy — this should be genuinely harder than the intermediate version, but still a capacity protocol, not a max effort.',r:120}
        ]},
      pull:{n:'Pull & Lock-off', w:'Home/Gym · 45 min', c:'--tidepool', finger:0, pull:3, note:null,
        x:[
          {t:'Warm up',m:'8 min',d:'Band pull-aparts and scap pulls before anything heavy.'},
          {t:'Weighted pull-ups',m:'5 × 4',ph:{'Base':'4 × 6 — lighter','Power':'5 × 3 — heavier, lower reps, save volume for campus/recruitment work','Performance':'3 × 5 — maintain only'},d:'Full dead hang to full lockout. Heavy — this is the main lift of the session.',r:180},
          {t:'One-arm progression',m:'4 × 6–8s / arm',d:'Whatever your current honest progression is — assisted, negatives, or a real one-arm hang. Alternate arms.',r:90},
          {t:'Front lever',m:'4 × 10–12s',d:'Hardest clean variation you hold — straddle, single-leg, or full.',r:75},
          {t:'Antagonists',m:'3 supersets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 · external rotation 3×12 · dips 3×10. Non-negotiable at this training load — skipping this is how the imbalances that cause injury actually happen.'}
        ]},
      climbHard:{n:'Bouldering Session', w:'Gym · 90 min', c:'--heather', finger:3, pull:3, climb:1,
        x:[
          {t:'Warm up',m:'20 min',d:'Full pyramid to your ceiling before anything at your limit.'},
          {t:'Limit bouldering',m:'40 min',ph:{'Base':'50 min — volume-leaning reset','Power':'25 min — fewer, higher-quality attempts'},d:'At or near your limit — steep terrain specifically, where power and contact strength actually transfer.',r:180},
          {t:'Campus board',m:'skip — Power phase only, and only if you meet the prerequisites in this phase’s description',ph:{'Power':'20 min — short ladders, full recovery between'},d:'Standard prerequisite before attempting this: a comfortable one-arm hang around 20mm for ~20s, and 10 strict pull-ups. If that’s not honestly true yet, skip this and add more limit bouldering instead — campus is a precision tool for people who’ve already built the base it assumes.',r:180},
          {t:'Cool down',m:'10 min',d:'Easy traversing.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:3, climb:1,
        x:[
          {t:'Warm up properly',m:'25 min',d:'Cold rock and cold tendons at this training load is a real injury risk, not a formality.'},
          {t:'Project',m:'—',d:'Pick something at your limit — outdoor grades rarely match gym grades directly.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit — actively resting the effort spent on your hard days.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'At this training load, skipping a rest day is one of the more common ways advanced climbers hurt themselves — the fatigue is real even when it doesn’t feel like it yet.', x:[]}
    }
  }
};
});

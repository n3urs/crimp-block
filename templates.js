/* ============================================================
   TEMPLATES
   Phase C's template library — same job as PROGRAMS in programs.js
   (plain data, no logic, same seven session keys engine-core.js
   requires), but keyed by template id instead of a hardcoded email,
   and missing `startDate` (assigned per-user by template-resolver.js
   at quiz-completion time, not baked into the template itself).

   THIS FILE CONTAINS ONE DRAFT TEMPLATE, DELIBERATELY. Per the
   commercial-relaunch plan, the template matrix (discipline x
   experience-level x goal-focus) is real content-authoring work that
   belongs to Oscar's coaching judgement, not something to generate
   wholesale. `boulderingBeginner` below is a first, reviewable draft
   — grounded in generally-published climbing-training principles
   (progressive tendon/pulley loading, general-strength-before-
   finger-specific-load for true beginners — the kind of guidance
   found across mainstream climbing coaching literature, e.g. Eric
   Hörst's "Training for Climbing", Steve Bechtel, Lattice's public
   content) and the same structural shape as Oscar's and Joe's own
   programs, NOT copied from any specific paid program's proprietary
   content. Treat every number and exercise choice in here as a
   starting point to correct, not a finished product — it hasn't been
   run past a single real athlete the way Oscar's and Joe's programs
   have.
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
      maxFingers:{n:'Finger Conditioning', w:'Home/Gym · 30 min', c:'--gorse', finger:1, pull:0, note:'This is deliberately light, not a top-set day — the point right now is teaching your fingers to tolerate load consistently, not finding your ceiling.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then two progressively firmer two-hand jug hangs before touching an edge.'},
          {t:'Open-hand hang — largest comfortable edge',m:'4 × 8s',ph:{'Base Strength':'5 × 8s — one more set now the foundation month is done','Performance':'3 × 8s — maintain only'},d:'Two hands, open-hand (no crimp), an edge size you can hold for the full 8 seconds without your form breaking down. If you don’t have a hangboard, a doorway pull-up bar edge or a thick towel over a bar both work fine at this stage.',r:90},
          {t:'Light half-crimp hang',m:'3 × 5s',ph:{'Foundation':'skip — open-hand only this phase, half-crimp is more load than the first month needs','Performance':'3 × 5s — maintain only'},d:'Introduced once Base Strength starts. A comfortably larger edge than the open-hand one above — this is about pattern, not load.',r:90},
          {t:'Dead hang or top-of-pull-up hold',m:'3 × 10s',d:'Jug or bar, whichever you have — general grip and shoulder conditioning, nothing finger-specific yet.',r:60}
        ]},
      hangboard:{n:'Repeaters', w:'Home/Gym · 25 min', c:'--slate', finger:1, pull:0, note:'Light, submaximal repeaters — around the intensity you could hold a conversation through, not a grind.',
        x:[
          {t:'Warm up',m:'8 min',d:'Pulse raise, then a couple of easy jug hangs.'},
          {t:'Repeaters — largest comfortable edge',id:'tpl-rep',m:'3 sets',interval:{on:7,off:3,reps:5},ph:{'Foundation':'2 sets — shorter, this is about learning the rhythm','Base Strength':'4 sets','Performance':'2–3 sets — maintain only'},d:'7s on / 3s off. Should feel moderate throughout — if the last couple of reps in a set are genuinely maximal, size up the edge next session rather than pushing through. Press Start below and just hang.',r:120}
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
  }
};
});

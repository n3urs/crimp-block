/* ============================================================
   CRIMP BLOCK
   Rules-based training scheduler. No fixed weekdays — rolling
   7-day quotas plus recovery gaps, so a spontaneous crag day
   reshuffles the week instead of breaking it.
   ============================================================ */
(function(){
"use strict";

/* >>> Active program set from PROGRAMS below once the signed-in
   user's email is known. See applyProgram(). <<< */
var START_DATE, T, PHASES, PER_WEEK;

/* ------------------------------------------------------------
   STORE — the ONLY place persistence happens.
   Backed by Supabase for cross-device sync. See SUPABASE.md.
   ------------------------------------------------------------ */
var SUPABASE_URL  = 'https://lbhsgkadlhcqqnlbfswr.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiaHNna2FkbGhjcXFubGJmc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNTg2NzMsImV4cCI6MjEwMTkzNDY3M30.3Df2BW9YVfJYZVSalLWGsx54iY_RvnZdln71Kehljug';

var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var Store = {
  _d:{},
  load:async function(){
    /* Must cover BOTH: everything since START_DATE (block progression counts
       every training day since day one, so a rolling window would rewind the
       plan) AND a buffer before it (the week-dots row shows the last 7 days,
       and you can backdate days that predate the program start — filtering
       from START_DATE alone silently discarded those on reload). */
    var back = addDays(today(), -60);
    var from = back < START_DATE ? back : START_DATE;
    var res = await sb.from('sessions').select('date,type,load').gte('date', from);
    this._d = {};
    (res.data||[]).forEach(function(r){ this._d[r.date] = {t:r.type, l:r.load}; }, this);
  },
  all:function(){ return this._d; },
  get:function(date){ return this._d[date] || null; },
  /* Writes are optimistic (the UI updates before the network call returns,
     so the app stays usable with no signal at the crag) — but that means a
     failed write used to look identical to a successful one right up until
     the next full reload silently dropped it. Both methods now roll the
     local state back and rethrow on failure, so callers can tell the user
     rather than losing the day quietly. */
  set:async function(date, type, load){
    var prev=this._d[date];
    this._d[date] = load ? {t:type, l:load} : {t:type};
    var ures = await sb.auth.getUser();
    if(ures.error || !ures.data.user){
      this._d[date]=prev;
      throw new Error(ures.error ? ures.error.message : 'Not signed in');
    }
    var res = await sb.from('sessions').upsert(
      {user_id:ures.data.user.id, date:date, type:type, load: load == null ? null : load},
      {onConflict:'user_id,date'}
    );
    if(res.error){ this._d[date]=prev; throw new Error(res.error.message); }
  },
  clear:async function(date){
    var prev=this._d[date];
    delete this._d[date];
    var res = await sb.from('sessions').delete().eq('date', date);
    if(res.error){ this._d[date]=prev; throw new Error(res.error.message); }
  }
};

/* Small error toast so a failed save is obvious immediately, not days
   later when a reload reveals the day never actually persisted. */
function saveFailed(err){
  console.error('Save failed:', err);
  var t=$('toast');
  t.textContent='Could not save — '+(err&&err.message?err.message:'check your connection')+'. Try again.';
  t.classList.add('on');
  clearTimeout(saveFailed._h);
  saveFailed._h=setTimeout(function(){ t.classList.remove('on'); },5000);
}

/* ------------------------------------------------------------
   PROGRAMS
   One session library per person, keyed by their sign-in email
   (lowercased). Every program must define the same seven keys
   (maxFingers, hangboard, pull, climbHard, outdoorHard, climbEasy,
   rest) — the rules engine below (decide/ORDER/FING/CLIMB) is
   shared and references those keys directly. Only the content
   (name, description, exercises, load numbers, start date)
   varies per person. 'default' is used for anyone signed in
   whose email isn't listed below yet.

   finger / pull = load scores 0–3, used by the rules engine.
   ask = prompt for a top-set number after logging.
   ------------------------------------------------------------ */
var PROGRAMS = {
  'oscar@sullivanltd.co.uk': {
    startDate:'2026-08-10',
    /* Phases run in block order. `from` is the block this phase starts at,
       and it holds until the next phase's `from`. Week 4 of every block is
       a deload — see isDeload()/decide(). */
    perWeek:4,
    phases:[
      {n:'Base', from:1, c:'--tidepool', cue:'Submaximal — build capacity, not a top set', d:'Four weeks building tissue tolerance before the heavy work starts. Loads sit clearly submaximal and sets run longer — the point is capacity and movement quality, not a top set. You are already training, so this is short: one block, not two.'},
      {n:'Max Strength', from:2, c:'--gorse', cue:'Near-maximal — heavy is correct here', d:'The main event, and the longest phase — twelve weeks. Pickups and hangs go near-maximal, rests go long, set counts stay low. This is where the crimp weakness and the one-arm actually move. Everything else in the week exists to let these sessions happen fresh.'},
      {n:'Power', from:5, c:'--heather', cue:'Lighter, fast — speed over load', d:'Converting the strength you built into speed. Same movements, fewer reps, moved fast and explosively rather than ground out. Contact strength on the fingers rather than long holds.'},
      {n:'Performance', from:6, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back and climbing takes over. Keep one light finger session a week to hold what you built, and spend the rest of your days projecting. This is when the previous five months are supposed to show up on rock.'}
    ],
    sessions:{
      maxFingers:{n:'Max Fingers', w:'Home · 50 min', c:'--gorse', finger:3, pull:1, ask:'Top set — one-arm pickup',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then three progressively heavier two-hand pickups. Never skip this on a cold morning.'},
          {t:'Pickups — half crimp',m:'5 × 5s / hand',ph:{'Base':'4 × 8s / hand — lighter','Power':'5 × 3s / hand — fast pickup','Performance':'3 × 5s / hand — maintain only'},d:'20mm. Rep five hard but form-perfect. Add 1–2.5kg once all five feel solid two sessions running. Alternate hands — each hand then gets about three minutes between efforts, which is what near-max work needs to stay near-max.',r:90},
          {t:'Pickups — three-finger drag',m:'3 × 5s / hand',d:'Lighter. Covers the rounded granite edges you actually climb on. Alternate hands.',r:90},
          {t:'Pinch block',m:'4 × 5s / hand',d:'Alternate hands.',r:60},
          {t:'Wrist roller',m:'3 sets',d:'Up and down to near failure.',r:60}
        ]},
      pull:{n:'Pull', w:'Home · 40 min', c:'--tidepool', finger:0, pull:3,
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts, scap pulls, then two progressively heavier pull-up sets. The bar is outside — do not pull heavy on cold shoulders and elbows.'},
          {t:'Bottom-range pull-ups',m:'4 × 5',ph:{'Base':'3 × 8 — lighter','Power':'5 × 3 — explosive out of the hang','Performance':'3 × 4 — maintain only'},d:'Two arms, full dead hang, pull only to ~30° elbow bend, hold 2s, lower slow. Heavy. This is the one that matters — it loads exactly the range where your one-arm stalls. Every third or fourth session, swap it for weighted pull-ups 4×4 or one-arm negatives 3×1/arm to vary the stimulus.',r:150},
          {t:'One-arm transition holds',m:'4 × 8s / arm',d:'Minimal band or a toe on a stool. Hold at the top of your shrug plus a couple of centimetres — the exact point where you cannot get the elbow flexing. Alternate arms: one rests while the other works.',r:60},
          {t:'Weighted one-arm shrugs',m:'3 × 3 / arm',d:'Belt or vest, three-second hold at the top. Alternate arms. Three reps is right at your current ceiling — add weight before adding reps.',r:60},
          {t:'Front lever',m:'4 × 8–10s',d:'Hardest tuck or straddle you hold clean. If you cannot hold a tuck yet, do slow negative lowers from a tuck for the same sets.',r:75},
          {t:'Antagonists',m:'3 supersets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 · external rotation 3×12 · dips 3×10. Run as supersets with minimal rest — maintenance work, not a strength focus.'}
        ]},
      hangboard:{n:'Hangboard', w:'Gym · 40–55 min + climb', c:'--slate', finger:2, pull:1, ask:'Repeater load',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before touching the edge. On weeks Weighted Hangs is in the session it goes first, while fingers are fresh — so warm up properly, you are heading straight into the heaviest thing you do here.'},
          {t:'Weighted hangs',m:'10s × 5',ph:{'Base':'skip — repeaters only this phase','Power':'3s × 6 — short, sharp, contact-focused','Performance':'skip — hold what you built, repeaters only'},d:'Alternate weeks, only if the gym has a belt. Heavy-ish, never maximal. This goes FIRST, while fingers are fresh — doing repeaters before it would blunt the load you can hold and mean pulling near-max on already-fatigued tissue.',r:180},
          {t:'20mm repeaters',m:'4–5 sets',ph:{'Base':'5–6 sets — lighter, higher volume','Power':'3 sets — reduced, priority is the pickups','Performance':'2–3 sets — maintain only'},d:'7s on / 3s off × 6 = one set. Around 55–60% of max. Two minutes between sets.',r:120},
          {t:'Band-assisted one-arm',m:'3 × 5s / hand',d:'If there is a pulley or a band. Closest thing to pickups you can do at work — and the right step while you cannot one-arm hang a 20mm edge unassisted. Alternate hands.',r:90},
          {t:'Volume climbing',m:'45 min',d:'Crimp-biased mileage, not limit attempts.'}
        ]},
      climbHard:{n:'Crimp Session', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Crimp-only limit bouldering',m:'45 min',ph:{'Base':'60 min — volume over difficulty, movement quality first','Power':'30 min — fewer attempts, full power between tries','Performance':'projecting — no fixed time'},d:'Small edges, vertical to 20°. Set your own if there is nothing suitable — you work there.',r:180},
          {t:'No slopers, no heels',m:'rest of session',d:'Your instincts pull you toward what you are already good at. Ignore them.'},
          {t:'Cool down',m:'10 min',d:'Easy traversing, then finger extensors.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold granite and cold fingers is how pulleys go.'},
          {t:'Project',m:'—',d:'Every third day out, pick something crimpy you would normally walk past.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit. If you are trying hard, it stops being this session.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, x:[]}
    }
  },

  'joepearce2005@icloud.com': {
    startDate:'2026-08-10',
    /* The Font trip is an idea, not a booking — so there is deliberately NO
       taper phase here. A taper is only meaningful counted back from a known
       date; running one "just in case" sheds fitness and buys nothing. This
       is an open-ended rotation of strength and power-endurance blocks
       instead.

       WHEN THE TRIP IS BOOKED: insert a phase starting at the block that
       contains the departure date, so the taper runs the final 7–10 days:
         {n:'Peak — Font', from:<block>, d:'Volume drops hard, intensity
          stays, you arrive fresh rather than fried. Fitness gained in the
          last ten days is negligible; fatigue carried in is not.'}
       and add matching `ph` entries: sloper hangs '2 × 7s — light, keep
       sharp', endurance circuit 'skip', limit bouldering '30 min — Font-
       style, well short of failure'. */
    perWeek:4,
    phases:[
      {n:'Max Strength', from:1, c:'--gorse', cue:'Near-maximal — heavy is correct here', d:'Straight at it — you are already training 2–3x a week, so there is no need for a long base phase. Sloper and open-hand work goes near-maximal, weighted pull-ups build toward a real one-rep max. Strength first, because everything else is easier to add on top of it than the other way round.'},
      {n:'Power Endurance', from:2, c:'--tidepool', cue:'Submaximal, high volume — chase reps, not weight', d:'Strength work drops to maintenance and the endurance gap becomes the priority — that is the thing most likely to cost you a 7B+. Circuits, boulder doubles and 4x4s move to the front of the session, where they get your best effort instead of your leftovers.'},
      {n:'Max Strength', from:3, c:'--gorse', cue:'Near-maximal, and higher than block 1 — you are stronger now', d:'Second strength block, and the long one. You come into it stronger and better conditioned than the first, so the loads should be meaningfully higher — that is the point of alternating rather than grinding one quality for six months.'},
      {n:'Power Endurance', from:5, c:'--tidepool', cue:'Submaximal, high volume — chase reps, not weight', d:'Convert the second strength block into staying power. Same format as before, heavier problems in the circuits.'},
      {n:'Performance', from:6, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back and climbing takes over — keep one finger session and one circuit a week to hold what you built, and spend the rest projecting. If the Font trip has a date by now, say so and this becomes a proper taper instead.'}
    ],
    sessions:{
      maxFingers:{n:'Max Strength', w:'Work · 40 min', c:'--gorse', finger:3, pull:1, ask:'Top set load',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before loading anything.'},
          {t:'Open-hand / sloper block hangs',m:'5 × 7s',ph:{'Power Endurance':'3 × 7s — maintain only','Performance':'3 × 7s — maintain only'},d:'This is the priority lift — slopers are your weak grip, so this is where you actually move the needle for Font. Add weight once all five feel solid two sessions running. Take the full three minutes between sets; near-max work stops being near-max without it.',r:180},
          {t:'Half-crimp hang',m:'3 × 7s',d:'Maintenance, not the focus — crimps are already a strength. Keep the pinky engaged the whole rep; that is what has tweaked the ring finger before.',r:120},
          {t:'Two-hand pinch block',m:'4 × 5s',d:'Compression-relevant grip work.',r:90}
        ]},
      pull:{n:'Pull & Power', w:'Work · 40 min', c:'--tidepool', finger:0, pull:3,
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts, scap pulls, then two progressively heavier pull-up sets. Given the bicep history, never start heavy or explosive work cold.'},
          {t:'Weighted pull-ups',m:'4 × 3',d:'You know a 30kg × 3 — build toward a real 1-rep max here, not just reps. This is where the burliness comes from.',r:180},
          {t:'Explosive pull-ups',m:'4 × 3',d:'Fast concentric, controlled landing. Power, not grind.',r:150},
          {t:'Weighted dips or shoulder press',m:'4 × 6',d:'Push/shoulder strength for the compression-and-shouldery moves you are after.',r:120},
          {t:'Bicep tendon health',m:'3 sets',d:'Slow eccentric hammer curls + isometric holds. Non-negotiable every time this session comes up, whether the arms feel fine or not — this is specifically what has kept the tendinopathy from coming back before. Progress load here gradually; sudden jumps are what has flared it up in the past.',r:60}
        ]},
      hangboard:{n:'Repeaters', w:'Work · 25 min', c:'--slate', finger:2, pull:1, ask:'Repeater load',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug. Short session, but going straight onto a loaded edge cold is exactly how the ring finger gets tweaked.'},
          {t:'Repeaters',m:'5 × (10s on / 5s off × 5)',d:'Your usual protocol, at a sustainable load — not a max effort. If you are on a drag or edge position, keep the pinky engaged rather than isolating the ring finger.',r:120}
        ]},
      climbHard:{n:'Compression & Power', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Compression / sloper limit bouldering',m:'40 min',ph:{'Power Endurance':'25 min — after the circuit','Performance':'projecting — no fixed time'},d:'Seek out the compression-y, shouldery, sloper problems you would normally avoid. This block is what actually prepares you for Font, not the crimpy stuff you are already good at.',r:180},
          {t:'Endurance circuit',m:'20 min',ph:{'Power Endurance':'35 min — do this FIRST, while fresh','Performance':'20 min — hold what you built'},d:'Boulder doubles or 4x4s — same format you have used before. This is the direct fix for the endurance gap. In the Power Endurance block this moves to the front of the session: whatever comes first gets the quality.',r:180},
          {t:'Cool down',m:'10 min',d:'Easy traversing.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold fingers on cold rock is how pulleys go.'},
          {t:'Project',m:'—',d:'Font-style movement — compression, footwork, reading slopers — is the priority whenever the choice is yours.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit. Footwork and reading, not trying hard.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, x:[]}
    }
  },

  /* Generic placeholder — used for anyone signing in whose email isn't
     mapped to a real program above yet. Add a PROGRAMS['<their-email>']
     entry, built around their actual weaknesses/goals, once you have
     answers for them (same as Oscar's crimps/one-arm-pull-up program
     and Joe's compression/sloper program above). */
  'default': {
    startDate:'2026-08-10',
    perWeek:4,
    phases:[
      {n:'Base', from:1, c:'--tidepool', cue:'Submaximal — build capacity, not a top set', d:'Build capacity and movement quality before loading heavy. Submaximal throughout.'},
      {n:'Max Strength', from:2, c:'--gorse', cue:'Near-maximal — heavy is correct here', d:'Near-maximal work, long rests, low set counts.'},
      {n:'Power', from:5, c:'--heather', cue:'Lighter, fast — speed over load', d:'Convert strength to speed — same movements, fewer reps, moved fast.'},
      {n:'Performance', from:6, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back, climbing takes over.'}
    ],
    sessions:{
      maxFingers:{n:'Finger Strength', w:'Home · 30 min', c:'--gorse', finger:3, pull:1, ask:'Top set load',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before touching a small edge.'},
          {t:'Edge hangs',m:'5 × 7s',d:'20mm, two hands. Add weight once all five feel solid two sessions running.',r:120},
          {t:'Open-hand hangs',m:'4 × 7s',d:'Same edge, open-hand grip — different tendon stress than crimping.',r:120},
          {t:'Antagonists',m:'3 sets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 · external rotation 3×12.'}
        ]},
      pull:{n:'Pull Strength', w:'Home · 30 min', c:'--tidepool', finger:0, pull:3,
        x:[
          {t:'Weighted pull-ups',m:'5 × 5',d:'Full dead hang, controlled tempo. Add weight once all five are clean.',r:150},
          {t:'Lock-off holds',m:'4 × 8s',d:'Bent-arm hold at three joint angles across the set.',r:90},
          {t:'Rows',m:'4 × 8',d:'Ring rows or barbell rows, heavy.',r:90},
          {t:'Dips',m:'3 × 10',d:'Push antagonist work.',r:60}
        ]},
      hangboard:{n:'Hangboard', w:'Gym · 25 min', c:'--slate', finger:2, pull:1, ask:'Repeater load',
        x:[
          {t:'Repeaters',m:'4–5 sets',d:'7s on / 3s off × 6 = one set, around 55–60% of max. Two minutes between sets.',r:120},
          {t:'Volume climbing',m:'40 min',d:'Easy mileage, not limit attempts.'}
        ]},
      climbHard:{n:'Limit Session', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Limit bouldering',m:'50 min',d:'Hardest moves you can do with good form. This is where the session earns its keep.',r:180},
          {t:'Cool down',m:'10 min',d:'Easy traversing, then antagonist work.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold fingers on cold rock is how injuries happen.'},
          {t:'Project',m:'—',d:'Pick something that pushes you.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit — volume and movement quality only.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, x:[]}
    }
  }
};

function applyProgram(email){
  var key = (email||'').toLowerCase();
  var p = PROGRAMS[key] || PROGRAMS['default'];
  START_DATE = p.startDate;
  T = p.sessions;
  PHASES = p.phases;
  PER_WEEK = p.perWeek || 4;
}

/* ------------------------------------------------------------
   RULES ENGINE — shared across everyone. Only PROGRAMS above
   varies per person; the gating logic below does not.
   ------------------------------------------------------------ */
var ORDER=['maxFingers','hangboard','pull','climbHard','outdoorHard','climbEasy','rest'];
var CLIMB=['climbHard','outdoorHard','climbEasy'];
var FING=['maxFingers','hangboard','climbHard','outdoorHard'];

/* ------------------------------------------------------------
   DATES
   ------------------------------------------------------------ */
function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function today(){ return iso(new Date()); }
function addDays(base,n){ var d=new Date(base+'T12:00:00'); d.setDate(d.getDate()+n); return iso(d); }

/* ------------------------------------------------------------
   PHASE — where you are in the plan. Week 4 of every block is a
   deload, and unlike before this actually changes what decide()
   recommends, not just the header text.
   ------------------------------------------------------------ */
/* A "training week" is a week's worth of work actually done, NOT seven days
   elapsed. Calendar weeks would march the plan forward through illness,
   holidays and busy spells, dumping you into a Max Strength block having
   trained twice — which contradicts the whole point of the daily engine.
   So: count logged days that carried load, and advance every PER_WEEK of
   them. Take a fortnight off and you resume exactly where you left off. */
function isTraining(t){ return load(t,'finger')+load(t,'pull')>0; }

function block(date){
  date = date || today();
  var all=Store.all(), n=0;
  for(var k in all){
    if(k>=START_DATE && k<=date && all[k] && isTraining(all[k].t)) n++;
  }
  var per=PER_WEEK, wIdx=Math.floor(n/per);
  return {
    b: Math.min(6, Math.floor(wIdx/4)+1),
    w: (wIdx%4)+1,
    done: n%per,        // sessions banked into the current week
    per: per,
    total: n,           // total training days since the block started
    wIdx: wIdx,          // training weeks completed, uncapped
    /* Six blocks is the whole structured plan. Once wIdx passes 24 there is
       no block 7 — you hold in block 6 (Performance/maintenance) and just
       keep cycling its 4-week deload rhythm indefinitely. `over` marks that
       so the UI can say so instead of quietly repeating "Block 6" forever. */
    over: wIdx>=24
  };
}
/* Index, not the object — a plan may repeat a phase name (e.g. two separate
   Max Strength blocks), and "you are here" has to mark the right one. */
function phaseIndexAt(b){
  var out=0;
  for(var i=0;i<PHASES.length;i++) if(b>=PHASES[i].from) out=i;
  return out;
}
function phaseAt(b){ return PHASES[phaseIndexAt(b)]; }
function phaseRange(i){
  if(i===PHASES.length-1) return 'Block '+PHASES[i].from+' onwards';
  var from=PHASES[i].from, to=PHASES[i+1].from-1;
  return from>=to ? ('Block '+from) : ('Blocks '+from+'–'+to);
}
function isDeload(date){ return block(date).w===4; }
/* Show the phase-specific prescription for an exercise if it has one. */
function presc(e,phaseName){ return (e.ph && e.ph[phaseName]) || e.m; }

/* Tomorrow's forecast. decide() is a pure function of the last 7 days, so
   asking it about tomorrow just needs one hypothetical day patched in for
   today — whatever's actually logged, or today's own current
   recommendation if nothing's logged yet. Doesn't touch Store, so nothing
   here is real until today is. */
function upNext(){
  var tmr=addDays(today(),1);
  var logged=Store.get(today());
  var todayKey = logged ? logged.t : decide(today()).k;
  var h=history(tmr);
  h[0]={date:h[0].date, type:todayKey, ago:1};
  return {date:tmr, key:decide(tmr,h).k, provisional:!logged};
}

/* ------------------------------------------------------------
   RULES ENGINE
   ------------------------------------------------------------ */
function history(endDate){
  var out=[];
  for(var i=1;i<=7;i++){
    var k=addDays(endDate,-i), e=Store.get(k);
    out.push({date:k, type:e?e.t:null, ago:i});
  }
  return out;
}
function load(type,which){ return (type && T[type]) ? (T[type][which]||0) : 0; }
function since(h,keys){ for(var i=0;i<h.length;i++) if(h[i].type && keys.indexOf(h[i].type)>=0) return h[i].ago; return 99; }
function count(h,keys){ var n=0; for(var i=0;i<h.length;i++) if(h[i].type && keys.indexOf(h[i].type)>=0) n++; return n; }
function isHard(type){ return load(type,'finger')>=2 || load(type,'pull')>=3; }
function streak(h){
  var n=0;
  for(var i=0;i<h.length;i++){
    if(!h[i].type) break;
    if(isHard(h[i].type)) n++; else break;
  }
  return n;
}

function decide(date, hOverride){
  var h=hOverride || history(date);
  var yf=load(h[0].type,'finger');
  var yName=h[0].type?T[h[0].type].n:null;
  var hard=h.filter(function(e){ return isHard(e.type); }).length;
  var run=streak(h);

  /* Deload weeks pull both ceilings down, so the week genuinely comes out
     lighter instead of just being labelled that way. */
  var dl=isDeload(date);
  var runCap=dl?2:3, hardCap=dl?3:5;

  if(run>=runCap) return {k:'rest', why: dl
    ? run+' days on the trot in a deload week. The whole point of this week is arriving at the next block fresh.'
    : run+' days on the trot. Nothing productive happens on day four.'};
  if(hard>=hardCap) return {k:'rest', why: dl
    ? hard+' hard days already this deload week. Cap is three — bank the recovery.'
    : hard+' hard days in the last seven. That is the ceiling.'};

  if(count(h,['maxFingers'])<1 && since(h,['maxFingers'])>=3 && yf<=1)
    return {k:'maxFingers', why:'Fingers are fresh. This is the session that moves your weakness, so it gets first claim.'};

  if(count(h,['hangboard'])<1 && since(h,FING)>=2)
    return {k:'hangboard', why:'Max Fingers is unavailable, but your fingers can take submaximal tolerance work.'};

  if(count(h,['pull'])<1 && since(h,['pull'])>=2)
    return {k:'pull', why: yf>1
      ? (yName||'Yesterday')+' left your fingers cooked. Your arms are fine — this is exactly what Pull is for.'
      : 'Pull work is outstanding this week and nothing is blocking it.'};

  if(count(h,CLIMB)<4)
    return {k:'climbHard', why:'Structured work is covered. Go climbing, and make it the crimpy one.'};

  return {k:'rest', why:'Everything is done or blocked. Take the day.'};
}

/* ------------------------------------------------------------
   RENDER
   ------------------------------------------------------------ */
var ticks={}, timer=null, tEnd=0, tTot=0;
var $=function(id){ return document.getElementById(id); };
function v(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

var browseIndex=null;

function render(){
  var p=block();
  var logged=Store.get(today());
  var d=decide(today());
  var key = browseIndex!==null ? ORDER[browseIndex] : (logged?logged.t:d.k);
  var s=T[key];
  var isLogged = logged && logged.t===key;
  var isRec = key===d.k && !logged;

  document.documentElement.style.setProperty('--c', v(s.c));

  var ph=phaseAt(p.b), dl=p.w===4;
  $('topB').textContent=ph.n+' · Wk '+p.w+(dl?' · Deload':'');
  $('topB').onclick=showPlan;
  $('topD').textContent=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

  // week dots
  var dh='';
  for(var i=6;i>=0;i--){
    var k=addDays(today(),-i), e=Store.get(k);
    var col = e ? v(T[e.t].c) : '';
    dh+='<button class="dot'+(i===0?' now':'')+'" data-d="'+k+'" aria-label="'+k+'">'+
        '<i class="'+(e?'on':'')+'" style="'+(e?'background:'+col:'')+'"></i></button>';
  }
  $('dots').innerHTML=dh;
  $('dots').querySelectorAll('.dot').forEach(function(b){
    b.onclick=function(){ pick(b.dataset.d); };
  });

  // session swipe strip
  var sdh=ORDER.map(function(k){
    var cls='sdot'+(k===key?' cur':'')+(k===d.k&&!logged?' rec':'');
    return '<button class="'+cls+'" data-k="'+k+'" style="--sc:'+v(T[k].c)+'" aria-label="'+T[k].n+'"></button>';
  }).join('');
  $('sdots').innerHTML=sdh;
  $('sdots').querySelectorAll('.sdot').forEach(function(b){
    b.onclick=function(){ browseIndex=ORDER.indexOf(b.dataset.k); render(); };
  });

  $('h1').textContent=s.n;
  $('where').innerHTML=s.w+(isRec?' <span class="rec-badge">Recommended</span>':'');
  $('why').textContent = isLogged ? 'Logged.' + (logged.l ? ' Top set ' + logged.l + 'kg.' : '')
    : isRec ? (dl ? 'Deload week — cut every working set by about a third and keep the load the same. ' + d.why : d.why)
    : 'Browsing — swipe or tap a dot to see other sessions, Done logs this one instead.';

  // effort cue — how hard/heavy this session should actually be, at a glance,
  // without needing to tap through to the plan sheet
  if(key==='rest'){
    $('cue').hidden=true;
  } else {
    var phCol=v(ph.c||'--c');
    $('cue').hidden=false;
    $('cueB').textContent=dl?'Deload':ph.n;
    $('cueB').style.background=phCol; $('cueB').style.color='var(--bg)';
    $('cueT').textContent=dl?'Pull back regardless of phase — every working set lighter or shorter this week.':ph.cue;
    $('cueT').style.color=phCol;
  }

  // exercises — prescriptions follow the current phase where one is defined.
  // A phase can skip an exercise entirely ("skip — ...") rather than just
  // adjust its numbers — those don't render as a row at all, not a row
  // that says "skip" while still showing its full description and timer.
  $('list').innerHTML = s.x.map(function(e,i){
    var m=presc(e,ph.n);
    if(/^skip\b/i.test(m)) return '';
    var on=!!ticks[key+i];
    return '<div class="ex'+(on?' done':'')+'" data-i="'+i+'">'+
      '<button class="tick" aria-pressed="'+on+'" aria-label="'+e.t+'"></button>'+
      '<div class="eb"><div class="et"><span class="en">'+e.t+'</span><span class="em'+(m!==e.m?' ph':'')+'">'+m+'</span></div>'+
      (e.d?'<div class="ed">'+e.d+'</div>':'')+
      (e.r?'<button class="rest" data-r="'+e.r+'" data-l="'+e.t+'">'+fmt(e.r)+'</button>':'')+
      '</div></div>';
  }).join('');

  $('list').querySelectorAll('.tick').forEach(function(b){
    b.onclick=function(){
      var row=b.closest('.ex'), k2=key+row.dataset.i;
      ticks[k2]=!ticks[k2];
      b.setAttribute('aria-pressed',!!ticks[k2]);
      row.classList.toggle('done',!!ticks[k2]);
    };
  });
  $('list').querySelectorAll('.rest').forEach(function(b){
    b.onclick=function(){ startTimer(+b.dataset.r, b.dataset.l); };
  });

  $('doneBtn').textContent = isLogged ? 'Undo' : 'Done';
  $('doneBtn').onclick = isLogged
    ? function(){ var p=Store.clear(today()); browseIndex=null; render(); p.catch(function(e){ render(); saveFailed(e); }); }
    : function(){ browseIndex=null; finish(today(), key); };
  $('altBtn').onclick = function(){ pick(today()); };

  // up next — tomorrow's forecast, independent of whatever session is
  // currently being browsed/previewed above
  var un=upNext(), unS=T[un.key];
  $('upnext').innerHTML =
    '<span class="un-dot" style="background:'+v(unS.c)+'"></span>'+
    '<span class="un-t">Up next<b>'+unS.n+'</b></span>'+
    '<span class="un-d">'+(un.provisional?'if today goes to plan · ':'')+
      new Date(un.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})+'</span>';
  $('upnext').onclick=function(){ preview(un.date, un.key); };
}

function fmt(s){ var m=Math.floor(s/60),r=s%60; return m+':'+(r<10?'0':'')+r; }

/* ---- swipe between sessions ---- */
var swX=0, swY=0;
$('card').addEventListener('touchstart',function(e){
  var t=e.touches[0]; swX=t.clientX; swY=t.clientY;
},{passive:true});
$('card').addEventListener('touchend',function(e){
  var t=e.changedTouches[0], dx=t.clientX-swX, dy=t.clientY-swY;
  if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5){
    var logged=Store.get(today()), d=decide(today());
    var cur = browseIndex!==null ? ORDER[browseIndex] : (logged?logged.t:d.k);
    var idx=(ORDER.indexOf(cur)+(dx<0?1:-1)+ORDER.length)%ORDER.length;
    browseIndex=idx; render();
  }
},{passive:true});

/* ---- sheets ---- */
var sh=$('sh'), bgd=$('bgd');
function open(html){ $('shIn').innerHTML=html; sh.classList.add('on'); bgd.classList.add('on'); }
function close(){ sh.classList.remove('on'); bgd.classList.remove('on'); }
bgd.onclick=close;

function pick(date){
  var isToday = date===today();
  var label = isToday ? 'What did you do?' : new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
  var h='<h2>'+label+'</h2>';
  h+=ORDER.map(function(k){
    return '<button class="opt" style="--oc:'+v(T[k].c)+'" data-k="'+k+'">'+
      '<span class="optn">'+T[k].n+'</span><span class="opts">'+T[k].w+'</span></button>';
  }).join('');
  if(Store.get(date)) h+='<button class="opt" style="--oc:var(--s4)" data-k="__clear"><span class="optn">Clear</span></button>';
  open(h);
  $('shIn').querySelectorAll('.opt').forEach(function(b){
    b.onclick=function(){
      if(b.dataset.k==='__clear'){ close(); var p=Store.clear(date); render(); p.catch(function(e){ render(); saveFailed(e); }); return; }
      preview(date, b.dataset.k);
    };
  });
}

/* ---- the plan / timeline ---- */

/* Which exercises this phase actually rewrites — derived from the `ph`
   overrides rather than written out by hand, so it can never drift. */
function phaseChanges(name){
  var out=[];
  ORDER.forEach(function(k){
    T[k].x.forEach(function(e){
      if(e.ph && e.ph[name]) out.push({s:T[k].n, t:e.t, m:e.ph[name]});
    });
  });
  return out;
}

function bar(done,total,col){
  var pct=Math.round((done/total)*100);
  return '<div class="bar-t"><i style="width:'+pct+'%;background:'+col+'"></i></div>';
}

/* Six segments, one per block — each filled by how much of that block's 4
   training weeks are actually banked. Past blocks read full, the current
   one fills as you go, future ones sit empty. Once the whole plan is done
   (over) block 6 just reads permanently full. */
function overallBar(p){
  var segs='';
  for(var i=1;i<=6;i++){
    var col=v(phaseAt(i).c||'--c');
    var frac=Math.max(0,Math.min(1,(p.wIdx-(i-1)*4)/4));
    segs+='<div class="ov-seg'+(!p.over&&p.b===i?' cur':'')+'"><i style="width:'+Math.round(frac*100)+'%;background:'+col+'"></i></div>';
  }
  return '<div class="ov-bar">'+segs+'</div>';
}

function showPlan(){
  var p=block(), curI=phaseIndexAt(p.b), cur=PHASES[curI];
  var col=v(cur.c||'--c');

  var h='<h2>The plan</h2>'+
    overallBar(p)+
    '<div class="plan-now" style="border-left-color:'+col+'">'+
      '<div class="plan-now-t" style="color:'+col+'">'+cur.n+' · '+(p.over?'Ongoing':'Block '+p.b)+' · Week '+p.w+(p.w===4?' · Deload':'')+'</div>'+
      bar(p.done,p.per,col)+
      '<div class="plan-now-s">'+p.done+' of '+p.per+' sessions into this week · '+p.total+' logged since you started</div>'+
    '</div>'+
    (p.over
      ? '<p class="shp">You have worked through all six blocks — the structured plan is complete. It does not stop or reset: you now hold in <strong style="color:'+col+'">'+cur.n+'</strong> indefinitely, still on the same 4-week rhythm with a deload every fourth trained week. This is meant to be where you live long-term, not a finish line.</p>'
      : '<p class="shp">A week advances when you have banked '+p.per+' sessions that carried load — not every 7 days. Take a fortnight off and you pick up exactly where you left off. Four weeks make a block, and every fourth week is a deload, where the app tightens its own limits and pushes rest.</p>');

  h+=PHASES.map(function(x,i){
    var on=i===curI, c=v(x.c||'--s4');
    return '<button class="opt" style="--oc:'+c+(on?'':';opacity:.62')+'" data-p="'+i+'">'+
      '<span class="optn">'+x.n+'</span>'+
      '<span class="opts">'+(on?'NOW · ':'')+phaseRange(i)+'</span></button>';
  }).join('');

  open(h);
  $('shIn').querySelectorAll('.opt').forEach(function(b){
    b.onclick=function(){ showPhase(+b.dataset.p); };
  });
}

function showPhase(i){
  var x=PHASES[i], p=block(), on=i===phaseIndexAt(p.b);
  var col=v(x.c||'--c'), ch=phaseChanges(x.n);
  var weeks=(i===PHASES.length-1) ? null : (PHASES[i+1].from-x.from)*4;

  var h='<h2 style="color:'+col+'">'+x.n+'</h2>'+
    '<p class="shp">'+phaseRange(i)+' · '+(weeks?weeks+' training weeks':'runs to the end of the plan')+
      (on?' · <span style="color:'+col+'">you are here</span>':'')+'</p>';

  if(on) h+='<div class="plan-now" style="border-left-color:'+col+'">'+
      bar(p.done,p.per,col)+
      '<div class="plan-now-s">Week '+p.w+' of 4 · '+p.done+' of '+p.per+' sessions banked'+(p.w===4?' · deload week':'')+
        (p.over?' · plan complete, this repeats indefinitely':'')+'</div>'+
    '</div>';

  h+='<p class="shp" style="color:var(--dim)">'+x.d+'</p>';

  if(ch.length){
    h+='<div class="plan-h">What changes in this phase</div>';
    h+=ch.map(function(c){
      return '<div class="plan-ch"><div class="plan-ch-t">'+c.t+'<span>'+c.s+'</span></div>'+
        '<div class="plan-ch-m" style="color:'+col+'">'+c.m+'</div></div>';
    }).join('');
  } else {
    h+='<div class="plan-h">What changes in this phase</div>'+
       '<p class="shp">Sessions run at their standard prescriptions — this is the phase the others are written against.</p>';
  }

  h+='<div class="row2" style="margin-top:18px"><button class="sec" id="phBack">Back</button></div>';
  open(h);
  $('phBack').onclick=showPlan;
}

function preview(date, key){
  var s=T[key];
  var h='<h2>'+s.n+'</h2><p class="shp">'+s.w+'</p>';
  h += s.x.length ? s.x.map(function(e){
    return '<div style="padding:11px 0;border-bottom:1px solid var(--s2)">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">'+
        '<span style="font-family:\'Barlow Condensed\',sans-serif;font-weight:600;font-size:17px;text-transform:uppercase">'+e.t+'</span>'+
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--faint);white-space:nowrap">'+e.m+'</span>'+
      '</div>'+
      (e.d?'<div style="font-size:13.5px;color:var(--dim);margin-top:3px;line-height:1.4">'+e.d+'</div>':'')+
    '</div>';
  }).join('') : '<p class="shp">No set exercises — just take the day.</p>';
  h += '<div class="row2" style="margin-top:16px"><button class="sec" id="prevBack">Back</button><button class="pri" id="prevLog">Log this</button></div>';
  open(h);
  $('prevBack').onclick=function(){ pick(date); };
  $('prevLog').onclick=function(){ close(); finish(date, key); };
}

function finish(date, key){
  var s=T[key];
  if(date===today()) browseIndex=null;
  if(!s.ask){
    var p=Store.set(date,key); render();
    p.catch(function(e){ render(); saveFailed(e); });
    return;
  }
  open('<h2>'+s.ask+'</h2>'+
    '<p class="shp">One number, best set. Skip it if you did not measure — the plan still works without it.</p>'+
    '<div class="num"><input type="number" inputmode="decimal" id="numIn" placeholder="0"><span>kg</span></div>'+
    '<div class="row2"><button class="sec" id="numSkip">Skip</button><button class="pri" id="numOk">Save</button></div>');
  setTimeout(function(){ var el=$('numIn'); if(el) el.focus(); },260);
  $('numSkip').onclick=function(){
    close(); var p=Store.set(date,key); render();
    p.catch(function(e){ render(); saveFailed(e); });
  };
  $('numOk').onclick=function(){
    var val=parseFloat($('numIn').value);
    close(); var p=Store.set(date,key, isNaN(val)?null:val); render();
    p.catch(function(e){ render(); saveFailed(e); });
  };
}

/* ---- timer ---- */
function startTimer(secs,label){
  if(timer) clearInterval(timer);
  tTot=secs; tEnd=Date.now()+secs*1000;
  $('tmL').textContent=label;
  $('tm').classList.add('on');
  step(); timer=setInterval(step,200);
}
function step(){
  var left=Math.max(0,Math.round((tEnd-Date.now())/1000));
  $('tmN').textContent=fmt(left);
  $('tmBar').style.transform='scaleX('+(left/tTot)+')';
  if(left<=0){
    beep(); clearInterval(timer); timer=null;
    setTimeout(function(){ $('tm').classList.remove('on'); },1800);
  }
}
$('tmX').onclick=function(){ if(timer) clearInterval(timer); timer=null; $('tm').classList.remove('on'); };
function beep(){
  try{
    var ac=new (window.AudioContext||window.webkitAudioContext)();
    [0,190].forEach(function(dl){
      var o=ac.createOscillator(), g=ac.createGain();
      o.connect(g); g.connect(ac.destination); o.frequency.value=880;
      var t=ac.currentTime+dl/1000; g.gain.value=0.0001;
      g.gain.exponentialRampToValueAtTime(.3,t+.01);
      g.gain.exponentialRampToValueAtTime(.0001,t+.15);
      o.start(t); o.stop(t+.17);
    });
    if(navigator.vibrate) navigator.vibrate([120,80,120]);
  }catch(e){}
}

/* re-render on wake, so the date rolls over correctly overnight */
document.addEventListener('visibilitychange',function(){ if(!document.hidden && sessionReady) render(); });

var sessionReady = false;

function showLogin(msg){
  $('h1').textContent='Sign in';
  $('where').textContent='Crimp Block';
  $('why').textContent = msg || 'Enter your email for a magic sign-in link. Each email gets its own private log — share the URL, everyone keeps their own data.';
  $('bar').style.display='none';
  $('list').innerHTML =
    '<div class="num" style="margin-top:20px">'+
      '<input type="email" inputmode="email" id="loginEmail" placeholder="you@example.com">'+
    '</div>'+
    '<div class="row2"><button class="pri" id="loginSend">Send link</button></div>';
  $('loginSend').onclick=function(){
    var email=$('loginEmail').value.trim();
    if(!email) return;
    var btn=$('loginSend'); btn.disabled=true; btn.textContent='Sending…';
    sb.auth.signInWithOtp({email:email, options:{emailRedirectTo:location.origin+location.pathname}}).then(function(res){
      if(res.error){ showLogin('Something went wrong: '+res.error.message); return; }
      $('h1').textContent='Check email';
      $('where').textContent='Sign-in';
      $('why').textContent='Magic link sent to '+email+'. Open it on this device to continue.';
      $('list').innerHTML='';
    });
  };
}

function showWho(email){
  $('topUe').textContent=email;
  $('topU').hidden=false;
  $('topU').onclick=function(){
    open('<h2>Signed in</h2>'+
      '<p class="shp">'+email+'</p>'+
      '<button class="opt" style="--oc:var(--s4)" id="signOutBtn"><span class="optn">Sign out</span></button>');
    $('signOutBtn').onclick=function(){
      close();
      sb.auth.signOut().then(function(){ location.reload(); });
    };
  };
}

function boot(){
  sb.auth.getSession().then(function(res){
    if(!res.data.session){ $('topU').hidden=true; showLogin(); return; }
    $('bar').style.display='';
    applyProgram(res.data.session.user.email);
    showWho(res.data.session.user.email);
    Store.load().then(function(){ sessionReady=true; render(); });
  });
}
sb.auth.onAuthStateChange(function(event){
  if(event==='SIGNED_IN' && !sessionReady) boot();
});
boot();
})();

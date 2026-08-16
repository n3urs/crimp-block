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

/* ------------------------------------------------------------
   LOADS — what weight, on which exercise, on which day.

   Deliberately its OWN table rather than a column on sessions:
   writing a weight must not mark the day as trained. You set a
   weight at the START of a session, and if that logged the day the
   card would flip to "Undo" before you had done anything and the
   engine would count a session you have not had yet.

   Writes land immediately rather than being held until Done. The
   iOS shell reloads the web view after 60s in the background, which
   would otherwise silently bin a weight typed mid-session.
   ------------------------------------------------------------ */
var Loads = {
  _d:{},   // exercise id -> [{date, kg}], newest first
  load:async function(){
    this._d={};
    /* Not date-filtered: "what did I lift last time" has to survive a long
       layoff, which is exactly when you can least remember it. The table is
       a handful of rows per week — small enough to just hold all of it. */
    var res = await sb.from('exercise_loads').select('date,ex,kg').order('date',{ascending:false});
    /* Missing table (migration not run yet) must not take the app down —
       weights just don't appear until the SQL in SUPABASE.md is run. */
    if(res.error){ console.warn('Loads unavailable:', res.error.message); return; }
    (res.data||[]).forEach(function(r){
      (this._d[r.ex] = this._d[r.ex] || []).push({date:r.date, kg:Number(r.kg)});
    }, this);
  },
  history:function(id){ return this._d[id] || []; },
  on:function(id, date){
    var a=this._d[id]||[];
    for(var i=0;i<a.length;i++) if(a[i].date===date) return a[i];
    return null;
  },
  set:async function(date, id, kg){
    var a = this._d[id] = this._d[id] || [];
    var prev = a.slice(), hit = this.on(id, date);
    if(hit) hit.kg = kg;
    else { a.push({date:date, kg:kg}); a.sort(function(x,y){ return x.date<y.date?1:-1; }); }
    var ures = await sb.auth.getUser();
    if(ures.error || !ures.data.user){
      this._d[id]=prev;
      throw new Error(ures.error ? ures.error.message : 'Not signed in');
    }
    var res = await sb.from('exercise_loads').upsert(
      {user_id:ures.data.user.id, date:date, ex:id, kg:kg},
      {onConflict:'user_id,date,ex'}
    );
    if(res.error){ this._d[id]=prev; throw new Error(res.error.message); }
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
   rest) — the rules engine below (decide/ORDER/FING) is
   shared and references those keys directly. Only the first three
   are ever RECOMMENDED; the climbing sessions exist so you can log
   them yourself, and so they count toward recovery once you have.
   Only the content
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
      maxFingers:{n:'Max Fingers', w:'Home · 50 min', c:'--gorse', finger:3, pull:1, note:'Climbing today? This first, then the gym a few hours later. Never climb before max finger work — you cannot pull max on tired fingers, and that is how pulleys go.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then three progressively heavier two-hand pickups. Never skip this on a cold morning.'},
          {t:'Pickups — half crimp',id:'osc-pickup-half',m:'5 × 5s / hand',ph:{'Base':'4 × 8s / hand — lighter','Power':'5 × 3s / hand — fast pickup','Performance':'3 × 5s / hand — maintain only'},d:'20mm. Rep five hard but form-perfect. Alternate hands — each hand then gets about three minutes between efforts, which is what near-max work needs to stay near-max.',r:90},
          {t:'Pickups — three-finger drag',id:'osc-pickup-drag',m:'3 × 5s / hand',d:'Lighter. Covers the rounded granite edges you actually climb on. Alternate hands.',r:90},
          {t:'Pinch block',id:'osc-pinch',step:1.25,m:'4 × 5s / hand',d:'Alternate hands.',r:60},
          {t:'Wrist roller',m:'3 sets',d:'Up and down to near failure.',r:60}
        ]},
      pull:{n:'Pull', w:'Home · 40 min', c:'--tidepool', finger:0, pull:3, note:'Climbing today? Climb FIRST and do this after — no fingers here, so spend them on the wall. This is the day to try hard on something crimpy. Just leave enough arm for the one-arm holds.',
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts, scap pulls, then two progressively heavier pull-up sets. The bar is outside — do not pull heavy on cold shoulders and elbows.'},
          {t:'Bottom-range pull-ups',id:'osc-pull-bottom',m:'4 × 5',ph:{'Base':'3 × 8 — lighter','Power':'5 × 3 — explosive out of the hang','Performance':'3 × 4 — maintain only'},d:'Two arms, full dead hang, pull only to ~30° elbow bend, hold 2s, lower slow. Heavy. This is the one that matters — it loads exactly the range where your one-arm stalls. Rotates automatically every 4th Pull session to vary the stimulus.',r:150,
            rotate:{every:4, with:[
              {t:'Weighted pull-ups',id:'osc-pull-wt',m:'4 × 4',d:'Heavy, full dead hang each rep.',r:180},
              {t:'One-arm negatives',m:'3 × 1 / arm',d:'8–10 second descent. Control the last 30cm above all.',r:180}
            ]}},
          {t:'One-arm transition holds',m:'4 × 8s / arm',d:'Minimal band or a toe on a stool. Hold at the top of your shrug plus a couple of centimetres — the exact point where you cannot get the elbow flexing. Alternate arms: one rests while the other works.',r:60},
          {t:'Weighted one-arm shrugs',id:'osc-shrug',m:'3 × 3 / arm',d:'Belt or vest, three-second hold at the top. Alternate arms. Three reps is right at your current ceiling, so the weight moves rather than the reps.',r:60},
          {t:'Front lever',m:'4 × 8–10s',d:'Hardest tuck or straddle you hold clean. If you cannot hold a tuck yet, do slow negative lowers from a tuck for the same sets.',r:75},
          {t:'Antagonists',m:'3 supersets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 (a rubber band round the fingertips, opening the hand against it — no dedicated tool needed) · external rotation 3×12 · dips 3×10. Run as supersets with minimal rest — maintenance work, not a strength focus.'}
        ]},
      hangboard:{n:'Hangboard', w:'Gym · 40–55 min + climb', c:'--slate', finger:2, pull:1, note:'Board work before climbing, in the order below. Repeaters on already-tired fingers is a different exercise at a load you did not choose.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before touching the edge. On weeks Weighted Hangs is in the session it goes first, while fingers are fresh — so warm up properly, you are heading straight into the heaviest thing you do here.'},
          {t:'Weighted hangs',id:'osc-hang-wt',m:'10s × 5',ph:{'Base':'skip — repeaters only this phase','Power':'3s × 6 — short, sharp, contact-focused','Performance':'skip — hold what you built, repeaters only'},d:'Only if the gym has a belt. Heavy-ish, never maximal. This goes FIRST, while fingers are fresh — doing repeaters before it would blunt the load you can hold and mean pulling near-max on already-fatigued tissue. Alternates automatically with a lighter week.',r:180,
            rotate:{every:2, with:[{t:'Weighted hangs',m:'skip — alternate week, repeaters carries this session'}]}},
          {t:'20mm repeaters',id:'osc-rep20',m:'4–5 sets',ph:{'Base':'5–6 sets — lighter, higher volume','Power':'3 sets — reduced, priority is the pickups','Performance':'2–3 sets — maintain only'},d:'7s on / 3s off × 6 = one set. Around 55–60% of max. Two minutes between sets.',r:120},
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
          {t:'Project',m:'—',d:'Pick something that pushes you.',
            rotate:{every:3, with:[{t:'Project — crimpy pick',m:'—',d:'Third outdoor day — pick something crimpy you would normally walk past.'}]}}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit. If you are trying hard, it stops being this session.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Rest from training, not from moving. An easy climb is fine — if it turns into trying hard, log it as a Crimp Session so the plan can count it.', x:[]}
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
      maxFingers:{n:'Max Strength', w:'Work · 40 min', c:'--gorse', finger:3, pull:1, note:'Climbing today? This first, ideally hours before. Fingers cannot pull near-max once they are already tired, and that is when they get hurt.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before loading anything.'},
          {t:'Half-crimp hang — 15mm edge',id:'joe-hang15',m:'5 × 7s',ph:{'Power Endurance':'3 × 7s — maintain only','Performance':'3 × 7s — maintain only'},d:'Beastmaker 1000, 15mm edge, four fingers half-crimped. This is the priority lift — crimps train reliably, which slopers do not: a sloper hold fails on friction and skin, so a worse session might just mean a slicker day rather than a weaker one. WHEN THE GYM’S ~15kg RUNS OUT: move to the 10mm four-finger pockets, then band-assisted one-arm on 20mm. NOT the three- or two-finger pockets — pinky disengaged is exactly what has tweaked your ring finger. Take the full three minutes between sets; near-max work stops being near-max without it.',r:180},
          {t:'Open-hand hang — 20mm pockets',id:'joe-hang20',m:'3 × 7s',d:'Secondary, not the focus. Extended fingers, no crimp. Keeps the open-hand position that slopers actually load, so dropping sloper board work does not leave that capacity untrained — but it stays submaximal and low volume while the 15mm work carries the session. Four fingers, pinky in.',r:120},
          {t:'Plate pinches',id:'joe-pinch',step:1.25,m:'4 × 5s / hand',d:'Two plates smooth-sides-out, pinched between thumb and fingers, held for time — the substitute for a pinch block, which the gym does not have. Thumb strength is what compression climbing runs on, so this is the Font-relevant bit. Start light; the grip fails long before the weight feels heavy.',r:90}
        ]},
      pull:{n:'Pull & Power', w:'Work · 40 min', c:'--tidepool', finger:0, pull:3, note:'Climbing today? Climb first and do this after — no finger load here, so spend them on the wall. Keep enough left for the bicep work; that one is not optional.',
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts, scap pulls, then two progressively heavier pull-up sets. Given the bicep history, never start heavy or explosive work cold.'},
          {t:'Archer / band-assisted one-arm pull-ups',m:'4 × 3 / arm',d:'Swapped off weighted pull-ups because the gym’s ~15kg cannot make them near-maximal — you already pull 30kg × 3, so 15kg is rep work wearing a strength label. Going unilateral gets you back to a genuine max effort with no plates at all: archer pull-ups, or a band through the bar taking just enough off. Progress by reducing band assistance. This is still where the burliness comes from.',r:180},
          {t:'Explosive pull-ups',m:'4 × 3',d:'Fast concentric, controlled landing. Power, not grind.',r:150},
          {t:'Weighted dips or shoulder press',id:'joe-dip',m:'4 × 6',d:'Push/shoulder strength for the compression-and-shouldery moves you are after.',r:120},
          /* dl deliberately equals m: this is rehab, not training load. Deload
             weeks thin out the work that accumulates fatigue — tendon
             maintenance is the thing you keep doing while the rest backs off. */
          {t:'Bicep tendon health',m:'3 sets',dl:'3 sets',d:'Slow eccentric hammer curls + isometric holds. Non-negotiable every time this session comes up, whether the arms feel fine or not — this is specifically what has kept the tendinopathy from coming back before. Progress load here gradually; sudden jumps are what has flared it up in the past.',r:60}
        ]},
      hangboard:{n:'Repeaters', w:'Work · 25 min', c:'--slate', finger:2, pull:1, note:'Board before climbing. Repeaters are meant to be a known, sustainable load — done on tired fingers they stop being that.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug. Short session, but going straight onto a loaded edge cold is exactly how the ring finger gets tweaked.'},
          {t:'Repeaters',id:'joe-rep',m:'5 × (10s on / 5s off × 5)',d:'Your usual protocol, at a sustainable load — not a max effort. Beastmaker 1000, the 20mm-range four-finger pockets. Unaffected by the gym’s 15kg cap: repeaters are meant to be submaximal, so running out of plates costs nothing here. Keep the pinky engaged and stay off the three- and two-finger pockets — that position is what tweaks your ring finger.',r:120}
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
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Rest from training, not from moving. An easy climb is fine — if it turns into trying hard, log it so the plan can count it.', x:[]}
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
      maxFingers:{n:'Finger Strength', w:'Home · 30 min', c:'--gorse', finger:3, pull:1, note:'Climbing today? This first, ideally hours before. Near-max finger work on already-tired fingers is the classic injury mechanism.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before touching a small edge.'},
          {t:'Edge hangs',id:'def-hang',m:'5 × 7s',d:'20mm, two hands.',r:120},
          {t:'Open-hand hangs',id:'def-hang-open',m:'4 × 7s',d:'Same edge, open-hand grip — different tendon stress than crimping.',r:120},
          {t:'Antagonists',m:'3 sets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 (a rubber band round the fingertips, opening the hand against it — no dedicated tool needed) · external rotation 3×12.'}
        ]},
      pull:{n:'Pull Strength', w:'Home · 30 min', c:'--tidepool', finger:0, pull:3, note:'Climbing today? Climb first and do this after — no finger load here, so spend them on the wall.',
        x:[
          {t:'Weighted pull-ups',id:'def-pull',m:'5 × 5',d:'Full dead hang, controlled tempo.',r:150},
          {t:'Lock-off holds',m:'4 × 8s',d:'Bent-arm hold at three joint angles across the set.',r:90},
          {t:'Rows',m:'4 × 8',d:'Ring rows or barbell rows, heavy.',r:90},
          {t:'Dips',m:'3 × 10',d:'Push antagonist work.',r:60}
        ]},
      hangboard:{n:'Hangboard', w:'Gym · 25 min', c:'--slate', finger:2, pull:1, note:'Board work before climbing, in the order below.',
        x:[
          {t:'Repeaters',id:'def-rep',m:'4–5 sets',d:'7s on / 3s off × 6 = one set, around 55–60% of max. Two minutes between sets.',r:120},
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
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Rest from training, not from moving. An easy climb is fine — if it turns into trying hard, log it so the plan can count it.', x:[]}
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
/* ORDER is the swipe strip — every session stays reachable by hand, including
   the climbing ones the engine never recommends. FING is what counts as
   having loaded your fingers, and deliberately still includes the climbing
   sessions: a crag day gates tomorrow's hangboard exactly as it always did,
   whether the app suggested it or you did. */
var ORDER=['maxFingers','hangboard','pull','climbHard','outdoorHard','climbEasy','rest'];
var FING=['maxFingers','hangboard','climbHard','outdoorHard'];

/* ------------------------------------------------------------
   DATES
   ------------------------------------------------------------ */
function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
/* The day "starts" here, not at midnight — logging a late session should not
   silently roll into tomorrow while you are still mid-workout. Before this
   hour, "today" is still yesterday. Keep in sync with `dayStartHour` in
   ios/Shared/Forecast.swift — the widget computes its own "today" from the
   raw device clock and has to agree with this or it can show the wrong day's
   entry for the few hours either side of the boundary. */
var DAY_START_HOUR = 3;
function today(){
  var d = new Date();
  if(d.getHours() < DAY_START_HOUR) d.setDate(d.getDate()-1);
  return iso(d);
}
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
function phaseNameAt(date){ return phaseAt(block(date).b).n; }
function phaseRange(i){
  if(i===PHASES.length-1) return 'Block '+PHASES[i].from+' onwards';
  var from=PHASES[i].from, to=PHASES[i+1].from-1;
  return from>=to ? ('Block '+from) : ('Blocks '+from+'–'+to);
}
function isDeload(date){ return block(date).w===4; }
/* Show the phase-specific prescription for an exercise if it has one. */
function presc(e,phaseName){ return (e.ph && e.ph[phaseName]) || e.m; }

/* ------------------------------------------------------------
   RETURNING FROM A LAYOFF — the same taper deload already does
   (cut volume, hold weight), triggered by a real gap instead of the
   4-week clock.

   block() already handles the calendar side correctly: it counts
   training days actually banked, so a fortnight off just pauses the
   count rather than skipping you forward. What it does NOT do is
   notice the gap happened at all — miss three weeks and it hands you
   back the same Max Strength loads you were doing before, on tissue
   that has partly detrained. For finger/pulley work specifically
   that is exactly the caution this whole plan already takes for a
   COLD session ("cold fingers is how pulleys go") — a long layoff is
   the same risk, just measured in weeks instead of minutes.

   LAYOFF_DAYS is deliberately short (crimp-specific tissue, not
   general fitness) and RETURN_SESSIONS deliberately small — this is
   two cautious sessions back in, not a whole reset block. */
var LAYOFF_DAYS = 10;
var RETURN_SESSIONS = 2;
/* Deload holds the weight and only cuts volume, because that is fatigue
   management on capacity that is still intact. A layoff is a different
   risk — connective tissue that has not been loaded in weeks meeting a
   near-max weight cold — so unlike deload this DOES reduce the number, not
   just the sets. 15% is a reasoned buffer, not a measured one: there is no
   clean per-person formula for this, and it applies the same cut to
   everything tracked rather than trying to guess which exercises are more
   finger/tendon-sensitive than others. If it reads as too cautious or not
   cautious enough once you have actually come back from a break, this is
   the one number to change. */
var RETURN_CUT = 0.85;

/* Is there a layoff of LAYOFF_DAYS+ that ended recently enough for `date`
   to still be inside the RETURN_SESSIONS-session taper — and if so, which
   layoff, and how far into the taper is `date`.

   Walks the real training history backward from `date` (`date` itself
   counted as the hypothetical next session) looking for the most recent
   gap of LAYOFF_DAYS+. This has to be a walk, not a single before/after
   comparison against the single most recent training day — the most
   recent training day IS session 1 of the taper once you have done it, so
   anchoring the gap check there instead of the ORIGINAL layoff would
   collapse the whole taper down to one session: on session 2 the "gap"
   would just be the couple of days since session 1, nowhere near
   LAYOFF_DAYS, and the taper would look like it had already ended when it
   has not. */
function returnInfo(date){
  date = date || today();
  var all=Store.all(), days=[];
  for(var k in all) if(k<date && all[k] && isTraining(all[k].t)) days.push(k);
  days.sort();
  if(!days.length) return null;

  var seq=days.concat([date]), n=0;
  for(var i=seq.length-1; i>0; i--){
    n++;
    var gap=Math.round((new Date(seq[i]+'T12:00:00') - new Date(seq[i-1]+'T12:00:00')) / 86400000);
    if(gap>=LAYOFF_DAYS) return n<=RETURN_SESSIONS ? {gap:gap, resumed:seq[i], session:n} : null;
    if(n>=RETURN_SESSIONS) return null;   // RETURN_SESSIONS have passed with no qualifying gap
  }
  return null;
}
function isReturning(date){ return !!returnInfo(date); }

/* Which time round is this? Counts logged days of this session type before
   `date`, so today is occurrence n+1 whether or not it's been logged yet. */
function occurrence(key, date){
  date = date || today();
  var all=Store.all(), n=0;
  for(var k in all){
    if(k < date && all[k] && all[k].t===key) n++;
  }
  return n+1;
}

/* Exercises that deliberately vary session to session ("every third or
   fourth session swap it", "alternate weeks") used to say so in their
   description — which meant YOU had to remember how many you'd done. The
   engine already knows the whole history, so it picks.

   `rotate:{every:N, with:[...]}` — on every Nth occurrence of the session,
   substitute the next variant in `with`, cycling through them. Returns the
   exercise to actually show plus whether it was swapped, so the UI can say
   so rather than silently showing something different. */
function rotated(e, key, date){
  if(!e.rotate || !e.rotate.with || !e.rotate.with.length) return {e:e, swapped:false};
  var every = e.rotate.every || 4;
  var occ = occurrence(key, date);
  if(occ % every !== 0) return {e:e, swapped:false};
  var list = e.rotate.with;
  return {e:list[((occ/every) - 1) % list.length], swapped:true, occ:occ};
}

/* Deload = cut VOLUME, hold INTENSITY. Same weight on the bar/belt, fewer
   sets. Dropping the load instead sheds exactly the neural adaptation the
   block just built, which is the opposite of the point — and it would also
   mean needing to remember last block's numbers to take a third off them.
   Fewer sets of whatever you did last time needs no records at all.

   Derived from the ALREADY phase-resolved prescription rather than written
   out per exercise, so it stays correct in every phase for free. An
   explicit `dl` on the exercise wins where the shapes below don't fit. */
function deloadPresc(m){
  var cut=function(n){ return Math.max(2, Math.round(parseInt(n,10)*0.65)); };
  // "10s × 5" -> "10s × 3". Hang duration is the intensity here, so the
  // SECOND number is the set count. Must be tested before the rule below.
  if(/^\d+s\s*[×x]\s*\d+/.test(m))
    return m.replace(/^(\d+s\s*[×x]\s*)(\d+)/, function(_,head,n){ return head+cut(n); });
  // "5 × 5s / hand" -> "3 × 5s / hand"
  if(/^\d+\s*[×x]/.test(m))            return m.replace(/^(\d+)/, function(n){ return cut(n); });
  // "4–5 sets" -> "3 sets"
  if(/^\d+\s*[–-]\s*\d+\s*sets?/i.test(m)) return m.replace(/^(\d+)\s*[–-]\s*\d+(\s*sets?)/i, function(_,a,s){ return cut(a)+s; });
  // "3 sets" / "3 supersets" -> "2 sets"
  if(/^\d+\s*(super)?sets?/i.test(m))  return m.replace(/^(\d+)/, function(n){ return cut(n); });
  // "45 min" -> "30 min". Warm-ups and cool-downs never reach here (see
  // resolveEx) — a deload week is not a reason to warm up less.
  if(/^\d+\s*min/i.test(m)){
    var mins=parseInt(m,10), out=Math.max(10, Math.round(mins*0.65/5)*5);
    // The 10-minute floor must never round a short session UP: a deload
    // week can only ever take work away.
    if(out>=mins) return m;
    return m.replace(/^\d+/, out);
  }
  return m;  // "—", "rest of session", "projecting", anything else
}

/* Weight history for an exercise, scoped to the phase actually active on
   `date` — Base's submaximal numbers must never surface as "last time"
   once you are in Max Strength's near-max protocol for the same lift, and
   the reverse. Needs no stored field: any past date's phase is already
   fully derivable from the training log (that is how the whole
   periodization system works), so this is a filter over data already
   collected, not new bookkeeping.

   Phases that repeat by name (Joe's program runs Max Strength twice)
   correctly DO share history across their occurrences — same name, same
   intensity, and his second Max Strength block is explicitly written to
   continue from where the first one left off, not restart blind. */
function loadHistory(id, date){
  var ph=phaseNameAt(date);
  return Loads.history(id).filter(function(r){ return r.date<date && phaseNameAt(r.date)===ph; });
}

/* What to put on the bar today, for exercises carrying an `id`.

   This is the last hand-administered rule in the plan: "add 1–2.5kg once
   all five feel solid two sessions running" used to sit in the exercise
   description, which meant YOU had to remember what you lifted and how
   many times. The app has the history, so it does the arithmetic.

   Returns null when there is no history at all — the app cannot invent a
   starting weight, so the first one is always typed in by hand.

   Deload weeks never bump: the whole point of the week is holding the load
   while volume drops, so suggesting a PB in one would be backwards. */
function target(e, date){
  date = date || today();
  var step = e.step || 2.5;
  var set = Loads.on(e.id, date);
  if(set) return {kg:set.kg, bump:false, set:true};

  var past = loadHistory(e.id, date);
  if(!past.length) return null;

  var last = past[0];
  if(isDeload(date)) return {kg:last.kg, bump:false};
  if(isReturning(date)) return {kg:+(last.kg*RETURN_CUT).toFixed(2), bump:false, eased:true};
  /* Two sessions at the same weight = it has stopped being hard. One is
     not enough — a single good session is as likely to be a good day. */
  var held = past.length>=2 && past[1].kg===last.kg;
  return held ? {kg:+(last.kg+step).toFixed(2), bump:true} : {kg:last.kg, bump:false};
}

/* Every load-tracked exercise in a session, already resolved for rotation
   and phase, paired with its row index so tick state can be matched up. */
function sessionLoads(key, date, phName){
  var out=[];
  T[key].x.forEach(function(base,i){
    var r=resolveEx(base, key, date, phName);
    if(r && r.e.id) out.push({i:i, e:r.e});
  });
  return out;
}

/* Resolve an exercise for a given session/date/phase: phase skip wins over
   rotation (a phase that drops an exercise entirely shouldn't have a
   rotated variant sneak back in), otherwise rotate, apply the phase
   prescription, then thin it out if this is a deload week. */
function resolveEx(e, key, date, phaseName){
  if(/^skip\b/i.test(presc(e, phaseName))) return null;
  var r = rotated(e, key, date);
  var m = presc(r.e, phaseName);
  if(/^skip\b/i.test(m)) return null;   // a rotated-in variant can also skip
  if((isDeload(date) || isReturning(date)) && !/^(warm up|cool down)/i.test(r.e.t))
    m = r.e.dl || deloadPresc(m);
  return {e:r.e, m:m, swapped:r.swapped, base:e};
}

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

/* An N-day rolling forecast for the iOS widget. Same idea as upNext() but
   iterated: each day the plan is assumed followed becomes the history for
   the next. Real logged days always win over simulated ones.

   Phase is taken from the current block for every day, which is correct
   rather than lazy: the plan only advances when days are actually logged,
   and logging requires opening the app, which regenerates this. So the
   cached forecast is accurate for exactly as long as it is the widget's
   only source of truth. */
function forecast(days){
  var sim={}, out=[], p=block(), ph=phaseAt(p.b), dl=p.w===4;
  for(var i=0;i<days;i++){
    var d=addDays(today(),i);
    var real=Store.get(d), key;
    if(real){ key=real.t; }
    else {
      var h=history(d).map(function(e){
        return sim[e.date] ? {date:e.date, type:sim[e.date], ago:e.ago} : e;
      });
      key=decide(d,h).k;
      sim[d]=key;
    }
    var s=T[key];
    /* isReturning() checks real Store data, not the `sim` days above, so
       across a 14-day forecast this stays "true" for every simulated day
       until a real log shrinks the actual gap — same known limitation as
       phase/dl being frozen to today for the whole window (see comment
       above). Cosmetic only: it can show the taper running a little longer
       in the widget than it will once real days get logged. */
    var ret = !dl && isReturning(d);
    out.push({
      date:d, key:key, name:s.n, where:s.w, colour:v(s.c), logged:!!real,
      phase: dl ? 'Deload' : ret ? 'Returning' : ph.n,
      cue: key==='rest' ? '' : (dl ? 'Pull back — every set lighter or shorter this week.' : ph.cue),
      exercises: s.x.map(function(e){ return resolveEx(e, key, d, ph.n); }).filter(Boolean)
                    .map(function(r){
                      /* Weight folded into the prescription string rather than
                         a new field — the widget shows it with no Swift change. */
                      var tg = r.e.id ? target(r.e, d) : null;
                      return {t:r.e.t, m:r.m + (tg ? ' · '+tg.kg+'kg' : '')};
                    })
    });
  }
  return out;
}

/* Hand the forecast to the native iOS wrapper, if we are running inside it.
   In any normal browser window.webkit.messageHandlers is undefined, so this
   is a complete no-op and the web app behaves exactly as it always has. */
function pushNative(){
  var mh = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.crimp;
  if(!mh) return;
  try{
    mh.postMessage(JSON.stringify({v:1, generated:today(), days:forecast(14)}));
  }catch(e){ /* the bridge must never be able to break the app */ }
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
function isHard(type){ return load(type,'finger')>=2 || load(type,'pull')>=3; }
function streak(h){
  var n=0;
  for(var i=0;i<h.length;i++){
    if(!h[i].type) break;
    if(isHard(h[i].type)) n++; else break;
  }
  return n;
}

/* The engine only ever schedules the three structured sessions — Max
   Fingers, Hangboard, Pull — or rest. Climbing (indoor, outdoor, easy) is
   never recommended: those are days you decide to take, and you put them
   in yourself by swiping or tapping a dot. Logged climbing days still feed
   the recovery gates and the hard-day caps below exactly as before, they
   just are not something the app asks you to do. */
function decide(date, hOverride){
  var h=hOverride || history(date);
  var yf=load(h[0].type,'finger');
  var yName=h[0].type?T[h[0].type].n:null;
  var run=streak(h);

  /* The caps below mean "no more than N in any SEVEN CONSECUTIVE DAYS", and
     the window that matters when deciding `date` is `date` itself plus the
     six days behind it — `date` occupies the seventh slot. So the count runs
     over ago 1..6, not the full ago 1..7 that history() returns.

     Counting all seven made the engine a day more conservative than designed
     and produced a genuinely wrong answer: a finger day exactly 7 days back
     blocked training today, even though it drops out of the window the
     instant today is logged, so no 5-in-7 could ever have occurred. Recency
     is handled separately by the since() gates; these two are purely about
     how much fits in a week. */
  var win=h.slice(0,6);
  var hard=win.filter(function(e){ return isHard(e.type); }).length;

  /* Deload weeks pull both ceilings down, so the week genuinely comes out
     lighter instead of just being labelled that way. Returning from a
     layoff gets the same tighter ceilings, for the same reason deload
     tightens them, but for a different underlying cause — see isReturning(). */
  var dl=isDeload(date), ret=!dl && isReturning(date);
  var tight=dl||ret;
  var runCap=tight?2:3, hardCap=tight?3:6;

  /* Fingers get their own ceiling, separate from the blanket one above.
     Pull is systemically hard but it is a REST DAY for fingers, so counting
     it against a single combined cap strangled the rotation — the plan could
     not run three-on-one-off no matter how recovered the fingers were.
     Connective tissue adapts far slower than muscle, so this is the limit
     that actually matters for injury; the blanket cap is the systemic one. */
  var fingerDays=win.filter(function(e){ return e.type && FING.indexOf(e.type)>=0; }).length;
  var fingerCap=tight?2:4;

  if(run>=runCap) return {k:'rest', why: dl
    ? run+' days on the trot in a deload week. The whole point of this week is arriving at the next block fresh.'
    : ret ? run+' days on the trot while easing back in. That is exactly the number that used to catch you out — rest.'
    : run+' days on the trot. Nothing productive happens on day four.'};
  if(hard>=hardCap) return {k:'rest', why: dl
    ? hard+' hard days already this deload week. Cap is three — bank the recovery.'
    : ret ? hard+' hard days already since coming back. Cap is three while easing back in — bank the recovery.'
    : hard+' hard days behind you already. Training today would make '+(hard+1)+' in a week, which is over the ceiling.'};

  /* Gated on RECOVERY ONLY, not on a once-per-calendar-week quota. The old
     `count(h,[X])<1` meant each session could appear at most once in any
     7-day window, which capped the whole plan at three training days a
     week and left five rest days in a row. The intended rhythm is a
     rolling three-on-one-off: each session comes back round as soon as
     the tissue it loads has recovered, and the caps above are what stop it
     running away. Recovery is the limiter, not the calendar. */
  if(fingerDays<fingerCap && since(h,['maxFingers'])>=3 && yf<=1)
    return {k:'maxFingers', why:'Fingers are fresh. This is the session that moves your weakness, so it gets first claim.'};

  /* Two clear days since ANY finger loading, crag days included — which is
     also why this one gets squeezed first when the week is busy. Little and
     often on the board matters less than arriving at Max Fingers fresh. */
  if(fingerDays<fingerCap && since(h,FING)>=2)
    return {k:'hangboard', why:'Max Fingers is unavailable, but your fingers can take submaximal tolerance work.'};

  /* Three-day floor, not two: at two it filled every gap the finger cap
     opened up and the rotation degenerated into pull-rest-pull-rest. */
  if(since(h,['pull'])>=3)
    return {k:'pull', why: yf>1
      ? (yName||'Yesterday')+' left your fingers cooked. Your arms are fine — this is exactly what Pull is for.'
      : 'Pull work is outstanding this week and nothing is blocking it.'};

  /* Nothing structured is due. Before settling for rest: if yesterday was
     already a rest day, Pull's floor drops from three days to two. Pull is
     the one session that costs the fingers nothing, so it is the only
     legitimate filler for a would-be second consecutive rest day — and this
     lives HERE, at the nothing-due fallthrough, deliberately: rests decided
     by the caps above are safety and are never overridden, and deload /
     easing-back weeks (tight) keep their doubled rests on purpose. */
  var y=h[0].type;
  if((!y || y==='rest') && !tight && since(h,['pull'])>=2)
    return {k:'pull', why:'Second day off in a row otherwise. Pull spares the fingers entirely, so its usual three-day gap drops to two rather than sitting still again.'};

  /* Genuinely nothing due. Not an instruction to sit still — this is the
     day to go climbing if you fancy it; the app just does not presume to
     schedule that for you. */
  return {k:'rest', why:'Nothing structured due. Climb if you fancy it, otherwise take the day.'};
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

  document.documentElement.style.setProperty('--c', v(s.c));

  var ph=phaseAt(p.b), dl=p.w===4, ret=!dl && isReturning(today());
  $('topB').textContent=ph.n+' · Wk '+p.w+(dl?' · Deload':ret?' · Easing back in':'');
  $('topB').onclick=showPlan;
  $('topD').textContent=new Date(today()+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

  // week dots, and the day-initial under each one
  var dh='', wh='';
  for(var i=6;i>=0;i--){
    var k=addDays(today(),-i), e=Store.get(k);
    var col = e ? v(T[e.t].c) : '';
    dh+='<button class="dot'+(i===0?' now':'')+'" data-d="'+k+'" aria-label="'+k+'">'+
        '<i class="'+(e?'on':'')+'" style="'+(e?'background:'+col:'')+'"></i></button>';
    var letter=new Date(k+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'}).charAt(0);
    wh+='<span'+(i===0?' class="now"':'')+'>'+letter+'</span>';
  }
  $('dots').innerHTML=dh;
  $('dow').innerHTML=wh;
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
    b.onclick=function(){
      var to=b.dataset.k;
      if(to===key) return;
      slideTo(dirBetween(key,to), function(){ browseIndex=ORDER.indexOf(to); });
    };
  });

  // The daily card shows what to do, not the reasoning behind it — no
  // recommendation text, no phase/effort-cue narration, no rotation
  // explanation. That detail lives one tap away in "the plan" (topB above)
  // for whoever wants it; the card itself should take zero thought to read.
  $('h1').textContent=s.n;
  $('where').innerHTML=s.w+
    (dl && key!=='rest' ? ' <span class="deload-badge">Deload</span>'
      : ret && key!=='rest' ? ' <span class="deload-badge">Easing back in</span>' : '');
  /* The only surviving explanatory lines, and they earn their place: the
     numbers below are already adjusted, but the REASON you should not just
     push through to what they used to say is the bit worth one sentence.
     Falls back to the session's own note (where climbing goes relative to
     this workout) on an ordinary day — the one bit of sequencing you have
     to get right before you start, so it belongs before the exercises
     rather than a tap away. Suppressed once logged: the session is over,
     the ordering advice has expired. */
  var msg = (isLogged ? 'Logged.' + (logged.l ? ' Top set ' + logged.l + 'kg.' : '') + ' ' : '') +
    (dl && key!=='rest'
      ? 'Deload week — ' + (s.climb
          ? 'fewer hard attempts, and stop well short of failure. Times below are already cut.'
          : 'same weights as usual, fewer sets. The numbers below are already cut.')
      : ret && key!=='rest'
      ? 'Easing back in after a break — weights are cut, not just sets. Go by feel: back off further if anything below feels off, this is not the week to chase the number.'
      : '');
  if(!msg && !isLogged && s.note) msg = s.note;
  $('why').textContent = msg;

  // exercises — prescriptions follow the current phase where one is defined.
  // A phase can skip an exercise entirely ("skip — ...") rather than just
  // adjust its numbers — those don't render as a row at all, not a row
  // that says "skip" while still showing its full description and timer.
  // Rotation swaps the exercise silently — resolveEx() already picked the
  // right variant, and the card just shows it like any other exercise.
  $('list').innerHTML = s.x.map(function(base,i){
    var r=resolveEx(base, key, today(), ph.n);
    if(!r) return '';
    var e=r.e, m=r.m;
    var on=!!ticks[key+i];
    /* Working weight, for exercises that carry one. Shown, not asked for —
       the number IS the instruction, so the zero-tap path is to read it and
       lift it. Tapping only happens on the rare day the weight changes. */
    var w='';
    if(e.id){
      var tg=target(e, today());
      w = tg
        ? '<button class="wt'+(tg.bump?' up':'')+(tg.set?' set':'')+'" data-x="'+i+'" aria-label="'+e.t+' weight">'+tg.kg+'<i>kg</i></button>'
        : '<button class="wt add" data-x="'+i+'" aria-label="Set '+e.t+' weight">set<i>kg</i></button>';
    }
    return '<div class="ex'+(on?' checked':'')+'" data-i="'+i+'">'+
      '<button class="tick" aria-pressed="'+on+'" aria-label="'+e.t+'"></button>'+
      '<div class="eb"><div class="et"><span class="en">'+e.t+'</span>'+
        '<span class="ep"><span class="em'+(m!==e.m?' ph':'')+'">'+m+'</span>'+w+'</span></div>'+
      (e.d?'<div class="ed">'+e.d+'</div>':'')+
      (e.r?'<button class="rest" data-r="'+e.r+'" data-l="'+e.t+'">'+fmt(e.r)+'</button>':'')+
      '</div></div>';
  }).join('');

  $('list').querySelectorAll('.wt').forEach(function(b){
    b.onclick=function(ev){
      ev.stopPropagation();
      var rr=resolveEx(s.x[+b.dataset.x], key, today(), ph.n);
      if(rr && rr.e.id) weightSheet(rr.e);
    };
  });

  $('list').querySelectorAll('.tick').forEach(function(b){
    b.onclick=function(){
      var row=b.closest('.ex'), k2=key+row.dataset.i;
      ticks[k2]=!ticks[k2];
      b.setAttribute('aria-pressed',!!ticks[k2]);
      row.classList.toggle('checked',!!ticks[k2]);
    };
  });
  $('list').querySelectorAll('.rest').forEach(function(b){
    b.onclick=function(){ startTimer(+b.dataset.r, b.dataset.l); };
  });

  // No separate "browse other sessions" button — swipe/tap a dot to get
  // there, then this logs whichever one is on screen. Label spells that
  // out so it doesn't read as only confirming the recommendation.
  $('doneBtn').textContent = isLogged ? 'Undo' : 'Done This Workout';
  $('doneBtn').onclick = isLogged
    ? function(){ var p=Store.clear(today()); browseIndex=null; render(); p.catch(function(e){ render(); saveFailed(e); }); }
    : function(){ browseIndex=null; finish(today(), key); };

  // up next — tomorrow's forecast, independent of whatever session is
  // currently being browsed/previewed above. Lives compact next to the
  // session dots rather than as its own full-width row.
  var un=upNext(), unS=T[un.key];
  var unLabel='Tomorrow, '+new Date(un.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric'})+
    ': '+unS.n+(un.provisional?' — if today goes to plan':'');
  $('upnext').setAttribute('aria-label',unLabel);
  $('upnext').title=unLabel;
  $('upnext').innerHTML =
    '<span class="un-l">NEXT</span>'+
    '<span class="un-dot" style="background:'+v(unS.c)+'"></span>'+
    '<span class="un-n">'+unS.n+'</span>';
  $('upnext').onclick=function(){ preview(un.date, un.key); };

  pushNative();
}

function fmt(s){ var m=Math.floor(s/60),r=s%60; return m+':'+(r<10?'0':'')+r; }

/* ---- swipe between sessions ---- */

/* Slide the card out the way you swiped, re-render while it's off screen,
   then bring the new one in from the opposite edge. `dir` is +1 for moving
   forward through ORDER (finger swiped left), -1 for back. */
var animating=false;
function slideTo(dir, apply){
  var card=$('card');
  if(animating){ apply(); render(); return; }
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    apply(); render(); return;
  }
  animating=true;
  card.style.transition='transform .13s ease-in, opacity .13s ease-in';
  card.style.transform='translateX('+(dir>0?-34:34)+'px)';
  card.style.opacity='0';
  setTimeout(function(){
    apply(); render();
    card.style.transition='none';
    card.style.transform='translateX('+(dir>0?34:-34)+'px)';
    void card.offsetWidth;                     // force the jump to take before animating back
    card.style.transition='transform .19s ease-out, opacity .19s ease-out';
    card.style.transform='translateX(0)';
    card.style.opacity='1';
    setTimeout(function(){
      card.style.transition=''; card.style.transform=''; card.style.opacity='';
      animating=false;
    },200);
  },135);
}

/* Which way to slide when jumping to an arbitrary session — take the
   shorter way round the list so the motion matches the dot you tapped. */
function dirBetween(fromKey, toKey){
  var n=ORDER.length, a=ORDER.indexOf(fromKey), b=ORDER.indexOf(toKey);
  if(a<0||b<0||a===b) return 1;
  return ((b-a+n)%n) <= n/2 ? 1 : -1;
}

function currentKey(){
  var logged=Store.get(today());
  return browseIndex!==null ? ORDER[browseIndex] : (logged?logged.t:decide(today()).k);
}

var swX=0, swY=0;
$('card').addEventListener('touchstart',function(e){
  var t=e.touches[0]; swX=t.clientX; swY=t.clientY;
},{passive:true});
$('card').addEventListener('touchend',function(e){
  var t=e.changedTouches[0], dx=t.clientX-swX, dy=t.clientY-swY;
  if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5){
    var dir = dx<0 ? 1 : -1;
    var idx=(ORDER.indexOf(currentKey())+dir+ORDER.length)%ORDER.length;
    slideTo(dir, function(){ browseIndex=idx; });
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

/* Every exercise with a `rotate` config, across all sessions, with where it
   currently sits in its own cycle. This is the "behind the scenes" detail
   the daily card deliberately no longer shows — it lives here instead,
   one tap into the plan, for whoever wants to check it. */
function rotationsInfo(){
  var out=[];
  ORDER.forEach(function(key){
    T[key].x.forEach(function(e){
      if(!e.rotate || !e.rotate.with || !e.rotate.with.length) return;
      var every=e.rotate.every||4;
      var occ=occurrence(key, today());
      var pos=((occ-1)%every)+1;
      var r=rotated(e, key, today());
      out.push({
        session:T[key].n, base:e.t, every:every, pos:pos,
        showingToday:r.swapped, showing:r.swapped?r.e.t:e.t
      });
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

  /* Sticks around for exactly the sessions the taper actually covers, not
     a fixed number of days — it does not linger as stale advice once you
     are back to normal. */
  var rinfo=returnInfo();
  if(rinfo){
    h+='<div class="plan-h">Coming back</div>'+
      '<p class="shp">'+rinfo.gap+' days off, back since '+shortDate(rinfo.resumed)+
      ' — session '+rinfo.session+' of '+RETURN_SESSIONS+' in the taper. Weights are cut '+Math.round((1-RETURN_CUT)*100)+
      '% and volume is trimmed. Normal prescriptions from the session after this.</p>';
  }

  h+=PHASES.map(function(x,i){
    var on=i===curI, c=v(x.c||'--s4');
    return '<button class="opt" style="--oc:'+c+(on?'':';opacity:.62')+'" data-p="'+i+'">'+
      '<span class="optn">'+x.n+'</span>'+
      '<span class="opts">'+(on?'NOW · ':'')+phaseRange(i)+'</span></button>';
  }).join('');

  var rot=rotationsInfo();
  if(rot.length){
    h+='<div class="plan-h">Rotations</div>';
    h+=rot.map(function(r){
      var status = r.showingToday
        ? 'Currently showing <strong>'+r.showing+'</strong> instead'
        : 'On '+r.base+' · swaps to a variant every '+r.every+(r.every===2?'nd':r.every===3?'rd':'th')+' '+r.session+' session — '+(r.every-r.pos)+' to go';
      return '<div class="plan-ch"><div class="plan-ch-t">'+r.base+'<span>'+r.session+'</span></div>'+
        '<div class="plan-ch-m" style="color:var(--dim)">'+status+'</div></div>';
    }).join('');
  }

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
  var phName=phaseAt(block(date).b).n;
  var shown=s.x.map(function(base){ return resolveEx(base, key, date, phName); }).filter(Boolean);
  var h='<h2>'+s.n+'</h2><p class="shp">'+s.w+'</p>';
  h += shown.length ? shown.map(function(r){
    var e=r.e;
    return '<div style="padding:11px 0;border-bottom:1px solid var(--s2)">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">'+
        '<span style="font-family:\'Barlow Condensed\',sans-serif;font-weight:600;font-size:17px;text-transform:uppercase">'+e.t+'</span>'+
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--faint);white-space:nowrap">'+r.m+'</span>'+
      '</div>'+
      (e.d?'<div style="font-size:13.5px;color:var(--dim);margin-top:3px;line-height:1.4">'+e.d+'</div>':'')+
    '</div>';
  }).join('') : '<p class="shp">No set exercises — just take the day.</p>';
  h += '<div class="row2" style="margin-top:16px"><button class="sec" id="prevBack">Back</button><button class="pri" id="prevLog">Log this</button></div>';
  open(h);
  $('prevBack').onclick=function(){ pick(date); };
  $('prevLog').onclick=function(){ close(); finish(date, key); };
}

function shortDate(d){
  return new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
}

/* Setting a working weight. Behind a tap, so this is the one place it is
   worth explaining itself — the daily card stays silent. Writes immediately
   rather than on Done: this table does not mark the day as trained, so
   there is no reason to hold it, and holding it would lose the number to
   the iOS shell's 60-second background reload. */
function weightSheet(e){
  var step=e.step||2.5;
  var tg=target(e, today());
  var past=loadHistory(e.id, today());   // this phase only — see loadHistory()
  var prev=past[0];
  // Only consulted when there is nothing in THIS phase yet — a reference,
  // never a suggestion, so a Base number never quietly becomes today's
  // Max Strength target.
  var anyPrev = !prev ? Loads.history(e.id).filter(function(r){ return r.date<today(); })[0] : null;

  var note;
  if(tg && tg.set)      note='Recorded '+tg.kg+'kg today.'+(prev?' Last time '+prev.kg+'kg, '+shortDate(prev.date)+'.':'');
  else if(tg && tg.bump)note='You held '+prev.kg+'kg for two sessions, so this is up '+step+'kg. Put it back if it is too much — nothing is lost.';
  else if(tg && tg.eased){
    var rinf=returnInfo(today());
    note='Easing back in after '+(rinf?rinf.gap:'a few')+' days off, so this is cut down from '+prev.kg+'kg rather than picking up where you left off. Go lower still if it feels off — the number is a ceiling, not a target.';
  }
  else if(prev)         note='Last time — '+prev.kg+'kg, '+shortDate(prev.date)+'.';
  else if(anyPrev)      note='New phase — '+phaseNameAt(anyPrev.date)+' numbers don\'t carry over here. Last logged there: '+anyPrev.kg+'kg, '+shortDate(anyPrev.date)+'. Put in what you actually lift today.';
  else                  note='First time on this one. Put in what you actually lift today and the app takes it from there.';

  open('<h2>'+e.t+'</h2>'+
    '<p class="shp">'+note+'</p>'+
    '<div class="wtr">'+
      '<button class="wtb" id="wDn" aria-label="Less">−</button>'+
      '<div class="num" style="margin:0;flex:1"><input type="number" inputmode="decimal" step="any" id="wIn" placeholder="0" value="'+(tg?tg.kg:'')+'"><span>kg</span></div>'+
      '<button class="wtb" id="wUp" aria-label="More">+</button>'+
    '</div>'+
    '<div class="row2"><button class="sec" id="wX">Cancel</button><button class="pri" id="wOk">Save</button></div>');

  /* No floor at 0: negative is a real value here, not an error — it is
     assistance taken OFF (a band, a pulley, feet still doing some of the
     work), same as Joe's band-assisted pull-ups. Less negative next time is
     still progress, so the existing bump-when-held-twice logic already
     does the right thing without any sign-specific handling. */
  function nudge(dir){
    var cur=parseFloat($('wIn').value);
    if(isNaN(cur)) cur=0;
    $('wIn').value=+(cur + dir*step).toFixed(2);
  }
  $('wDn').onclick=function(){ nudge(-1); };
  $('wUp').onclick=function(){ nudge(1); };
  $('wX').onclick=close;
  $('wOk').onclick=function(){
    var n=parseFloat($('wIn').value);
    close();
    if(isNaN(n)) return;
    var p=Loads.set(today(), e.id, n); render();
    p.catch(function(err){ render(); saveFailed(err); });
  };
}

function finish(date, key){
  if(date===today()) browseIndex=null;

  /* Ticking an exercise off is already how you say "did that" — so it is
     also the confirmation that you did it at the weight on screen, and the
     weight gets recorded. No extra step, and nothing is invented for rows
     you never ticked. Computed BEFORE the session is saved: logging the day
     can tip the block into a deload week, which changes what target() says. */
  var phn=phaseAt(block(date).b).n;
  sessionLoads(key, date, phn).forEach(function(x){
    if(!ticks[key+x.i]) return;
    if(Loads.on(x.e.id, date)) return;        // already set by hand today
    var tg=target(x.e, date);
    if(tg) Loads.set(date, x.e.id, tg.kg).catch(saveFailed);
  });

  var p=Store.set(date,key); render();
  p.catch(function(e){ render(); saveFailed(e); });
  if(date===today()) celebrate();
}

/* ---- celebration ---- */
/* A brief, non-blocking reward on logging today's session — nothing to
   dismiss, nothing to read, just there for a moment then gone. Kept out
   of the daily card itself (same reasoning as everything else stripped
   off it): this is a one-off reaction to an action just taken, not
   standing information about the day. */
function celebrate(){
  var el=$('celebrate');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var particles='';
  if(!reduced){
    var n=10;
    for(var i=0;i<n;i++){
      var ang=Math.round((360/n)*i + (Math.random()*20-10));
      var dist=Math.round(60+Math.random()*40);
      particles+='<i class="cel-p" style="--ang:'+ang+'deg;--dist:'+dist+'px;animation-delay:'+(Math.random()*0.06).toFixed(2)+'s"></i>';
    }
  }
  el.innerHTML = particles +
    '<div class="cel-check"><svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 6"/></svg></div>';
  el.classList.add('on');
  clearTimeout(celebrate._t);
  celebrate._t=setTimeout(function(){ el.classList.remove('on'); el.innerHTML=''; },900);
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
  $('why').textContent = msg || 'Enter your email. Each email gets its own private log — share the URL, everyone keeps their own data.';
  $('bar').style.display='none';
  $('list').innerHTML =
    '<div class="num" style="margin-top:20px">'+
      '<input type="email" inputmode="email" id="loginEmail" placeholder="you@example.com">'+
    '</div>'+
    '<div class="row2"><button class="pri go off" id="loginSend">Send code</button></div>';

  function emailOK(){ return /\S+@\S+\.\S+/.test($('loginEmail').value.trim()); }
  function syncBtn(){ $('loginSend').classList.toggle('off', !emailOK()); }
  $('loginEmail').oninput=syncBtn;
  $('loginEmail').onkeydown=function(e){ if(e.key==='Enter' && emailOK()) $('loginSend').click(); };
  syncBtn();

  $('loginSend').onclick=function(){
    var email=$('loginEmail').value.trim();
    if(!emailOK()) return;
    var btn=$('loginSend'); btn.disabled=true; btn.textContent='Sending…';
    sb.auth.signInWithOtp({email:email, options:{emailRedirectTo:location.origin+location.pathname}}).then(function(res){
      if(res.error){ showLogin('Something went wrong: '+res.error.message); return; }
      showCode(email);
    });
  };
}

/* Code entry rather than relying on the emailed link.
   Tapping the link opens Safari, and Safari and the iOS wrapper's WKWebView
   have separate storage — so a link that signs you in on the website leaves
   the app still signed out. A typed code lands the session in whichever one
   you are actually looking at, and works the same on every device. The link
   still works too, for anyone who prefers it in a browser. */
function showCode(email, msg){
  $('h1').textContent='Enter code';
  $('where').textContent='Sign-in';
  $('why').textContent = msg || 'Sign-in code sent to '+email+'. Typing it here signs you in on this device — in the app, tapping the emailed link would sign you in to Safari instead.';
  $('bar').style.display='none';
  /* No maxlength: Supabase's OTP length is a per-project setting (this one
     issues 8 digits, not the documented default of 6), so pinning a length
     here just makes longer codes impossible to type. Let the server decide
     what's valid. */
  $('list').innerHTML =
    '<div class="num" style="margin-top:20px">'+
      '<input type="text" inputmode="numeric" autocomplete="one-time-code" id="otpIn" placeholder="code from email">'+
    '</div>'+
    '<div class="row2"><button class="sec" id="otpBack">Back</button><button class="pri go off" id="otpGo">Sign in</button></div>';
  setTimeout(function(){ var el=$('otpIn'); if(el) el.focus(); },120);

  /* Length isn't fixed (it's a Supabase project setting), so this only
     checks there's a plausible amount of digits — the server is still the
     one that decides whether the code is right. */
  function codeOK(){ return $('otpIn').value.replace(/\D/g,'').length>=4; }
  function syncBtn(){ $('otpGo').classList.toggle('off', !codeOK()); }
  $('otpIn').oninput=syncBtn;
  syncBtn();

  function submit(){
    // tolerate pasted codes with spaces or stray characters
    var token=$('otpIn').value.replace(/\D/g,'');
    if(!token) return;
    var btn=$('otpGo'); btn.disabled=true; btn.textContent='Checking…';
    sb.auth.verifyOtp({email:email, token:token, type:'email'}).then(function(res){
      if(res.error){ showCode(email, 'That code did not work: '+res.error.message+' Codes expire, so request a new one if it has been a while.'); return; }
      boot();
    });
  }
  $('otpGo').onclick=submit;
  $('otpIn').onkeydown=function(e){ if(e.key==='Enter') submit(); };
  $('otpBack').onclick=function(){ showLogin(); };
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
    Promise.all([Store.load(), Loads.load()]).then(function(){ sessionReady=true; render(); });
  });
}
sb.auth.onAuthStateChange(function(event){
  if(event==='SIGNED_IN' && !sessionReady) boot();
});
boot();
})();

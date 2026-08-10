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
var START_DATE, T, PHASES;

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
    var since = new Date(Date.now() - 60*86400000).toISOString().slice(0,10);
    var res = await sb.from('sessions').select('date,type,load').gte('date', since);
    this._d = {};
    (res.data||[]).forEach(function(r){ this._d[r.date] = {t:r.type, l:r.load}; }, this);
  },
  all:function(){ return this._d; },
  get:function(date){ return this._d[date] || null; },
  set:async function(date, type, load){
    this._d[date] = load ? {t:type, l:load} : {t:type};
    var u = (await sb.auth.getUser()).data.user;
    await sb.from('sessions').upsert(
      {user_id:u.id, date:date, type:type, load: load == null ? null : load},
      {onConflict:'user_id,date'}
    );
  },
  clear:async function(date){
    delete this._d[date];
    await sb.from('sessions').delete().eq('date', date);
  }
};

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
    phases:[
      {n:'Base', from:1, d:'Four weeks building tissue tolerance before the heavy work starts. Loads sit clearly submaximal and sets run longer — the point is capacity and movement quality, not a top set. You are already training, so this is short: one block, not two.'},
      {n:'Max Strength', from:2, d:'The main event, and the longest phase — twelve weeks. Pickups and hangs go near-maximal, rests go long, set counts stay low. This is where the crimp weakness and the one-arm actually move. Everything else in the week exists to let these sessions happen fresh.'},
      {n:'Power', from:5, d:'Converting the strength you built into speed. Same movements, fewer reps, moved fast and explosively rather than ground out. Contact strength on the fingers rather than long holds.'},
      {n:'Performance', from:6, d:'Structured training steps back and climbing takes over. Keep one light finger session a week to hold what you built, and spend the rest of your days projecting. This is when the previous five months are supposed to show up on rock.'}
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
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before touching the edge. Weighted hangs come first in this session, so you are going straight into the heaviest thing you do here.'},
          {t:'Weighted hangs',m:'10s × 5',d:'Alternate weeks, only if the gym has a belt. Heavy-ish, never maximal. This goes FIRST, while fingers are fresh — doing repeaters before it would blunt the load you can hold and mean pulling near-max on already-fatigued tissue.',r:180},
          {t:'20mm repeaters',m:'4–5 sets',d:'7s on / 3s off × 6 = one set. Around 55–60% of max. Two minutes between sets.',r:120},
          {t:'Band-assisted one-arm',m:'3 × 5s / hand',d:'If there is a pulley or a band. Closest thing to pickups you can do at work — and the right step while you cannot one-arm hang a 20mm edge unassisted. Alternate hands.',r:90},
          {t:'Volume climbing',m:'45 min',d:'Crimp-biased mileage, not limit attempts.'}
        ]},
      climbHard:{n:'Crimp Session', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Crimp-only limit bouldering',m:'45 min',d:'Small edges, vertical to 20°. Set your own if there is nothing suitable — you work there.',r:180},
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
    /* Compressed to fit the Font trip in October — roughly nine weeks from
       the 10 Aug start. No long base phase: he is already training 2–3x a
       week, so block 1 goes straight at strength. Block 3 is the taper. */
    phases:[
      {n:'Max Strength', from:1, d:'Weeks 1–4. Straight at it — you are already training, so there is no time or need for a long base phase. Sloper and open-hand work goes near-maximal, weighted pull-ups build toward a real one-rep max. Get the strength on board early so there is time to convert it.'},
      {n:'Power Endurance', from:2, d:'Weeks 5–8. Strength work drops to maintenance and the endurance gap becomes the priority — this is the thing most likely to cost you a 7B+ in Font. Circuits, boulder doubles and 4x4s move to the front of sessions instead of the end.'},
      {n:'Peak — Font', from:3, d:'The last week or two before the trip. Volume drops hard, intensity stays, and you arrive fresh rather than fried. Resist the urge to cram a last big session in — fitness gained in the final ten days is negligible, but fatigue carried in is not. Climb easy, stay sharp, go send.'}
    ],
    sessions:{
      maxFingers:{n:'Max Strength', w:'Work · 40 min', c:'--gorse', finger:3, pull:1, ask:'Top set load',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before loading anything.'},
          {t:'Open-hand / sloper block hangs',m:'5 × 7s',ph:{'Power Endurance':'3 × 7s — maintain only','Peak — Font':'2 × 7s — light, keep sharp'},d:'This is the priority lift — slopers are your weak grip, so this is where you actually move the needle for Font. Add weight once all five feel solid two sessions running. Take the full three minutes between sets; near-max work stops being near-max without it.',r:180},
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
          {t:'Compression / sloper limit bouldering',m:'40 min',ph:{'Power Endurance':'25 min — after the circuit','Peak — Font':'30 min — Font-style, well short of failure'},d:'Seek out the compression-y, shouldery, sloper problems you would normally avoid. This block is what actually prepares you for Font, not the crimpy stuff you are already good at.',r:180},
          {t:'Endurance circuit',m:'20 min',ph:{'Power Endurance':'35 min — do this FIRST, while fresh','Peak — Font':'skip'},d:'Boulder doubles or 4x4s — same format you have used before. This is the direct fix for the endurance gap. In the Power Endurance block this moves to the front of the session: whatever comes first gets the quality.',r:180},
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
    phases:[
      {n:'Base', from:1, d:'Build capacity and movement quality before loading heavy. Submaximal throughout.'},
      {n:'Max Strength', from:2, d:'Near-maximal work, long rests, low set counts.'},
      {n:'Power', from:5, d:'Convert strength to speed — same movements, fewer reps, moved fast.'},
      {n:'Performance', from:6, d:'Structured training steps back, climbing takes over.'}
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
function block(date){
  var ms=new Date((date||today())+'T12:00:00').getTime()-new Date(START_DATE+'T12:00:00').getTime();
  var w=Math.max(0,Math.floor(ms/604800000));
  return {b:Math.min(6,Math.floor(w/4)+1), w:(w%4)+1};
}
function phaseAt(b){
  var out=PHASES[0];
  for(var i=0;i<PHASES.length;i++) if(b>=PHASES[i].from) out=PHASES[i];
  return out;
}
function phaseRange(i){
  if(i===PHASES.length-1) return 'Block '+PHASES[i].from+' onwards';
  var from=PHASES[i].from, to=PHASES[i+1].from-1;
  return from>=to ? ('Block '+from) : ('Blocks '+from+'–'+to);
}
function isDeload(date){ return block(date).w===4; }
/* Show the phase-specific prescription for an exercise if it has one. */
function presc(e,phaseName){ return (e.ph && e.ph[phaseName]) || e.m; }

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

function decide(date){
  var h=history(date);
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

  // exercises — prescriptions follow the current phase where one is defined
  $('list').innerHTML = s.x.map(function(e,i){
    var on=!!ticks[key+i];
    return '<div class="ex'+(on?' done':'')+'" data-i="'+i+'">'+
      '<button class="tick" aria-pressed="'+on+'" aria-label="'+e.t+'"></button>'+
      '<div class="eb"><div class="et"><span class="en">'+e.t+'</span><span class="em'+(presc(e,ph.n)!==e.m?' ph':'')+'">'+presc(e,ph.n)+'</span></div>'+
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
    ? function(){ Store.clear(today()); browseIndex=null; render(); }
    : function(){ browseIndex=null; finish(today(), key); };
  $('altBtn').onclick = function(){ pick(today()); };
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
      if(b.dataset.k==='__clear'){ close(); Store.clear(date); render(); return; }
      preview(date, b.dataset.k);
    };
  });
}

/* ---- the plan / timeline ---- */
function showPlan(){
  var p=block(), cur=phaseAt(p.b);
  var h='<h2>The plan</h2>'+
    '<p class="shp">Block '+p.b+' · Week '+p.w+(p.w===4?' · Deload week':'')+
    '. Every fourth week is a deload — the app drops its own limits that week and asks for more rest.</p>';
  h+=PHASES.map(function(x,i){
    var on = x.n===cur.n;
    return '<button class="opt" style="--oc:'+(on?'var(--c)':'var(--s4)')+'" data-p="'+i+'">'+
      '<span class="optn">'+x.n+'</span>'+
      '<span class="opts">'+(on?'NOW · ':'')+phaseRange(i)+'</span></button>';
  }).join('');
  open(h);
  $('shIn').querySelectorAll('.opt').forEach(function(b){
    b.onclick=function(){ showPhase(+b.dataset.p); };
  });
}

function showPhase(i){
  var x=PHASES[i], p=block(), on=x.n===phaseAt(p.b).n;
  open('<h2>'+x.n+'</h2>'+
    '<p class="shp">'+phaseRange(i)+(on?' · you are here':'')+'</p>'+
    '<p class="shp" style="color:var(--dim)">'+x.d+'</p>'+
    '<div class="row2" style="margin-top:16px"><button class="sec" id="phBack">Back</button></div>');
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
  if(!s.ask){ Store.set(date,key); render(); return; }
  open('<h2>'+s.ask+'</h2>'+
    '<p class="shp">One number, best set. Skip it if you did not measure — the plan still works without it.</p>'+
    '<div class="num"><input type="number" inputmode="decimal" id="numIn" placeholder="0"><span>kg</span></div>'+
    '<div class="row2"><button class="sec" id="numSkip">Skip</button><button class="pri" id="numOk">Save</button></div>');
  setTimeout(function(){ var el=$('numIn'); if(el) el.focus(); },260);
  $('numSkip').onclick=function(){ close(); Store.set(date,key); render(); };
  $('numOk').onclick=function(){
    var val=parseFloat($('numIn').value);
    close(); Store.set(date,key, isNaN(val)?null:val); render();
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

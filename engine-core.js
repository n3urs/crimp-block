/* ============================================================
   ENGINE-CORE
   The rules engine, extracted from app.js so it can run headless
   (Jest/Node, and eventually a native JSContext) with zero DOM and
   zero persistence dependency. Ported 1:1 from app.js — the only
   changes are:
     - Store/Loads (Supabase-backed singletons) replaced by small
       read-only facades over plain data passed into createEngine(),
       so every function here is a pure function of (program config,
       session log, load log, date) -> plain data.
     - forecast() no longer resolves a CSS colour via getComputedStyle
       (the one place the original touched the DOM) — it returns the
       raw colour-variable name and leaves resolving it to the caller.
   Every comment describing WHY a rule works the way it does is kept
   verbatim: those are hard-won, empirically-found correctness fixes,
   not incidental detail.
   ============================================================ */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EngineCore = factory();
})(typeof self !== 'undefined' ? self : this, function(){
"use strict";

/* ------------------------------------------------------------
   Session-key vocabulary, shared across every program. Every
   program's `sessions` object must define exactly these seven keys —
   the engine below references them directly. ORDER is the swipe
   strip — every session stays reachable by hand, including the
   climbing ones the engine never recommends. FING is what counts as
   having loaded your fingers, and deliberately still includes the
   climbing sessions: a crag day gates tomorrow's hangboard exactly
   as it always did, whether the app suggested it or you did.
   ------------------------------------------------------------ */
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
   Layoff-return taper constants — shared across every program.
   LAYOFF_DAYS is deliberately short (crimp-specific tissue, not
   general fitness) and RETURN_SESSIONS deliberately small — this is
   two cautious sessions back in, not a whole reset block.
   ------------------------------------------------------------ */
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

/* ------------------------------------------------------------
   createEngine(program, data) — program is one PROGRAMS[email] entry
   ({startDate, perWeek, phases, sessions}); data is
   {sessionLog, loadLog}, plain read-only snapshots shaped exactly
   like Store._d and Loads._d in app.js. Pass in LIVE references (not
   copies) if you want the engine to see writes as they land — every
   function below reads through the facades at call time, never caches.
   ------------------------------------------------------------ */
function createEngine(program, data){
  var START_DATE = program.startDate;
  var T = program.sessions;
  var PHASES = program.phases;
  var PER_WEEK = program.perWeek || 4;

  var sessionLog = (data && data.sessionLog) || {};
  var loadLog = (data && data.loadLog) || {};
  var StoreFacade = {
    all: function(){ return sessionLog; },
    get: function(date){ return sessionLog[date] || null; }
  };
  var LoadsFacade = {
    history: function(id){ return loadLog[id] || []; },
    on: function(id, date){
      var a = loadLog[id] || [];
      for(var i=0;i<a.length;i++) if(a[i].date===date) return a[i];
      return null;
    }
  };

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
    var all=StoreFacade.all(), n=0;
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
     ------------------------------------------------------------ */

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
    var all=StoreFacade.all(), days=[];
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
    var all=StoreFacade.all(), n=0;
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
    return LoadsFacade.history(id).filter(function(r){ return r.date<date && phaseNameAt(r.date)===ph; });
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
    var set = LoadsFacade.on(e.id, date);
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
     recommendation if nothing's logged yet. Doesn't touch the session log,
     so nothing here is real until today is. */
  function upNext(){
    var tmr=addDays(today(),1);
    var logged=StoreFacade.get(today());
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
     only source of truth.

     `colour` is the exercise's raw colour-variable name (e.g. '--gorse'),
     not a resolved colour — resolving CSS custom properties needs the DOM,
     which this module deliberately never touches. Callers that need an
     actual colour value resolve it themselves. */
  function forecast(days){
    var sim={}, out=[], p=block(), ph=phaseAt(p.b), dl=p.w===4;
    for(var i=0;i<days;i++){
      var d=addDays(today(),i);
      var real=StoreFacade.get(d), key;
      if(real){ key=real.t; }
      else {
        var h=history(d).map(function(e){
          return sim[e.date] ? {date:e.date, type:sim[e.date], ago:e.ago} : e;
        });
        key=decide(d,h).k;
        sim[d]=key;
      }
      var s=T[key];
      /* isReturning() checks the real session log, not the `sim` days above, so
         across a 14-day forecast this stays "true" for every simulated day
         until a real log shrinks the actual gap — same known limitation as
         phase/dl being frozen to today for the whole window (see comment
         above). Cosmetic only: it can show the taper running a little longer
         in the widget than it will once real days get logged. */
      var ret = !dl && isReturning(d);
      out.push({
        date:d, key:key, name:s.n, where:s.w, colour:s.c, logged:!!real,
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

  /* ------------------------------------------------------------
     RULES ENGINE
     ------------------------------------------------------------ */
  function history(endDate){
    var out=[];
    for(var i=1;i<=7;i++){
      var k=addDays(endDate,-i), e=StoreFacade.get(k);
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

  return {
    decide: decide, block: block, phaseIndexAt: phaseIndexAt, phaseAt: phaseAt,
    phaseNameAt: phaseNameAt, phaseRange: phaseRange, isDeload: isDeload, presc: presc,
    returnInfo: returnInfo, isReturning: isReturning, occurrence: occurrence, rotated: rotated,
    deloadPresc: deloadPresc, loadHistory: loadHistory, target: target,
    sessionLoads: sessionLoads, resolveEx: resolveEx, upNext: upNext, forecast: forecast,
    history: history, load: load, since: since, isHard: isHard, streak: streak, isTraining: isTraining
  };
}

return {
  createEngine: createEngine,
  today: today, addDays: addDays, iso: iso,
  ORDER: ORDER, FING: FING,
  LAYOFF_DAYS: LAYOFF_DAYS, RETURN_SESSIONS: RETURN_SESSIONS, RETURN_CUT: RETURN_CUT,
  DAY_START_HOUR: DAY_START_HOUR
};
});

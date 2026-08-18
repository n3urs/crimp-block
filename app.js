/* ============================================================
   DEADPOINT
   Rules-based training scheduler. No fixed weekdays — rolling
   7-day quotas plus recovery gaps, so a spontaneous crag day
   reshuffles the week instead of breaking it.
   ============================================================ */
(function(){
"use strict";

/* >>> Active program set from PROGRAMS (programs.js) below once the
   signed-in user's email is known. See applyProgram(). <<< */
var START_DATE, T, PHASES, PER_WEEK;

/* ------------------------------------------------------------
   ENGINE BINDING
   The rules engine itself lives in engine-core.js (loaded before this
   file, alongside programs.js for PROGRAMS) so it can run headless in
   tests and, eventually, natively — see engine-core.js for the full
   set of comments on WHY each rule works the way it does; nothing
   about the rules themselves changed in this split.

   today/addDays/iso and the shared constants don't depend on the
   signed-in user's program, so they're bound immediately below. The
   rest (decide, block, target, ...) are per-program — bound once
   inside boot(), after the program is chosen and Store/Loads have
   loaded (see the end of boot()) — and every call site elsewhere in
   this file keeps using the same bare name it always has.
   ------------------------------------------------------------ */
var today = EngineCore.today, addDays = EngineCore.addDays, iso = EngineCore.iso;
var ORDER = EngineCore.ORDER, FING = EngineCore.FING;
var LAYOFF_DAYS = EngineCore.LAYOFF_DAYS, RETURN_SESSIONS = EngineCore.RETURN_SESSIONS, RETURN_CUT = EngineCore.RETURN_CUT;
var DAY_START_HOUR = EngineCore.DAY_START_HOUR;
var decide, block, phaseIndexAt, phaseAt, phaseNameAt, phaseRange, isDeload, presc,
    returnInfo, isReturning, occurrence, rotated, deloadPresc, loadHistory, target,
    sessionLoads, resolveEx, upNext, forecast, history, load, since, isHard, streak, isTraining;

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
  all:function(){ return this._d; },
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

/* PROGRAMS now lives in programs.js (loaded before this file) — plain
   session-library data, keyed by lowercased sign-in email, same shape
   as before. See programs.js for the "every program must define the
   same seven keys" contract this file's engine relies on. */

function applyProgram(email){
  var key = (email||'').toLowerCase();
  var p = PROGRAMS[key] || PROGRAMS['default'];
  START_DATE = p.startDate;
  T = p.sessions;
  PHASES = p.phases;
  PER_WEEK = p.perWeek || 4;
  return p;
}

/* Hand the forecast to the native iOS wrapper, if we are running inside it.
   In any normal browser window.webkit.messageHandlers is undefined, so this
   is a complete no-op and the web app behaves exactly as it always has. */
function pushNative(){
  var mh = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.crimp;
  if(!mh) return;
  try{
    /* forecast() returns each day's colour as a raw CSS-variable name
       (e.g. '--gorse') rather than a resolved colour — engine-core.js
       never touches the DOM, so resolving it via v() happens here. */
    var days = forecast(14).map(function(d){ d.colour = v(d.colour); return d; });
    mh.postMessage(JSON.stringify({v:1, generated:today(), days:days}));
  }catch(e){ /* the bridge must never be able to break the app */ }
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
    /* An exercise with structured interval data gets the auto-cycling
       repeater timer instead of the plain rest button — that button would
       be redundant once the interval timer owns the between-set rest too. */
    var timerBtn = e.interval
      ? '<button class="reps" data-x="'+i+'">Start</button>'
      : (e.r?'<button class="rest" data-r="'+e.r+'" data-l="'+e.t+'">'+fmt(e.r)+'</button>':'');
    return '<div class="ex'+(on?' checked':'')+'" data-i="'+i+'">'+
      '<button class="tick" aria-pressed="'+on+'" aria-label="'+e.t+'"></button>'+
      '<div class="eb"><div class="et"><span class="en">'+e.t+'</span>'+
        '<span class="ep"><span class="em'+(m!==e.m?' ph':'')+'">'+m+'</span>'+w+'</span></div>'+
      (e.d?'<div class="ed">'+e.d+'</div>':'')+
      timerBtn+
      '</div></div>';
  }).join('');

  $('list').querySelectorAll('.wt').forEach(function(b){
    b.onclick=function(ev){
      ev.stopPropagation();
      var rr=resolveEx(s.x[+b.dataset.x], key, today(), ph.n);
      if(rr && rr.e.id) weightSheet(rr.e);
    };
  });
  $('list').querySelectorAll('.reps').forEach(function(b){
    b.onclick=function(ev){
      ev.stopPropagation();
      var rr=resolveEx(s.x[+b.dataset.x], key, today(), ph.n);
      if(rr && rr.e.interval) startIntervalTimer(rr.e.interval, rr.e.r||120, rr.m, rr.e.t);
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

/* One AudioContext, shared, unlocked exactly once by a real tap — not one
   fresh context per beep. WebKit requires audio to originate from a user
   gesture or the context comes up 'suspended' and produces nothing, silent
   and error-free. beep() and tone() below both used to call `new
   AudioContext()` from inside a setInterval callback, which is never a
   gesture no matter how the timer itself got started — that silence, with
   nothing in the console to explain it, was the actual bug Oscar reported.
   Creating/resuming it here, synchronously inside startTimer()'s and
   startIntervalTimer()'s own click handlers, unlocks it for every sound
   scheduled afterwards, gesture or not — WebKit's restriction is on
   starting a context outside a gesture, not on a context that is already
   running continuing to play. */
var audioCtx=null;
function unlockAudio(){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}

/* ---- timer ---- */
function startTimer(secs,label){
  if(timer) clearInterval(timer);
  unlockAudio();
  tTot=secs; tEnd=Date.now()+secs*1000;
  $('tmL').textContent=label;
  $('tm').classList.add('on');
  step(); timer=setInterval(step,200);
  pushTimerNative('start', {secs:secs, label:label, colour:v('--c')});
}
function step(){
  var left=Math.max(0,Math.round((tEnd-Date.now())/1000));
  $('tmN').textContent=fmt(left);
  $('tmBar').style.transform='scaleX('+(left/tTot)+')';
  if(left<=0){
    beep(); clearInterval(timer); timer=null;
    setTimeout(function(){ $('tm').classList.remove('on'); },1800);
    /* Notification was already scheduled for this exact moment when the
       timer started — it stays live and fires on its own (only actually
       audible if the app is backgrounded; the OS suppresses a notification's
       own sound while its app is frontmost, so this is never a double beep
       on top of the Web Audio one two lines up). This message just ends the
       Live Activity — nothing left to cancel. */
    pushTimerNative('stop', {cancelNotification:false});
  }
}
$('tmX').onclick=function(){
  if(timer) clearInterval(timer); timer=null; $('tm').classList.remove('on');
  // Stopped early — the notification scheduled for the original end time
  // must NOT fire later for a timer that no longer exists.
  pushTimerNative('stop', {cancelNotification:true});
};

/* No-op outside the native app, exactly like pushNative() for the widget
   forecast — window.webkit.messageHandlers.timer only exists inside the
   WKWebView shell, so this is silently inert in any normal browser. */
function pushTimerNative(action, extra){
  var mh = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.timer;
  if(!mh) return;
  try{
    var msg = {action:action};
    for(var k in extra) msg[k]=extra[k];
    mh.postMessage(JSON.stringify(msg));
  }catch(e){ /* the bridge must never be able to break the timer itself */ }
}
function beep(){
  try{
    var ac=unlockAudio();
    [0,190].forEach(function(dl){
      var o=ac.createOscillator(), g=ac.createGain();
      o.connect(g); g.connect(ac.destination); o.frequency.value=880;
      var t=ac.currentTime+dl/1000; g.gain.value=0.0001;
      g.gain.exponentialRampToValueAtTime(.3,t+.01);
      g.gain.exponentialRampToValueAtTime(.0001,t+.15);
      o.start(t); o.stop(t+.17);
    });
    if(navigator.vibrate) navigator.vibrate([120,80,120]);
  }catch(e){ console.warn('beep failed:', e); }
}

/* ---- interval (repeater) timer ----
   Auto-cycling on/off/set-rest, press once and it runs the whole prescribed
   volume unattended: reps within a set, then the between-set rest (reusing
   the exercise's own `r`), then straight into the next set, until every set
   is done. No further taps unless stopped early. */
var ivt=null, ivtTimer=null, wakeLock=null;

/* Two tones, not one: this runs while you are hanging off a board looking
   at your hand, not the phone, so the SOUND has to carry which phase just
   started — a rising double-beep means go, a single low one means rest.
   Distinct from beep() (the plain rest timer's completion sound) on
   purpose, so the two timers never sound the same. */
function tone(kind){
  try{
    var ac=unlockAudio();
    var freqs = kind==='go' ? [880,1180] : [420];
    var gap = kind==='go' ? 130 : 0;
    freqs.forEach(function(f,i){
      var o=ac.createOscillator(), g=ac.createGain();
      o.connect(g); g.connect(ac.destination); o.frequency.value=f;
      var t=ac.currentTime+(i*gap)/1000; g.gain.value=0.0001;
      g.gain.exponentialRampToValueAtTime(.32,t+.015);
      g.gain.exponentialRampToValueAtTime(.0001,t+(kind==='go'?.16:.32));
      o.start(t); o.stop(t+(kind==='go'?.18:.34));
    });
    if(navigator.vibrate) navigator.vibrate(kind==='go'?[80,60,80]:[200]);
  }catch(e){ console.warn('tone failed:', e); }
}

/* Best-effort, and only ever a supplement — the native bridge below
   (isIdleTimerDisabled inside the wrapped app) is what Joe actually relies
   on. This covers anyone using it as a plain browser tab, where that native
   call is a no-op. The browser itself revokes the lock when the tab is
   hidden, so it is re-acquired on visibilitychange while ivt is running. */
function requestWakeLock(){
  if(!('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then(function(l){ wakeLock=l; }).catch(function(){});
}
function releaseWakeLock(){
  if(wakeLock){ wakeLock.release().catch(function(){}); wakeLock=null; }
}
document.addEventListener('visibilitychange',function(){
  if(!document.hidden && ivt) requestWakeLock();
});

/* `setRest` comes from the exercise's own `r` (the same number the plain
   rest button would have used) rather than living twice in the data — one
   source of truth for "how long between sets". `sets` is deliberately a
   parameter here, not part of `cfg`: it is read by the caller from the
   CURRENT resolved prescription text, which is already phase- and
   deload-adjusted, so a deload week runs fewer sets for free. */
/* Time to put the phone down and get hands on the board before the first
   rep starts counting — without this, pressing Start and then getting into
   position eats into (or entirely swallows) the first hang. Applies to
   every interval timer, Oscar's and Joe's alike, since it lives in the
   shared engine rather than per-exercise data. */
var READY_SECS = 5;

function startIntervalTimer(cfg, setRest, prescText, label){
  var sets = parseInt(prescText, 10);
  if(!sets || sets<1) sets=1;
  stopIntervalTimer();
  unlockAudio();
  ivt = {label:label, on:cfg.on, off:cfg.off, reps:cfg.reps, sets:sets, setRest:setRest,
         set:1, rep:1, phase:'ready', tTot:READY_SECS, tEnd:Date.now()+READY_SECS*1000};
  requestWakeLock();
  pushTimerNative('keepAwake', {});
  $('ivt').classList.add('on');
  ivtRender(READY_SECS);
  ivtTimer=setInterval(ivtStep,200);
}

function ivtStep(){
  var left=Math.max(0,Math.round((ivt.tEnd-Date.now())/1000));
  ivtRender(left);
  if(left<=0) ivtAdvance();
}

function ivtAdvance(){
  var next;
  if(ivt.phase==='ready'){
    next='on'; // straight into set 1, rep 1 — nothing to advance yet
  } else if(ivt.phase==='on'){
    next='off';
  } else if(ivt.phase==='off'){
    if(ivt.rep<ivt.reps){ ivt.rep++; next='on'; }
    else if(ivt.set<ivt.sets){ next='setrest'; }
    else { finishIntervalTimer(); return; }
  } else { // 'setrest' just ended -> straight into the next set
    ivt.set++; ivt.rep=1; next='on';
  }
  ivt.phase=next;
  ivt.tTot = next==='on' ? ivt.on : next==='off' ? ivt.off : ivt.setRest;
  ivt.tEnd = Date.now()+ivt.tTot*1000;
  tone(next==='on' ? 'go' : 'rest');
  ivtRender(ivt.tTot);
}

function ivtRender(left){
  var ph=ivt.phase;
  $('ivt').className = 'ivt on ivt-'+(ph==='ready'?'ready':ph==='setrest'?'off':ph);
  $('ivtN').textContent=fmt(left);
  $('ivtBar').style.transform='scaleX('+(left/ivt.tTot)+')';
  $('ivtL').textContent=ivt.label;
  $('ivtP').textContent = ph==='ready'
    ? 'GET READY — SET '+ivt.set+' OF '+ivt.sets
    : ph==='setrest'
    ? 'SET '+ivt.set+' OF '+ivt.sets+' · REST BEFORE SET '+(ivt.set+1)
    : 'SET '+ivt.set+' OF '+ivt.sets+' · REP '+ivt.rep+' OF '+ivt.reps+' · '+(ph==='on'?'HANG':'REST');
}

function finishIntervalTimer(){
  tone('go');
  clearInterval(ivtTimer); ivtTimer=null;
  $('ivtP').textContent='DONE — ALL '+ivt.sets+' SETS';
  $('ivtN').textContent='';
  $('ivtBar').style.transform='scaleX(0)';
  setTimeout(function(){ $('ivt').classList.remove('on'); ivt=null; },1400);
  releaseWakeLock();
  pushTimerNative('allowSleep', {});
  celebrate();
}

function stopIntervalTimer(){
  if(ivtTimer){ clearInterval(ivtTimer); ivtTimer=null; }
  if(ivt){ $('ivt').classList.remove('on'); ivt=null; }
  releaseWakeLock();
  pushTimerNative('allowSleep', {});
}
$('ivtX').onclick=stopIntervalTimer;

/* re-render on wake, so the date rolls over correctly overnight */
document.addEventListener('visibilitychange',function(){ if(!document.hidden && sessionReady) render(); });

var sessionReady = false;

function showLogin(msg){
  $('h1').textContent='Sign in';
  $('where').textContent='Deadpoint';
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
    var program = applyProgram(res.data.session.user.email);
    showWho(res.data.session.user.email);
    Promise.all([Store.load(), Loads.load()]).then(function(){
      /* Built once per boot(), against the LIVE Store/Loads objects — not
         copies. Store.set/clear and Loads.set all mutate their _d object in
         place rather than reassigning it (see Store/Loads above), so every
         write after this point is visible to the engine immediately, with
         no need to recreate it on every render(). */
      var engine = EngineCore.createEngine(program, {sessionLog: Store.all(), loadLog: Loads.all()});
      decide=engine.decide; block=engine.block; phaseIndexAt=engine.phaseIndexAt; phaseAt=engine.phaseAt;
      phaseNameAt=engine.phaseNameAt; phaseRange=engine.phaseRange; isDeload=engine.isDeload; presc=engine.presc;
      returnInfo=engine.returnInfo; isReturning=engine.isReturning; occurrence=engine.occurrence; rotated=engine.rotated;
      deloadPresc=engine.deloadPresc; loadHistory=engine.loadHistory; target=engine.target;
      sessionLoads=engine.sessionLoads; resolveEx=engine.resolveEx; upNext=engine.upNext; forecast=engine.forecast;
      history=engine.history; load=engine.load; since=engine.since; isHard=engine.isHard; streak=engine.streak; isTraining=engine.isTraining;
      sessionReady=true; render();
    });
  });
}
sb.auth.onAuthStateChange(function(event){
  if(event==='SIGNED_IN' && !sessionReady) boot();
});
boot();
})();

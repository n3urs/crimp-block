/* ============================================================
   CRIMP BLOCK
   Rules-based training scheduler. No fixed weekdays — rolling
   7-day quotas plus recovery gaps, so a spontaneous crag day
   reshuffles the week instead of breaking it.
   ============================================================ */
(function(){
"use strict";

/* >>> EDIT THIS when you start. Monday of week 1. <<< */
var START_DATE = '2026-08-10';

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
   SESSIONS
   finger / pull = load scores 0–3, used by the rules engine.
   ask = prompt for a top-set number after logging.
   ------------------------------------------------------------ */
var T = {
  maxFingers:{n:'Max Fingers', w:'Home · 40 min', c:'--gorse', finger:3, pull:1, ask:'Top set — one-arm pickup',
    x:[
      {t:'Warm up',m:'15 min',d:'Pulse raise, then three progressively heavier two-hand pickups. Never skip this on a cold morning.'},
      {t:'Pickups — half crimp',m:'5 × 5s / hand',d:'20mm. Rep five hard but form-perfect. Add 1–2.5kg once all five feel solid two sessions running.',r:120},
      {t:'Pickups — three-finger drag',m:'3 × 5s / hand',d:'Lighter. Covers the rounded granite edges you actually climb on.',r:120},
      {t:'Pinch block',m:'4 × 5s / hand',d:'',r:90},
      {t:'Wrist roller',m:'3 sets',d:'Up and down to near failure.',r:60}
    ]},
  pull:{n:'Pull', w:'Home · 40 min', c:'--tidepool', finger:0, pull:3,
    x:[
      {t:'Bottom-range pull-ups',m:'5 × 5',d:'Two arms, full dead hang, pull only to ~30° elbow bend, hold 2s, lower slow. Heavy. This is the one that matters.',r:180},
      {t:'One-arm transition holds',m:'8s × 5 / arm',d:'Minimal band or a toe on a stool. Hold at the top of your shrug plus a couple of centimetres.',r:120},
      {t:'Weighted one-arm shrugs',m:'4 × 3 / arm',d:'Belt or vest, three-second hold at the top.',r:120},
      {t:'One-arm negatives',m:'3 × 1 / arm',d:'8–10 second descent. Control the last 30cm above all.',r:180},
      {t:'Weighted pull-ups',m:'4 × 4',d:'Heavy, full dead hang each rep.',r:180},
      {t:'Front lever',m:'5 × 8–10s',d:'Hardest tuck or straddle you hold clean.',r:90},
      {t:'Antagonists',m:'4 sets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 · external rotation 3×12 · dips 3×10.'}
    ]},
  hangboard:{n:'Hangboard', w:'Gym · 25 min', c:'--slate', finger:2, pull:1, ask:'Repeater load',
    x:[
      {t:'20mm repeaters',m:'4–5 sets',d:'7s on / 3s off × 6 = one set. Around 55–60% of max. Two minutes between sets.',r:120},
      {t:'Weighted hangs',m:'10s × 5',d:'Alternate weeks, only if the gym has a belt. Heavy-ish, never maximal.',r:180},
      {t:'Band-assisted one-arm',m:'3 × 5s / hand',d:'If there is a pulley or a band. Closest thing to pickups you can do at work.',r:120},
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
};

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
function streak(h){
  var n=0;
  for(var i=0;i<h.length;i++){
    if(!h[i].type) break;
    if(load(h[i].type,'finger')+load(h[i].type,'pull')>0) n++; else break;
  }
  return n;
}

function decide(date){
  var h=history(date);
  var yf=load(h[0].type,'finger');
  var yName=h[0].type?T[h[0].type].n:null;
  var hard=h.filter(function(e){ return load(e.type,'finger')>=2 || load(e.type,'pull')>=3; }).length;
  var run=streak(h);

  if(run>=3)  return {k:'rest', why:run+' days on the trot. Nothing productive happens on day four.'};
  if(hard>=5) return {k:'rest', why:hard+' hard days in the last seven. That is the ceiling.'};

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

function block(){
  var ms=Date.now()-new Date(START_DATE+'T12:00:00').getTime();
  var w=Math.max(0,Math.floor(ms/604800000));
  return {b:Math.min(6,Math.floor(w/4)+1), w:(w%4)+1};
}

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

  $('topB').textContent='Block '+p.b+' · Wk '+p.w+(p.w===4?' · Deload':'');
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
    : isRec ? d.why
    : 'Browsing — swipe or tap a dot to see other sessions, Done logs this one instead.';

  // exercises
  $('list').innerHTML = s.x.map(function(e,i){
    var on=!!ticks[key+i];
    return '<div class="ex'+(on?' done':'')+'" data-i="'+i+'">'+
      '<button class="tick" aria-pressed="'+on+'" aria-label="'+e.t+'"></button>'+
      '<div class="eb"><div class="et"><span class="en">'+e.t+'</span><span class="em">'+e.m+'</span></div>'+
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
    showWho(res.data.session.user.email);
    Store.load().then(function(){ sessionReady=true; render(); });
  });
}
sb.auth.onAuthStateChange(function(event){
  if(event==='SIGNED_IN' && !sessionReady) boot();
});
boot();
})();

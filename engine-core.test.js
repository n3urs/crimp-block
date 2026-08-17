/* ============================================================
   Regression suite for engine-core.js, run headless via Jest/Node —
   no DOM, no Supabase, no iOS. Targets the specific boundaries that
   were real, empirically-found bugs during this project (see the
   plan at ~/.claude/plans/moonlit-juggling-catmull.md), plus broader
   scenario coverage against the real Oscar/Joe programs so a future
   change can't silently break their actual data shape.
   ============================================================ */
"use strict";
var EngineCore = require('./engine-core.js');
var REAL_PROGRAMS = require('./programs.js');

/* A small synthetic program, independent of Oscar's/Joe's real data,
   so the boundary tests below are easy to read and don't shift every
   time the real programs' content changes. */
function makeTestProgram(overrides){
  var p = {
    startDate: '2026-01-01',
    perWeek: 4,
    phases: [
      {n:'Base', from:1, c:'--x', cue:'', d:''},
      {n:'Max Strength', from:2, c:'--y', cue:'', d:''}
    ],
    sessions: {
      maxFingers:{n:'Max Fingers', w:'', c:'--a', finger:3, pull:1, x:[{t:'Ex1',id:'ex1',m:'5 × 5s',r:90}]},
      hangboard: {n:'Hangboard',  w:'', c:'--b', finger:2, pull:1, x:[{t:'Ex2',id:'ex2',m:'4 sets',r:90}]},
      pull:      {n:'Pull',      w:'', c:'--c', finger:0, pull:3, x:[{t:'Ex3',id:'ex3',m:'5 × 5',r:90}]},
      climbHard: {n:'Climb Hard',w:'', c:'--d', finger:2, pull:2, climb:1, x:[]},
      outdoorHard:{n:'Outdoor Hard',w:'', c:'--e', finger:3, pull:2, climb:1, x:[]},
      climbEasy: {n:'Climb Easy',w:'', c:'--f', finger:1, pull:1, climb:1, x:[]},
      rest:      {n:'Rest',      w:'', c:'--g', finger:0, pull:0, x:[]}
    }
  };
  return Object.assign(p, overrides);
}

/* Builds the hOverride array decide()/history() expect: 7 entries,
   ago 1..7, oldest last. `types[0]` is yesterday (ago 1). Dates are
   filled in backward from `endDate` so they're plausible even though
   decide()'s gating logic itself never reads h[i].date. */
function mkH(endDate, types){
  var out=[];
  for(var i=1;i<=7;i++){
    out.push({date: EngineCore.addDays(endDate,-i), type: types[i-1] || null, ago:i});
  }
  return out;
}

/* n consecutive training days starting at `from`, all the same type —
   the simplest way to bank a known number of training days so
   block()/phaseNameAt() land on a specific week/phase. */
function seedTraining(from, n, type){
  var log={};
  for(var i=0;i<n;i++) log[EngineCore.addDays(from,i)] = {t:type};
  return log;
}

describe('7-day window is inclusive of "today", not the full 7-day history', function(){
  // The original bug: counting ago 1..7 (instead of ago 1..6) made a hard
  // day exactly 7 days back count toward the finger cap, even though it
  // drops out of the window the instant today is logged. Three FING days
  // already sit in ago1–6 (one below the cap of 4) — a fourth at ago 7
  // must NOT push the cap over and block maxFingers, since ago 7 is
  // outside the 6-day window that actually gates today.
  it('does not let a FING day at ago 7 count toward the finger cap', function(){
    var engine = EngineCore.createEngine(makeTestProgram(), {sessionLog:{}, loadLog:{}});
    var date = '2026-03-10';
    var h = mkH(date, [null, null, 'hangboard', null, 'hangboard', 'hangboard', 'hangboard']);
    var d = engine.decide(date, h);
    expect(d.k).toBe('maxFingers');
  });
});

describe('hard-cap safety check takes precedence over the second-rest-day fallback', function(){
  // The fallback that fills a would-be second rest day with Pull must never
  // fire when a hard-day safety cap already applies — even in a scenario
  // that otherwise looks exactly like the fallback's trigger (yesterday was
  // rest, pull is overdue). Only reachable with tight (deload) caps, since
  // in a normal week hard>=6 is only possible when all 6 window slots are
  // hard, which always trips the run-cap first (see comment in the test).
  it('returns rest via the hard-cap branch, not the fallback, during a deload week', function(){
    var program = makeTestProgram();
    // Bank exactly 12 training days ending well before the test window, so
    // block() lands on week 4 (deload) of block 1 with no real gap (>=10
    // days would itself trigger the separate layoff-return path).
    var sessionLog = seedTraining('2026-01-13', 12, 'pull'); // Jan13–Jan24
    var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:{}});
    var date = '2026-02-01'; // 8 days after the last banked session — not a layoff
    expect(engine.isDeload(date)).toBe(true);
    expect(engine.isReturning(date)).toBe(false);

    var h = mkH(date, ['rest','maxFingers','maxFingers','maxFingers',null,null]);
    var d = engine.decide(date, h);
    expect(d.k).toBe('rest');
    expect(d.why).toMatch(/hard days/);
    expect(d.why).not.toMatch(/Second day off/);
  });
});

describe('phase advancement is banked training days, not calendar time', function(){
  it('does not advance the block during a long gap with no training', function(){
    var program = makeTestProgram();
    var sessionLog = seedTraining('2026-01-01', 4, 'pull'); // exactly one week banked
    var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:{}});
    var soonAfter = engine.block('2026-01-10');
    var monthsLater = engine.block('2026-06-01'); // no training logged in between
    expect(soonAfter.wIdx).toBe(1);
    expect(monthsLater.wIdx).toBe(1);
    expect(monthsLater.total).toBe(4);
  });
});

describe('deload-week text is derived from the phase-resolved prescription, not the default', function(){
  it('cuts the phase override, not the base m, when both exist', function(){
    var program = makeTestProgram();
    program.sessions.maxFingers.x = [
      {t:'Phased', id:'phx', m:'5 × 5s', ph:{'Base':'8 × 5s'}, r:90}
    ];
    var sessionLog = seedTraining('2026-01-01', 12, 'pull'); // banks to week 4 = deload, still Base (block 1)
    var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:{}});
    var date = '2026-01-13'; // week 4 of block 1
    expect(engine.isDeload(date)).toBe(true);
    expect(engine.phaseNameAt(date)).toBe('Base');

    var r = engine.resolveEx(program.sessions.maxFingers.x[0], 'maxFingers', date, 'Base');
    // deloadPresc('8 × 5s') cuts the SET count (8 -> round(8*0.65)=5), not
    // deloadPresc('5 × 5s') (which would cut 5 -> round(5*0.65)=3).
    expect(r.m).toBe('5 × 5s');
  });
});

describe('layoff-return taper is anchored at the original gap, not the most recent training day', function(){
  // The original bug: anchoring the gap check at "most recent training day"
  // collapses the taper to one session, because by session 2 the most
  // recent training day IS session 1 — nowhere near LAYOFF_DAYS away.
  it('still reports the correct gap and resume date on session 2 of the taper', function(){
    var program = makeTestProgram();
    var sessionLog = {};
    sessionLog['2026-01-01'] = {t:'pull'};   // last session before the layoff
    sessionLog['2026-01-20'] = {t:'pull'};   // session 1, after a 19-day gap
    sessionLog['2026-01-22'] = {t:'pull'};   // session 2
    var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:{}});

    var session1 = engine.returnInfo('2026-01-20');
    expect(session1).toEqual({gap:19, resumed:'2026-01-20', session:1});

    var session2 = engine.returnInfo('2026-01-22');
    expect(session2).toEqual({gap:19, resumed:'2026-01-20', session:2});
    expect(engine.isReturning('2026-01-22')).toBe(true);

    // A hypothetical session 3 falls outside the RETURN_SESSIONS taper.
    var session3 = engine.returnInfo('2026-01-24');
    expect(session3).toBeNull();
  });
});

describe('rotation cycles through variants by real occurrence count, not a stored index', function(){
  it('swaps in the right variant on every Nth occurrence and cycles', function(){
    var program = makeTestProgram();
    var variantA = {t:'Variant A', m:'—'};
    var variantB = {t:'Variant B', m:'—'};
    var base = {t:'Base pull', m:'—', rotate:{every:4, with:[variantA, variantB]}};
    program.sessions.pull.x = [base];

    function occAt(priorPullSessions, date){
      var sessionLog = {};
      for(var i=0;i<priorPullSessions;i++){
        sessionLog[EngineCore.addDays('2026-01-01', i)] = {t:'pull'};
      }
      var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:{}});
      return engine.rotated(base, 'pull', date);
    }

    // 3 prior sessions -> today is occurrence 4 -> swap to variant A (index 0).
    expect(occAt(3, '2026-02-01').swapped).toBe(true);
    expect(occAt(3, '2026-02-01').e.t).toBe('Variant A');
    // 7 prior -> occurrence 8 -> variant B (index 1).
    expect(occAt(7, '2026-02-01').e.t).toBe('Variant B');
    // 11 prior -> occurrence 12 -> cycles back to variant A.
    expect(occAt(11, '2026-02-01').e.t).toBe('Variant A');
    // 2 prior -> occurrence 3 -> not a multiple of 4 -> unswapped.
    expect(occAt(2, '2026-02-01').swapped).toBe(false);
  });
});

describe('weight history is scoped to the active phase', function(){
  it('never surfaces a Base-phase weight once training has moved into Max Strength', function(){
    var program = makeTestProgram();
    var sessionLog = seedTraining('2026-01-01', 16, 'pull'); // banks straight through into block 2
    var loadLog = { exA: [{date:'2026-01-05', kg:10}] }; // logged while still in Base
    var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:loadLog});

    expect(engine.phaseNameAt('2026-01-05')).toBe('Base');
    var maxStrengthDate = '2026-01-20';
    expect(engine.phaseNameAt(maxStrengthDate)).toBe('Max Strength');

    var history = engine.loadHistory('exA', maxStrengthDate);
    expect(history).toEqual([]);
    var tg = engine.target({id:'exA', step:2.5}, maxStrengthDate);
    expect(tg).toBeNull(); // no history in THIS phase -> nothing to suggest, must be typed in
  });

  it('does pick up a weight logged within the current phase, ignoring an older one from a different phase', function(){
    var program = makeTestProgram();
    var sessionLog = seedTraining('2026-01-01', 16, 'pull');
    var loadLog = { exA: [
      {date:'2026-01-18', kg:15}, // logged within Max Strength
      {date:'2026-01-05', kg:10}  // logged within Base — must be ignored here
    ]};
    var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:loadLog});
    var tg = engine.target({id:'exA', step:2.5}, '2026-01-20');
    expect(tg).toEqual({kg:15, bump:false});
  });

  it('bumps only when the same weight was held twice within the SAME phase', function(){
    var program = makeTestProgram();
    var sessionLog = seedTraining('2026-01-01', 16, 'pull');
    var loadLog = { exA: [
      {date:'2026-01-19', kg:15},
      {date:'2026-01-18', kg:15}, // held twice, both in Max Strength -> bump
      {date:'2026-01-05', kg:15}  // same number, but a different phase -> must not count
    ]};
    var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:loadLog});
    var tg = engine.target({id:'exA', step:2.5}, '2026-01-20');
    expect(tg).toEqual({kg:17.5, bump:true});
  });
});

describe('forecast() never leaks a DOM call into the engine', function(){
  it('returns the raw colour-variable name, not a resolved colour', function(){
    var program = makeTestProgram();
    var engine = EngineCore.createEngine(program, {sessionLog:{}, loadLog:{}});
    var days = engine.forecast(5);
    expect(days.length).toBe(5);
    days.forEach(function(d){ expect(d.colour).toMatch(/^--/); });
  });
});

describe('broad scenario coverage against the real programs', function(){
  ['oscar@sullivanltd.co.uk', 'joepearce2005@icloud.com', 'default'].forEach(function(email){
    describe(email, function(){
      var program = REAL_PROGRAMS[email];

      it('never recommends a climbing session', function(){
        var engine = EngineCore.createEngine(program, {sessionLog:{}, loadLog:{}});
        var climbTypes = ['climbHard','outdoorHard','climbEasy'];
        // Sweep a spread of small histories rather than just the empty one,
        // so a future change can't quietly make decide() suggest a climb day.
        var patterns = [
          [], ['rest'], ['pull'], ['maxFingers'], ['hangboard'],
          ['rest','rest'], ['pull','rest','pull'], ['maxFingers','rest','hangboard','rest']
        ];
        patterns.forEach(function(p){
          var h = mkH('2026-04-01', p);
          var d = engine.decide('2026-04-01', h);
          expect(climbTypes).not.toContain(d.k);
        });
      });

      it('resolves every exercise in every session without throwing, across every phase', function(){
        var sessionLog = seedTraining(program.startDate, 40, 'pull'); // deep enough to reach every phase
        var engine = EngineCore.createEngine(program, {sessionLog:sessionLog, loadLog:{}});
        program.phases.forEach(function(ph){
          Object.keys(program.sessions).forEach(function(key){
            expect(function(){
              program.sessions[key].x.forEach(function(base){
                engine.resolveEx(base, key, '2026-01-01', ph.n);
              });
            }).not.toThrow();
          });
        });
      });
    });
  });
});

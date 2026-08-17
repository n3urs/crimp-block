/* ============================================================
   Regression suite for template-resolver.js — same discipline as
   engine-core.test.js: a bug here hands someone a wrong or unsafe
   program just as surely as a bug in the engine itself.
   ============================================================ */
"use strict";
var TemplateResolver = require('./template-resolver.js');
var TEMPLATES = require('./templates.js');
var EngineCore = require('./engine-core.js');

function makeTestTemplate(overrides){
  var t = {
    perWeek: 3,
    phases: [
      {n:'Foundation', from:1, c:'--x', cue:'', d:''},
      {n:'Strength', from:2, c:'--y', cue:'', d:''}
    ],
    sessions: {
      maxFingers:{n:'Max Fingers', w:'', c:'--a', finger:2, pull:0, x:[
        {t:'Open hang', m:'4 × 8s', r:90},
        {t:'Weighted board hang', m:'3 × 5s', equip:'hangboard', r:90}
      ]},
      hangboard: {n:'Hangboard', w:'', c:'--b', finger:1, pull:0, x:[
        {t:'Repeaters', m:'3 sets', equip:'hangboard', r:120}
      ]},
      pull:      {n:'Pull', w:'', c:'--c', finger:0, pull:2, x:[
        {t:'Pull-ups', m:'4 × 6', equip:'pullBar', r:120},
        {t:'Push-ups', m:'3 × 10', r:90}
      ]},
      climbHard: {n:'Climb Hard', w:'', c:'--d', finger:2, pull:2, climb:1, x:[]},
      outdoorHard:{n:'Outdoor Hard', w:'', c:'--e', finger:2, pull:2, climb:1, x:[]},
      climbEasy: {n:'Climb Easy', w:'', c:'--f', finger:1, pull:1, climb:1, x:[]},
      rest:      {n:'Rest', w:'', c:'--g', finger:0, pull:0, x:[]}
    }
  };
  return Object.assign(t, overrides);
}

describe('resolveTemplate — basics', function(){
  test('requires a startDate', function(){
    expect(function(){
      TemplateResolver.resolveTemplate(makeTestTemplate(), {modifiers:{}});
    }).toThrow();
  });

  test('with no modifiers, carries the template through plus startDate — equipment-tagged exercises are dropped by default (no stated equipment means assume none, not assume everything)', function(){
    var tpl = makeTestTemplate();
    var program = TemplateResolver.resolveTemplate(tpl, {startDate:'2026-01-01', modifiers:{}});
    expect(program.startDate).toBe('2026-01-01');
    expect(program.perWeek).toBe(3);
    expect(program.sessions.maxFingers.x.length).toBe(1); // "Weighted board hang" (equip:hangboard) dropped
    expect(program.sessions.maxFingers.x[0].t).toBe('Open hang');
  });

  test('does not mutate the original template object (templates are shared across every user assigned to them)', function(){
    var tpl = makeTestTemplate();
    var before = JSON.stringify(tpl);
    TemplateResolver.resolveTemplate(tpl, {startDate:'2026-01-01', modifiers:{equipment:[], injuryFlags:['fingerPulley'], weaknesses:['slopers'], tripDate:'2026-04-01'}});
    expect(JSON.stringify(tpl)).toBe(before);
  });

  test('the resolved program is accepted by engine-core.createEngine with no errors', function(){
    var tpl = makeTestTemplate();
    var program = TemplateResolver.resolveTemplate(tpl, {startDate:'2026-01-01', modifiers:{}});
    expect(function(){ EngineCore.createEngine(program, {sessionLog:{}, loadLog:{}}); }).not.toThrow();
  });
});

describe('resolveTemplate — equipment gating', function(){
  test('drops exercises tagged with equipment the user does not have', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{equipment:[]}
    });
    var titles = program.sessions.maxFingers.x.map(function(e){ return e.t; });
    expect(titles).toEqual(['Open hang']); // "Weighted board hang" (equip:hangboard) dropped
    expect(program.sessions.hangboard.x.length).toBe(0); // its only exercise needs a hangboard
  });

  test('keeps equipment-tagged exercises the user DOES have', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{equipment:['hangboard','pullBar']}
    });
    expect(program.sessions.maxFingers.x.length).toBe(2);
    expect(program.sessions.hangboard.x.length).toBe(1);
    expect(program.sessions.pull.x.map(function(e){return e.t;})).toEqual(['Pull-ups','Push-ups']);
  });

  test('never drops an untagged exercise, regardless of equipment list', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{equipment:[]}
    });
    expect(program.sessions.pull.x.map(function(e){return e.t;})).toContain('Push-ups');
  });
});

describe('resolveTemplate — injury flags', function(){
  test('unknown flag id is ignored rather than throwing (quiz data may outpace the seed library)', function(){
    expect(function(){
      TemplateResolver.resolveTemplate(makeTestTemplate(), {startDate:'2026-01-01', modifiers:{injuryFlags:['somethingNotInTheLibraryYet']}});
    }).not.toThrow();
  });

  test('known flag appends its caution text to every session it applies to', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{injuryFlags:['fingerPulley']}
    });
    expect(program.sessions.maxFingers.note).toMatch(/finger or pulley/);
    expect(program.sessions.hangboard.note).toMatch(/finger or pulley/);
    expect(program.sessions.pull.note).toBeUndefined(); // fingerPulley module doesn't apply here
  });

  test('known flag inserts its mandatory exercise exactly once, even if the flag is somehow passed twice', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{injuryFlags:['bicepTendon','bicepTendon']}
    });
    var bicepEntries = program.sessions.pull.x.filter(function(e){ return e.t === 'Bicep isolation'; });
    expect(bicepEntries.length).toBe(1);
  });
});

describe('resolveTemplate — weaknesses', function(){
  test('appends the weakness-driven exercise to its target session', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{weaknesses:['slopers']}
    });
    var titles = program.sessions.hangboard.x.map(function(e){ return e.t; });
    expect(titles).toContain('Open-hand sloper hangs');
  });

  test('unknown weakness id is ignored rather than throwing', function(){
    expect(function(){
      TemplateResolver.resolveTemplate(makeTestTemplate(), {startDate:'2026-01-01', modifiers:{weaknesses:['notInTheLibrary']}});
    }).not.toThrow();
  });
});

describe('resolveTemplate — trip taper', function(){
  test('no tripDate leaves phases untouched', function(){
    var tpl = makeTestTemplate();
    var program = TemplateResolver.resolveTemplate(tpl, {startDate:'2026-01-01', modifiers:{}});
    expect(program.phases.length).toBe(tpl.phases.length);
  });

  test('a trip ~8 weeks out inserts a Taper phase at the estimated block (28 calendar days/block)', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{tripDate:'2026-02-26'} // 56 days out -> ceil(56/28) = block 2
    });
    var taper = program.phases.filter(function(p){ return p.n === 'Taper'; });
    expect(taper.length).toBe(1);
    expect(taper[0].from).toBe(2);
  });

  test('a trip date in the past (before startDate) is ignored, not inserted as a negative/zero block', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-06-01', modifiers:{tripDate:'2026-01-01'}
    });
    expect(program.phases.some(function(p){ return p.n === 'Taper'; })).toBe(false);
  });

  test('a trip date beyond the 6-block plan horizon is ignored rather than silently clamped', function(){
    var program = TemplateResolver.resolveTemplate(makeTestTemplate(), {
      startDate:'2026-01-01', modifiers:{tripDate:'2027-06-01'} // far beyond 6 blocks
    });
    expect(program.phases.some(function(p){ return p.n === 'Taper'; })).toBe(false);
  });

  test('inserting a taper replaces any existing phase that already starts at that block, rather than creating two phases at the same block', function(){
    var tpl = makeTestTemplate({phases:[
      {n:'Foundation', from:1, c:'--x', cue:'', d:''},
      {n:'Strength', from:2, c:'--y', cue:'', d:''} // same block (2) the taper below will target
    ]});
    var program = TemplateResolver.resolveTemplate(tpl, {
      startDate:'2026-01-01', modifiers:{tripDate:'2026-02-26'} // -> block 2, same as 'Strength' above
    });
    var atBlock2 = program.phases.filter(function(p){ return p.from === 2; });
    expect(atBlock2.length).toBe(1);
    expect(atBlock2[0].n).toBe('Taper');
  });
});

Object.keys(TEMPLATES).forEach(function(templateId){
  describe('the real ' + templateId + ' template', function(){
    test('resolves cleanly with no modifiers and is accepted by createEngine', function(){
      var program = TemplateResolver.resolveTemplate(TEMPLATES[templateId], {startDate:'2026-01-01', modifiers:{}});
      expect(function(){ EngineCore.createEngine(program, {sessionLog:{}, loadLog:{}}); }).not.toThrow();
    });

    test('defines all seven session keys engine-core.js requires', function(){
      var program = TemplateResolver.resolveTemplate(TEMPLATES[templateId], {startDate:'2026-01-01', modifiers:{}});
      ['maxFingers','hangboard','pull','climbHard','outdoorHard','climbEasy','rest'].forEach(function(key){
        expect(program.sessions[key]).toBeDefined();
      });
    });

    test('produces a decision on day one with an empty history, same as a real new user would see', function(){
      var program = TemplateResolver.resolveTemplate(TEMPLATES[templateId], {startDate:'2026-01-01', modifiers:{}});
      var engine = EngineCore.createEngine(program, {sessionLog:{}, loadLog:{}});
      var d = engine.decide('2026-01-01');
      expect(d).toBeTruthy();
      expect(typeof d.k).toBe('string');
    });

    test('resolves cleanly with every seed modifier applied at once, against the real template content (not the synthetic test one)', function(){
      var program = TemplateResolver.resolveTemplate(TEMPLATES[templateId], {
        startDate:'2026-01-01',
        modifiers:{equipment:['hangboard'], injuryFlags:['fingerPulley'], weaknesses:['slopers'], tripDate:'2026-04-01'}
      });
      expect(function(){ EngineCore.createEngine(program, {sessionLog:{}, loadLog:{}}); }).not.toThrow();
      expect(program.sessions.maxFingers.note).toMatch(/finger or pulley/);
    });

    test('every ph override key matches a real phase name in this template (a typo\'d phase name silently never applies)', function(){
      var tpl = TEMPLATES[templateId];
      var phaseNames = {};
      tpl.phases.forEach(function(p){ phaseNames[p.n] = true; });
      Object.keys(tpl.sessions).forEach(function(sessionKey){
        (tpl.sessions[sessionKey].x || []).forEach(function(ex){
          Object.keys(ex.ph || {}).forEach(function(phaseName){
            expect(phaseNames[phaseName]).toBe(true);
          });
        });
      });
    });
  });
});

test('boulderingIntermediate\'s Power-phase-only exercises (base text is "skip") correctly activate once a program actually reaches Power', function(){
  var program = TemplateResolver.resolveTemplate(TEMPLATES.boulderingIntermediate, {startDate:'2026-01-01', modifiers:{}});
  var explosive = program.sessions.pull.x.filter(function(ex){ return ex.t === 'Explosive pull-ups'; })[0];
  expect(explosive.m).toMatch(/^skip/);        // base/fallback text, used in Strength Base
  expect(explosive.ph['Power']).toBe('4 × 3 — explosive, as much height as you can generate cleanly');
});

/* ============================================================
   Regression suite for rehab-resolver.js — same discipline as
   template-resolver.test.js and engine-core.test.js: a bug here shows
   someone the wrong or an unsafe rehab exercise just as surely as a
   bug in either of those.
   ============================================================ */
"use strict";
var RehabResolver = require('./rehab-resolver.js');
var REHAB_TEMPLATES = require('./rehab-templates.js');

var INJURY_AREAS = ['fingerPulley', 'elbowMedial', 'elbowLateral', 'shoulder', 'bicepsTendon', 'wristTFCC'];
var PHASE_IDS = ['unload', 'mobility', 'strength', 'returnToClimbing'];

function makeTestArea(overrides){
  var a = {
    meta: { name: 'Test Area', description: 'test' },
    phases: [
      { id:'unload', name:'Tissue Unload', cue:'', description:'', caution:'', selfReportCriteria:['No pain at rest'], exercises:[{t:'Rest', m:'—', d:'', r:0}] },
      { id:'mobility', name:'Mobility', cue:'', description:'', caution:'', selfReportCriteria:['Full range of motion'], exercises:[{t:'Stretch', m:'3 × 20s', d:'', r:30}] },
      { id:'strength', name:'Strength', cue:'', description:'', caution:'', selfReportCriteria:['Comfortable with light load'], exercises:[{t:'Isometric hold', m:'3 × 20s', d:'', r:60}] },
      { id:'returnToClimbing', name:'Return to Climbing', cue:'', description:'', caution:'', selfReportCriteria:['A full session pain-free'], exercises:[{t:'Easy climbing', m:'—', d:'', r:0}] }
    ]
  };
  return Object.assign(a, overrides);
}

describe('resolvePhase', function(){
  test('returns phase 0 (unload) by default and clamps a negative index to it', function(){
    var templates = { test: makeTestArea() };
    var a = RehabResolver.resolvePhase(templates, 'test', 0);
    var b = RehabResolver.resolvePhase(templates, 'test', -5);
    expect(a.phase.id).toBe('unload');
    expect(b.phase.id).toBe('unload');
    expect(b.phaseIndex).toBe(0);
  });

  test('clamps an out-of-range high index to the last phase rather than throwing', function(){
    var templates = { test: makeTestArea() };
    var result = RehabResolver.resolvePhase(templates, 'test', 99);
    expect(result.phase.id).toBe('returnToClimbing');
    expect(result.phaseIndex).toBe(3);
    expect(result.isFinalPhase).toBe(true);
  });

  test('isFinalPhase is false for every phase except returnToClimbing', function(){
    var templates = { test: makeTestArea() };
    [0, 1, 2].forEach(function(i){
      expect(RehabResolver.resolvePhase(templates, 'test', i).isFinalPhase).toBe(false);
    });
  });

  test('throws on an unknown injury area id — a mismatched quiz answer is a real bug, not something to paper over', function(){
    expect(function(){
      RehabResolver.resolvePhase({}, 'notARealArea', 0);
    }).toThrow();
  });

  test('carries the area meta alongside the resolved phase', function(){
    var templates = { test: makeTestArea() };
    var result = RehabResolver.resolvePhase(templates, 'test', 1);
    expect(result.meta.name).toBe('Test Area');
    expect(result.phase.id).toBe('mobility');
  });
});

describe('canAdvance', function(){
  test('false when no criteria are checked', function(){
    var phase = makeTestArea().phases[0];
    expect(RehabResolver.canAdvance(phase, [])).toBe(false);
  });

  test('false when only some criteria are checked', function(){
    var phase = { selfReportCriteria: ['A', 'B', 'C'] };
    expect(RehabResolver.canAdvance(phase, ['A', 'B'])).toBe(false);
  });

  test('true only once every criterion is checked', function(){
    var phase = { selfReportCriteria: ['A', 'B', 'C'] };
    expect(RehabResolver.canAdvance(phase, ['A', 'B', 'C'])).toBe(true);
  });

  test('extra checked items beyond the real criteria do not matter', function(){
    var phase = { selfReportCriteria: ['A'] };
    expect(RehabResolver.canAdvance(phase, ['A', 'Z', 'Q'])).toBe(true);
  });

  test('a phase with an empty criteria list can never be advanced past (guards a mis-authored phase, not a real one)', function(){
    var phase = { selfReportCriteria: [] };
    expect(RehabResolver.canAdvance(phase, [])).toBe(false);
  });
});

describe('nextPhaseIndex', function(){
  test('increments normally', function(){
    expect(RehabResolver.nextPhaseIndex(0)).toBe(1);
    expect(RehabResolver.nextPhaseIndex(1)).toBe(2);
    expect(RehabResolver.nextPhaseIndex(2)).toBe(3);
  });

  test('clamps at the last phase — advancing past returnToClimbing is a no-op, not an error', function(){
    expect(RehabResolver.nextPhaseIndex(3)).toBe(3);
    expect(RehabResolver.nextPhaseIndex(50)).toBe(3);
  });
});

describe('rehab-templates.js content — real content, checked structurally', function(){
  test('all 6 injury areas from the plan are present', function(){
    INJURY_AREAS.forEach(function(area){
      expect(REHAB_TEMPLATES[area]).toBeDefined();
    });
  });

  test('every area has exactly 4 phases in the fixed unload/mobility/strength/returnToClimbing order', function(){
    INJURY_AREAS.forEach(function(area){
      var ids = REHAB_TEMPLATES[area].phases.map(function(p){ return p.id; });
      expect(ids).toEqual(PHASE_IDS);
    });
  });

  test('every phase has a non-empty selfReportCriteria list (so canAdvance can never silently vacuously pass)', function(){
    INJURY_AREAS.forEach(function(area){
      REHAB_TEMPLATES[area].phases.forEach(function(phase){
        expect(phase.selfReportCriteria.length).toBeGreaterThan(0);
      });
    });
  });

  test('every phase has at least one exercise and a caution line', function(){
    INJURY_AREAS.forEach(function(area){
      REHAB_TEMPLATES[area].phases.forEach(function(phase){
        expect(phase.exercises.length).toBeGreaterThan(0);
        expect(phase.caution.length).toBeGreaterThan(0);
      });
    });
  });

  test('every caution line includes the "see a physio" guidance — never purely prescriptive with no disclaimer', function(){
    INJURY_AREAS.forEach(function(area){
      REHAB_TEMPLATES[area].phases.forEach(function(phase){
        expect(phase.caution.toLowerCase()).toContain('physio');
      });
    });
  });

  test('resolvePhase works end-to-end against the real content for every area and phase', function(){
    INJURY_AREAS.forEach(function(area){
      for(var i = 0; i < 4; i++){
        var result = RehabResolver.resolvePhase(REHAB_TEMPLATES, area, i);
        expect(result.phase.id).toBe(PHASE_IDS[i]);
      }
    });
  });
});

/* ============================================================
   TEMPLATE-RESOLVER
   Phase C's data-model change: instead of `PROGRAMS` keyed by
   hardcoded email, a template-assigned user gets a `program` object
   built at load time from (template + their own quiz answers). This
   file is that build step — pure, DOM-free, same testing discipline
   as engine-core.js, because a bug here is just as capable of handing
   someone a wrong recommendation as a bug in engine-core itself.

   A resolved template produces EXACTLY the same program shape
   engine-core.js already consumes ({startDate, perWeek, phases,
   sessions}) — templates are not a parallel system, they're just
   another source of that same shape. Oscar's and Joe's hand-authored
   programs in programs.js are untouched and never routed through
   this file.
   ============================================================ */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TemplateResolver = factory();
})(typeof self !== 'undefined' ? self : this, function(){
"use strict";

/* ------------------------------------------------------------
   Modifier library — seed data. Each entry here is a reusable,
   quiz-attachable piece, generalizing the pattern already present in
   Oscar's and Joe's hand-authored programs (Joe's mandatory
   bicep-tendon rehab work, Oscar's "no three-finger pockets" caution)
   into something any template can pull in by id rather than having
   it hand-written per program.

   THIS IS A STARTING SEED, NOT A FINISHED LIBRARY — it exists to
   prove the mechanism (equipment gating, injury caution + mandatory
   inserts, weakness-driven emphasis) works end-to-end. Expanding the
   actual content — which injuries need which cautions, which
   equipment gates which exercises — is exactly the kind of judgement
   call that belongs to Oscar's coaching expertise, not something to
   invent wholesale here.
   ------------------------------------------------------------ */
var INJURY_MODULES = {
  fingerPulley: {
    label: 'Finger / pulley history',
    caution: 'You flagged a finger or pulley injury history — ease into any new edge size over 2–3 sessions rather than loading it maximally on day one, and stop an exercise immediately if you feel anything sharp or localized (as opposed to general muscular fatigue).',
    appliesToSessions: ['maxFingers','hangboard'],
    mandatoryInsert: {
      sessionKey: 'hangboard',
      exercise: {t:'Finger extensor rehab', m:'3 × 15', d:'A rubber band round the fingertips, opening the hand against it. Mandatory whenever a finger/pulley flag is set — antagonist strength is cheap insurance against the exact injury you flagged.', r:45}
    }
  },
  bicepTendon: {
    label: 'Bicep tendon history',
    caution: 'You flagged bicep tendon history — the isolated bicep work below is mandatory, not optional, for exactly that reason.',
    appliesToSessions: ['pull'],
    mandatoryInsert: {
      sessionKey: 'pull',
      exercise: {t:'Bicep isolation', m:'3 × 12', d:'Slow, controlled dumbbell or band curls. Mandatory rehab/prevention work given your flagged history — do this even on days you are short on time.', r:60}
    }
  }
};

var WEAKNESS_MODULES = {
  slopers: {
    label: 'Slopers / open-hand strength',
    sessionKey: 'hangboard',
    exercise: {t:'Open-hand sloper hangs', m:'4 × 8s', d:'Added because you flagged slopers as a weakness — open-hand position, biggest comfortable edge or a sloper block if the board has one.', r:120}
  },
  compression: {
    label: 'Compression / pinch strength',
    sessionKey: 'maxFingers',
    exercise: {t:'Pinch block', m:'4 × 5s / hand', d:'Added because you flagged compression/pinch as a weakness. Alternate hands.', r:90}
  }
};

var EQUIPMENT_TAGS = ['hangboard','pullBar','gym','pickupRig','resistanceBand'];

/* ------------------------------------------------------------
   Calendar days per block, for the trip taper estimate below. A
   block is DEFINED as 4 training-weeks (see engine-core.js's
   block()), and perWeek is chosen to be a realistic weekly pace —
   so at on-pace adherence a block runs close to 4 calendar weeks
   regardless of what perWeek actually is. This is an estimate, not a
   measurement: real adherence varies, which is exactly why
   engine-core.js counts training days banked rather than calendar
   time for the plan itself. The taper's insertion POINT is therefore
   a best guess at assignment time, not something that silently
   re-corrects itself later — if the trip date is materially wrong or
   adherence is very different from planned, the inserted block
   number will be off and needs a manual fix (same as the
   "WHEN THE TRIP IS BOOKED" comment already documents by hand in
   Joe's program).
   ------------------------------------------------------------ */
var CALENDAR_DAYS_PER_BLOCK = 28;

function daysBetween(fromISO, toISO){
  var a = new Date(fromISO+'T00:00:00Z'), b = new Date(toISO+'T00:00:00Z');
  return Math.round((b-a)/86400000);
}

function deepClone(v){ return JSON.parse(JSON.stringify(v)); }

/* Applies the user's equipment list to one session's exercise array:
   drop any exercise tagged with equipment the user doesn't have.
   Untagged exercises (no `equip` field) are always kept — the tag is
   opt-in per exercise, not a whitelist you have to fill in for
   everything. */
function filterEquipment(sessionsObj, haveEquipment){
  var have = {};
  (haveEquipment||[]).forEach(function(e){ have[e]=true; });
  Object.keys(sessionsObj).forEach(function(key){
    var s = sessionsObj[key];
    if(!s.x) return;
    s.x = s.x.filter(function(ex){
      return !ex.equip || have[ex.equip];
    });
  });
}

/* Appends a mandatory-insert exercise once (never duplicated even if
   resolveTemplate is somehow called twice on the same modifier set —
   matched by exercise title within the target session). */
function insertExerciseOnce(session, exercise){
  if(!session || !session.x) return;
  var already = session.x.some(function(ex){ return ex.t === exercise.t; });
  if(!already) session.x.push(deepClone(exercise));
}

function applyInjuryFlags(program, flags){
  (flags||[]).forEach(function(flagId){
    var mod = INJURY_MODULES[flagId];
    if(!mod) return; // unknown flag id — ignore rather than throw, quiz data may outpace this seed library
    (mod.appliesToSessions||[]).forEach(function(sessionKey){
      var s = program.sessions[sessionKey];
      if(!s) return;
      s.note = s.note ? (s.note + ' ' + mod.caution) : mod.caution;
    });
    if(mod.mandatoryInsert){
      insertExerciseOnce(program.sessions[mod.mandatoryInsert.sessionKey], mod.mandatoryInsert.exercise);
    }
  });
}

function applyWeaknesses(program, weaknesses){
  (weaknesses||[]).forEach(function(weakId){
    var mod = WEAKNESS_MODULES[weakId];
    if(!mod) return;
    insertExerciseOnce(program.sessions[mod.sessionKey], mod.exercise);
  });
}

/* Inserts a taper phase ahead of a booked trip date, mirroring the
   pattern already documented by hand in Joe's program. Deliberately
   does NOT attempt to auto-generate cut prescription numbers (no
   `ph` overrides on individual exercises) — parsing arbitrary
   prescription text like "5 × 7s" into a "cut" version generically,
   for template content this resolver has never seen, is not
   something to do blind. The phase's own name/cue/description communicate
   the taper; fine-tuning individual numbers via `ph` overrides
   remains a manual, template-specific step, same as it already is
   for Oscar's and Joe's programs.
   Returns program unchanged if there's no trip date, or if the trip
   is too far out / already past to land inside the 6-block plan. */
function applyTripTaper(program, startDate, tripDate){
  if(!tripDate) return program;
  var daysOut = daysBetween(startDate, tripDate);
  if(daysOut <= 0) return program; // already past, or same day — nothing sensible to taper toward
  var block = Math.ceil(daysOut / CALENDAR_DAYS_PER_BLOCK);
  if(block < 1 || block > 6) return program; // outside the 6-block plan this estimate can address
  program.phases = program.phases.filter(function(p){ return p.from !== block; });
  program.phases.push({
    n: 'Taper', from: block, c: '--slate',
    cue: 'Ease off — freshness over fitness now',
    d: 'Trip prep, estimated from your target date (' + tripDate + '). Volume should drop, intensity holds — fitness gained in the final ten days is negligible, fatigue carried in is not. This block’s insertion point is an estimate from your training pace, not a measurement — if it lands noticeably wrong once you’re closer to the date, that’s worth a manual correction.'
  });
  program.phases.sort(function(a,b){ return a.from - b.from; });
  return program;
}

/* The one function everything else in this file exists to support.
   `template` = {perWeek, phases, sessions} (no startDate — that's
   assigned per-user, not baked into the template). `modifiers` =
   {equipment:[...], injuryFlags:[...], weaknesses:[...], tripDate:
   'YYYY-MM-DD'|null}. Returns a program object shaped exactly like
   programs.js entries, ready for createEngine(). */
function resolveTemplate(template, opts){
  opts = opts || {};
  var startDate = opts.startDate;
  var modifiers = opts.modifiers || {};
  if(!startDate) throw new Error('resolveTemplate: startDate is required');

  var program = deepClone({
    perWeek: template.perWeek,
    phases: template.phases,
    sessions: template.sessions
  });
  program.startDate = startDate;

  /* daysPerWeek is the quiz's own question ("how many days a week can
     you train"), separate from perWeek's role inside engine-core.js
     (the number of training days that make up one 4-week block — see
     block() in engine-core.js). They're the same number in every
     template today because that's a reasonable default, but they're
     conceptually different, so this only overrides when the quiz
     answer actually differs from the template's built-in pace rather
     than always overwriting it. */
  if(modifiers.daysPerWeek && modifiers.daysPerWeek !== program.perWeek){
    program.perWeek = modifiers.daysPerWeek;
  }

  filterEquipment(program.sessions, modifiers.equipment);
  applyInjuryFlags(program, modifiers.injuryFlags);
  applyWeaknesses(program, modifiers.weaknesses);
  applyTripTaper(program, startDate, modifiers.tripDate);

  return program;
}

return {
  resolveTemplate: resolveTemplate,
  INJURY_MODULES: INJURY_MODULES,
  WEAKNESS_MODULES: WEAKNESS_MODULES,
  EQUIPMENT_TAGS: EQUIPMENT_TAGS
};

});

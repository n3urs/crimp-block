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
/* Researched against real injury-epidemiology and sports-medicine
   sources (not just Oscar's/Joe's own history, which is all the
   original two modules were seeded from — see the module-level
   comment above). Injuries are safety-critical content, so every
   caution here is deliberately hedged the same way: what causes it,
   a concrete stop-signal, and an explicit "this is prevention, not
   treatment, see a physio if it's currently active" line — never a
   diagnosis, never a clinical rehab protocol (e.g. the Tyler Twist
   eccentric-loading protocol for lateral epicondylitis is real and
   evidence-backed, but it's a supervised TREATMENT protocol for an
   active, staged injury — not something to hand a stranger through a
   quiz flag with no clinician involved). Sources:
     - Epidemiology of Musculoskeletal Injuries Among Climbers —
       Systematic Review (PMC12821603): hand/finger/wrist ~28-42% of
       injuries, shoulder 77% lifetime pain prevalence, elbow ~19% of
       overuse injuries.
     - Rehabilitation of shoulder impingement syndrome and rotator
       cuff injuries: an evidence-based review (PubMed 20371557) and
       the scapular-stabilization RCTs it's grounded in: scapular
       control work performs as well as or better than rotator-cuff
       isolation alone.
     - Managing Elbow Pain from Climbing (backcountry.physio) and
       Climber's Elbow guides (strengthclimbing.com, totalpursuitpt.com):
       medial epicondylitis ("climber's elbow", inner-elbow, flexor/
       pronator mass) is the dominant elbow complaint in climbers
       specifically, distinct from and disproportionately more common
       than lateral epicondylitis ("tennis elbow") despite the latter
       being more common in the general population.
     - Long Head of the Biceps Tendinopathy (theclimbingdoctor.com)
       and Biceps vs. Impingement (mendcolorado.com): in climbers,
       "bicep tendon" pain is most often the LONG HEAD tendon at the
       front of the shoulder (gaston/compression loading), not a
       distal elbow-area tendon, and frequently overlaps with general
       shoulder impingement.
     - The two ORIGINAL modules (fingerPulley, bicepTendon) were
       re-checked against dedicated sources too, not just carried
       over on the assumption Joe's history made them correct:
     - Finger flexion to extension ratio in healthy climbers (Frontiers
       in Sports and Active Living, 2023, PMC10701375): climbers run
       ~6:1 flexor:extensor strength ratio (up to 9:1 in elite
       climbers) vs ~3.7:1 in the general population — confirms
       extensor-focused antagonist work (fingerPulley's own mandatory
       insert) is a real, evidence-backed correction, not a guess.
     - A2 pulley rehab protocols (The Climbing Doctor, Rock Rehab,
       Medstar Sport Physio): confirm progressive, controlled edge-size
       reintroduction (fingerPulley's caution) over the actual failure
       mode these sources all flag — resting until pain-free, then
       jumping straight back to small crimps.
     - Biceps Tendinopathy (Physiopedia, E3 Rehab, IJSPT): rehab
       follows an isometric -> isotonic -> eccentric progression, and
       critically "rarely happens in isolation" — treatment leans on
       scapular/rotator-cuff coordination as much as the bicep itself.
       This is why bicepTendon's caution below now points at the new
       shoulder flag explicitly, and why its own exercise gets an
       isometric fallback rather than staying pure moving-rep isolation
       work — the original wording ("isolated bicep work... mandatory")
       was the one piece of the original two modules this pass actually
       changed on the merits, not just re-confirmed. */
var INJURY_MODULES = {
  fingerPulley: {
    label: 'Finger / pulley history',
    caution: 'You flagged a finger or pulley injury history — ease into any new edge size over 2–3 sessions rather than loading it maximally on day one, and stop an exercise immediately if you feel anything sharp or localized (as opposed to general muscular fatigue). If this is currently active or still flares up day-to-day — not just something from your history — get assessed by a physio before training through it. What’s below is general prevention work, not treatment.',
    appliesToSessions: ['maxFingers','hangboard'],
    mandatoryInsert: {
      sessionKey: 'hangboard',
      exercise: {t:'Finger extensor rehab', m:'3 × 15', d:'A rubber band round the fingertips, opening the hand against it. Mandatory whenever a finger/pulley flag is set — climbers run roughly a 6:1 flexor-to-extensor strength ratio (vs ~3.7:1 in the general population, up to 9:1 in elite climbers), and extensor work is the standard way to correct that imbalance, not just cheap insurance.', r:45}
    }
  },
  bicepTendon: {
    label: 'Bicep tendon history',
    caution: 'You flagged bicep tendon history — in climbers this is most often the long head of biceps tendon at the front of the shoulder (not the elbow), commonly linked to gaston and compression moves. Research on this tendon specifically is clear it’s rarely an isolated problem — prevention leans on scapular and rotator cuff coordination as much as the bicep itself — so flag Shoulder above too if that sounds familiar; the two mandatory exercises are meant to work together, not as alternatives. If anything below reproduces the original pain rather than plain working fatigue, swap to a static hold at a pain-free angle instead of full reps. If this is currently active or still flares up day-to-day — not just something from your history — get assessed by a physio before training through it. What’s below is general prevention work, not treatment.',
    appliesToSessions: ['pull'],
    mandatoryInsert: {
      sessionKey: 'pull',
      exercise: {t:'Bicep isolation', m:'3 × 12', d:'Slow, controlled dumbbell or band curls — if a full rep is uncomfortable, hold isometrically at a pain-free elbow angle instead (e.g. 3 × 20s) rather than pushing through it. Mandatory rehab/prevention work given your flagged history, alongside the scapular work above if you’ve also flagged Shoulder.', r:60}
    }
  },
  shoulder: {
    label: 'Shoulder history',
    caution: 'You flagged shoulder injury history — climbing loads the shoulder hardest on compression and gaston moves (reaching across or behind the body under load), so build into steep or compression-heavy sessions gradually rather than jumping straight in, and stop immediately for anything sharp or catching, as opposed to general fatigue. If this is currently active or still flares up day-to-day — not just something from your history — get assessed by a physio before training through it. What’s below is general prevention work, not treatment.',
    appliesToSessions: ['pull'],
    mandatoryInsert: {
      sessionKey: 'pull',
      exercise: {t:'Scapular stability work', m:'3 × 12', d:'Band pull-aparts or prone Y-raises — on top of the external rotation already in this session’s antagonist work, since scapular control is the other half of what shoulder-injury-prevention research points to alongside rotator cuff strength. Mandatory given your flagged history.', r:60}
    }
  },
  elbow: {
    label: 'Elbow history',
    caution: 'You flagged elbow injury history — “climber’s elbow” (pain on the inside of the elbow) comes from the same gripping and pulling load everything in this program is built around, so ease into any jump in grip intensity over several sessions rather than all at once, and stop immediately for anything sharp or localized on the inside of the elbow, as opposed to general forearm fatigue. If this is currently active or still flares up day-to-day — not just something from your history — get assessed by a physio before training through it. What’s below is general prevention work, not treatment.',
    appliesToSessions: ['maxFingers','hangboard','pull'],
    mandatoryInsert: {
      sessionKey: 'hangboard',
      exercise: {t:'Wrist flexor + pronator strengthening', m:'3 × 12', d:'Slow, controlled wrist curls in the flexion direction, plus forearm pronation/supination with a light dumbbell — the specific tendon group climber’s elbow affects, on top of the extensor-focused reverse wrist curls already elsewhere in this program. Mandatory given your flagged history.', r:60}
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

var EQUIPMENT_TAGS = ['hangboard','pullBar','gym','pickupRig'];

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

/* Same opt-in/untagged-always-kept shape as filterEquipment above, but
   for the hangboard-vs-weighted-pickup preference (quiz's
   maxFingersMethod question — only asked when pickupRig equipment is
   selected, since it's meaningless otherwise). `method` is a SEPARATE
   dimension from `equip`: a hangboard exercise is never equip-gated
   today (someone can max-hang on any edge, not just a purpose-built
   board), so this only ever removes the LOSING side of an explicit
   either/or choice, never something the equipment filter above would
   have removed anyway.

   A no-op when no preference is set (undefined/null) — someone who was
   never asked, or who answered nothing, keeps seeing exactly what they
   always would have (both sides, subject only to equipment filtering) —
   this must never newly hide an exercise nobody actually chose to hide. */
function applyMaxFingersMethod(sessionsObj, method){
  if(!method) return;
  Object.keys(sessionsObj).forEach(function(key){
    var s = sessionsObj[key];
    if(!s.x) return;
    s.x = s.x.filter(function(ex){
      return !ex.method || ex.method === method;
    });
  });
}

/* Eases the Max Fingers session's first phase for someone who has never
   done structured hangboard/strength training before (quiz's
   priorTraining flag — only asked at the intermediate tier, see
   ExperienceStep). Reuses the SAME per-phase-name `ph` override
   engine-core.js already resolves dynamically (presc() in engine-core.js)
   rather than inventing a new "week one" concept in the shared engine —
   the tradeoff is this eases the whole first phase (both intermediate
   templates run that ~8 weeks), not literally just week one, but that's
   the granularity the engine already understands, and the first phase is
   already the gentlest one in every template.

   A no-op whenever priorTraining isn't explicitly false (nobody asked, or
   they said they HAVE trained) or an exercise carries no hand-authored
   `onramp` text (every advanced-tier exercise today) — someone never
   asked, or who answered "yes", sees exactly what they always would
   have. */
function applyOnramp(program, priorTraining){
  if(priorTraining !== false) return;
  var firstPhase = program.phases[0] && program.phases[0].n;
  if(!firstPhase) return;
  var s = program.sessions.maxFingers;
  if(!s || !s.x) return;
  s.x.forEach(function(ex){
    if(!ex.onramp) return;
    ex.ph = ex.ph || {};
    ex.ph[firstPhase] = ex.onramp;
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
   'YYYY-MM-DD'|null, maxFingersMethod:'hangboard'|'pickup'|null,
   priorTraining:boolean|null}. Returns a program object shaped exactly like
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
  applyMaxFingersMethod(program.sessions, modifiers.maxFingersMethod);
  applyOnramp(program, modifiers.priorTraining);
  applyInjuryFlags(program, modifiers.injuryFlags);
  applyWeaknesses(program, modifiers.weaknesses);
  applyTripTaper(program, startDate, modifiers.tripDate);

  return program;
}

return {
  resolveTemplate: resolveTemplate,
  INJURY_MODULES: INJURY_MODULES,
  WEAKNESS_MODULES: WEAKNESS_MODULES,
  EQUIPMENT_TAGS: EQUIPMENT_TAGS,
  applyMaxFingersMethod: applyMaxFingersMethod,
  applyOnramp: applyOnramp
};

});

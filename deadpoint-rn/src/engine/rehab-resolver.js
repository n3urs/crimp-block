/* ============================================================
   REHAB-RESOLVER
   Phase C.1's resolution layer for the rehab track — much simpler
   than template-resolver.js's resolveTemplate(), because rehab has
   no equipment/injury-flag/trip-taper modifiers to apply (the injury
   area selection IS the modifier — there's nothing further to layer
   on top of it). Given {injuryArea, phaseIndex}, this returns the
   current phase's content, ready to render. Pure, DOM-free — same
   Jest-testable discipline as template-resolver.js and engine-core.js,
   because a bug here is just as capable of showing someone a wrong or
   unsafe rehab exercise as a bug in either of those.

   This file, deliberately, is NOT wired into engine-core.js's
   decide()/block() in any way — see the "Why this can't reuse
   decide()/block()" note in Phase C.1 of the plan. Rehab phases
   advance on self-report (canAdvance below), never on a calendar.
   ============================================================ */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RehabResolver = factory();
})(typeof self !== 'undefined' ? self : this, function(){
"use strict";

var PHASE_COUNT = 4; // unload, mobility, strength, returnToClimbing — fixed, every injury area follows the same 4-phase pyramid

/* Given the REHAB_TEMPLATES object (rehab-templates.js) and an injury
   area id, returns that area's full entry, or throws — an unknown
   injury area id is a real bug (a quiz answer that doesn't match any
   authored content), not something to silently paper over. */
function resolveArea(rehabTemplates, injuryArea){
  var area = rehabTemplates[injuryArea];
  if(!area) throw new Error('rehab-resolver: unknown injury area "' + injuryArea + '"');
  return area;
}

/* The current phase's full content — meta (name/description for the
   area) plus the one phase object at phaseIndex. phaseIndex is
   clamped, not thrown on, for out-of-range input — a stale/corrupted
   stored index (e.g. from an older version of this file with a
   different PHASE_COUNT) should degrade to the nearest real phase
   rather than crash the app. */
function resolvePhase(rehabTemplates, injuryArea, phaseIndex){
  var area = resolveArea(rehabTemplates, injuryArea);
  var clamped = Math.max(0, Math.min(PHASE_COUNT - 1, phaseIndex));
  return {
    meta: area.meta,
    phase: area.phases[clamped],
    phaseIndex: clamped,
    phaseCount: PHASE_COUNT,
    isFinalPhase: clamped === PHASE_COUNT - 1
  };
}

/* Whether every one of the current phase's self-report criteria has
   been checked. `checked` is the set of criteria strings the user has
   ticked (matched by exact string, same as insertExerciseOnce's
   title-matching in template-resolver.js — simple and good enough for
   a fixed, authored list that isn't user-editable). An empty
   selfReportCriteria list can never be advanced past by definition
   (every() on an empty array is vacuously true in JS, which would
   silently let a mis-authored phase with no criteria auto-advance —
   guarded against explicitly rather than relying on that footgun). */
function canAdvance(phase, checked){
  var criteria = phase.selfReportCriteria || [];
  if(criteria.length === 0) return false;
  var checkedSet = {};
  (checked || []).forEach(function(c){ checkedSet[c] = true; });
  return criteria.every(function(c){ return checkedSet[c]; });
}

/* phaseIndex + 1, clamped to the last phase — advancing past
   returnToClimbing is a no-op, not an error, since the UI's own
   "Advance" action naturally stops being shown once isFinalPhase is
   true, but this stays safe to call regardless. */
function nextPhaseIndex(phaseIndex){
  return Math.min(PHASE_COUNT - 1, phaseIndex + 1);
}

return {
  PHASE_COUNT: PHASE_COUNT,
  resolveArea: resolveArea,
  resolvePhase: resolvePhase,
  canAdvance: canAdvance,
  nextPhaseIndex: nextPhaseIndex
};

});

/* ============================================================
   REHAB-TEMPLATES
   Phase C.1's rehab track content — a parallel, deliberately simpler
   sibling to templates.js, not a variant of it. A standard template's
   `sessions` object holds SEVEN session types because engine-core.js's
   decide() has to pick which one today's session is; rehab has no such
   picking to do — there's exactly one thing to work on right now (the
   current phase), so each phase just carries a flat `exercises` list in
   the same {t, m, d, r} shape ExerciseRowView already renders, nothing
   OF this file's data ever reaches decide()/block() at all (see
   RehabBridge.swift and Phase C.1 of the plan for why).

   Every entry follows Dr. Jared Vagy's four-phase Rock Rehab Pyramid
   structure (Tissue Unload -> Mobility -> Strength -> Return to Climbing
   Movement — the same shape used across TrainingBeta's and The Climbing
   Doctor's published, climbing-specific protocols), and every phase's
   caution text follows the exact hedge template-resolver.js's own
   INJURY_MODULES already established: what causes it, a concrete stop
   signal, and an explicit "this is general guidance, not treatment, see
   a physio if it's active or unclear" line. Deliberately generic, not
   diagnostic — nothing here grades an injury's severity or tells anyone
   they're specifically at "Grade 2" of anything; that's a clinician's
   call, not a quiz's. Progression between phases is entirely self-
   report gated (see selfReportCriteria + rehab-resolver.js's
   canAdvance()) — never calendar-driven the way engine-core.js's
   block() is, because healing timelines vary by person and severity in
   a way a fixed 4-week clock cannot account for.

   THIS IS A FIRST, REVIEWABLE DRAFT, same status as templates.js's own
   entries — real coaching/clinical-adjacent content that needs Oscar's
   review, not something to trust blindly just because it's sourced.

   Sources (see the per-area comments below for which apply where):
     - Dr. Jared Vagy's Rock Rehab Pyramid, 4-phase structure
       (trainingbeta.com/rock-rehab-pyramid-videos, theclimbingdoctor.com)
     - Finger pulley grading & graded-exposure return to load: Schöffl's
       2003 classification; Medstar Sport Physio and Max Climbing's pulley
       injury write-ups; "tendons and pulleys don't heal from rest — they
       heal from progressive load applied at the right time and dosage"
       (theclimbingdoctor.com/finger-training-recommendations-after-pulley-injury)
     - Climber's elbow (medial epicondylitis) vs tennis elbow (lateral):
       trainingbeta.com/medialepi, trainingforclimbing.com's
       treating-climbers-elbow write-up — antagonist/extensor strengthening
       to offload the medial epicondyle is a recurring theme
     - Rotator cuff / shoulder: trainingbeta.com/cuff, the Rock Rehab
       Protocol's mild/moderate/severe self-assessment framing
     - Biceps tendinopathy: Physiopedia's SLAP Lesion page, the PubMed
       biceps-rehab continuum-of-exercises paper (pubmed.ncbi.nlm.nih.gov/24658344),
       theclimbingdoctor.com's biceps tendinopathy protocol — isometric ->
       isotonic -> eccentric progression, scapular coordination alongside
     - TFCC / wrist: treattfcc.org's phase-by-phase exercise guide,
       The Climbing Doctor's TFCC write-up — 6-direction isometrics, the
       dart-thrower's motion as the wrist's safest natural pattern
   ------------------------------------------------------------ */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.REHAB_TEMPLATES = factory();
})(typeof self !== 'undefined' ? self : this, function(){
"use strict";

var SEE_PHYSIO = 'This is general guidance, not treatment or a diagnosis — if this is currently active, not improving, or you are at all unsure, get assessed by a physio before continuing.';

return {

  /* ------------------------------------------------------------
     FINGER / PULLEY — by far the most common climbing injury
     (hand/finger/wrist ~28-42% of all climbing injuries per the
     epidemiology review already cited in template-resolver.js). The
     A2 pulley is the single most frequently injured, A4 second.
     ------------------------------------------------------------ */
  fingerPulley: {
    meta: {
      name: 'Finger / Pulley',
      description: 'For a strained or partially torn finger pulley (most often A2, sometimes A4) — sharp, localized pain at the base of a finger, often from a sudden crimp catch. Built around graded, progressive re-loading rather than prolonged rest, which the research is consistently clear does not by itself rebuild tolerance to climbing loads.'
    },
    phases: [
      {
        id: 'unload', name: 'Tissue Unload',
        cue: 'Settle the pain at rest first — this phase is short by design',
        description: 'The goal here is simple: get pain at rest to settle. No climbing, no hanging on the injured finger. This phase is over as soon as that happens — it is not a fixed number of weeks, and for most single-pulley strains it should be days, not months.',
        caution: 'Full rest from climbing, but not from everything — general fitness (legs, core, the uninjured hand) can continue as normal. ' + SEE_PHYSIO,
        selfReportCriteria: ['No pain at rest, including first thing in the morning', 'No pain with normal daily hand use (opening jars, typing, etc.)'],
        exercises: [
          {t:'Gentle tendon glides', m:'2 × 10', d:'Slowly making a full fist then fully straightening the fingers, no resistance. Aim for pain-free range only — stop short of anywhere it pulls.', r:0},
          {t:'General conditioning', m:'—', d:'Legs, core, and general upper-body work that does not load the injured finger — this is a good phase to keep training everything else.', r:0}
        ]
      },
      {
        id: 'mobility', name: 'Mobility',
        cue: 'Restore full, comfortable range of motion before adding load',
        description: 'Once pain at rest has settled, the next step is making sure the finger moves through its full range comfortably before any real loading starts.',
        caution: 'Stop any exercise immediately for anything sharp or localized at the injury site, as opposed to a general stretch sensation. ' + SEE_PHYSIO,
        selfReportCriteria: ['Full, pain-free range of motion in the injured finger', 'Comfortable making a full fist and a full flat-hand stretch'],
        exercises: [
          {t:'Tendon glides', m:'3 × 10', d:'Full fist, hook fist, and straight-fist positions in sequence, holding each briefly.', r:0},
          {t:'Passive finger extension stretch', m:'3 × 20s', d:'Gently pull the finger back into extension with the other hand, well short of any pain.', r:30},
          {t:'Light putty or stress-ball squeezes', m:'2 × 15', d:'Very light resistance — this is about restoring comfortable movement, not building strength yet.', r:30}
        ]
      },
      {
        id: 'strength', name: 'Strength',
        cue: 'Progressive, controlled loading — the actual rebuilding phase',
        description: 'This is where real tissue capacity gets rebuilt, and it is a progression, not a single exercise: start open-hand on a large edge at low intensity, and only add load, reduce edge size, or reintroduce a half-crimp once the current step is genuinely comfortable. Graded exposure — starting well below what you could eventually hold and moving up in small, deliberate steps — is the single most consistently recommended approach across every source reviewed for this track.',
        caution: 'Progress ONE variable at a time (edge size, hold time, or grip type — not several at once), and only when the previous step has been pain-free for a couple of sessions in a row. Sharp or localized pain at the pulley means back off a step, not push through. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable open-hand hangs on a large edge at low intensity', 'No pain with light half-crimp loading', 'Grip feels stable, not tentative or guarded'],
        exercises: [
          {t:'Open-hand hang — large edge, low intensity',m:'4 × 8s',d:'Two hands, open-hand (no crimp), an edge large enough to feel genuinely easy — roughly 20-30% of what you’d call a real effort. This is deliberately conservative; the point is teaching the pulley to tolerate load again, not testing it.',r:90},
          {t:'Finger extensor rehab',m:'3 × 15',d:'A rubber band round the fingertips, opening the hand against it. Climbers run roughly a 6:1 flexor-to-extensor strength ratio (vs ~3.7:1 in the general population) — this corrects that imbalance and is worth keeping even once you’re back to full training.',r:45},
          {t:'Light half-crimp reintroduction',m:'3 × 5s',d:'Only once open-hand loading above is comfortable. A larger, easier edge than you’d normally use — this is about reintroducing the position safely, not loading it hard.',r:90}
        ]
      },
      {
        id: 'returnToClimbing', name: 'Return to Climbing',
        cue: 'Graded exposure — jugs first, smaller holds over several sessions',
        description: 'Back on the wall, but deliberately conservative for the first few sessions: start on holds well below your limit (a commonly cited rule of thumb is starting about three grades below your max) and let edge size and intensity increase gradually across sessions, not within one session.',
        caution: 'Taping (an H-tape wrap around the affected finger) can add reassurance and a little mechanical support during this phase, but it is not a substitute for the graded loading above — do not use it to justify skipping straight back to your previous limit. ' + SEE_PHYSIO,
        selfReportCriteria: ['A full easy/moderate session with zero pain during or after', 'Comfortable crimping on route/problem holds, not just controlled hangboard reps'],
        exercises: [
          {t:'Jugs and large holds only',m:'—',d:'First 1-2 sessions back: nothing that requires a real crimp. Movement and confidence, not intensity.',r:0},
          {t:'Gradual edge-size reintroduction',m:'—',d:'Each session after that, allow slightly smaller holds if the previous session was fully pain-free — a slow ramp over several sessions, not a jump back to your old limit.',r:0},
          {t:'Finger extensor rehab',m:'3 × 15',d:'Keep this going alongside climbing — same as the Strength phase, it stays worthwhile long-term, not just during rehab.',r:45}
        ]
      }
    ]
  },

  /* ------------------------------------------------------------
     ELBOW — MEDIAL (climber's elbow) — the dominant elbow complaint
     in climbers specifically (flexor/pronator mass, inner elbow),
     distinct from and more common in climbers than lateral
     epicondylitis despite the latter being more common generally.
     Deliberately generic here, not a named clinical eccentric-loading
     protocol with a specific dosage — that's supervised treatment
     territory, same line template-resolver.js's own bicepTendon/elbow
     modules already draw.
     ------------------------------------------------------------ */
  elbowMedial: {
    meta: {
      name: 'Elbow — Inner (Climber’s Elbow)',
      description: 'For pain on the inside of the elbow from gripping and pulling load — "climber’s elbow," medial epicondylitis. The most common elbow complaint in climbers specifically. Built around unloading the flexor/pronator tendon group first, then rebuilding it with progressive, controlled loading.'
    },
    phases: [
      {
        id: 'unload', name: 'Tissue Unload',
        cue: 'Ease off grip-intensive work until pain at rest settles',
        description: 'Reduce anything that reproduces the inner-elbow pain — hard crimping, aggressive pulling, and anything gripping-intensive — until pain at rest has genuinely settled.',
        caution: 'Everyday gripping (carrying bags, a firm handshake) is normal life, not a hazard — the target is avoiding the specific HARD gripping/pulling load that aggravates it, not all hand use. ' + SEE_PHYSIO,
        selfReportCriteria: ['No pain at rest', 'No pain with light everyday gripping'],
        exercises: [
          {t:'Gentle wrist and forearm range of motion',m:'2 × 10',d:'Slow wrist circles and gentle flexion/extension through a comfortable range, no resistance.',r:0},
          {t:'General conditioning',m:'—',d:'Legs, core, and anything that does not load the forearm — good phase to keep everything else moving.',r:0}
        ]
      },
      {
        id: 'mobility', name: 'Mobility',
        cue: 'Forearm and wrist flexibility before reloading',
        description: 'Restoring comfortable wrist and forearm mobility before real strength work starts.',
        caution: 'Stretch to a comfortable pull, not to pain — anything sharp on the inside of the elbow means back off. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable full wrist flexion and extension stretch', 'No pain with forearm pronation/supination through full range'],
        exercises: [
          {t:'Wrist flexor stretch',m:'3 × 20s',d:'Arm extended, palm up, gently pull the fingers back with the other hand.',r:30},
          {t:'Forearm pronation/supination',m:'2 × 10',d:'Elbow tucked to your side, slowly rotate the forearm palm-up to palm-down through a comfortable range, no weight.',r:30}
        ]
      },
      {
        id: 'strength', name: 'Strength',
        cue: 'Progressive loading — isometric first, then through full range',
        description: 'Rebuild capacity in the flexor/pronator group with a gradual progression: start with a still, held (isometric) position, and only move to full-range reps once holding is genuinely comfortable. Antagonist (extensor) work alongside this is not optional — the imbalance between a climber’s pulling muscles and their opposing muscles is a large part of what causes this in the first place.',
        caution: 'Progress the load or range gradually, not all at once, and only once the current step has been comfortable for a couple of sessions. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable isometric wrist-flexor hold at moderate effort', 'Comfortable full-range wrist curls with light weight', 'No pain with light climbing-specific gripping'],
        exercises: [
          {t:'Isometric wrist flexor hold',m:'4 × 20s',d:'Light dumbbell or band, wrist held still in a neutral, mid-range position — no movement, just a steady hold at an effort that feels moderate, not maximal.',r:60},
          {t:'Wrist flexor curls',m:'3 × 12',d:'Once isometric holds are comfortable — slow, controlled, full range, light weight. Progress the weight in small steps.',r:60},
          {t:'Antagonists — wrist extensors',m:'3 × 15',d:'Reverse wrist curls, light weight or a band — the opposing muscle group to the one above, and the standard prevention/rebalancing move for this injury.',r:45},
          {t:'Forearm pronator strengthening',m:'3 × 12',d:'Light dumbbell held at one end, slow controlled rotation from palm-up to palm-down.',r:60}
        ]
      },
      {
        id: 'returnToClimbing', name: 'Return to Climbing',
        cue: 'Easy, foot-focused climbing first — save powerful arm moves for later',
        description: 'Start back on easy, movement-focused terrain that leans on footwork rather than pulling hard. Gradually reintroduce grip intensity and powerful or dynamic arm moves only once easier sessions are consistently pain-free.',
        caution: 'A cautious return matters here specifically — rushing back into hard crimping or powerful pulling is the most commonly cited way this flares back up. ' + SEE_PHYSIO,
        selfReportCriteria: ['A full easy session with zero pain during or after', 'Comfortable with moderate crimping and pulling load'],
        exercises: [
          {t:'Easy, foot-focused climbing',m:'—',d:'First sessions back: movement and footwork over pulling hard. Nothing that reproduces the original pain.',r:0},
          {t:'Gradual reintroduction of grip intensity',m:'—',d:'Add harder pulling and crimping only once easier sessions have been consistently pain-free.',r:0},
          {t:'Antagonists — wrist extensors',m:'3 × 15',d:'Keep this going long-term, not just during rehab — it is standard prevention work for this injury, not just treatment.',r:45}
        ]
      }
    ]
  },

  /* ------------------------------------------------------------
     ELBOW — LATERAL (tennis elbow) — the extensor-mass equivalent
     of the above. Less common in climbers than medial (climbing is
     flexor-dominant), but does happen, often from overcompensating
     antagonist/extensor training or specific gripping patterns.
     ------------------------------------------------------------ */
  elbowLateral: {
    meta: {
      name: 'Elbow — Outer (Tennis Elbow)',
      description: 'For pain on the outside of the elbow — lateral epicondylitis, "tennis elbow." Less common in climbers than the inner-elbow version (climbing loads the flexor side more), but a real overuse injury, often from wrist-extensor-heavy work or specific grip patterns. Same general unload-then-reload structure, extensor-focused.'
    },
    phases: [
      {
        id: 'unload', name: 'Tissue Unload',
        cue: 'Ease off wrist-extension-heavy work until pain at rest settles',
        description: 'Reduce anything that loads the wrist extensors hard — including antagonist/prevention exercises that normally target this group — until pain at rest has settled.',
        caution: 'Ordinary daily hand use is fine — the target is avoiding the specific loaded extension/gripping combination that aggravates it. ' + SEE_PHYSIO,
        selfReportCriteria: ['No pain at rest', 'No pain with light everyday gripping'],
        exercises: [
          {t:'Gentle wrist range of motion',m:'2 × 10',d:'Slow wrist circles and gentle flexion/extension, no resistance.',r:0},
          {t:'General conditioning',m:'—',d:'Legs, core, and anything that does not load the forearm.',r:0}
        ]
      },
      {
        id: 'mobility', name: 'Mobility',
        cue: 'Restore comfortable wrist and forearm range',
        description: 'Comfortable range of motion before real loading resumes.',
        caution: 'Stretch to a comfortable pull, not to pain — anything sharp on the outside of the elbow means back off. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable full wrist flexion stretch (which stretches the extensors)', 'No pain with gripping through a light fist'],
        exercises: [
          {t:'Wrist extensor stretch',m:'3 × 20s',d:'Arm extended, palm down, gently pull the hand down and back with the other hand.',r:30},
          {t:'Light grip and release',m:'2 × 15',d:'Making then releasing a loose fist through a comfortable range, no added resistance.',r:30}
        ]
      },
      {
        id: 'strength', name: 'Strength',
        cue: 'Progressive extensor loading — isometric first',
        description: 'Rebuild extensor capacity gradually: an isometric hold first, moving to full-range loaded reps once that is comfortable, alongside flexor work so the two sides of the forearm progress together rather than one racing ahead.',
        caution: 'Progress load or range gradually, only once the current step is comfortable for a couple of sessions in a row. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable isometric wrist-extensor hold at moderate effort', 'Comfortable full-range reverse wrist curls with light weight', 'No pain with light climbing-specific gripping'],
        exercises: [
          {t:'Isometric wrist extensor hold',m:'4 × 20s',d:'Light dumbbell or band, wrist held still in a neutral, mid-range position — steady moderate effort, not maximal.',r:60},
          {t:'Reverse wrist curls',m:'3 × 12',d:'Once isometric holds are comfortable — slow, controlled, full range, light weight, progressing gradually.',r:60},
          {t:'Flexor work — balance the forearm',m:'3 × 15',d:'Standard wrist curls, light weight — keeping the flexor side moving too rather than only training the injured extensor side.',r:45}
        ]
      },
      {
        id: 'returnToClimbing', name: 'Return to Climbing',
        cue: 'Easy sessions first, build load gradually',
        description: 'Same graded return as any forearm injury — easy, movement-focused sessions first, adding intensity only once those are consistently pain-free.',
        caution: 'Watch grip styles that load the extensors specifically (e.g. certain open-hand and pinch positions) as you ramp back up. ' + SEE_PHYSIO,
        selfReportCriteria: ['A full easy session with zero pain during or after', 'Comfortable with moderate gripping and pulling load'],
        exercises: [
          {t:'Easy, movement-focused climbing',m:'—',d:'First sessions back: nothing near limit. Confirm it stays pain-free before adding intensity.',r:0},
          {t:'Gradual reintroduction of grip intensity',m:'—',d:'Build back up across several sessions, not one.',r:0},
          {t:'Reverse wrist curls',m:'3 × 12',d:'Keep this going long-term as standard prevention, same as the finger-extensor work does for pulley injuries.',r:45}
        ]
      }
    ]
  },

  /* ------------------------------------------------------------
     SHOULDER — rotator cuff strain / impingement / general shoulder
     pain, kept as one track rather than split further, matching
     INJURY_MODULES's own existing "shoulder" granularity. 77%
     lifetime shoulder-pain prevalence in climbers per the
     epidemiology review already cited elsewhere in this repo.
     ------------------------------------------------------------ */
  shoulder: {
    meta: {
      name: 'Shoulder',
      description: 'For general shoulder pain, impingement, or a rotator cuff strain — a dull ache, often worse reaching overhead or across the body, common on compression and gaston moves. Built around scapular control and rotator cuff strength, which the research points to as working as well as or better than isolated rotator cuff work alone.'
    },
    phases: [
      {
        id: 'unload', name: 'Tissue Unload',
        cue: 'Ease off overhead and cross-body loading until pain at rest settles',
        description: 'Reduce compression moves, gastons, and reaching overhead under load until pain at rest has settled.',
        caution: 'Normal daily arm use is fine — the target is avoiding loaded overhead/cross-body positions specifically. ' + SEE_PHYSIO,
        selfReportCriteria: ['No pain at rest', 'No pain with normal daily arm use below shoulder height'],
        exercises: [
          {t:'Pendulum swings',m:'2 × 10',d:'Lean forward, let the arm hang, gently swing it in small circles — passive movement, no muscle effort.',r:0},
          {t:'General conditioning',m:'—',d:'Legs, core, and lower-body work that does not load the shoulder.',r:0}
        ]
      },
      {
        id: 'mobility', name: 'Mobility',
        cue: 'Restore comfortable range before adding strength work',
        description: 'Gentle, active range of motion work before real loading resumes.',
        caution: 'Move within a comfortable range — sharp or catching pain (as opposed to general stiffness) means back off. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable full active range of motion overhead', 'No catching or sharp pain through the full range'],
        exercises: [
          {t:'Active-assisted shoulder flexion',m:'3 × 10',d:'Lying on your back, use the uninjured arm to gently guide the injured one overhead through a comfortable range.',r:30},
          {t:'Scapular squeezes',m:'3 × 12',d:'Squeeze the shoulder blades together and hold briefly — restoring scapular movement and awareness.',r:30}
        ]
      },
      {
        id: 'strength', name: 'Strength',
        cue: 'Scapular control first, then rotator cuff loading',
        description: 'Scapular stability work is not a warm-up here — the research is clear it performs as well as or better than isolated rotator cuff work on its own, so it gets equal billing. Build rotator cuff strength alongside it, progressing gradually.',
        caution: 'Progress load gradually and only once the current step is comfortable for a couple of sessions in a row. Anything sharp or catching means back off, general fatigue is fine. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable band pull-aparts and prone Y-raises at moderate load', 'Comfortable external rotation work at moderate load', 'No pain with light pressing/pulling overhead'],
        exercises: [
          {t:'Scapular stability work',m:'3 × 12',d:'Band pull-aparts or prone Y-raises — restoring the scapular control that shoulder-injury-prevention research points to as at least as important as rotator cuff strength itself.',r:60},
          {t:'External rotation',m:'3 × 12',d:'Light band, elbow tucked to your side, rotating the forearm outward. The standard low-cost rotator cuff strengthening move.',r:45},
          {t:'Progressive overhead loading',m:'3 × 10',d:'Once the above is comfortable — light, controlled overhead pressing or pulling, building load gradually.',r:60}
        ]
      },
      {
        id: 'returnToClimbing', name: 'Return to Climbing',
        cue: 'Vertical and slab first — save steep, compression-heavy terrain for later',
        description: 'Return on terrain that does not demand heavy compression or gaston positions — vertical walls and slab first. Reintroduce steep, overhanging, or compression-heavy climbing gradually.',
        caution: 'Steep terrain and gastons load the shoulder hardest — this is deliberately the last thing reintroduced, not an early test. ' + SEE_PHYSIO,
        selfReportCriteria: ['A full session on vertical/slab terrain with zero pain', 'Comfortable with light compression/gaston moves'],
        exercises: [
          {t:'Vertical or slab climbing',m:'—',d:'First sessions back: avoid steep, compression-heavy, or gaston-reliant terrain entirely.',r:0},
          {t:'Gradual reintroduction of steep terrain',m:'—',d:'Add overhanging and compression moves only once vertical sessions are consistently pain-free.',r:0},
          {t:'External rotation',m:'3 × 12',d:'Keep this going long-term — standard shoulder-injury prevention, not just treatment.',r:45}
        ]
      }
    ]
  },

  /* ------------------------------------------------------------
     BICEPS TENDINOPATHY — in climbers this is most often the LONG
     HEAD tendon at the front of the shoulder (gaston/compression
     loading), not a distal elbow-area tendon, and "rarely happens in
     isolation" per the research — hence the explicit cross-reference
     to Shoulder throughout, same pattern template-resolver.js's own
     bicepTendon module already uses.
     ------------------------------------------------------------ */
  bicepsTendon: {
    meta: {
      name: 'Biceps Tendon',
      description: 'For front-of-shoulder pain from gastons or compression moves — in climbers this is usually the long head of the biceps tendon, not the elbow. Rarely an isolated problem: this track leans on scapular/rotator cuff coordination as much as the biceps itself, so pair it with the Shoulder track if that also sounds familiar.'
    },
    phases: [
      {
        id: 'unload', name: 'Tissue Unload',
        cue: 'Ease off gastons and compression until pain at rest settles',
        description: 'Reduce gaston and compression moves, and any resisted elbow-flexion/forearm-supination work, until pain at rest has settled.',
        caution: 'Normal daily arm use is fine — the target is avoiding loaded gaston/compression positions and hard resisted curling specifically. ' + SEE_PHYSIO,
        selfReportCriteria: ['No pain at rest', 'No pain with normal daily arm use'],
        exercises: [
          {t:'Active range of motion — shoulder flexion',m:'2 × 10',d:'Lying on your side, gently raise the arm through a comfortable range — lessens biceps tension compared to standing overhead work.',r:0},
          {t:'General conditioning',m:'—',d:'Legs, core, and lower-body work that does not load the shoulder or biceps.',r:0}
        ]
      },
      {
        id: 'mobility', name: 'Mobility',
        cue: 'Gentle shoulder range before any biceps loading',
        description: 'Restoring comfortable shoulder range of motion first — the biceps tendon’s attachment at the shoulder means shoulder mobility matters here as much as the elbow does for other tracks.',
        caution: 'Sharp or catching front-of-shoulder pain means back off — general stretch sensation is fine. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable active range of motion in shoulder flexion and abduction', 'No catching or sharp pain through the range'],
        exercises: [
          {t:'Shoulder abduction — supine or prone',m:'3 × 10',d:'Lying down, raise the arm out to the side through a comfortable range.',r:30},
          {t:'Scapular squeezes',m:'3 × 12',d:'Squeeze the shoulder blades together and hold briefly.',r:30}
        ]
      },
      {
        id: 'strength', name: 'Strength',
        cue: 'Isometric, then isotonic, then careful loaded biceps work — with scapular coordination alongside',
        description: 'A staged progression: an isometric hold first, then full-range light reps, before returning to real biceps loading. Scapular/rotator cuff work runs alongside the whole way — the research on this tendon specifically is clear it is rarely an isolated problem.',
        caution: 'If a full rep is uncomfortable, hold isometrically at a pain-free angle instead rather than pushing through — this is the same fallback template-resolver.js’s own bicepTendon module already uses. Progress gradually. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable isometric biceps hold at a mid-range angle', 'Comfortable full-range light curls', 'No pain with light gaston/compression positions'],
        exercises: [
          {t:'Isometric biceps hold',m:'3 × 20s',d:'Light dumbbell or band, elbow held at a comfortable mid-range angle — a steady hold, not a rep.',r:60},
          {t:'Biceps isolation — light curls',m:'3 × 12',d:'Once isometric holds are comfortable — slow, controlled dumbbell or band curls, light weight.',r:60},
          {t:'Scapular stability work',m:'3 × 12',d:'Band pull-aparts or prone Y-raises, alongside the external rotation below — pair with the Shoulder track if you’ve also flagged shoulder history.',r:60},
          {t:'External rotation',m:'3 × 12',d:'Light band, elbow tucked to your side.',r:45}
        ]
      },
      {
        id: 'returnToClimbing', name: 'Return to Climbing',
        cue: 'Avoid gastons and underclings first — everything else can come back sooner',
        description: 'Return on terrain and hold types that avoid gaston and undercling positions specifically — most other movement is fine much sooner than those two.',
        caution: 'Gastons and underclings load this tendon hardest — reintroduce them last and gradually, not as an early test. ' + SEE_PHYSIO,
        selfReportCriteria: ['A full session avoiding gastons/underclings with zero pain', 'Comfortable with light gaston or undercling moves'],
        exercises: [
          {t:'Climbing avoiding gastons and underclings',m:'—',d:'First sessions back: pick lines that let you avoid these two hold types entirely.',r:0},
          {t:'Gradual reintroduction of gastons/underclings',m:'—',d:'Add these back only once general sessions are consistently pain-free.',r:0},
          {t:'External rotation',m:'3 × 12',d:'Keep this going long-term, same as the Shoulder track.',r:45}
        ]
      }
    ]
  },

  /* ------------------------------------------------------------
     WRIST — TFCC (triangular fibrocartilage complex) — ulnar-sided
     wrist pain, common from crimping and mantling. The dart-thrower's
     motion (radial extension to ulnar flexion, on the diagonal) is
     repeatedly cited as the wrist's safest natural movement pattern
     for this injury specifically.
     ------------------------------------------------------------ */
  wristTFCC: {
    meta: {
      name: 'Wrist (TFCC)',
      description: 'For pain on the pinky-side of the wrist — the triangular fibrocartilage complex (TFCC), often from crimping or mantling. Built around restoring the wrist’s safest natural movement pattern (the diagonal "dart-thrower’s motion") and rebuilding the secondary stabilizers that support the joint.'
    },
    phases: [
      {
        id: 'unload', name: 'Tissue Unload',
        cue: 'Ease off loaded wrist rotation and deviation until pain at rest settles',
        description: 'Reduce mantling, and anything involving loaded wrist rotation (pronation/supination) or sideways deviation, until pain at rest has settled.',
        caution: 'Normal daily hand use is fine — the target is avoiding loaded rotation/deviation specifically. ' + SEE_PHYSIO,
        selfReportCriteria: ['No pain at rest', 'No pain with normal daily wrist use'],
        exercises: [
          {t:'Gentle wrist range of motion',m:'2 × 10',d:'Slow, small wrist circles through a comfortable range, no resistance.',r:0},
          {t:'General conditioning',m:'—',d:'Legs, core, and grip-light upper-body work.',r:0}
        ]
      },
      {
        id: 'mobility', name: 'Mobility',
        cue: 'Six-direction range, then the dart-thrower’s motion',
        description: 'Restoring comfortable movement in every direction the wrist moves, before introducing the diagonal pattern research points to as the wrist’s safest natural motion.',
        caution: 'Stay in a comfortable range — sharp pain on the pinky-side of the wrist means back off. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable full range in all six wrist directions', 'Comfortable dart-thrower’s motion'],
        exercises: [
          {t:'Six-direction isometrics',m:'10s hold × 6 directions',d:'Flexion, extension, radial deviation, ulnar deviation, pronation, supination — a gentle held position in each, no movement.',r:15},
          {t:'Dart-thrower’s motion',m:'2 × 15',d:'A diagonal movement from wrist-up-and-thumb-back to wrist-down-and-pinky-back — the wrist’s most natural, TFCC-safest pattern. Slow and controlled, no weight.',r:30}
        ]
      },
      {
        id: 'strength', name: 'Strength',
        cue: 'Build the secondary stabilizers that support the joint',
        description: 'The muscles that cross the wrist and support the TFCC from the outside — not just the joint itself — are what this phase rebuilds, progressing gradually.',
        caution: 'Progress load gradually, only once the current step is comfortable for a couple of sessions in a row. ' + SEE_PHYSIO,
        selfReportCriteria: ['Comfortable light grip work with the wrist in neutral', 'Comfortable light resisted dart-thrower’s motion', 'No pain with light crimping'],
        exercises: [
          {t:'Dart-thrower’s motion — light resistance',m:'3 × 12',d:'Same diagonal pattern as Mobility, now with a light band or light dumbbell.',r:45},
          {t:'Wrist stabilizer strengthening',m:'3 × 12',d:'Light dumbbell, slow controlled wrist curls and forearm rotation — building the pronator and carpi muscle groups that support the TFCC.',r:45},
          {t:'Grip work — neutral wrist',m:'3 × 15',d:'Light grip squeezes keeping the wrist in a neutral position throughout, not flexed or deviated.',r:45}
        ]
      },
      {
        id: 'returnToClimbing', name: 'Return to Climbing',
        cue: 'Neutral wrist positions first — ease into mantling',
        description: 'Return favoring holds and movement that keep the wrist neutral. Ease into mantling and anything requiring loaded wrist rotation gradually, and engage the core and shoulders to take load off the wrist where you can.',
        caution: 'Repetitive radial deviation and loaded pronation/supination (common in mantling) are what most often flare this back up — reintroduce them last and gradually. ' + SEE_PHYSIO,
        selfReportCriteria: ['A full session avoiding mantling with zero pain', 'Comfortable with light mantling and loaded wrist rotation'],
        exercises: [
          {t:'Climbing with neutral wrist positions',m:'—',d:'First sessions back: favor holds that keep the wrist neutral, avoid mantling.',r:0},
          {t:'Gradual mantling reintroduction',m:'—',d:'Add mantling and loaded wrist rotation back only once general sessions are consistently pain-free.',r:0},
          {t:'Wrist stabilizer strengthening',m:'3 × 12',d:'Keep this going long-term as standard prevention.',r:45}
        ]
      }
    ]
  }

};
});

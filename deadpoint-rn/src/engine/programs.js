/* ============================================================
   PROGRAMS
   One session library per person, keyed by their sign-in email
   (lowercased). Every program must define the same seven keys
   (maxFingers, hangboard, pull, climbHard, outdoorHard, climbEasy,
   rest) — the rules engine (engine-core.js) is shared and references
   those keys directly. Only the first three are ever RECOMMENDED; the
   climbing sessions exist so you can log them yourself, and so they
   count toward recovery once you have. Only the content
   (name, description, exercises, load numbers, start date)
   varies per person. 'default' is used for anyone signed in
   whose email isn't listed below yet.

   finger / pull = load scores 0–3, used by the rules engine.
   ask = prompt for a top-set number after logging.

   Plain data, no logic — extracted to its own file so the engine-core
   test suite can run against the real programs, not just synthetic
   fixtures.
   ------------------------------------------------------------ */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PROGRAMS = factory();
})(typeof self !== 'undefined' ? self : this, function(){
"use strict";
return {
  'oscar@sullivanltd.co.uk': {
    startDate:'2026-08-10',
    /* Phases run in block order. `from` is the block this phase starts at,
       and it holds until the next phase's `from`. Week 4 of every block is
       a deload — see isDeload()/decide(). */
    perWeek:4,
    phases:[
      {n:'Base', from:1, c:'--tidepool', cue:'Submaximal — build capacity, not a top set', d:'Four weeks building tissue tolerance before the heavy work starts. Loads sit clearly submaximal and sets run longer — the point is capacity and movement quality, not a top set. You are already training, so this is short: one block, not two.'},
      {n:'Max Strength', from:2, c:'--gorse', cue:'Near-maximal — heavy is correct here', d:'The main event, and the longest phase — twelve weeks. Pickups and hangs go near-maximal, rests go long, set counts stay low. This is where the crimp weakness and the one-arm actually move. Everything else in the week exists to let these sessions happen fresh.'},
      {n:'Power', from:5, c:'--heather', cue:'Lighter, fast — speed over load', d:'Converting the strength you built into speed. Same movements, fewer reps, moved fast and explosively rather than ground out. Contact strength on the fingers rather than long holds.'},
      {n:'Performance', from:6, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back and climbing takes over. Keep one light finger session a week to hold what you built, and spend the rest of your days projecting. This is when the previous five months are supposed to show up on rock.'}
    ],
    sessions:{
      maxFingers:{n:'Max Fingers', w:'Home · 50 min', c:'--gorse', finger:3, pull:1, note:'Climbing today? This first, then the gym a few hours later. Never climb before max finger work — you cannot pull max on tired fingers, and that is how pulleys go.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then three progressively heavier two-hand pickups. Never skip this on a cold morning.'},
          {t:'Pickups — half crimp',id:'osc-pickup-half',m:'5 × 5s / hand',ph:{'Base':'4 × 8s / hand — lighter','Power':'5 × 3s / hand — fast pickup','Performance':'3 × 5s / hand — maintain only'},d:'20mm. Rep five hard but form-perfect. Alternate hands — each hand then gets about three minutes between efforts, which is what near-max work needs to stay near-max.',r:90},
          {t:'Pickups — three-finger drag',id:'osc-pickup-drag',m:'3 × 5s / hand',d:'Lighter. Covers the rounded granite edges you actually climb on. Alternate hands.',r:90},
          {t:'Pinch block',id:'osc-pinch',step:1.25,m:'4 × 5s / hand',d:'Alternate hands.',r:60},
          {t:'Wrist roller',m:'3 sets',d:'Up and down to near failure.',r:60}
        ]},
      pull:{n:'Pull', w:'Home · 45 min', c:'--tidepool', finger:0, pull:3, note:'Climbing today? Climb FIRST and do this after — no fingers here, so spend them on the wall. This is the day to try hard on something crimpy. Just leave enough arm for the one-arm holds.',
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts, scap pulls, then two progressively heavier pull-up sets. The bar is outside — do not pull heavy on cold shoulders and elbows.'},
          {t:'Full-range pull-ups',id:'osc-pull-full',m:'4 × 5',ph:{'Base':'3 × 8 — lighter','Power':'5 × 3 — explosive out of the hang','Performance':'3 × 4 — maintain only'},d:'Two arms, full dead hang all the way to chin over the bar, controlled down. Heavy. The bottom used to be the whole point of this exercise — now that range has caught up, the target moves back to the full pull rather than staying parked on the bottom third. New exercise, not the old one under a new name: starts with no weight history, so the first session is a fresh feel for what full range actually takes. Rotates automatically every 4th Pull session to vary the stimulus.',r:150,
            rotate:{every:4, with:[
              {t:'Weighted pull-ups',id:'osc-pull-wt',m:'4 × 4',d:'Heavy, full dead hang each rep.',r:180},
              {t:'One-arm negatives',m:'3 × 1 / arm',d:'8–10 second descent. Control the last 30cm above all.',r:180}
            ]}},
          {t:'One-arm transition holds',m:'4 × 8s / arm',d:'Minimal band or a toe on a stool. Hold at the top of your shrug plus a couple of centimetres — the exact point where you cannot get the elbow flexing. Alternate arms: one rests while the other works.',r:60},
          {t:'Weighted one-arm shrugs',id:'osc-shrug',m:'3 × 3 / arm',d:'Belt or vest, three-second hold at the top. Alternate arms. Three reps is right at your current ceiling, so the weight moves rather than the reps.',r:60},
          {t:'Shoulder anti-rotation holds',m:'3 × 5–10s / arm',d:'One-arm pulling strength alone will not stop you twisting off a hold — this is the fix. Hang one-armed off the bar (band or a toe on a stool for assistance, same setup as the transition holds above), open grip rather than a crimp. Without using your wrist or arm, resist rotation using the small stabiliser muscles around your shoulder. Once that feels solid, progress to turning deliberately to one side, holding, then returning to centre before turning the other way. A real limiter for the one-arm pull-up on its own, not just prep for whatever comes after it.',r:45},
          {t:'Front lever',m:'4 × 8–10s',d:'Hardest tuck or straddle you hold clean. If you cannot hold a tuck yet, do slow negative lowers from a tuck for the same sets.',r:75},
          {t:'Antagonists',m:'3 supersets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 (a rubber band round the fingertips, opening the hand against it — no dedicated tool needed) · external rotation 3×12 · dips 3×10. Run as supersets with minimal rest — maintenance work, not a strength focus.'}
        ]},
      hangboard:{n:'Hangboard', w:'Gym · 40–55 min + climb', c:'--slate', finger:2, pull:1, note:'Board work before climbing, in the order below. Repeaters on already-tired fingers is a different exercise at a load you did not choose.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before touching the edge. On weeks Weighted Hangs is in the session it goes first, while fingers are fresh — so warm up properly, you are heading straight into the heaviest thing you do here.'},
          {t:'Weighted hangs',id:'osc-hang-wt',m:'10s × 5',ph:{'Base':'skip — repeaters only this phase','Power':'3s × 6 — short, sharp, contact-focused','Performance':'skip — hold what you built, repeaters only'},d:'Only if the gym has a belt. Heavy-ish, never maximal. This goes FIRST, while fingers are fresh — doing repeaters before it would blunt the load you can hold and mean pulling near-max on already-fatigued tissue. Alternates automatically with a lighter week.',r:180,
            rotate:{every:2, with:[{t:'Weighted hangs',m:'skip — alternate week, repeaters carries this session'}]}},
          {t:'20mm repeaters',id:'osc-rep20',m:'4–5 sets',interval:{on:7,off:3,reps:6},ph:{'Base':'5–6 sets — lighter, higher volume','Power':'3 sets — reduced, priority is the pickups','Performance':'2–3 sets — maintain only'},d:'7s on / 3s off × 6 = one set. Around 55–60% of max. Two minutes between sets. Press Start below and just hang — sets, phase and deload are all handled for you.',r:120},
          {t:'Band-assisted one-arm',m:'3 × 5s / hand',d:'If there is a pulley or a band. Closest thing to pickups you can do at work — and the right step while you cannot one-arm hang a 20mm edge unassisted. Alternate hands.',r:90},
          {t:'Volume climbing',m:'45 min',d:'Crimp-biased mileage, not limit attempts.'}
        ]},
      climbHard:{n:'Hard Climb / Board', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1, note:'Got board access today? All three boards are fair game — go hard on whatever is set.',
        guide:{title:'Board Session Guide', sections:[
          {heading:'The real fix: hips, not just fingers', body:'Your crimp strength already works on vertical granite. On the board it is not enough on its own, because the angle shifts load straight onto your arms unless your hips are doing their share. Before adding more finger effort on a stalled move, check your hips are extended and pulled into the wall — backstep or drop-knee to get there. Quiet feet and a tensioned core are what let you hold that position on small holds.'},
          {heading:'Warm up on the board itself', body:'A normal gym warm-up does not transfer — board holds are too specific. Fifteen to twenty minutes: pull-ups on big holds, static positions, single moves, then link moves progressively before trying full problems.'},
          {heading:'Rest longer than feels natural', body:'90 seconds minimum between attempts, four to five minutes after a real max effort. Board sessions fatigue tendons differently to normal bouldering — rushing back on is how they wear down.'},
          {heading:'Project session — pick this for raw strength', body:'Two to three problems, maximum, twenty minutes each, three to five minutes rest between attempts. Build them around the exact pattern you are weak at — crimp to crimp, or crimp to gaston, on steep ground — rather than whatever looks appealing; your instincts pull toward what you are already good at. Work each one through three levels as the session goes on: the single hardest move in isolation, then linking sections together, then full attempts at the whole thing. Vary the style across your two or three picks — pinches, then crimps, then dynamic versus static moves — so you are not just drilling one pattern. Ignore the grade on the wall; board grades are notoriously subjective, and it is better to drop a grade to work moves you genuinely find hard. It is completely normal for a problem to carry over into your next board session rather than getting sent in one go.'},
          {heading:'Tension session — pick this for footwork and control', body:'Choose four problems you can already climb. The rule: keep a foot in contact with a hold at all times — no cutting loose, no jumping between the crimps. Up to five attempts each, one to two minutes rest between. If you cut loose, it does not count as a completed attempt — reset and go again. Unlike a project session, you are aiming for a high completion rate here: by the end you should be sending most of these cleanly, proving you can hold the tension through the whole move instead of skipping it.'},
          {heading:'Cap the volume', body:'Board sessions are intense enough that even strong, experienced climbers often only get on one twice a week. If you are newer to it, small amounts go a long way — build up how often and how hard gradually rather than treating it like normal bouldering volume.'},
          {heading:'Bring a partner, within reason', body:'Climbing with someone else on the board pushes you to try moves and hold types you would skip solo, and makes the session more enjoyable. Just do not chase them past your own limit — if they are much stronger, finish while you still have quality attempts left rather than grinding into fatigue.'}
        ]},
        x:[
          {t:'Crimp-only limit bouldering',m:'45 min',ph:{'Base':'60 min — volume over difficulty, movement quality first','Power':'30 min — fewer attempts, full power between tries','Performance':'projecting — no fixed time'},d:'Small edges, vertical to 20°. Set your own if there is nothing suitable — you work there. At the board: crimps are fine — that is the whole point of board access, hard controlled training on whatever is set. Use any of the three. Poor feet throughout means do not let sloppy footwork turn this into a strength-endurance session by accident.',r:180},
          {t:'No slopers, no heels',m:'rest of session',d:'Your instincts pull you toward what you are already good at. Ignore them.'},
          {t:'Cool down',m:'10 min',d:'Easy traversing, then finger extensors.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold granite and cold fingers is how pulleys go.'},
          {t:'Project',m:'—',d:'Pick something that pushes you.',
            rotate:{every:3, with:[{t:'Project — crimpy pick',m:'—',d:'Third outdoor day — pick something crimpy you would normally walk past.'}]}}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit. If you are trying hard, it stops being this session.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Rest from training, not from moving. An easy climb is fine — if it turns into trying hard, log it as a Crimp Session so the plan can count it.', x:[]}
    }
  },

  'joepearce2005@icloud.com': {
    startDate:'2026-08-10',
    /* The Font trip is an idea, not a booking — so there is deliberately NO
       taper phase here. A taper is only meaningful counted back from a known
       date; running one "just in case" sheds fitness and buys nothing. This
       is an open-ended rotation of strength and power-endurance blocks
       instead.

       WHEN THE TRIP IS BOOKED: insert a phase starting at the block that
       contains the departure date, so the taper runs the final 7–10 days:
         {n:'Peak — Font', from:<block>, d:'Volume drops hard, intensity
          stays, you arrive fresh rather than fried. Fitness gained in the
          last ten days is negligible; fatigue carried in is not.'}
       and add matching `ph` entries: sloper hangs '2 × 7s — light, keep
       sharp', endurance circuit 'skip', limit bouldering '30 min — Font-
       style, well short of failure'. */
    perWeek:4,
    phases:[
      {n:'Max Strength', from:1, c:'--gorse', cue:'Near-maximal — heavy is correct here', d:'Straight at it — you are already training 2–3x a week, so there is no need for a long base phase. Sloper and open-hand work goes near-maximal, weighted pull-ups build toward a real one-rep max. Strength first, because everything else is easier to add on top of it than the other way round.'},
      {n:'Power Endurance', from:2, c:'--tidepool', cue:'Submaximal, high volume — chase reps, not weight', d:'Strength work drops to maintenance and the endurance gap becomes the priority — that is the thing most likely to cost you a 7B+. Circuits, boulder doubles and 4x4s move to the front of the session, where they get your best effort instead of your leftovers.'},
      {n:'Max Strength', from:3, c:'--gorse', cue:'Near-maximal, and higher than block 1 — you are stronger now', d:'Second strength block, and the long one. You come into it stronger and better conditioned than the first, so the loads should be meaningfully higher — that is the point of alternating rather than grinding one quality for six months.'},
      {n:'Power Endurance', from:5, c:'--tidepool', cue:'Submaximal, high volume — chase reps, not weight', d:'Convert the second strength block into staying power. Same format as before, heavier problems in the circuits.'},
      {n:'Performance', from:6, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back and climbing takes over — keep one finger session and one circuit a week to hold what you built, and spend the rest projecting. If the Font trip has a date by now, say so and this becomes a proper taper instead.'}
    ],
    sessions:{
      maxFingers:{n:'Max Strength', w:'Work · 40 min', c:'--gorse', finger:3, pull:1, note:'Climbing today? This first, ideally hours before. Fingers cannot pull near-max once they are already tired, and that is when they get hurt.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before loading anything.'},
          {t:'Half-crimp hang — 15mm edge',id:'joe-hang15',m:'5 × 7s',ph:{'Power Endurance':'3 × 7s — maintain only','Performance':'3 × 7s — maintain only'},d:'Beastmaker 1000, 15mm edge, four fingers half-crimped. This is the priority lift — crimps train reliably, which slopers do not: a sloper hold fails on friction and skin, so a worse session might just mean a slicker day rather than a weaker one. WHEN THE GYM’S ~15kg RUNS OUT: move to the 10mm four-finger pockets, then band-assisted one-arm on 20mm. NOT the three- or two-finger pockets — pinky disengaged is exactly what has tweaked your ring finger. Take the full three minutes between sets; near-max work stops being near-max without it.',r:180},
          {t:'Open-hand hang — 20mm pockets',id:'joe-hang20',m:'3 × 7s',d:'Secondary, not the focus. Extended fingers, no crimp. Keeps the open-hand position that slopers actually load, so dropping sloper board work does not leave that capacity untrained — but it stays submaximal and low volume while the 15mm work carries the session. Four fingers, pinky in.',r:120},
          {t:'Plate pinches',id:'joe-pinch',step:1.25,m:'4 × 5s / hand',d:'Two plates smooth-sides-out, pinched between thumb and fingers, held for time — the substitute for a pinch block, which the gym does not have. Thumb strength is what compression climbing runs on, so this is the Font-relevant bit. Start light; the grip fails long before the weight feels heavy.',r:90}
        ]},
      pull:{n:'Pull & Power', w:'Work · 40 min', c:'--tidepool', finger:0, pull:3, note:'Climbing today? Climb first and do this after — no finger load here, so spend them on the wall. Keep enough left for the bicep work; that one is not optional.',
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts, scap pulls, then two progressively heavier pull-up sets. Given the bicep history, never start heavy or explosive work cold.'},
          {t:'Archer / band-assisted one-arm pull-ups',m:'4 × 3 / arm',d:'Swapped off weighted pull-ups because the gym’s ~15kg cannot make them near-maximal — you already pull 30kg × 3, so 15kg is rep work wearing a strength label. Going unilateral gets you back to a genuine max effort with no plates at all: archer pull-ups, or a band through the bar taking just enough off. Progress by reducing band assistance. This is still where the burliness comes from.',r:180},
          {t:'Explosive pull-ups',m:'4 × 3',d:'Fast concentric, controlled landing. Power, not grind.',r:150},
          {t:'Weighted dips or shoulder press',id:'joe-dip',m:'4 × 6',d:'Push/shoulder strength for the compression-and-shouldery moves you are after.',r:120},
          /* dl deliberately equals m: this is rehab, not training load. Deload
             weeks thin out the work that accumulates fatigue — tendon
             maintenance is the thing you keep doing while the rest backs off. */
          {t:'Bicep tendon health',m:'3 sets',dl:'3 sets',d:'Slow eccentric hammer curls + isometric holds. Non-negotiable every time this session comes up, whether the arms feel fine or not — this is specifically what has kept the tendinopathy from coming back before. Progress load here gradually; sudden jumps are what has flared it up in the past.',r:60}
        ]},
      hangboard:{n:'Repeaters', w:'Work · 25 min', c:'--slate', finger:2, pull:1, note:'Board before climbing. Repeaters are meant to be a known, sustainable load — done on tired fingers they stop being that.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug. Short session, but going straight onto a loaded edge cold is exactly how the ring finger gets tweaked.'},
          /* interval:{on,off,reps} drives the auto-cycling full-screen
             repeater timer (see startIntervalTimer()) — press once, it runs
             every rep of every set with no further taps, using `r` below as
             the rest BETWEEN sets so that number only has to live in one
             place. Deliberately no `sets` field here: the set count is read
             at start time from whatever `m` currently resolves to, which is
             already phase- and deload-adjusted — a deload week correctly
             runs fewer sets with zero extra logic. */
          {t:'Repeaters',id:'joe-rep',m:'5 × (10s on / 5s off × 5)',interval:{on:10,off:5,reps:5},d:'Your usual protocol, at a sustainable load — not a max effort. Beastmaker 1000, the 20mm-range four-finger pockets. Unaffected by the gym’s 15kg cap: repeaters are meant to be submaximal, so running out of plates costs nothing here. Keep the pinky engaged and stay off the three- and two-finger pockets — that position is what tweaks your ring finger. Press Start below and just hang — the timer runs the whole protocol, sets included.',r:120}
        ]},
      climbHard:{n:'Hard Climb / Board', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1, note:'Got board access today? All three boards are fair game — go hard on whatever is set.',
        x:[
          {t:'Compression / sloper limit bouldering',m:'40 min',ph:{'Power Endurance':'25 min — after the circuit','Performance':'projecting — no fixed time'},d:'Seek out the compression-y, shouldery, sloper problems you would normally avoid. This block is what actually prepares you for Font, not the crimpy stuff you are already good at. At the board: crimps are fine — that is the whole point of board access, hard controlled training on whatever is set. Use any of the three.',r:180},
          {t:'Endurance circuit',m:'20 min',ph:{'Power Endurance':'35 min — do this FIRST, while fresh','Performance':'20 min — hold what you built'},d:'Boulder doubles or 4x4s — same format you have used before. This is the direct fix for the endurance gap. In the Power Endurance block this moves to the front of the session: whatever comes first gets the quality.',r:180},
          {t:'Cool down',m:'10 min',d:'Easy traversing.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold fingers on cold rock is how pulleys go.'},
          {t:'Project',m:'—',d:'Font-style movement — compression, footwork, reading slopers — is the priority whenever the choice is yours.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit. Footwork and reading, not trying hard.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Rest from training, not from moving. An easy climb is fine — if it turns into trying hard, log it so the plan can count it.', x:[]}
    }
  },

  /* Max Pamplin — built from his own handwritten notebook (photographed
     2026-08-24). Direct feedback after the first pass: keep his three
     days (Monday/Wednesday/Friday) intact exactly as he wrote them,
     each as ONE combined session — not split apart by training purpose
     across separate session types the way an earlier version of this
     did. Only maxFingers/hangboard/pull are ever actually RECOMMENDED
     by the engine (see the file header above) — climbHard/climbEasy
     never get pushed as a suggestion, only logged manually — so those
     three keys are where his three real days live, each holding
     everything he wrote for that day (climbing included). climbHard/
     climbEasy below are just generic fallbacks for anything extra he
     logs outside his three set days, not part of his actual plan.
     Nothing here has been through a live sign-in yet — Oscar should
     sanity-check the numbers below with Max before he starts. One
     remaining open item: there's no periodization scheme in his
     notebook at all (just a steady weekly split) — the phases/deload
     structure below is a reasonable default modelled on Oscar's own
     program, not something Max specified himself. */
  'maxpamplin2000@googlemail.com': {
    startDate:'2026-08-24',
    perWeek:3,
    phases:[
      {n:'Max Strength', from:1, c:'--gorse', cue:'Near-maximal — heavy is correct here', d:'Your existing split, structured through the app: limit bouldering and fingerboard near-maximal, pull-ups heavy. No easing-in phase — you are already training this hard, so this starts straight at your current numbers and is the longest phase.'},
      {n:'Power', from:5, c:'--heather', cue:'Lighter, fast — speed over load', d:'Same three days, converted to speed. Fingerboard goes short and sharp, pull-ups explosive, and the deadpoint/power bouldering gets priority over the limit boulders.'},
      {n:'Performance', from:6, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back. One finger day and one pull day a week to hold what you built, everything else goes to outside projects.'}
    ],
    sessions:{
      maxFingers:{n:'Max Strength', w:'Gym · 2 hr', c:'--gorse', finger:3, pull:1, climb:1, note:'Your Monday — warm up, work through the grades, then finish on the board.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise, then progressively heavier hangs/pulls before loading anything.'},
          {t:'Progressive problems',m:'V2 → V7',d:'Ramping up through the grades.'},
          {t:'Limit boulders',m:'3 attempts, around V9/V10',ph:{'Performance':'projecting instead — no fixed attempt count'},d:'Your ceiling grade. Full recovery between attempts, not a circuit.',r:240},
          {t:'Weighted fingerboard hangs',id:'max-hang-wt',m:'5 × 10s',ph:{'Power':'5 × 4s — short, sharp, contact-focused','Performance':'3 × 8s — maintain only'},d:'Currently 25kg added. 3 min rest between reps.',r:180}
        ]},
      hangboard:{n:'Volume', w:'Gym · 75 min', c:'--slate', finger:2, pull:1, climb:1, note:'Your Wednesday — mileage first, board work and mobility after.',
        x:[
          {t:'Warm up',m:'10 min',d:'Pulse raise before the volume problems.'},
          {t:'Volume bouldering',m:'15–20 problems',d:'V5–V7. Mileage, not limit attempts — the opposite end of the week from Monday.'},
          {t:'Repeaters',id:'max-rep',m:'3 sets',interval:{on:7,off:3,reps:6},ph:{'Power':'2 sets — reduced, priority is elsewhere this phase','Performance':'1–2 sets — maintain only'},d:'7s on / 3s off × 6 = one set. Press Start below and just hang.',r:120},
          {t:'Mobility',m:'—',d:'Hips, shoulders, thoracic.'}
        ]},
      pull:{n:'Power', w:'Gym · 2 hr', c:'--tidepool', finger:1, pull:3, climb:1, note:'Your Friday — power bouldering first, pulling strength after.',
        x:[
          {t:'Warm up',m:'5 min',d:'Band pull-aparts, scap pulls, then two progressively heavier pull-up sets.'},
          {t:'Power bouldering — big moves',m:'5 problems, 2–4 moves',ph:{'Performance':'skip — projecting instead'},d:'Big deadpoints and pulls, cutting feet on the big moves. Max effort every go, not volume.',r:240},
          {t:'Weighted pull-ups',id:'max-pull-wt',m:'5 × 3',ph:{'Power':'5 × 3 — explosive, faster tempo','Performance':'3 × 3 — maintain only'},d:'Currently 25kg added.',r:240},
          {t:'One-arm progression',m:'3 sets',d:'Hardest variation you hold with good form.',r:90},
          {t:'Front lever progression',m:'3 sets',d:'Hardest variation you hold with good form.',r:90},
          {t:'Reverse wrist curls',m:'3 × 20',d:'Antagonist work.',r:60}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold fingers on cold rock is how pulleys go.'},
          {t:'Project',m:'—',d:'Your outside projects — the weekend focus.'}
        ]},
      climbHard:{n:'Extra Bouldering', w:'Gym', c:'--heather', finger:2, pull:2, climb:1, note:'Not one of your three set days — only here if you climb extra and want to log it.',
        x:[{t:'Bouldering',m:'—',d:'Whatever you climbed.'}]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit — outside your three set days.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Rest from training, not from moving. An easy climb is fine — if it turns into trying hard, log it under Extra Bouldering so the plan can count it.', x:[]}
    }
  },

  /* Generic placeholder — used for anyone signing in whose email isn't
     mapped to a real program above yet. Add a PROGRAMS['<their-email>']
     entry, built around their actual weaknesses/goals, once you have
     answers for them (same as Oscar's crimps/one-arm-pull-up program
     and Joe's compression/sloper program above). */
  'default': {
    startDate:'2026-08-10',
    perWeek:4,
    phases:[
      {n:'Base', from:1, c:'--tidepool', cue:'Submaximal — build capacity, not a top set', d:'Build capacity and movement quality before loading heavy. Submaximal throughout.'},
      {n:'Max Strength', from:2, c:'--gorse', cue:'Near-maximal — heavy is correct here', d:'Near-maximal work, long rests, low set counts.'},
      {n:'Power', from:5, c:'--heather', cue:'Lighter, fast — speed over load', d:'Convert strength to speed — same movements, fewer reps, moved fast.'},
      {n:'Performance', from:6, c:'--slate', cue:'Maintain only — climbing is the real work now', d:'Structured training steps back, climbing takes over.'}
    ],
    sessions:{
      maxFingers:{n:'Finger Strength', w:'Home · 30 min', c:'--gorse', finger:3, pull:1, note:'Climbing today? This first, ideally hours before. Near-max finger work on already-tired fingers is the classic injury mechanism.',
        x:[
          {t:'Warm up',m:'15 min',d:'Pulse raise, then progressively heavier two-hand hangs on a jug before touching a small edge.'},
          {t:'Edge hangs',id:'def-hang',m:'5 × 7s',d:'20mm, two hands.',r:120},
          {t:'Open-hand hangs',id:'def-hang-open',m:'4 × 7s',d:'Same edge, open-hand grip — different tendon stress than crimping.',r:120},
          {t:'Antagonists',m:'3 sets',d:'Reverse wrist curls 3×15 · finger extensors 3×20 (a rubber band round the fingertips, opening the hand against it — no dedicated tool needed) · external rotation 3×12.'}
        ]},
      pull:{n:'Pull Strength', w:'Home · 30 min', c:'--tidepool', finger:0, pull:3, note:'Climbing today? Climb first and do this after — no finger load here, so spend them on the wall.',
        x:[
          {t:'Weighted pull-ups',id:'def-pull',m:'5 × 5',d:'Full dead hang, controlled tempo.',r:150},
          {t:'Lock-off holds',m:'4 × 8s',d:'Bent-arm hold at three joint angles across the set.',r:90},
          {t:'Rows',m:'4 × 8',d:'Ring rows or barbell rows, heavy.',r:90},
          {t:'Dips',m:'3 × 10',d:'Push antagonist work.',r:60}
        ]},
      hangboard:{n:'Hangboard', w:'Gym · 25 min', c:'--slate', finger:2, pull:1, note:'Board work before climbing, in the order below.',
        x:[
          {t:'Repeaters',id:'def-rep',m:'4–5 sets',interval:{on:7,off:3,reps:6},d:'7s on / 3s off × 6 = one set, around 55–60% of max. Two minutes between sets. Press Start below and just hang.',r:120},
          {t:'Volume climbing',m:'40 min',d:'Easy mileage, not limit attempts.'}
        ]},
      climbHard:{n:'Limit Session', w:'Gym · 90 min', c:'--heather', finger:2, pull:2, climb:1,
        x:[
          {t:'Limit bouldering',m:'50 min',d:'Hardest moves you can do with good form. This is where the session earns its keep.',r:180},
          {t:'Cool down',m:'10 min',d:'Easy traversing, then antagonist work.'}
        ]},
      outdoorHard:{n:'Outdoor', w:'Crag', c:'--heather', finger:3, pull:2, climb:1,
        x:[
          {t:'Warm up properly',m:'20 min',d:'Cold fingers on cold rock is how injuries happen.'},
          {t:'Project',m:'—',d:'Pick something that pushes you.'}
        ]},
      climbEasy:{n:'Easy Climbing', w:'Anywhere', c:'--tidepool', finger:1, pull:1, climb:1,
        x:[{t:'Mileage and movement',m:'—',d:'Nothing near limit — volume and movement quality only.'}]},
      rest:{n:'Rest', w:'—', c:'--grey', finger:0, pull:0, note:'Rest from training, not from moving. An easy climb is fine — if it turns into trying hard, log it so the plan can count it.', x:[]}
    }
  }
};
});

/** Direct port of QuizModel.swift. The mapping from answers to a
    template id is intentionally trivial (discipline + experience level
    compose directly into one of the 6 keys in templates.js) - no
    separate lookup table to keep in sync as the matrix grows. */

export type Discipline = 'bouldering' | 'sport';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type Weakness = 'slopers' | 'compression';
export type Equipment = 'hangboard' | 'pullBar' | 'gym' | 'pickupRig';
export type InjuryFlag = 'fingerPulley' | 'bicepTendon' | 'shoulder' | 'elbow';
export type RehabInjuryArea = 'fingerPulley' | 'elbowMedial' | 'elbowLateral' | 'shoulder' | 'bicepsTendon' | 'wristTFCC';
export type RehabStartingPoint = 0 | 1 | 2 | 3;

export interface QuizAnswers {
  discipline: Discipline;
  experienceLevel: ExperienceLevel;
  weaknesses: Weakness[];
  equipment: Equipment[];
  injuryFlags: InjuryFlag[];
  daysPerWeek: number;
  tripDate: string | null;
}

export type QuizResult =
  | { kind: 'standard'; answers: QuizAnswers }
  | { kind: 'rehab'; area: RehabInjuryArea; startingPhase: RehabStartingPoint };

export function templateId(discipline: Discipline, level: ExperienceLevel): string {
  return discipline + level[0].toUpperCase() + level.slice(1);
}

export function modifiersPayload(answers: QuizAnswers): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    equipment: answers.equipment,
    injuryFlags: answers.injuryFlags,
    weaknesses: answers.weaknesses,
    daysPerWeek: answers.daysPerWeek,
  };
  if (answers.tripDate) payload.tripDate = answers.tripDate;
  return payload;
}

/** Draft bands, not a definitive scale - Oscar's own call to adjust, not
    derived from anything authoritative (same caveat as the Swift
    source). Bouldering uses V-scale, sport uses French grades, matching
    templates.js's own meta descriptions. */
export function gradeRange(discipline: Discipline, level: ExperienceLevel): string {
  const table: Record<Discipline, Record<ExperienceLevel, string>> = {
    bouldering: { beginner: 'Roughly V0–V2', intermediate: 'Roughly V3–V6', advanced: 'V7 and above' },
    sport: { beginner: 'Roughly up to French 6a', intermediate: 'Roughly French 6a–6c', advanced: 'French 7a and above' },
  };
  return table[discipline][level];
}

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  bouldering: 'Bouldering', sport: 'Sport climbing',
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};

export const WEAKNESS_LABELS: Record<Weakness, string> = {
  slopers: 'Slopers / open-hand strength', compression: 'Compression / pinches',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  hangboard: 'A hangboard', pullBar: 'A pull-up bar', gym: 'Regular gym access',
  pickupRig: 'A loading pin + edge/block/roller for weighted pickups',
};

export const INJURY_FLAG_LABELS: Record<InjuryFlag, string> = {
  fingerPulley: 'Finger or pulley injury history', bicepTendon: 'Bicep tendon injury history',
  shoulder: 'Shoulder injury history', elbow: 'Elbow injury history',
};
export const INJURY_FLAG_SUBTITLES: Record<InjuryFlag, string> = {
  fingerPulley: 'A2 pulley strain, tweaked finger joints',
  bicepTendon: 'Front-of-shoulder pain from gastons or compression',
  shoulder: 'Rotator cuff, impingement, general shoulder pain',
  elbow: 'Inner-elbow pain from gripping — "climber\'s elbow"',
};

export const REHAB_AREA_LABELS: Record<RehabInjuryArea, string> = {
  fingerPulley: 'Finger / Pulley', elbowMedial: 'Elbow — Inner (Climber\'s Elbow)',
  elbowLateral: 'Elbow — Outer (Tennis Elbow)', shoulder: 'Shoulder',
  bicepsTendon: 'Biceps Tendon', wristTFCC: 'Wrist (TFCC)',
};
export const REHAB_AREA_SUBTITLES: Record<RehabInjuryArea, string> = {
  fingerPulley: 'Sharp, localized pain at the base of a finger — a strained or torn pulley',
  elbowMedial: 'Inner-elbow pain from gripping — the most common climbing elbow injury',
  elbowLateral: 'Outer-elbow pain — less common in climbers, but real',
  shoulder: 'Rotator cuff, impingement, general shoulder pain',
  bicepsTendon: 'Front-of-shoulder pain from gastons or compression',
  wristTFCC: 'Pinky-side wrist pain, often from crimping or mantling',
};

export const REHAB_STARTING_POINT_LABELS: Record<RehabStartingPoint, string> = {
  0: 'Just happened, or it still hurts at rest', 1: 'Past the worst of it, working on movement',
  2: 'Pain-free, rebuilding strength', 3: 'Nearly back to normal, easing into climbing',
};
export const REHAB_STARTING_POINT_SUBTITLES: Record<RehabStartingPoint, string> = {
  0: 'Starts at Tissue Unload', 1: 'Starts at Mobility', 2: 'Starts at Strength', 3: 'Starts at Return to Climbing',
};

export interface TemplateMeta { name: string; description: string; }

/** Hand-mirrored from templates.js's own `meta` block per template, same
    pattern as SESSION_ORDER already mirrors engine-core.js's ORDER. KEEP
    IN SYNC with templates.js if either changes. */
export const TEMPLATE_META: Record<string, TemplateMeta> = {
  boulderingBeginner: { name: 'Bouldering — Beginner', description: 'For someone newer to bouldering who wants real structure without heavy fingerboard loading on day one.' },
  boulderingIntermediate: { name: 'Bouldering — Intermediate', description: 'For someone a couple of years into bouldering who has hit the classic V3–V4 plateau.' },
  boulderingAdvanced: { name: 'Bouldering — Advanced', description: 'For someone climbing V8 and above who has already built real finger and pull strength.' },
  sportBeginner: { name: 'Sport — Beginner', description: 'For someone newer to sport climbing — endurance, not power, is the central quality here.' },
  sportIntermediate: { name: 'Sport — Intermediate', description: 'For someone a couple of years into sport climbing ready for structured power-endurance work.' },
  sportAdvanced: { name: 'Sport — Advanced', description: 'For an established sport climber training power-endurance deliberately rather than constantly.' },
};

export const REHAB_META: Record<string, TemplateMeta> = {
  fingerPulley: { name: 'Finger / Pulley', description: 'For a strained or partially torn finger pulley — built around graded, progressive re-loading rather than prolonged rest.' },
  elbowMedial: { name: 'Elbow — Inner (Climber\'s Elbow)', description: 'For pain on the inside of the elbow from gripping and pulling load — the most common elbow complaint in climbers.' },
  elbowLateral: { name: 'Elbow — Outer (Tennis Elbow)', description: 'For pain on the outside of the elbow — less common in climbers, but a real overuse injury.' },
  shoulder: { name: 'Shoulder', description: 'For general shoulder pain, impingement, or a rotator cuff strain — built around scapular control alongside rotator cuff strength.' },
  bicepsTendon: { name: 'Biceps Tendon', description: 'For front-of-shoulder pain from gastons or compression — rarely isolated, leans on scapular coordination alongside the biceps itself.' },
  wristTFCC: { name: 'Wrist (TFCC)', description: 'For pain on the pinky-side of the wrist, often from crimping or mantling — built around the wrist\'s safest natural movement pattern.' },
};

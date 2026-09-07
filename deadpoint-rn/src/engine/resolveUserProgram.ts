/** THE fix for a real, live bug: every screen that needs "this user's
    actual program" (card.tsx, calendar.tsx, day-picker.tsx, plan.tsx,
    plan-phase.tsx, session-guide.tsx) independently computed
    `PROGRAMS[email] ?? PROGRAMS.default` — meaning every real customer,
    regardless of what they answered in the quiz, saw the literal same
    generic `PROGRAMS.default` content. `src/engine/templates.js` (4 real,
    researched templates) and `src/engine/template-resolver.js` (a
    complete equipment/injury/weakness/trip-taper/onramp resolver) both
    already existed, fully built — nothing wired them to a real screen.
    See docs/superpowers/plans (or ask Oscar) for the "Task 12 left this
    as an open judgment call" history; this closes that gap.

    Kept as one function every screen calls, rather than patching each
    `PROGRAMS[email] ?? PROGRAMS.default` line in place six times over —
    a single shared source of truth for "how do we pick this user's
    program" is the whole point, not six copies that can drift again. */
const PROGRAMS = require('./programs.js');
const TEMPLATES = require('./templates.js');
const { resolveTemplate } = require('./template-resolver.js');

/** Only the profile fields this needs — narrowed rather than importing
    the full `ProfileRow` type from `src/data/useProfile.ts`, so the
    engine layer doesn't take a dependency on the data layer for a type
    alone. Every real field here is a 1:1 match to that interface. */
export interface UserProfileForProgram {
  assignedTemplateId: string | null;
  programStartDate: string;
  modifiers: Record<string, unknown>;
}

/** Mirrors `isBuiltInProgram` in `src/routing/computeRoute.ts` exactly
    (same two-part check: present in PROGRAMS, and not the shared
    'default' fallback) — duplicated rather than imported, since that
    file already reaches into `../engine/programs.js` directly and
    importing it back the other way (engine -> routing) would point the
    dependency backwards for a two-line predicate. */
function isBuiltInEmail(key: string): boolean {
  return key !== 'default' && Object.prototype.hasOwnProperty.call(PROGRAMS, key);
}

/** Returns the program object every caller already knows how to hand to
    `createEngine()` — shaped exactly like a `PROGRAMS` entry, whichever
    of the three sources below actually produced it.

    Priority, matching `computeRoute.ts`'s own built-in-first ordering:
      1. A built-in account (Oscar, Joe, Max) — their hand-authored
         program, completely unaffected by this change.
      2. A real customer with a completed standard quiz — resolves their
         actual `assignedTemplateId` template through their actual
         `modifiers`. Guarded (template exists, `programStartDate` is
         present — `resolveTemplate` itself throws without one) and
         wrapped in try/catch: a resolution failure must fall back to
         something rather than crash a real, possibly paying customer's
         entire screen.
      3. `PROGRAMS.default` — the safety net for every other case: profile
         still loading, a rehab-only account with no standard template
         assignment, or a genuine resolution failure above. */
export function resolveUserProgram(email: string | null, profile: UserProfileForProgram | null): any {
  const key = (email ?? '').toLowerCase();
  if (isBuiltInEmail(key)) return PROGRAMS[key];

  const templateId = profile?.assignedTemplateId;
  const startDate = profile?.programStartDate;
  if (templateId && startDate && TEMPLATES[templateId]) {
    try {
      return resolveTemplate(TEMPLATES[templateId], { startDate, modifiers: profile?.modifiers ?? {} });
    } catch (e) {
      console.error('resolveUserProgram: resolveTemplate failed, falling back to PROGRAMS.default:', e);
    }
  }

  return PROGRAMS.default;
}

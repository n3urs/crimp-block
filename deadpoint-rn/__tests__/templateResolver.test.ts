// __tests__/templateResolver.test.ts
// First dedicated test file for template-resolver.js — its own top
// comment says a bug here is just as capable of handing someone a wrong
// recommendation as a bug in engine-core.js itself, so this shouldn't
// stay untested just because it predates this file.
const TemplateResolver = require('../src/engine/template-resolver.js');
const TEMPLATES = require('../src/engine/templates.js');

describe('applyMaxFingersMethod', () => {
  function sessions() {
    return {
      maxFingers: {
        x: [
          { t: 'Warm up' }, // untagged — must survive every case
          { t: 'Max hang', method: 'hangboard' },
          { t: 'Weighted pickup', method: 'pickup' },
        ],
      },
    };
  }

  test('no preference set: both sides of the choice survive, same as before this feature existed', () => {
    const s = sessions();
    TemplateResolver.applyMaxFingersMethod(s, null);
    expect(s.maxFingers.x.map((e: any) => e.t)).toEqual(['Warm up', 'Max hang', 'Weighted pickup']);
  });

  test("preference 'hangboard': the pickup side is removed, hangboard and untagged survive", () => {
    const s = sessions();
    TemplateResolver.applyMaxFingersMethod(s, 'hangboard');
    expect(s.maxFingers.x.map((e: any) => e.t)).toEqual(['Warm up', 'Max hang']);
  });

  test("preference 'pickup': the hangboard side is removed, pickup and untagged survive", () => {
    const s = sessions();
    TemplateResolver.applyMaxFingersMethod(s, 'pickup');
    expect(s.maxFingers.x.map((e: any) => e.t)).toEqual(['Warm up', 'Weighted pickup']);
  });
});

describe('resolveTemplate + maxFingersMethod, against the real templates', () => {
  // Every real template's maxFingers session must carry exactly one
  // hangboard-tagged and one pickup-tagged exercise (or, for
  // boulderingAdvanced, two hangboard-tagged for its MAW/MED cycle) —
  // this is the exact class of "stray leftover" bug a future edit to
  // one template without touching the others would produce.
  test.each(['boulderingIntermediate', 'boulderingAdvanced', 'sportIntermediate', 'sportAdvanced'])(
    '%s has both a hangboard and a pickup option for Max Fingers',
    (templateId) => {
      const x = TEMPLATES[templateId].sessions.maxFingers.x;
      expect(x.some((e: any) => e.method === 'hangboard')).toBe(true);
      expect(x.some((e: any) => e.method === 'pickup')).toBe(true);
    }
  );

  test('a real template resolved with the pickup preference drops the hangboard exercises, keeps everything else', () => {
    const program = TemplateResolver.resolveTemplate(TEMPLATES.boulderingAdvanced, {
      startDate: '2026-01-01',
      modifiers: { equipment: ['pickupRig'], maxFingersMethod: 'pickup' },
    });
    const titles = program.sessions.maxFingers.x.map((e: any) => e.t);
    expect(titles).not.toContain('Max hang — added weight (MAW)');
    expect(titles).not.toContain('Max hang — minimum edge (MED)');
    expect(titles).toContain('Weighted pickup — 20mm edge');
    expect(titles).toContain('Warm up');
  });

  test('the hangboard preference drops the pickup exercise instead', () => {
    const program = TemplateResolver.resolveTemplate(TEMPLATES.boulderingAdvanced, {
      startDate: '2026-01-01',
      modifiers: { equipment: ['pickupRig'], maxFingersMethod: 'hangboard' },
    });
    const titles = program.sessions.maxFingers.x.map((e: any) => e.t);
    expect(titles).toContain('Max hang — added weight (MAW)');
    expect(titles).toContain('Max hang — minimum edge (MED)');
    expect(titles).not.toContain('Weighted pickup — 20mm edge');
  });

  test('no preference and no pickupRig equipment: unchanged from before this feature — only the hangboard exercises show', () => {
    const program = TemplateResolver.resolveTemplate(TEMPLATES.boulderingAdvanced, {
      startDate: '2026-01-01',
      modifiers: { equipment: [] },
    });
    const titles = program.sessions.maxFingers.x.map((e: any) => e.t);
    expect(titles).toContain('Max hang — added weight (MAW)');
    // filterEquipment (not applyMaxFingersMethod) is what removes this —
    // no pickupRig equipment means it was never in the running at all.
    expect(titles).not.toContain('Weighted pickup — 20mm edge');
  });
});

describe('applyOnramp', () => {
  function program(): any {
    return {
      phases: [{ n: 'Strength Base' }, { n: 'Power' }],
      sessions: {
        maxFingers: {
          x: [
            { t: 'Warm up' }, // no `onramp` field — must survive untouched
            { t: 'Max hang', m: '4 x 8s', onramp: '3 x 8s — easier edge' },
          ],
        },
      },
    };
  }

  test('priorTraining: false merges onramp text into the first phase\'s ph override', () => {
    const p = program();
    TemplateResolver.applyOnramp(p, false);
    expect(p.sessions.maxFingers.x[1].ph).toEqual({ 'Strength Base': '3 x 8s — easier edge' });
    expect(p.sessions.maxFingers.x[0].ph).toBeUndefined(); // untagged exercise untouched
  });

  test('priorTraining: true is a no-op, same as before this feature existed', () => {
    const p = program();
    TemplateResolver.applyOnramp(p, true);
    expect(p.sessions.maxFingers.x[1].ph).toBeUndefined();
  });

  test('priorTraining: null (never asked) is a no-op', () => {
    const p = program();
    TemplateResolver.applyOnramp(p, null);
    expect(p.sessions.maxFingers.x[1].ph).toBeUndefined();
  });

  test('merges into an existing ph object rather than clobbering other phase overrides', () => {
    const p = program();
    p.sessions.maxFingers.x[1].ph = { Power: '5 x 5s' };
    TemplateResolver.applyOnramp(p, false);
    expect(p.sessions.maxFingers.x[1].ph).toEqual({ Power: '5 x 5s', 'Strength Base': '3 x 8s — easier edge' });
  });

  test('a real intermediate template resolved with priorTraining false eases the first phase only', () => {
    const resolved = TemplateResolver.resolveTemplate(TEMPLATES.boulderingIntermediate, {
      startDate: '2026-01-01',
      modifiers: { priorTraining: false },
    });
    const hang = resolved.sessions.maxFingers.x.find((e: any) => e.id === 'tpl-int-maxhang');
    expect(hang.ph['Strength Base']).toMatch(/^3 × 8s/);
    expect(hang.ph['Power']).toMatch(/^5 × 5s/); // pre-existing override untouched
    expect(hang.m).toBe('4 × 8s'); // base prescription itself is unchanged — engine-core reads ph, not m, once resolved
  });

  test('the advanced template has no onramp text — priorTraining false is a no-op there', () => {
    const resolved = TemplateResolver.resolveTemplate(TEMPLATES.boulderingAdvanced, {
      startDate: '2026-01-01',
      modifiers: { priorTraining: false },
    });
    const hang = resolved.sessions.maxFingers.x.find((e: any) => e.id === 'tpl-adv-maw');
    expect(hang.ph.Base).not.toMatch(/easier edge|noticeably bigger/);
  });
});

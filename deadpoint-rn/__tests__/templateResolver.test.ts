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

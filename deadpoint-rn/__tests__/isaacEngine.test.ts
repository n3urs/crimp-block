// __tests__/isaacEngine.test.ts
// Isaac's engine is deliberately separate from the shared climbing engine
// (engine-core.js) — see isaacEngine.ts's own doc comment for why. These
// tests cover the three algorithms his spec doc actually specifies:
// RPE-deviation weight reduction, Push-day 48h spacing, and the fixed
// 6-day rotation — plus the weight-resolution logic (1RM percentages,
// neverBump).
import {
  checkRpeDeviation, checkPushSpacing, nextInRotation, isaacDecide,
  weekNumberSince, isIsaac, resolveIsaacExercises, isaacAddDays,
  checkPushSpacingForKey,
} from '../src/engine/isaac/isaacEngine';
import { phaseForWeek, ISAAC_BASELINE } from '../src/engine/isaac/isaacProgram';

describe('isIsaac', () => {
  test('matches case-insensitively', () => {
    expect(isIsaac('phillipsisaac14@gmail.com')).toBe(true);
    expect(isIsaac('PhillipsIsaac14@Gmail.com')).toBe(true);
  });
  test('does not match anyone else, or null', () => {
    expect(isIsaac('oscar@sullivanltd.co.uk')).toBe(false);
    expect(isIsaac(null)).toBe(false);
    expect(isIsaac(undefined)).toBe(false);
  });
});

describe('checkRpeDeviation — section 3A', () => {
  test('at or under target: no reduction', () => {
    expect(checkRpeDeviation(8, 8)).toEqual({ shouldReduce: false, reduceByKg: 0, message: '' });
    expect(checkRpeDeviation(7, 8)).toEqual({ shouldReduce: false, reduceByKg: 0, message: '' });
  });
  test('exactly the +1.0 deviation the doc\'s rule is keyed on: reduces', () => {
    const r = checkRpeDeviation(9, 8);
    expect(r.shouldReduce).toBe(true);
    expect(r.reduceByKg).toBe(2.5);
    expect(r.message).toContain('2.5kg');
  });
  test('further over target scales within the doc\'s 2.5-5kg range, capped at 5', () => {
    expect(checkRpeDeviation(10, 8).reduceByKg).toBe(5); // 2 over -> 5kg, at the cap
    expect(checkRpeDeviation(12, 8).reduceByKg).toBe(5); // way over -> still capped, not unbounded
  });
});

describe('checkPushSpacing — section 3C', () => {
  test('no prior Push day logged: no warning', () => {
    expect(checkPushSpacing(null, '2026-09-10')).toEqual({ warn: false, message: '' });
  });
  test('less than 48h (under 2 full calendar days) since last Push: warns', () => {
    const r = checkPushSpacing('2026-09-09', '2026-09-10'); // 1 day apart = 24h
    expect(r.warn).toBe(true);
    expect(r.message).toContain('CNS Warning');
  });
  test('exactly 48h (2 full days) or more: no warning', () => {
    expect(checkPushSpacing('2026-09-08', '2026-09-10').warn).toBe(false); // 2 days = 48h exactly
    expect(checkPushSpacing('2026-09-01', '2026-09-10').warn).toBe(false);
  });
});

describe('nextInRotation — fixed 6-day split, not a fatigue-scored pick', () => {
  test('brand new account with no log: starts at the top of the rotation', () => {
    expect(nextInRotation({}, '2026-09-10')).toBe('pushHeavy');
  });
  test('advances one slot at a time through the full 7-slot cycle', () => {
    const order: string[] = ['pushHeavy', 'pullHeavy', 'pushSecondary', 'legs', 'pushSpeed', 'pullSpeed', 'rest'];
    let date = '2026-09-01';
    for (let i = 0; i < order.length; i++) {
      const log = { [date]: { t: order[i] } };
      const expected = order[(i + 1) % order.length];
      expect(nextInRotation(log, isaacAddDays(date, 1))).toBe(expected);
    }
  });
  test('only looks at the most recent logged day, not the whole history', () => {
    const log = { '2026-09-01': { t: 'pushHeavy' }, '2026-09-05': { t: 'legs' } };
    expect(nextInRotation(log, '2026-09-06')).toBe('pushSpeed'); // next after legs, ignoring the older pushHeavy entry
  });
});

describe('isaacDecide — reasoning text', () => {
  test('non-Push next session: plain rotation reasoning, no CNS warning', () => {
    const log = { '2026-09-08': { t: 'pushHeavy' } }; // next = pullHeavy
    const d = isaacDecide(log, '2026-09-09');
    expect(d.k).toBe('pullHeavy');
    expect(d.why).not.toContain('CNS');
  });
  test('under strict day-by-day adherence, decide()\'s own suggestion can never itself land a Push within 48h of the last one', () => {
    // The rotation always interposes a non-Push slot between any two Push
    // slots, so the earliest a fresh nextInRotation() call can compute a
    // Push is always >=2 real days after the last actual Push, by
    // construction. This is a structural property of the fixed order, not
    // an oversight — verified directly rather than assumed, walking every
    // possible one-day-apart sequence.
    const order = ['pushHeavy', 'pullHeavy', 'pushSecondary', 'legs', 'pushSpeed', 'pullSpeed', 'rest'];
    let date = '2026-09-01';
    const log: Record<string, { t: string }> = {};
    for (let i = 0; i < 14; i++) {
      const d = isaacDecide(log, date);
      expect(d.why).not.toContain('CNS');
      log[date] = { t: d.k };
      date = isaacAddDays(date, 1);
    }
    void order;
  });
});

describe('checkPushSpacingForKey — the real trigger case: free-browsing to a Push day the app did not just recommend', () => {
  test('doc\'s own worked example: three Push days compounding in a short window', () => {
    // Mon: pushHeavy (on-plan). Tue: Isaac overrides and trains
    // pushSecondary instead of the recommended pullHeavy. Wed: he
    // overrides again into pushSpeed instead of the recommended legs —
    // this third Push day, only 1 real day after Tuesday's, is exactly
    // the doc's "compounding Push days" scenario, and must warn.
    const log = { '2026-09-07': { t: 'pushHeavy' }, '2026-09-08': { t: 'pushSecondary' } };
    const r = checkPushSpacingForKey(log, 'pushSpeed', '2026-09-09');
    expect(r.warn).toBe(true);
    expect(r.message).toContain('CNS Warning');
  });
  test('a non-Push key never warns, regardless of history', () => {
    const log = { '2026-09-08': { t: 'pushHeavy' } };
    expect(checkPushSpacingForKey(log, 'legs', '2026-09-09').warn).toBe(false);
  });
  test('training the SAME Push type again the very next day also warns', () => {
    const log = { '2026-09-08': { t: 'pushHeavy' } };
    expect(checkPushSpacingForKey(log, 'pushHeavy', '2026-09-09').warn).toBe(true);
  });
});

describe('weekNumberSince / phaseForWeek — linear 10-week arc, not a repeating block', () => {
  test('week 1 covers the first 7 days from start', () => {
    expect(weekNumberSince('2026-09-01', '2026-09-01')).toBe(1);
    expect(weekNumberSince('2026-09-01', '2026-09-07')).toBe(1);
    expect(weekNumberSince('2026-09-01', '2026-09-08')).toBe(2);
  });
  test('phase mapping matches the doc\'s week ranges exactly', () => {
    expect(phaseForWeek(1).n).toBe('Re-entry');
    expect(phaseForWeek(2).n).toBe('Mass Construction');
    expect(phaseForWeek(6).n).toBe('Mass Construction');
    expect(phaseForWeek(7).n).toBe('Intensification');
    expect(phaseForWeek(9).n).toBe('Intensification');
    expect(phaseForWeek(10).n).toBe('Peak & Test');
  });
  test('weeks past 10 hold at Peak & Test rather than erroring or repeating week 1 — Oscar\'s own "not decided yet" call', () => {
    expect(phaseForWeek(11).n).toBe('Peak & Test');
    expect(phaseForWeek(52).n).toBe('Peak & Test');
  });
});

describe('resolveIsaacExercises — weight resolution', () => {
  test('Close-Grip Bench computes as a real percentage of the logged Bench 1RM, not the doc\'s example number forever', () => {
    const loadLog = { 'isaac-bench-1rm': [{ date: '2026-09-01', kg: 135 }] };
    const exercises = resolveIsaacExercises('pushSecondary', 'Mass Construction', loadLog, false);
    const closeGrip = exercises.find((e) => e.title === 'Close-Grip Bench')!;
    expect(closeGrip.prescription).toContain('99kg'); // round(135 * 0.73) = 98.55 -> 99
  });
  test('with no logged 1RM yet, falls back to the doc\'s baseline (130kg)', () => {
    const closeGrip = resolveIsaacExercises('pushSecondary', 'Mass Construction', undefined, false)
      .find((e) => e.title === 'Close-Grip Bench')!;
    expect(closeGrip.prescription).toContain(`${Math.round(ISAAC_BASELINE.benchOneRepMax * 0.73)}kg`);
  });
  test('Explosive Pull-Ups: fixed at the baseline weight, never tracked/editable', () => {
    const ex = resolveIsaacExercises('pullSpeed', 'Mass Construction', undefined, false)
      .find((e) => e.title === 'Explosive Pull-Ups')!;
    expect(ex.weightKg).toBe(ISAAC_BASELINE.explosivePullupBaselineKg);
    expect(ex.hasWeightTracking).toBe(false);
  });
  test('a normal tracked exercise (Weighted Pull-Ups) uses the most recently logged weight', () => {
    const loadLog = { 'isaac-pullup': [{ date: '2026-09-01', kg: 15 }, { date: '2026-09-08', kg: 17.5 }] };
    const ex = resolveIsaacExercises('pullHeavy', 'Mass Construction', loadLog, false)
      .find((e) => e.title === 'Weighted Pull-Ups')!;
    expect(ex.weightKg).toBe(17.5);
    expect(ex.hasWeightTracking).toBe(true);
  });
  test('Test Day swaps in for pushHeavy only when explicitly requested', () => {
    const normal = resolveIsaacExercises('pushHeavy', 'Peak & Test', undefined, false);
    const testDay = resolveIsaacExercises('pushHeavy', 'Peak & Test', undefined, true);
    expect(normal.some((e) => e.title.includes('Attempt'))).toBe(false);
    expect(testDay.some((e) => e.title.includes('Attempt 3'))).toBe(true);
  });
});

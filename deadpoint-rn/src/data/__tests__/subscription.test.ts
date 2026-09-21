import { hasEntitlement, trialLabel, willRenewEntitlement } from '../subscription';

test('reads the named entitlement from a RevenueCat CustomerInfo shape', () => {
  expect(hasEntitlement({ entitlements: { active: { standard: {} } } } as any, 'standard')).toBe(true);
});

test('a DIFFERENT active entitlement does not grant access', () => {
  expect(hasEntitlement({ entitlements: { active: { other: {} } } } as any, 'standard')).toBe(false);
});

test('no active entitlements means no access', () => {
  expect(hasEntitlement({ entitlements: { active: {} } } as any, 'standard')).toBe(false);
});

test('a malformed or absent CustomerInfo denies access rather than granting it', () => {
  expect(hasEntitlement(null as any, 'standard')).toBe(false);
  expect(hasEntitlement({} as any, 'standard')).toBe(false);
  expect(hasEntitlement({ entitlements: {} } as any, 'standard')).toBe(false);
});

// trialLabel used to be hardcoded on the paywall screen to "7-DAY FREE
// TRIAL" for the monthly tier regardless of what RevenueCat actually had
// configured — a user could be told "start free trial" and then get
// charged immediately, since the claim never read real data at all.
function pkgWithIntro(introPrice: { price: number; periodUnit: string; periodNumberOfUnits: number } | null) {
  return { product: { introPrice } } as any;
}

test('trialLabel: no package means no trial claimed', () => {
  expect(trialLabel(null)).toBeNull();
});

test('trialLabel: no introPrice configured means no trial claimed', () => {
  expect(trialLabel(pkgWithIntro(null))).toBeNull();
});

test('trialLabel: a paid introductory price is not called a free trial', () => {
  expect(trialLabel(pkgWithIntro({ price: 0.99, periodUnit: 'MONTH', periodNumberOfUnits: 1 }))).toBeNull();
});

test('trialLabel: a genuine free intro price produces the real trial length', () => {
  expect(trialLabel(pkgWithIntro({ price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 }))).toBe('7-DAY FREE TRIAL');
});

test('trialLabel: stays singular in the adjectival position regardless of n', () => {
  expect(trialLabel(pkgWithIntro({ price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 2 }))).toBe('2-WEEK FREE TRIAL');
});

// Deleting an account doesn't cancel an Apple/Google subscription, so the
// delete flow warns anyone the store will keep billing. A customer who has
// already cancelled is still entitled until the period ends but must NOT
// be told they'll keep being charged.
test('willRenewEntitlement: active and renewing warns', () => {
  const info = { entitlements: { active: { standard: { willRenew: true } } } } as any;
  expect(willRenewEntitlement(info, 'standard')).toBe(true);
});

test('willRenewEntitlement: active but already cancelled does not warn', () => {
  const info = { entitlements: { active: { standard: { willRenew: false } } } } as any;
  expect(hasEntitlement(info, 'standard')).toBe(true);
  expect(willRenewEntitlement(info, 'standard')).toBe(false);
});

test('willRenewEntitlement: no entitlement, another entitlement, or malformed info never warns', () => {
  expect(willRenewEntitlement({ entitlements: { active: {} } } as any, 'standard')).toBe(false);
  expect(willRenewEntitlement({ entitlements: { active: { other: { willRenew: true } } } } as any, 'standard')).toBe(false);
  expect(willRenewEntitlement(null, 'standard')).toBe(false);
  expect(willRenewEntitlement({} as any, 'standard')).toBe(false);
});

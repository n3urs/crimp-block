import { hasEntitlement } from '../subscription';

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

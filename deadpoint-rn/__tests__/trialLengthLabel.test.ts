import { trialLengthLabel } from '../src/data/subscription';
import type { PurchasesPackage } from 'react-native-purchases';

// Minimal fixture — only the fields trialLengthLabel actually reads.
// PurchasesPackage's real shape comes from the RevenueCat SDK; casting
// through unknown avoids pinning this test to fields the function never
// touches.
function pkgWithIntro(price: number, periodNumberOfUnits: number, periodUnit: string): PurchasesPackage {
  return { product: { introPrice: { price, periodNumberOfUnits, periodUnit } } } as unknown as PurchasesPackage;
}

test('trialLengthLabel pluralizes a multi-unit free trial', () => {
  expect(trialLengthLabel(pkgWithIntro(0, 7, 'DAY'))).toBe('7 days');
});

test('trialLengthLabel keeps a single-unit trial singular', () => {
  expect(trialLengthLabel(pkgWithIntro(0, 1, 'WEEK'))).toBe('1 week');
});

test('trialLengthLabel returns null for a paid introductory price — a discount, not a free trial', () => {
  expect(trialLengthLabel(pkgWithIntro(0.99, 1, 'MONTH'))).toBeNull();
});

test('trialLengthLabel returns null when there is no introductory offer at all', () => {
  expect(trialLengthLabel({ product: {} } as unknown as PurchasesPackage)).toBeNull();
});

test('trialLengthLabel returns null for a null package', () => {
  expect(trialLengthLabel(null)).toBeNull();
});

/** normaliseReferralCode — the pure decision behind Settings' referral-code
    entry (see src/data/referralCode.ts). Two things matter: it's a
    one-way door (never overwrites an existing code), and it normalises
    so the admin dashboard's grouping isn't split by capitalisation or
    stray whitespace a friend typed. */
import { normaliseReferralCode } from '../src/data/referralCode';

test('a fresh code is trimmed and lowercased', () => {
  expect(normaliseReferralCode('  Joe  ', null)).toBe('joe');
  expect(normaliseReferralCode('JOE', null)).toBe('joe');
});

test('refuses once a code is already set — a one-way door', () => {
  expect(normaliseReferralCode('ash', 'joe')).toBeNull();
  // Even typing the SAME code again is still a refusal, not a no-op
  // success — there's nothing to write, so the caller must not send one.
  expect(normaliseReferralCode('joe', 'joe')).toBeNull();
});

test('refuses blank or whitespace-only input', () => {
  expect(normaliseReferralCode('', null)).toBeNull();
  expect(normaliseReferralCode('   ', null)).toBeNull();
});

test('different real people typing the same word land on the same code', () => {
  expect(normaliseReferralCode('Joe', null)).toBe(normaliseReferralCode(' joe', null));
});

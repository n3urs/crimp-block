/** shareInvite — the pure half of Settings' "Invite a friend" row. The
    property that matters: the code a sharer sends is the exact string
    the referral field stores after normalisation, so the admin
    dashboard's `referred_by` column shows it verbatim and it can be
    traced back to the sharer's user id. */
import { inviteMessage, shareCodeForUser, SHARE_URL } from '../src/data/shareInvite';
import { normaliseReferralCode } from '../src/data/referralCode';

const USER_ID = '3F2A9C1E-77B4-4E0A-9D55-0C1B2A3D4E5F';

test('the code is a short, lowercase prefix of the user id', () => {
  expect(shareCodeForUser(USER_ID)).toBe('dp-3f2a9c');
});

test('the code survives referral normalisation unchanged, so it can be traced back', () => {
  const code = shareCodeForUser(USER_ID);
  expect(normaliseReferralCode(code, null)).toBe(code);
  expect(normaliseReferralCode(code.toUpperCase(), null)).toBe(code);
  expect(USER_ID.toLowerCase().startsWith(code.slice('dp-'.length))).toBe(true);
});

test('two different users get different codes', () => {
  expect(shareCodeForUser(USER_ID)).not.toBe(shareCodeForUser('9a1b2c3d-0000-4000-8000-000000000000'));
});

test('the message carries the site link and the sharer\'s code, and promises nothing', () => {
  const message = inviteMessage('dp-3f2a9c');
  expect(message).toContain(SHARE_URL);
  expect(message).toContain('dp-3f2a9c');
  expect(message.toLowerCase()).not.toMatch(/free|reward|discount/);
});

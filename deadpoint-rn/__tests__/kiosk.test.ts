/** isKioskEmail — which accounts turn a device into the locked-down gym
    station (see src/data/kiosk.ts). Exact match on a short list, so no
    ordinary user can land in it by accident. */
import { isKioskEmail, KIOSK_EMAILS } from '../src/data/kiosk';

test('the configured kiosk address is recognised, case and whitespace aside', () => {
  const email = KIOSK_EMAILS[0];
  expect(isKioskEmail(email)).toBe(true);
  expect(isKioskEmail(email.toUpperCase())).toBe(true);
  expect(isKioskEmail(`  ${email} `)).toBe(true);
});

test('ordinary accounts and empty values are not kiosks', () => {
  expect(isKioskEmail('someone@example.com')).toBe(false);
  expect(isKioskEmail('oscar@sullivanltd.co.uk')).toBe(false);
  expect(isKioskEmail(null)).toBe(false);
  expect(isKioskEmail('')).toBe(false);
});

test('no partial matches: a longer address containing the kiosk one is not a kiosk', () => {
  expect(isKioskEmail(`x${KIOSK_EMAILS[0]}`)).toBe(false);
  expect(isKioskEmail(`${KIOSK_EMAILS[0]}.evil.com`)).toBe(false);
});

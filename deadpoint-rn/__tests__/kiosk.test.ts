/** isKioskCode — the code word typed at sign-in that turns a device into the
    gym station (see src/data/kiosk.ts). Exact match, so nothing an ordinary
    user types can trigger it by accident. */
import { isKioskCode, KIOSK_CODE_WORDS } from '../src/data/kiosk';

test('the code word is recognised, ignoring case and surrounding spaces', () => {
  const word = KIOSK_CODE_WORDS[0];
  expect(isKioskCode(word)).toBe(true);
  expect(isKioskCode(word.toUpperCase())).toBe(true);
  expect(isKioskCode(`  ${word} `)).toBe(true);
});

test('ordinary emails and empty input are not the code word', () => {
  expect(isKioskCode('someone@example.com')).toBe(false);
  expect(isKioskCode('oscar@sullivanltd.co.uk')).toBe(false);
  expect(isKioskCode(null)).toBe(false);
  expect(isKioskCode('')).toBe(false);
});

test('no partial matches: text merely containing the word is not the code word', () => {
  expect(isKioskCode(`${KIOSK_CODE_WORDS[0]}@example.com`)).toBe(false);
  expect(isKioskCode(`my ${KIOSK_CODE_WORDS[0]}`)).toBe(false);
  expect(isKioskCode(KIOSK_CODE_WORDS[0].slice(0, -1))).toBe(false);
});

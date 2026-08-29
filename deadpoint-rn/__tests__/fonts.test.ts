import { Fonts } from '../src/design/fonts';

test('heading uses Archivo Black, matching AppFonts.heading', () => {
  expect(Fonts.heading(32)).toEqual({ fontFamily: 'ArchivoBlack-Regular', fontSize: 32 });
});

test('mono picks the bold cut for bold-ish weights, matching AppFonts.mono', () => {
  // AppFonts.boldWeights = [.bold, .heavy, .black, .semibold]
  expect(Fonts.mono(12, 'bold').fontFamily).toBe('RobotoMono-Bold');
  expect(Fonts.mono(12, 'semibold').fontFamily).toBe('RobotoMono-Bold');
  expect(Fonts.mono(12, 'medium').fontFamily).toBe('RobotoMono-Medium');
});

test('mono defaults to bold, matching the Swift default parameter', () => {
  expect(Fonts.mono(12).fontFamily).toBe('RobotoMono-Bold');
});

test('timer digits use Space Mono', () => {
  expect(Fonts.timerDigits(48).fontFamily).toBe('SpaceMono-Bold');
});

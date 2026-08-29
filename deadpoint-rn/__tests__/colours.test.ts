import { Colours, resolveColour } from '../src/design/colours';

test('base palette matches SessionColours.swift exactly', () => {
  expect(Colours.bg).toBe('#181B22');
  expect(Colours.s1).toBe('#1E222B');
  expect(Colours.s2).toBe('#272C37');
  expect(Colours.s3).toBe('#333947');
  expect(Colours.s4).toBe('#454C5C');
  expect(Colours.fg).toBe('#EDEBE5');
  expect(Colours.dim).toBe('#9AA0AE');
  expect(Colours.faint).toBe('#666C7A');
  expect(Colours.go).toBe('#1FA24A');
  expect(Colours.restC).toBe('#D6383D');
  expect(Colours.readyC).toBe('#D69A1F');
});

test('named colours resolve like SessionColours.resolve', () => {
  expect(resolveColour('--gorse')).toBe('#F2B134');
  expect(resolveColour('--tidepool')).toBe('#4FB3A5');
  expect(resolveColour('--slate')).toBe('#7B93E0');
  expect(resolveColour('--heather')).toBe('#C9739B');
  expect(resolveColour('--grey')).toBe('#5A6069');
});

test('unknown names fall back to --gorse, matching Swift', () => {
  expect(resolveColour('--nonsense')).toBe('#F2B134');
});

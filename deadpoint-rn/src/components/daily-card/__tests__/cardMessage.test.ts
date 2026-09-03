import { cardMessage } from '../cardMessage';

const base = {
  sessionKey: 'maxFingers',
  isDeload: false,
  isReturning: false,
  isClimb: false,
  isLogged: false,
  note: null as string | null,
};

test('a deload week explains that the numbers below are ALREADY cut', () => {
  expect(cardMessage({ ...base, isDeload: true })).toBe(
    'Deload week — same weights as usual, fewer sets. The numbers below are already cut.'
  );
});

test('a deload week on a CLIMBING session talks in attempts, not sets', () => {
  expect(cardMessage({ ...base, isDeload: true, isClimb: true, sessionKey: 'climbHard' })).toBe(
    'Deload week — fewer hard attempts, and stop well short of failure. Times below are already cut.'
  );
});

test('easing back in after a break warns that WEIGHTS are cut, not just sets', () => {
  expect(cardMessage({ ...base, isReturning: true })).toContain('weights are cut, not just sets');
});

test('deload outranks easing-back when somehow both are set — matches Swift\'s if/else-if order', () => {
  const msg = cardMessage({ ...base, isDeload: true, isReturning: true });
  expect(msg).toContain('Deload week');
  expect(msg).not.toContain('Easing back');
});

test('neither guidance message appears on a rest day — nothing to cut', () => {
  expect(cardMessage({ ...base, sessionKey: 'rest', isDeload: true })).toBe('');
  expect(cardMessage({ ...base, sessionKey: 'rest', isReturning: true })).toBe('');
});

test('guidance OUTRANKS the session note — the note is what it replaced before this was ported', () => {
  expect(cardMessage({ ...base, isDeload: true, note: 'Climbing today? This first, then the gym.' }))
    .toContain('Deload week');
});

test('falls back to LOGGED, then the note, then empty', () => {
  expect(cardMessage({ ...base, isLogged: true })).toBe('LOGGED');
  expect(cardMessage({ ...base, note: 'Board work before climbing.' })).toBe('Board work before climbing.');
  expect(cardMessage(base)).toBe('');
});

test('LOGGED outranks the note, so a logged day reads as done rather than as instructions', () => {
  expect(cardMessage({ ...base, isLogged: true, note: 'Board work before climbing.' })).toBe('LOGGED');
});

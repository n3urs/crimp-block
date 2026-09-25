/** shouldAskForReview — when the in-app rating prompt may appear. It only
    ever fires on the moment someone logs a session (a good moment), only
    after they've genuinely used the app for a while, and never more than
    once every few months. No reward is tied to it (App Store guideline
    3.2.2(x) forbids incentivising ratings). */
jest.mock('expo-store-review', () => ({ isAvailableAsync: jest.fn(), requestReview: jest.fn() }));
import { shouldAskForReview, MIN_LOGGED_DAYS, MIN_GAP_DAYS } from '../src/data/reviewPrompt';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25);

test('never asks a new user', () => {
  expect(shouldAskForReview(1, null, NOW)).toBe(false);
  expect(shouldAskForReview(MIN_LOGGED_DAYS - 1, null, NOW)).toBe(false);
});

test('asks once someone has logged enough days and was never asked', () => {
  expect(shouldAskForReview(MIN_LOGGED_DAYS, null, NOW)).toBe(true);
});

test('does not ask again inside the gap, asks again after it', () => {
  expect(shouldAskForReview(30, NOW - (MIN_GAP_DAYS - 1) * DAY, NOW)).toBe(false);
  expect(shouldAskForReview(30, NOW - MIN_GAP_DAYS * DAY, NOW)).toBe(true);
});

test('a last-asked time in the future (clock change) does not block forever', () => {
  expect(shouldAskForReview(30, NOW + 400 * DAY, NOW)).toBe(true);
});

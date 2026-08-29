import { createLoggedStampTimer } from '../src/components/daily-card/LoggedStamp';

jest.useFakeTimers();

test('becomes visible 1000ms after trigger, not before', () => {
  const calls: boolean[] = [];
  const timer = createLoggedStampTimer((visible) => calls.push(visible));
  timer.trigger();
  expect(calls).toEqual([false]);
  jest.advanceTimersByTime(999);
  expect(calls).toEqual([false]);
  jest.advanceTimersByTime(1);
  expect(calls).toEqual([false, true]);
});

test('auto-dismisses after a 2500ms hold', () => {
  const calls: boolean[] = [];
  const timer = createLoggedStampTimer((visible) => calls.push(visible));
  timer.trigger();
  jest.advanceTimersByTime(1000);
  expect(calls).toEqual([false, true]);
  jest.advanceTimersByTime(2499);
  expect(calls).toEqual([false, true]);
  jest.advanceTimersByTime(1);
  expect(calls).toEqual([false, true, false]);
});

test('a re-trigger during the hold cancels the first dismiss timer, not the second reveal', () => {
  const calls: boolean[] = [];
  const timer = createLoggedStampTimer((visible) => calls.push(visible));
  timer.trigger();
  jest.advanceTimersByTime(1000); // first card now visible, 2500ms hold started
  jest.advanceTimersByTime(1000); // 1000ms into the hold
  timer.trigger(); // undo + immediate re-log — must cancel the first hold's dismiss timer
  expect(calls).toEqual([false, true, false]); // hidden immediately, no animation
  // The first hold's dismiss would otherwise fire 1500ms from here (hold started
  // at t=1000, holds 2500ms, we're at t=2000) — advance past that point and
  // confirm only the SECOND trigger's own reveal happens, nothing extra.
  jest.advanceTimersByTime(1000); // completes the second trigger's own 1000ms delay
  expect(calls).toEqual([false, true, false, true]);
});

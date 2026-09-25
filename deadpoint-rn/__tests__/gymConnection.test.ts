/** gymConnectionNotice — what the gym station tells people while it isn't
    connected to the gauge. The important case: the gauge's own battery
    saving switches it off, and the only fix is to power-cycle it by hand,
    so once the station HAS been connected, a drop must say exactly that
    instead of the generic "looking for the gauge" it shows at start-up. */
import { gymConnectionNotice } from '../src/data/forceGauge/gymConnection';

test('nothing to say while connected', () => {
  expect(gymConnectionNotice('connected', false)).toBeNull();
  expect(gymConnectionNotice('connected', true)).toBeNull();
});

test('at start-up it is just looking, or connecting, with the normal hint', () => {
  for (const status of ['idle', 'scanning', 'scanDone', 'error'] as const) {
    const n = gymConnectionNotice(status, false)!;
    expect(n.lost).toBe(false);
    expect(n.headline).toMatch(/looking for the force gauge/i);
    expect(n.hint).toMatch(/switch the gauge on/i);
  }
  expect(gymConnectionNotice('connecting', false)!.headline).toMatch(/connecting/i);
});

test('after a drop it says the gauge turned off and how to bring it back', () => {
  for (const status of ['idle', 'scanning', 'scanDone', 'error'] as const) {
    const n = gymConnectionNotice(status, true)!;
    expect(n.lost).toBe(true);
    expect(n.headline).toMatch(/turned off/i);
    expect(n.hint).toMatch(/off, then on again/i);
    expect(n.hint).toMatch(/by itself/i);
  }
});

test('once the gauge is found again it stops shouting and says it is reconnecting', () => {
  const n = gymConnectionNotice('connecting', true)!;
  expect(n.lost).toBe(false);
  expect(n.headline).toMatch(/reconnecting/i);
});

/** launchPhysics — the Launch game's rules (src/components/force-gauge/LaunchGame.tsx).
    Spec: docs/superpowers/specs/2026-09-26-launch-game-design.md. */
import {
  CHARGE_SEC, LANDMARKS, MIN_RESULT_SEC,
  altitudeForKg, flightDurationSec, flightLevel, formatAltitude, initialLaunchState, kgFromScore,
  launchScore, reachedIndex, reachedPhrase, stepLaunch, type LaunchState,
} from '../src/data/forceGauge/launchPhysics';

describe('height ladder', () => {
  test('each landmark sits exactly at its altitude', () => {
    for (const l of LANDMARKS) {
      expect(altitudeForKg(l.kg) / l.altitudeM).toBeCloseTo(1, 6);
    }
  });

  test('the ground is zero and a pull never loses height as it gets harder', () => {
    expect(altitudeForKg(0)).toBe(0);
    expect(altitudeForKg(-3)).toBe(0);
    expect(altitudeForKg(Number.NaN)).toBe(0);
    let prev = -1;
    for (let kg = 0; kg <= 130; kg += 0.25) {
      const alt = altitudeForKg(kg);
      expect(alt).toBeGreaterThan(prev);
      prev = alt;
    }
  });

  test('between two landmarks the height is between them', () => {
    const everest = altitudeForKg(25);
    const clouds = altitudeForKg(20);
    const mid = altitudeForKg(22.5);
    expect(mid).toBeGreaterThan(clouds);
    expect(mid).toBeLessThan(everest);
  });

  test('100 kg one-arm leaves the solar system, the top of the ladder is 120', () => {
    expect(reachedPhrase(100)).toBe('OUT OF THE SOLAR SYSTEM');
    expect(LANDMARKS[LANDMARKS.length - 1].kg).toBe(120);
  });

  test('the phrase is the highest landmark passed', () => {
    expect(reachedPhrase(0)).toBe('BARELY OFF THE GROUND');
    expect(reachedPhrase(4.9)).toBe('BARELY OFF THE GROUND');
    expect(reachedPhrase(5)).toBe('OVER THE ROOFTOPS');
    expect(reachedPhrase(25)).toBe('HIGHER THAN EVEREST');
    expect(reachedPhrase(40)).toBe('INTO SPACE');
    expect(reachedPhrase(69.9)).toBe('UP WITH THE SATELLITES');
    expect(reachedPhrase(70)).toBe('TO THE MOON');
    expect(reachedPhrase(150)).toBe('TO ANOTHER GALAXY');
    expect(reachedIndex(4)).toBe(-1);
    expect(reachedIndex(5)).toBe(0);
  });
});

describe('altitude text', () => {
  test('long form', () => {
    expect(formatAltitude(0)).toBe('0 M');
    expect(formatAltitude(8849)).toBe('8,849 M');
    expect(formatAltitude(408000)).toBe('408 KM');
    expect(formatAltitude(384_400_000)).toBe('384,400 KM');
    expect(formatAltitude(2.25e11)).toBe('225 MILLION KM');
    expect(formatAltitude(2.4e13)).toBe('24 BILLION KM');
    expect(formatAltitude(4.0e16)).toBe('4.23 LIGHT YEARS');
    expect(formatAltitude(2.4e22)).toBe('2.54 MILLION LIGHT YEARS');
  });

  test('short form for the leaderboard', () => {
    expect(formatAltitude(8849, true)).toBe('8,849 M');
    expect(formatAltitude(2.25e11, true)).toBe('225 MN KM');
    expect(formatAltitude(2.4e13, true)).toBe('24 BN KM');
    expect(formatAltitude(4.0e16, true)).toBe('4.23 LY');
    expect(formatAltitude(2.4e22, true)).toBe('2.54 MN LY');
  });
});

describe('scores', () => {
  test('a board score is kg to one decimal, stored as tenths', () => {
    expect(launchScore(58.24)).toBe(582);
    expect(kgFromScore(582)).toBeCloseTo(58.2);
    expect(launchScore(-1)).toBe(0);
  });
});

describe('flight', () => {
  test('starts on the ground, ends exactly at the target and never goes back down', () => {
    const dur = flightDurationSec(60);
    expect(flightLevel(0, 60, dur)).toBe(0);
    expect(flightLevel(dur, 60, dur)).toBe(60);
    expect(flightLevel(dur + 5, 60, dur)).toBe(60);
    let prev = -1;
    for (let t = 0; t <= dur; t += dur / 50) {
      const lv = flightLevel(t, 60, dur);
      expect(lv).toBeGreaterThanOrEqual(prev);
      prev = lv;
    }
  });

  test('fast off the pad, slowing to a stop at the top', () => {
    const dur = flightDurationSec(60);
    const firstSecond = flightLevel(1, 60, dur);
    const lastSecond = 60 - flightLevel(dur - 1, 60, dur);
    expect(firstSecond).toBeGreaterThan(lastSecond * 3);
  });

  test('bigger pulls fly for longer, within limits', () => {
    expect(flightDurationSec(80)).toBeGreaterThan(flightDurationSec(20));
    expect(flightDurationSec(0)).toBeGreaterThanOrEqual(1.5);
    expect(flightDurationSec(500)).toBeLessThanOrEqual(11);
  });
});

describe('a round', () => {
  const run = (s: LaunchState, kg: number, seconds: number, dt = 0.05) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) s = stepLaunch(s, kg, dt);
    return s;
  };

  test('a light touch does not start a charge; a real pull does', () => {
    let s = initialLaunchState();
    s = run(s, 1.5, 0.5);
    expect(s.phase).toBe('ready');
    s = stepLaunch(s, 3, 0.05);
    expect(s.phase).toBe('charging');
  });

  test('letting go launches with the peak of the pull', () => {
    let s = initialLaunchState();
    s = run(s, 20, 0.5);
    s = run(s, 55, 0.5);
    s = run(s, 40, 0.5);
    expect(s.phase).toBe('charging');
    expect(s.peakKg).toBe(55);
    s = stepLaunch(s, 0, 0.05);
    expect(s.phase).toBe('flying');
    expect(s.launchKg).toBe(55);
  });

  test('holding on launches when the three seconds are up', () => {
    let s = initialLaunchState();
    s = run(s, 30, CHARGE_SEC - 0.1);
    expect(s.phase).toBe('charging');
    s = run(s, 30, 0.2);
    expect(s.phase).toBe('flying');
    expect(s.launchKg).toBe(30);
  });

  test('the flight ends in a result, and pulls mid-flight change nothing', () => {
    let s = initialLaunchState();
    s = run(s, 45, 0.3);
    s = stepLaunch(s, 0, 0.05);
    s = run(s, 80, 1);
    expect(s.phase).toBe('flying');
    expect(s.launchKg).toBe(45);
    s = run(s, 0, flightDurationSec(45));
    expect(s.phase).toBe('result');
  });

  test('another go needs the result shown for a moment, a release and a fresh pull', () => {
    let s = initialLaunchState();
    s = run(s, 45, 0.3);
    s = stepLaunch(s, 0, 0.05);
    s = run(s, 0, flightDurationSec(45) + 0.1);
    expect(s.phase).toBe('result');
    s = stepLaunch(s, 30, 0.05);
    expect(s.phase).toBe('result'); // too soon
    s = run(s, 0, MIN_RESULT_SEC);
    s = stepLaunch(s, 30, 0.05);
    expect(s.phase).toBe('charging');
    expect(s.peakKg).toBe(30);
  });

  test('a pull held right through the flight does not start the next round', () => {
    let s = initialLaunchState();
    s = run(s, 45, CHARGE_SEC + 0.1); // timed out while still pulling
    expect(s.phase).toBe('flying');
    s = run(s, 45, flightDurationSec(45) + MIN_RESULT_SEC + 1);
    expect(s.phase).toBe('result');
    s = stepLaunch(s, 0, 0.05);
    s = stepLaunch(s, 30, 0.05);
    expect(s.phase).toBe('charging');
  });

  test('bad readings count as zero', () => {
    let s = initialLaunchState();
    s = stepLaunch(s, Number.NaN, 0.05);
    expect(s.phase).toBe('ready');
    expect(s.liveKg).toBe(0);
  });
});

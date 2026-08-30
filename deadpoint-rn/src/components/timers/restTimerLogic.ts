/** Pure port of RestTimerOverlay.swift's own `fraction`/`format(_:)`
    computations. No timers, no RN — useRestTimer.ts supplies
    remaining/total each tick. */

export function fraction(remainingSeconds: number, totalSeconds: number): number {
  return totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
}

/** Mirrors RestTimerOverlay.swift's format(_:): `Int(interval.rounded())`
    then `"\(s/60):\(String(format:"%02d", s%60))"`. */
export function formatCountdown(remainingSeconds: number): string {
  const s = Math.round(remainingSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

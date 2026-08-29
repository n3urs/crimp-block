/** Direct port of ios/Shared/AppFonts.swift, using the same four TTFs.
    Archivo Black for the one heading role, Roboto Mono for everything
    else monospaced, Space Mono for timer countdown digits only — all
    picked in a live side-by-side against the real card, not chosen blind. */
type MonoWeight = 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';

/** Mirrors AppFonts.boldWeights exactly: a static TTF has no continuous
    weight axis, so this is an explicit allowlist, not a threshold. */
const BOLD_WEIGHTS: ReadonlySet<string> = new Set(['bold', 'heavy', 'black', 'semibold']);

export const Fonts = {
  heading(fontSize: number) {
    return { fontFamily: 'ArchivoBlack-Regular', fontSize };
  },
  mono(fontSize: number, weight: MonoWeight = 'bold') {
    return {
      fontFamily: BOLD_WEIGHTS.has(weight) ? 'RobotoMono-Bold' : 'RobotoMono-Medium',
      fontSize,
    };
  },
  timerDigits(fontSize: number) {
    return { fontFamily: 'SpaceMono-Bold', fontSize };
  },
};

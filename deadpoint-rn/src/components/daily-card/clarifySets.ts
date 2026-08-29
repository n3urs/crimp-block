/** Direct port of clarifySets() in DailyCardView.swift. Prescription text is
    free-form across templates.js/programs.js, and a blind "first number is
    sets" transform is actively wrong for real entries ("10s × 5" is a hold
    duration first; "5 min on / 5 min off × 3" has no leading set count).
    Only the one unambiguous pattern is touched: a plain leading integer
    followed by "×" with nothing but whitespace between. */
export function clarifySets(s: string): string {
  if (!/^\d+\s*×/.test(s)) return s;
  const count = s.match(/^\d+/)![0];
  const rest = s.slice(s.indexOf('×') + 1);
  return `${count} sets ×${rest}`;
}

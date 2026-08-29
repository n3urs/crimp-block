/** Direct port of ios/Shared/SessionColours.swift. Values must stay
    byte-identical to that file — it is the source of truth shared with
    the still-shipping SwiftUI app. */
export const Colours = {
  bg: '#181B22',
  s1: '#1E222B',
  s2: '#272C37',
  s3: '#333947',
  s4: '#454C5C',
  fg: '#EDEBE5',
  dim: '#9AA0AE',
  faint: '#666C7A',
  go: '#1FA24A',
  restC: '#D6383D',
  readyC: '#D69A1F',
} as const;

const NAMED: Record<string, string> = {
  '--gorse': '#F2B134',
  '--tidepool': '#4FB3A5',
  '--slate': '#7B93E0',
  '--heather': '#C9739B',
  '--grey': '#5A6069',
};

/** Falls back to --gorse for anything unrecognised, exactly as
    SessionColours.resolve(_:) does. */
export function resolveColour(variableName: string): string {
  return NAMED[variableName] ?? NAMED['--gorse'];
}

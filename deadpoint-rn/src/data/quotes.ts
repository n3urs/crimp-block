/** The line under LOGGED on the celebration card (LoggedStamp.tsx).

    It used to be a fixed "Nice work today." — fine once, wallpaper by the
    tenth session. A rotating quote is the same congratulation with
    something to actually read.

    EVERY NAME BELOW IS A REAL PERSON. Widely repeated is not the same as
    sourced, and a misattributed quote in a paid app is a bad look, so the
    list is kept deliberately short and only holds lines that are
    attributed consistently and specifically. Anything that only ever turns
    up on quote-aggregator sites was left out. Add to it freely — the only
    rule is that `who` has to be someone who actually said `text`. Keep
    them short: the card is 300pt wide and sits on top of the session. */

export interface Quote {
  text: string;
  /** Rendered in caps under the quote. */
  who: string;
}

export const QUOTES: Quote[] = [
  { text: 'The best climber in the world is the one having the most fun.', who: 'Alex Lowe' },
  { text: 'The brain is the most important muscle for climbing.', who: 'Wolfgang Güllich' },
  { text: 'It goes, boys!', who: 'Lynn Hill' },
  { text: 'It is not the mountain we conquer, but ourselves.', who: 'Edmund Hillary' },
  { text: 'Getting to the top is optional. Getting down is mandatory.', who: 'Ed Viesturs' },
  { text: "It's not an adventure until something goes wrong.", who: 'Yvon Chouinard' },
  { text: 'Mountains are not fair or unfair, they are just dangerous.', who: 'Reinhold Messner' },
  { text: 'Nobody achieves anything great by being happy and cozy.', who: 'Alex Honnold' },
  { text: 'Because it is there.', who: 'George Mallory' },
  { text: "Climbing is not a battle with the elements, nor against the law of gravity. It's a battle against oneself.", who: 'Walter Bonatti' },
];

/** Picks a quote, never the one just shown — logging two sessions in a row
    and being handed the same line twice would make the whole thing look
    broken. `previous` is the index last shown, or -1 on a first pick.
    `random` is injectable so the no-repeat rule is testable without
    depending on what Math.random happens to return. */
export function pickQuoteIndex(previous: number, random: () => number = Math.random): number {
  if (QUOTES.length <= 1) return 0;
  // Draw from the other n-1, then map back around the excluded slot. That
  // keeps every other quote equally likely, unlike re-rolling until it
  // differs (same distribution, but with an unbounded loop).
  const drawn = Math.min(QUOTES.length - 2, Math.floor(random() * (QUOTES.length - 1)));
  return drawn >= previous ? drawn + 1 : drawn;
}

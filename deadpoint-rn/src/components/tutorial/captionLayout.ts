// src/components/tutorial/captionLayout.ts
/** Where the tutorial's caption card and its bouncing arrow go for a given
    highlighted box ("hole"), in window coordinates. Pure, so every step's
    placement is testable.

    The arrow used to be drawn inside the card at the card's own horizontal
    centre, so it pointed at the highlighted box only when that box happened
    to be centred above or below the card. Now the arrow is positioned from
    the box itself: horizontally over the box (clamped to stay on screen),
    vertically just outside the edge nearest the card, pointing at it. The
    card sits beyond the arrow, on whichever side has room. */
export interface Box { x: number; y: number; width: number; height: number }

export const ARROW_SIZE = 34;
/** Space left between the box and its arrow (the bounce carries it a few px closer). */
const ARROW_TO_HOLE = 3;
const ARROW_TO_CARD = 8;
/** Gap between card and box on steps that have no arrow. */
const CARD_GAP = 12;
/** Keep the card this far from the top and bottom of the screen. */
const EDGE = 20;
/** Keep the arrow this far from the left and right of the screen. */
const SIDE = 8;

export interface CaptionLayout {
  /** Top of the card. */
  top: number;
  arrow: { left: number; top: number; direction: 'up' | 'down' } | null;
}

export function computeCaptionLayout({
  hole, screen, cardHeight, showArrow,
}: {
  hole: Box;
  screen: { width: number; height: number };
  cardHeight: number;
  showArrow: boolean;
}): CaptionLayout {
  const holeTop = hole.y;
  const holeBottom = hole.y + hole.height;
  const lead = showArrow ? ARROW_TO_HOLE + ARROW_SIZE + ARROW_TO_CARD : CARD_GAP;

  const belowTop = holeBottom + lead;
  const aboveTop = holeTop - lead - cardHeight;
  const fitsBelow = belowTop + cardHeight <= screen.height - EDGE;
  const fitsAbove = aboveTop >= EDGE;
  // Neither side has room (a very tall box): use whichever has more.
  const placeBelow = fitsBelow || (!fitsAbove && screen.height - holeBottom >= holeTop);

  const rawTop = placeBelow ? belowTop : aboveTop;
  const top = Math.max(EDGE, Math.min(rawTop, screen.height - cardHeight - EDGE));

  if (!showArrow) return { top, arrow: null };

  // Over the box's own centre, but for a wide box no further than its ends,
  // and always fully on screen.
  const half = ARROW_SIZE / 2;
  const holeCentre = hole.x + hole.width / 2;
  const inBox = hole.width > ARROW_SIZE ? Math.min(Math.max(holeCentre, hole.x + half), hole.x + hole.width - half) : holeCentre;
  const centre = Math.min(Math.max(inBox, SIDE + half), screen.width - SIDE - half);

  return {
    top,
    arrow: {
      left: centre - half,
      top: placeBelow ? holeBottom + ARROW_TO_HOLE : holeTop - ARROW_TO_HOLE - ARROW_SIZE,
      direction: placeBelow ? 'up' : 'down',
    },
  };
}

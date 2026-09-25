/** computeCaptionLayout — where the tutorial's caption card and its bouncing
    arrow go for a given highlighted box. The arrow used to live inside the
    card at the card's own horizontal centre, so it only pointed at the box
    when the box happened to be centred above or below the card; for the
    checkbox (left edge), the weight (right edge), the gear (top right) and
    most other steps it pointed at empty space. It must point at the box
    itself, from just outside its edge, wherever the box is. */
import { ARROW_SIZE, computeCaptionLayout, type Box } from '../src/components/tutorial/captionLayout';

const SCREEN = { width: 390, height: 844 };
const CARD_H = 200;
const layout = (hole: Box, showArrow = true, cardHeight = CARD_H, screen = SCREEN) =>
  computeCaptionLayout({ hole, screen, cardHeight, showArrow });
const centre = (a: { left: number }) => a.left + ARROW_SIZE / 2;

test('a box near the top: card goes below it and the arrow points up at its bottom edge', () => {
  const hole: Box = { x: 10, y: 100, width: 60, height: 40 };
  const l = layout(hole);
  expect(l.arrow!.direction).toBe('up');
  expect(l.arrow!.top).toBeGreaterThanOrEqual(140);            // just outside the box's bottom edge
  expect(l.arrow!.top).toBeLessThan(140 + 10);
  expect(l.top).toBeGreaterThanOrEqual(l.arrow!.top + ARROW_SIZE); // card clears the arrow
});

test('a box at the bottom (the DONE button): card goes above, arrow points down at its top edge', () => {
  const hole: Box = { x: 20, y: 760, width: 350, height: 60 };
  const l = layout(hole);
  expect(l.arrow!.direction).toBe('down');
  expect(l.arrow!.top + ARROW_SIZE).toBeLessThanOrEqual(760);   // ends at the box's top edge
  expect(l.arrow!.top + ARROW_SIZE).toBeGreaterThan(760 - 10);
  expect(l.top + CARD_H).toBeLessThanOrEqual(l.arrow!.top);      // card clears the arrow
});

test('the arrow is horizontally over the box, not over the card: left, right and centre', () => {
  const left = layout({ x: 8, y: 300, width: 40, height: 40 });
  const right = layout({ x: 340, y: 300, width: 44, height: 40 });
  const mid = layout({ x: 150, y: 300, width: 90, height: 40 });
  expect(centre(left.arrow!)).toBeGreaterThanOrEqual(8);
  expect(centre(left.arrow!)).toBeLessThanOrEqual(48);
  expect(centre(right.arrow!)).toBeGreaterThanOrEqual(340);
  expect(centre(right.arrow!)).toBeLessThanOrEqual(384);
  expect(centre(mid.arrow!)).toBeCloseTo(195, 0);
});

test('the arrow never leaves the screen, even for a box hard against an edge', () => {
  for (const hole of [{ x: 0, y: 200, width: 30, height: 30 }, { x: 362, y: 200, width: 28, height: 30 }] as Box[]) {
    const a = layout(hole).arrow!;
    expect(a.left).toBeGreaterThanOrEqual(0);
    expect(a.left + ARROW_SIZE).toBeLessThanOrEqual(SCREEN.width);
  }
});

test('a wide box gets its arrow at the box centre', () => {
  const a = layout({ x: 12, y: 300, width: 366, height: 80 }).arrow!;
  expect(centre(a)).toBeCloseTo(195, 0);
});

test('the card stays on screen and the arrow never overlaps it', () => {
  const holes: Box[] = [
    { x: 10, y: 60, width: 370, height: 50 }, { x: 10, y: 400, width: 100, height: 60 },
    { x: 300, y: 20, width: 60, height: 44 }, { x: 20, y: 760, width: 350, height: 60 },
  ];
  for (const hole of holes) {
    const l = layout(hole);
    expect(l.top).toBeGreaterThanOrEqual(20);
    expect(l.top + CARD_H).toBeLessThanOrEqual(SCREEN.height - 20);
    const a = l.arrow!;
    const overlapsCard = a.top < l.top + CARD_H && a.top + ARROW_SIZE > l.top;
    expect(overlapsCard).toBe(false);
  }
});

test('the arrow points from the card side towards the box, never away from it', () => {
  const upper = layout({ x: 10, y: 120, width: 80, height: 40 });
  expect(upper.arrow!.direction).toBe('up');
  expect(upper.top).toBeGreaterThan(120 + 40);
  const lower = layout({ x: 10, y: 700, width: 80, height: 40 });
  expect(lower.arrow!.direction).toBe('down');
  expect(lower.top + CARD_H).toBeLessThan(700);
});

test('a box too tall to fit the card either side still yields an on-screen card and an arrow', () => {
  const l = layout({ x: 10, y: 100, width: 370, height: 700 });
  expect(l.top).toBeGreaterThanOrEqual(20);
  expect(l.top + CARD_H).toBeLessThanOrEqual(SCREEN.height - 20);
  expect(l.arrow).not.toBeNull();
});

test('with no arrow (whole-screen steps) the card just sits a small gap from the anchor', () => {
  const l = layout({ x: 0, y: 464, width: 390, height: 1 }, false);
  expect(l.arrow).toBeNull();
  expect(l.top).toBe(464 + 1 + 12);
});

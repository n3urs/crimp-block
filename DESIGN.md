---
name: Deadpoint Marketing Site
description: The app's own session colours, one held phone, and no evidence that doesn't exist.
colors:
  bg: "#181B22"
  s1: "#1E222B"
  s2: "#272C37"
  s3: "#333947"
  s4: "#454C5C"
  footer-ground: "#15181E"
  fg: "#EDEBE5"
  dim: "#9AA0AE"
  faint: "#8A90A0"
  gorse: "#F2B134"
  tidepool: "#4FB3A5"
  slate: "#7B93E0"
  heather: "#C9739B"
  grey: "#5A6069"
  go: "#1FA24A"
  restC: "#D6383D"
  goText: "#3FD173"
  restText: "#EF7A7E"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(38px, 6.6vw, 68px)"
    fontWeight: 900
    lineHeight: 1.07
    letterSpacing: "-0.028em"
  headline:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(26px, 3.9vw, 40px)"
    fontWeight: 800
    lineHeight: 1.07
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.07
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  lede:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(16px, 1.75vw, 18.5px)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 700
    lineHeight: 1.6
    letterSpacing: "0.14em"
  small:
    fontFamily: "Archivo, system-ui, -apple-system, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "13px"
  lg: "20px"
  btn: "10px"
  device: "38px"
  pill: "99px"
spacing:
  gutter: "clamp(20px, 4vw, 26px)"
  card-pad: "24px"
  box-pad: "22px"
  grid-gap: "16px"
  sequence-gap: "26px"
  section: "clamp(72px, 10vw, 132px)"
  beat-gap: "clamp(64px, 14vh, 150px)"
components:
  button-primary:
    backgroundColor: "{colors.gorse}"
    textColor: "{colors.bg}"
    typography: "{typography.label}"
    rounded: "{rounded.btn}"
    padding: "13px 20px"
  button-primary-sm:
    backgroundColor: "{colors.gorse}"
    textColor: "{colors.bg}"
    rounded: "{rounded.btn}"
    padding: "9px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.btn}"
    padding: "13px 20px"
  card:
    backgroundColor: "{colors.s1}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "{spacing.card-pad}"
  chip:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.dim}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  chip-selected:
    backgroundColor: "{colors.gorse}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  nav-link:
    textColor: "{colors.dim}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  readout:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
    rounded: "11px"
    padding: "20px"
---

# Design System: Deadpoint Marketing Site

## Overview

**Creative North Star: "The Instrument Panel"**

The site is built out of the app's own materials. Its ground is the app's
background (`#181B22`), its accents are the app's `SessionColours` unchanged,
and every phone screen shown is a real 900×1947 app raster. Nothing here is a
representation of the product: it is the product's own surfaces, held up.

The register is machined rather than marketed. Archivo at 900 does the shouting,
JetBrains Mono does the labelling, and hairline `#333947` rules do the dividing.
Depth comes from four stacked greys and one-pixel borders, not from glow. The
single physically-modelled object on the site is the phone in the hero and in
the scrollytell — correct 9:19.5 aspect, machined bezel, one raking glare — and
its gradients are the only gradients allowed, because they describe an object
rather than decorate a panel.

The site argues instead of listing. The signature structure is the **Held
Phone**: one device stays pinned while the argument scrolls past it, and each
beat swaps the screen to the one that proves that beat. The failure mode this
world refuses is the stacked feature-card page every training app ships — which
is why cards are not the default container here.

**Key Characteristics:**
- Dark ground with four tonal surfaces; no light mode.
- Session colours are semantic, never decorative.
- Mono for labels and numbers, Archivo for everything that speaks.
- One orchestrated entrance, then nothing moves again.
- Hairline borders and tonal steps in place of shadows on all flat surfaces.
- Every screenshot is the real app.

### Direction Contract

Recorded verbatim from `website/index.html` so it outlives the session that
produced it:

- **THESIS:** One held phone proves the product while the argument scrolls past it; refuses the stacked feature-card page every training app ships.
- **OWN-WORLD:** The app's own SessionColours ground (#181B22) with gorse/tidepool/slate/heather carrying session meaning, Archivo 900 display against JetBrains Mono labels, hairline #333947 rules, no decorative gradients.
- **STORY:** A climber who already trains sees the real daily card, learns it is decided from their own log, and downloads.
- **FIRST VIEWPORT:** Hook left at up to 68px/900, dual store buttons beneath, price microline under those; a machined device right holding the real dashboard.
- **FORM:** Held Phone, #2 of seven ranked structures; surface seed bf3d041c.
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Colors

The palette is `SessionColours.swift` transplanted whole: a warm-ink dark ground
carrying four saturated session hues plus a go/rest pair.

### Primary
- **Gorse** (`{colors.gorse}`): max-finger day in the app, and the site's single
  action colour. Primary buttons, links, the wordmark's second half, the active
  nav underline, focus rings, selection, caret, pin markers, the open-state
  chevron.

### Secondary
- **Tidepool** (`{colors.tidepool}`): pull work. Beat accent, gate marker, chip
  fill, forecast dot.
- **Cornflower Slate** (`{colors.slate}`): board work. Same set of roles.
- **Heather** (`{colors.heather}`): climbing. Same set of roles.
- **Grey** (`{colors.grey}`): the session type with no character — rest and
  unclassified days.

### Tertiary
- **Go Green** (`{colors.go}`): the live lamp fill and its pulse ring.
- **Rest Red** (`{colors.restC}`): warning-box border and tint only.
- **Go Green Text** (`{colors.goText}`): the go colour at text weight.
- **Rest Red Text** (`{colors.restText}`): the rest colour at text weight.

### Neutral
- **Ground** (`{colors.bg}`): page background, and the inset background of
  readouts and forecast tiles so they read as recessed instruments.
- **Surface 1** (`{colors.s1}`): every raised panel — cards, engine, profile,
  TOC, correction box, screenshot backing.
- **Surface 2** (`{colors.s2}`): nested fills — chips at rest, tags, step
  buttons, engine head, nav-link hover.
- **Surface 3** (`{colors.s3}`): the hairline. Every border, divider and section
  rule on the site is 1px of this.
- **Surface 4** (`{colors.s4}`): ghost-button stroke, dashed readout divider,
  scrollbar thumb, card hover border.
- **Ink** (`{colors.fg}`): headings and primary body.
- **Dim Ink** (`{colors.dim}`): secondary paragraphs, nav links at rest, prose
  body on legal pages.
- **Faint Ink** (`{colors.faint}`): mono labels, captions, meta, microlines.
- **Footer Ground** (`{colors.footer-ground}`): the footer only, a half-step
  below the page so the page appears to end.

### Named Rules

**The Session Semantics Rule.** Gorse is max fingers, tidepool is pull, slate is
board, heather is climbing, grey is rest. These four hues carry meaning imported
from the app and are never reassigned to a mood, a section, or a rotation of
"variety". If a new surface needs an accent and has no session meaning, it uses
gorse or it uses none.

**The Text-Weight Variant Rule.** The saturated `go` and `restC` values are
fills and dots only — they fail 4.5:1 as small text. Small text on the go/rest
pair uses `goText` and `restText`. Never set body copy in a swatch colour that
was tuned for a 7px dot.

**The Faint Floor Rule.** `faint` is `#8A90A0` and does not get darker. Its
predecessor `#666C7A` measured 3.27:1 on the ground and failed. Any new muted
ink either uses `faint` or is measured before it ships.

**The One Ground Rule.** There is exactly one background family: `bg` through
`s4`, stepped tonally. Depth is a step up the ramp plus a 1px `s3` border. Never
introduce a fifth surface value to solve a contrast problem.

## Typography

**Display Font:** Archivo (with `system-ui`, `-apple-system`, sans-serif)
**Body Font:** Archivo — same family, the whole site is one voice at four weights
**Label/Mono Font:** JetBrains Mono (with `ui-monospace`, SFMono-Regular, Menlo)

**Character:** Archivo at 800–900 with negative tracking reads as compressed and
structural rather than friendly; JetBrains Mono handles anything that is a
measurement, a label, a price, a citation or a control. The pairing is a
technical instrument that can raise its voice.

### Hierarchy
- **Display** (900, `clamp(38px, 6.6vw, 68px)`, 1.07, `-0.028em`): page-opening
  H1 only, one per page. Emphasis inside it is set in gorse with
  `font-style: normal` on `<em>` — colour, never italic.
- **Headline** (800, `clamp(26px, 3.9vw, 40px)`, 1.07, `-0.02em`): section H2.
  Inside a scrollytell beat it steps down to `clamp(23px, 3.1vw, 33px)`; on
  legal prose pages it steps down to `clamp(20px, 2.4vw, 25px)`.
- **Title** (700, 19px, 1.07, `-0.01em`): H3 within a section. Coloured with the
  local `--beat` accent inside `.gates` and `.rules`.
- **Box Heading** (800, 15px): the heading of a callout that has no heading of
  its own. This is the *only* small bold label permitted above content.
- **Body** (400, 16px, 1.6): default. Constrained to `66ch` via `.measure`;
  legal prose runs at 15.5px inside `70ch`.
- **Lede** (400, `clamp(16px, 1.75vw, 18.5px)`, dim): the paragraph directly
  under an H1 or H2.
- **Label** (mono, 700, 10.5–11.5px, `0.10em`–`0.18em`, uppercase): field
  labels, footer column heads, device caption, engine head, forecast day names.
- **Micro** (mono, 11.5px, faint): the price microline under the hero buttons,
  figure captions, footer base line.

### Named Rules

**The No Kicker Rule.** Absolute. No kicker, eyebrow, or small-caps label ever
sits above a heading. All 22 that once existed were removed. A label above a
heading is decoration pretending to be structure; the heading says what the
thing is. `.boxh` exists for the genuine remaining case — a callout box with no
heading of its own — and is not a licence to reintroduce the pattern above one.

**The Mono Means Measurement Rule.** JetBrains Mono appears only where a value,
identifier, control label or citation appears: prices, day names, gate numbers,
chip labels, engine readout, references, buttons. It is never used for prose.

**The Tabular Digits Rule.** Any surface where digits stack or update —
readouts, forecast tiles, the engine, prices, steppers, `<time>` — carries
`font-variant-numeric: tabular-nums` so numbers hold their column.

## Layout

A single centred container (`max-width: 1160px`) with a fluid gutter of
`clamp(20px, 4vw, 26px)`. Reading measure is capped at `66ch` (`70ch` for legal
prose) independently of the container, so wide sections never produce wide text.

Vertical rhythm is one unit: sections are `clamp(72px, 10vw, 132px)` of block
padding and adjacent sections are separated by a single `s3` hairline. Inside a
section the spacing steps are 16px (grid gap), 22px (box padding), 24px (card
padding), 26px (sequence gap), and `clamp(64px, 14vh, 150px)` between
scrollytell beats.

Grids are explicit two- and three-column (`.g2`, `.g3`) and collapse to one
column at 900px. The hero is a two-column grid, argument left and device right,
that stacks at 900px. The scrollytell is the same shape with a sticky rail.

**Breakpoints** (all max-width, mobile handled by collapse rather than by a
mobile-first ramp):
- **920px** — nav collapses to the burger drawer; the header CTA button hides.
- **900px** — the primary structural breakpoint: hero stacks, `.g2`/`.g3`
  collapse, the engine's two panes stack, the held phone is dropped.
- **860px / 520px** — footer columns 4 → 2 → 1.
- **820px** — `.rules` collapses to one column.
- **640px** — the terms/privacy table of contents drops to one column.
- **520px** — the engine's three-day forecast stacks.

### Named Rules

**The Desktop-Only Phone Rule.** Below 900px `.told-rail` is hidden and each
beat carries its own `.beat-shot` instead. A pinned phone at a 390px viewport
eats over half the screen and is still too small to read; the argument keeps its
proof by putting a phone-width screenshot inside each beat rather than by
shrinking the held one.

## Elevation & Depth

The site is flat by construction. Depth on every content surface comes from
tonal layering plus a 1px `s3` hairline — a card is `s1` on `bg` with an `s3`
border, a chip is `s2` inside that, a readout drops back to `bg` inside `s1` to
read as recessed. No content surface casts a shadow at rest.

Two exceptions, both earned. The primary button carries a coloured lift so the
one action on the page is physically forward. The device is a modelled object
and carries a real four-layer shadow, a rim light and a glass rake, because it
is a phone rather than a panel.

### Shadow Vocabulary
- **Button rest** (`box-shadow: 0 1px 0 rgba(255,255,255,.14) inset, 0 6px 18px -10px rgba(242,177,52,.9)`):
  the inset top edge plus a gorse-tinted cast. Primary buttons only.
- **Button hover** (`0 1px 0 rgba(255,255,255,.18) inset, 0 12px 26px -12px rgba(242,177,52,.95)`),
  paired with `translateY(-2px)` and `brightness(1.07)`.
- **Device** (`0 0 0 1px rgba(255,255,255,.07), 0 2px 3px rgba(255,255,255,.05) inset, 0 44px 90px -34px rgba(0,0,0,.95), 0 8px 26px -12px rgba(0,0,0,.8)`):
  rim light, bezel highlight, deep contact shadow, near shadow.
- **Live lamp pulse** (`0 0 0 0 → 0 0 0 7px rgba(31,162,74,0)`, 2.4s): the only
  looping animation on the site; it exists to say the engine is running.
- **Pin halo** (`0 0 0 4px rgba(242,177,52,.22)`): annotation pins on the
  screenshot only.

### Named Rules

**The Flat Surface Rule.** Cards, boxes, panels and rails never take a shadow.
Elevation is a step up the surface ramp plus a hairline. Shadows are reserved
for the primary action and for the device.

**The Machined Gradient Rule.** The only gradients in the system are the
device's bezel (`linear-gradient(160deg, #3a4150, #1a1d24 42%, #0f1116)`) and
its glass rake (`linear-gradient(128deg, rgba(255,255,255,.11) 0 16%, transparent 42%)`,
screen-blended). Both describe a physical object. No gradient is ever used as a
background, a hero wash, a border sheen or a section transition.

## Shapes

Rounding is soft-industrial and scaled to the object: 8px for small interactive
chrome (nav links, burger, skip link), 13px for content containers, 20px for
large media frames, 10px for buttons, 11px and 9px for the engine's inset
readout and forecast tiles, 38px/30px for the device shell and its screen, and a
full pill (99px) for chips only.

Borders are always exactly 1px of `s3` (or `s4` where a stroke must read as
interactive, as on the ghost button). The dashed `s4` rule inside the engine
readout is the single dashed line in the system and marks the boundary between a
result and the reasoning that produced it.

The recurring non-box marker is a 38×2px rounded rule carrying the local session
colour: it heads each scrollytell beat (scaling from `scaleX(.58)` to full when
the beat goes live) and, as a 2px top border, heads each item in `.rules`.

### Named Rules

**The Unboxed Sequence Rule.** A box is for a thing with internal structure, not
for a paragraph. An ordered sequence (`.gates`) is a numbered mono marker and
indentation; a set of sibling rules (`.rules`) is a coloured top rule and
nothing else. `.profile` stays boxed because it is a genuine three-way
comparison with internal structure. Cards are not the default container.

## Components

### Buttons
- **Shape:** softly rounded (10px), mono label at 13px / `0.03em`, never
  wrapping.
- **Primary:** gorse fill on ground-coloured text, `13px 20px`, with the inset
  edge and gorse cast described above. The compact variant is `9px 14px` at
  12px.
- **Hover / Focus:** rises 2px, brightens 7%, deepens its cast, all on
  `.16s var(--ease)`; `:active` returns to 0. Focus is the global 2px gorse ring
  at 3px offset.
- **Ghost:** transparent with an `s4` stroke and ink text; on hover the stroke
  goes to full ink and the fill to `s2`. No shadow, no brighten.

### Chips
- **Style:** pill (99px), `s2` fill, dim mono 11px, transparent 1px border that
  reserves space for the selected state.
- **State:** selected fills with the chip's own session colour (`--chipc`,
  defaulting to gorse), swaps to ground-coloured text at weight 700, and takes
  the same colour as its border. Hover steps the fill to `s3`; `:active` scales
  to `0.96`. Selection is expressed with `aria-pressed`.

### Cards / Containers
- **Corner Style:** 13px.
- **Background:** `s1` on the page ground; `bg` when the container is meant to
  read as an inset instrument.
- **Shadow Strategy:** none — see Elevation.
- **Border:** 1px `s3`. A card may promote to a gorse border to mark the
  recommended option (pricing), and that is the only sanctioned border-colour
  override.
- **Internal Padding:** 24px for `.card`, 22px for callout boxes
  (`.correction`, `.warnbox`, `.profile`, `.toc`) and engine panes.
- **Warning box:** the only tinted surface in the system —
  `rgba(214,56,61,.07)` fill on a `rgba(214,56,61,.3)` border, heading in
  `restText`.

### Navigation
- Sticky, 64px tall, translucent ground (`rgba(24,27,34,.72)`) with a 14px blur
  and 140% saturate. Past 8px of scroll it takes a `data-scrolled="true"`
  attribute that raises opacity to `.93` and reveals an `s3` bottom border.
- Links are 14px dim, 8px/12px, 8px radius; hover goes to ink on `s2`. The
  current page is ink plus a 2px gorse underline inset 12px from each side,
  driven by `aria-current="page"`.
- Below 920px the links become a full-width drawer that slides down from under
  the header, toggled by a burger whose bars fold into a cross. The drawer
  closes on any link tap. The header's compact CTA hides; the store buttons in
  the page carry the action.

### Disclosure (details / summary)
Native `<details>` with the marker suppressed: a 17px-tall summary row over an
`s3` bottom hairline, with a 9px chevron drawn from two 1.6px faint borders that
rotates 180° and turns gorse when open. Answer text is dim at 15px within the
66ch measure.

### The Held Phone (signature)
A pinned `.told-rail` beside a column of `.beat` articles. The device is
`min(300px, 78vw)` at a true 9:19.5 aspect with a 9px bezel, a 30px screen, and
a 78×22px notch. All screens are stacked absolutely-positioned images inside the
screen, preloaded, cross-fading on `.is-live` (opacity `.5s`, transform `.7s`,
from `scale(1.015)`). A beat claims the device when it enters a band 42% inset
from the top and bottom of the viewport; claiming it swaps the screen, sets the
mono caption underneath, tints that caption with the beat's `--beat` colour, and
extends the beat's 38px rule to full width. The first beat owns the device on
load so the phone is never blank.

### The Engine Panel (signature)
The live rules-engine demo, styled as an instrument rather than a card: an `s2`
head strip with a mono uppercase title and a pulsing green live lamp, a body of
two `s1` panes divided by a vertical hairline (stacking at 900px, the divider
becoming horizontal), and inside the right pane a recessed `bg` readout. The
readout names the decision at `clamp(24px, 3.4vw, 32px)` in the session's own
colour, states where it happens in mono, and separates its reasoning below a
dashed `s4` rule. The three-day forecast beneath reuses the app's own week-strip
dot: colour rides the 7px dot, never the label.

### Named Rules

**The Real Raster Rule.** Every screenshot on the site is a genuine 900×1947 app
render. No mockup, no faked interface, no illustrated approximation of a screen
that does not exist. `.device-screen` is sized so the raster maps 1:1.

**The Reserved Space Rule.** Every `<img>` carries real `width`/`height`
attributes so the browser reserves layout, with `height: auto` in CSS to keep
the aspect correct. Animated markers scale rather than grow: the beat rule
occupies its full 38px from the start and animates `transform` only, so nothing
beside it shifts.

## Do's and Don'ts

### Do:
- **Do** take accents from the session set and use them with their app meaning:
  gorse = max fingers, tidepool = pull, slate = board, heather = climbing, grey
  = rest.
- **Do** use `--goText` (#3FD173) and `--restText` (#EF7A7E) for any small text
  on the go/rest pair; keep `--go` and `--restC` for fills and dots.
- **Do** build depth from the `bg → s1 → s2 → s3 → s4` ramp with 1px `s3`
  hairlines.
- **Do** gate every hidden entrance state on `.js`, which an inline script in
  `<head>` sets before first paint, and reveal everything immediately when the
  tab is hidden, reduced motion is set, or IntersectionObserver is missing.
- **Do** cap reading measure at 66ch (70ch for legal prose) regardless of
  container width.
- **Do** give any surface with stacking or updating digits
  `font-variant-numeric: tabular-nums`.
- **Do** ship every image with real `width`/`height` attributes and a real app
  raster behind it.

### Don't:
- **Don't** put a kicker, eyebrow or label above a heading. Anywhere. `.boxh` is
  for a callout that has no heading of its own, not a way back in.
- **Don't** use a gradient for anything but the device's bezel and glass rake.
  No hero washes, no gradient borders, no section fades.
- **Don't** reach for `.card` by default. An ordered sequence uses `.gates`, a
  set of sibling rules uses `.rules`, and both stay unboxed; box only what has
  real internal structure.
- **Don't** darken `--faint` below `#8A90A0`, and don't introduce a new muted
  ink without measuring it against `#181B22` at 4.5:1.
- **Don't** reassign a session colour to a mood, a page, or a rotation for
  variety.
- **Don't** park content at `opacity: 0` outside the `.js`-scoped reveal styles;
  a page with broken JavaScript must render fully readable.
- **Don't** shadow a card, panel or rail. Shadows belong to the primary button
  and the device.
- **Don't** replay an entrance. Reveals fire once and unobserve; the only
  looping motion in the system is the engine's live lamp.
- **Don't** pin the held phone below 900px; drop the rail and give each beat its
  own screenshot.
- **Don't** invent a screen, a user, a testimonial, a rating or a press mention.
  Deadpoint has none, and no visual component may be designed to hold one.

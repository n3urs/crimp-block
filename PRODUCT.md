# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Intermediate-to-advanced climbers who already train deliberately — they own or
have access to a hangboard, pull-up bar, or gym, and they train fingers on
purpose rather than just climbing. They have a real weakness they can name
(crimp strength, lock-off, endurance) and a week that never runs to plan:
a crag day appears, work eats Tuesday, fingers are still cooked from Sunday.

Explicitly NOT for beginners. The site says so out loud ("If you're new to
climbing, don't buy this") and that honesty is a product position, not a
disclaimer to soften.

## Product Purpose

Deadpoint decides what one climber should train *today*, recalculated daily
from the sessions they actually logged — not from a fixed 12-week PDF that
has no idea what their week did.

Success is a climber opening the app, seeing one card, and trusting it enough
to just do it — including on the days it tells them to rest.

## Positioning

The mechanism is a real rules engine, not content scheduling. It reads the
trailing seven days of logged sessions and applies recovery gates (finger
tissue recovers slower than muscle, so fingers get their own ceiling separate
from the systemic one), hard-day caps, deload weeks, and layoff tapers.

Two things a neighbouring app could not truthfully copy:
1. The same engine file that ships inside the app runs live in the browser on
   the marketing site. Visitors set their last three days and watch it decide,
   with the app's own reasoning text as the explanation. It is not a mock-up.
2. The plan is genuinely per-person: quiz answers (discipline, level, days per
   week, equipment, weaknesses, injuries) reshape which sessions and exercises
   exist at all, not just which numbers appear.

## Operating Context

Used one-handed, mid-session, often with chalky hands and a phone propped on a
bench — and frequently offline or on bad signal at a crag. Sessions are logged
the same day they happen. Weights are recorded per exercise and carried
forward. Rest timers and interval timers run during the session itself.

## Capabilities and Constraints

- iOS (live on the App Store, id6800266835) and Android (Play Store listing
  created, package `uk.co.sullivanltd.deadpoint`, not yet public).
- Subscription: £0.99/month or £9.99/year, 7-day free trial on monthly.
  Payments run through Apple and Google's own billing; RevenueCat only reads
  entitlement status.
- Passwordless email sign-in (one-time code, no passwords stored).
- Data: email, training session log, per-exercise weight log, subscription
  status. No analytics SDKs, no crash-reporting SDKs, no ads, no location, no
  advertising identifiers. Stored in Supabase, EU (Ireland) region, row-level
  security per account.
- Account deletion available in-app and by emailing support.
- Company: R. T. Sullivan Consulting Limited, trading as Deadpoint,
  Bexhill-on-Sea, UK. Support: support@getdeadpoint.co.uk.
- Site is static, deployed via Cloudflare Pages from the `website` branch of
  the crimp-block repo, at getdeadpoint.co.uk.

## Brand Commitments

- Name: Deadpoint (formerly Crimp Block).
- The site's palette is the app's own session colours, taken verbatim from
  SessionColours.swift — gorse/tidepool/slate/heather each *mean* a session
  type in the app, so they are semantic, not decorative.
- Voice: plain, direct, unhyped, occasionally blunt. Climber-to-climber, not
  marketer-to-lead. It tells you when not to buy, and admits when it got
  something wrong ("corrected when we got it wrong").
- Never medical advice; training-risk disclaimer stays visible.

## Evidence on Hand

Real, usable:
- `website/js/engine/` — the shipped rules engine, running live in-browser.
- `website/img/` — 8 real app screenshots: dashboard, calendar, quiz
  (equipment / summary / discipline / experience), welcome, paywall.
- Cited published research behind the training decisions (added-weight
  hangboard protocols, MaxHangs cycling, periodisation, why no campus board
  for intermediates), with the honest note that some was corrected later.
- Real pricing, real legal entity, real support address, live privacy policy.

Explicitly absent — must never be fabricated:
- No users, customers, testimonials, reviews, ratings, download counts, or
  press. The product is pre-launch on Android and effectively pre-launch on
  iOS. Any social proof on the site would be invented, so there is none.

## Product Principles

1. **Honesty outranks conversion.** Telling the wrong buyer not to buy is part
   of the product, not a leak in the funnel.
2. **Show the mechanism, don't claim it.** The engine runs on the page; the
   screenshots are the real app. Nothing is a mock-up.
3. **Semantic colour.** Session colours carry meaning from the app; they are
   not a decorative palette to re-pick.
4. **Respect the reader's time and body.** Plain language, no hype, and a
   standing risk disclaimer — this is training load on connective tissue.
5. **Pre-launch means no borrowed credibility.** Sell on the demonstrable
   thing in front of them.

## Accessibility & Inclusion

Reduced-motion must be honoured (the incumbent site already does this and the
rebuild adds real animation, so it matters more). Content is read on phones
in bad light with chalky hands: contrast and tap targets are functional
requirements, not polish.

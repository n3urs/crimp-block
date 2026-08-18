# Gifting free access — Offer Codes

How you give the app free to friends and testers, per your call to use real
App Store Offer Codes rather than a custom allow-list baked into the app.
Referenced from a code comment in `PaywallView.swift` ("HAVE A CODE?"
button) — this is the guide that comment points at.

**Why Offer Codes and not a hand-rolled "free forever" list**: a redeemed
code becomes a completely normal StoreKit subscription entitlement — the
same `Transaction.currentEntitlements` check that a paying subscriber's
receipt satisfies. Nothing in the app needs to know or care that a given
subscription came from a code instead of a card. No separate "comped user"
concept exists anywhere in the codebase, so there's nothing to keep in sync
or get wrong later.

## Two different things people might mean by "give it to my friends for free"

Worth being precise about, since they solve different problems:

1. **TestFlight testers** — automatic, no code needed at all. Anyone you add
   to the TestFlight build gets StoreKit's *sandbox* environment on that
   install: purchases and the free trial go through instantly, for free,
   every time, no real Apple ID billing ever touched. This is the right
   mechanism for people testing the app for you before launch. You already
   have this — it's just how TestFlight + StoreKit work together, nothing
   to set up.
2. **Offer Codes** — for people using the *real, released* App Store app
   (not a TestFlight build) who you want to have real, free, permanent-ish
   access — friends at the gym who aren't testers, people you want using
   the actual shipped product. This is what needs setting up below, and
   it's what the paywall's "HAVE A CODE?" button drives.

So: testers before launch → just add them to TestFlight, nothing else to
do. Friends after launch, on the real App Store app → Offer Codes.

## Prerequisite

Offer Codes are configured against a real, live subscription product in App
Store Connect — they can't be generated until
`uk.co.sullivanltd.crimpblock.standard.monthly` (currently only defined in
the local `Configuration.storekit` sandbox file, see
`ios/CrimpBlock/Configuration.storekit`) exists as an actual product there.
That itself needs your Apple Developer Program account and a signed
Paid Apps agreement — steps only you can do:

1. App Store Connect → your app record → **Subscriptions** → create a
   subscription group (e.g. "Deadpoint Standard", matching the group name
   already used in the local `.storekit` file) and one subscription inside
   it with product ID **exactly** `uk.co.sullivanltd.crimpblock.standard.monthly`
   — the ID is what the Swift code (`SubscriptionManager.standardMonthlyID`)
   looks up, so it has to match character-for-character.
2. Set price (£0.99/month) and add a 7-day free introductory offer, matching
   what's already modelled in `Configuration.storekit`.
3. Fill in the required subscription review metadata (localized display
   name, description) and submit the subscription for review alongside your
   next app build — subscriptions go through their own review, separate
   from the app binary.

## Generating and sending a code

Once that product exists and has been approved:

1. App Store Connect → **Subscriptions** → your subscription → **Offer
   Codes** tab → create a new **Custom Code** offer (one-time codes you
   generate and hand out yourself, as opposed to a public promotional code).
2. Choose the offer: e.g. "100% off for 1 month" (or however long you want
   a friend's free period to run) — this is separate from, and stacks
   however you configure it with, the 7-day trial every subscriber already
   gets.
3. Generate however many codes you need. Each one is single-use.
4. Send a code to a friend directly, or use the redemption **URL** App
   Store Connect generates alongside each code — sending that link is
   simpler than a code for anyone not already in the app, since tapping it
   opens the App Store and redeems in one step. The in-app "HAVE A CODE?"
   button (Apple's own redemption sheet, no custom UI) is for someone
   already in the app who's typing a code in by hand instead.

## What NOT to do

Don't build a custom "is this email on the free list" check anywhere in the
app or Supabase — this was considered and deliberately rejected in favour
of Offer Codes specifically so gifted access is indistinguishable, from the
app's point of view, from a real paid subscription. Anything bypassing
StoreKit's entitlement check would also be the kind of thing App Store
Review looks for and rejects in a paid app.

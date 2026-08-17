# App Store Connect — App Privacy questionnaire

Reference for filling in **App Store Connect → App → App Privacy** before submission.
Answers below are grounded in what the codebase actually does (checked by grepping
`app.js` and the native Swift layer for every network call and stored value) — no
analytics SDK, no ad SDK, no crash reporter, no location, no contacts, no device
identifiers are present anywhere in the app.

## Data types to declare as collected

### Contact Info → Email Address
- **Collected:** Yes
- **Linked to identity:** Yes (it's how you sign in)
- **Used for tracking:** No
- **Purpose:** App Functionality (account creation / sign-in via Supabase Auth)

### Health & Fitness → Fitness
- **What this covers:** the session log (date + session type) and exercise weight log
- **Collected:** Yes
- **Linked to identity:** Yes
- **Used for tracking:** No
- **Purpose:** App Functionality (this *is* the product — generating your next
  recommended session and correct working weights)

## Everything else: "Data Not Collected"

Confirmed absent from the codebase — no third-party SDK, no API call, nothing local
that leaves the device for any of:

- Location
- Contacts
- User Content beyond the fitness data above (no photos, no messages, no browsing history)
- Identifiers (no IDFA, no device ID sent anywhere)
- Usage Data / Analytics (no analytics SDK integrated)
- Diagnostics (no crash reporter integrated)
- Purchases — StoreKit 2 transaction data is handled by Apple; if a future
  server-side entitlement check is added (see plan Phase D), re-check this answer
  then, since that would newly involve a purchase-status data type

## Tracking

Answer **No** to "Do you or your third-party partners use data collected from this
app to track users?" — there is no tracking (as Apple defines it: linking data
across apps/websites owned by other companies, e.g. for advertising). Nothing in
this app does that.

## Before submitting, double-check

- [ ] Confirm Supabase project region (Settings → General in the Supabase
      dashboard) and update `privacy-policy.html`'s placeholder with it
- [ ] If Phase D adds server-side entitlement verification, re-run this checklist —
      it introduces a new data flow (subscription status) that isn't here yet
- [ ] If Phase C's intake quiz starts collecting anything beyond what's listed above
      (e.g. injury history as free text, equipment access) it needs to be added
      here as **User Content**, and the Privacy Policy needs a line about it —
      revisit this file when Phase C intake data model is built

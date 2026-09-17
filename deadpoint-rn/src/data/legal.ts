/** Shared by app/settings.tsx and app/paywall.tsx — added post-launch after
    an App Store rejection (Guideline 3.1.2) over the App Description
    missing a EULA link. That fix was metadata-only (the App Description
    itself), but the app had zero in-app Privacy Policy/Terms links at all,
    which Apple's fuller subscription rules also expect, particularly on
    the paywall itself. Kept in one file rather than duplicated in both
    screens so the two links can't drift apart.

    Both now point at the real getdeadpoint.co.uk pages (website/privacy.html,
    website/terms.html in the `website` branch of this same repo — a full,
    Oscar-read-and-approved Terms of Service, not a placeholder), replacing
    a stale claude.ai artifact link and Apple's own generic EULA template
    that were never actually the real destinations. This is separate from,
    and doesn't need to match, whatever EULA link is registered in App
    Store Connect's own App Description/App Privacy metadata — that field
    governs the App Store subscription transaction itself; this is the
    app's own general terms/privacy for using the service, the same
    distinction most apps' in-app Settings links vs. their store-listing
    EULA already draw. */
export const PRIVACY_POLICY_URL = 'https://getdeadpoint.co.uk/privacy';
export const TERMS_OF_USE_URL = 'https://getdeadpoint.co.uk/terms';

/** Shared by app/settings.tsx and app/paywall.tsx — added post-launch after
    an App Store rejection (Guideline 3.1.2) over the App Description
    missing a EULA link. That fix was metadata-only (the App Description
    itself), but the app had zero in-app Privacy Policy/Terms links at all,
    which Apple's fuller subscription rules also expect, particularly on
    the paywall itself. Kept in one file rather than duplicated in both
    screens so the two links can't drift apart.

    PRIVACY_POLICY_URL is the actual hosted policy — the same one
    registered as this app's Privacy Policy URL in App Store Connect's App
    Privacy section; keep them in sync if it ever moves.
    TERMS_OF_USE_URL is Apple's own standard EULA — this app never
    registered a custom one, so this is the one actually governing it,
    matching the exact link added to the App Description. */
export const PRIVACY_POLICY_URL = 'https://claude.ai/code/artifact/f709c8dc-fd11-4bd4-bef8-1221413b1d4a';
export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

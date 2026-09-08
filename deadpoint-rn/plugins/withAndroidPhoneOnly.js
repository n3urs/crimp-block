const { withAndroidManifest } = require('@expo/config-plugins');

/** Declares Deadpoint phone-only to the Play Store, via the one manifest tag
    Google reads to decide device eligibility. Mirrors app.json's own
    ios.supportsTablet: false, which already does the same thing on the App
    Store side — this app has no tablet layout and was never designed as
    one. Without it, Play's Store Listing form demands 7" and 10" tablet
    screenshots that don't exist and can't be produced (no tablet on hand),
    and 19,233 tablets sit in the supported-device count for an app that
    was never meant to run on one.

    android:largeScreens/xlargeScreens = false is still the mechanism Play
    reads for this — it hasn't been superseded by the device-catalogue UI,
    which excludes individual models, not whole form factors. */
module.exports = function withAndroidPhoneOnly(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults.manifest['supports-screens'] = [
      {
        $: {
          'android:smallScreens': 'true',
          'android:normalScreens': 'true',
          'android:largeScreens': 'false',
          'android:xlargeScreens': 'false',
          'android:anyDensity': 'true',
        },
      },
    ];
    return config;
  });
};

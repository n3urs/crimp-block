/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  name: "widget",
  displayName: "Deadpoint",
  bundleIdentifier: ".widget",
  deploymentTarget: "16.4",
  entitlements: {
    "com.apple.security.application-groups": ["group.uk.co.sullivanltd.crimpblock"],
  },
});

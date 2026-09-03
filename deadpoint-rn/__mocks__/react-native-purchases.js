/** Jest mock for 'react-native-purchases', mapped in jest.config.js.
    Added for Task 2 (subscription.ts). The real package's entry pulls in
    @revenuecat/purchases-js-hybrid-mappings, which ships ESM `import`/
    `export` syntax — same "Must use import to load ES Module" failure
    already documented for react-native, react-native-gesture-handler,
    etc. in this directory's own mocks, and for the same reason: this
    project's jest.config.js runs testEnvironment: 'node' with no RN
    preset, so nothing here transforms node_modules' ESM.

    subscription.test.ts only exercises hasEntitlement, a pure function
    with zero SDK dependency — but it lives in the same file as
    configureRevenueCat/useEntitlement/purchaseStandard/restorePurchases
    (per the task brief), so importing the module at all evaluates
    `import Purchases from 'react-native-purchases'` at the top. These
    stubs only need to make that import succeed; none of them is ever
    called by subscription.test.ts. The SDK itself is not unit-tested
    here (see subscription.ts's own doc comment) — real behaviour is
    verified live on device instead. */
module.exports = {
  __esModule: true,
  default: {
    configure: () => {},
    getCustomerInfo: () => Promise.resolve({ entitlements: { active: {} } }),
    getOfferings: () => Promise.resolve({ current: null }),
    purchasePackage: () => Promise.resolve({}),
    restorePurchases: () => Promise.resolve({ entitlements: { active: {} } }),
  },
};

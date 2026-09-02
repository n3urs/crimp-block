/** Jest mock for '@bacons/apple-targets' — mapped in jest.config.js.
    The real module's entry references the ambient `expo` global that
    expo-modules-core injects at native app startup; requiring it directly
    under this project's node-only jest.config.js throws "expo is not
    defined" before a single line of test code runs — confirmed empirically,
    same class of problem as the other mocks in this directory.

    Added for Task 3 (syncForecast): syncForecast.test.ts only exercises
    buildForecastPayload (pure, no native call), but importing syncForecast.ts
    also evaluates its top-level `import { ExtensionStorage } from
    '@bacons/apple-targets'` — this stub only needs to make that import
    succeed, not behave like the real native module. */
class ExtensionStorage {
  constructor(appGroup) {
    this.appGroup = appGroup;
  }
  set() {}
  get() {
    return null;
  }
  remove() {}
  static reloadWidget() {}
  static reloadControls() {}
}

module.exports = { ExtensionStorage };

/** Jest mock for 'react-native', mapped in jest.config.js.
    The real module's entry ships ESM `import`/`export` syntax — confirmed
    empirically: requiring it directly under this project's jest.config.js
    (testEnvironment: 'node', default transformIgnorePatterns excludes
    node_modules, no jest-expo/react-native preset) throws "Must use import
    to load ES Module" before a single line of test code runs, the same
    class of problem already documented for react-native-url-polyfill/auto
    and expo-secure-store in this directory.

    Added for Task 8 (SetsTally): __tests__/setsTally.test.ts only exercises
    `totalSetsFor`, a pure function with zero React Native dependency — but
    it lives in the same file as the `SetsTally` component (per the task
    brief), so importing the module at all pulls in `StyleSheet`/`View`
    too. These stubs only need to make module-level evaluation succeed
    (`StyleSheet.create` runs at import time; `View` is only referenced
    inside JSX, evaluated lazily when the component actually renders) —
    real rendering/hit-testing behaviour is NOT exercised by this mock or
    by setsTally.test.ts. Extend this file, don't fork it, if a future
    task's test needs more of the real API surface.

    Extended for Task 12 (DailyCard): __tests__/dailyCard.test.ts imports
    `DailyCard.tsx`, whose module-level `StyleSheet.create(...)` call
    spreads `StyleSheet.absoluteFill` and whose JSX/effects reference
    `ScrollView`/`Alert` — none of those are invoked or dereferenced by
    the test (it only calls the hook-free `CardBody` sub-component
    directly and inspects the returned element tree; `ScrollView`/`Alert`
    only ever appear as an unevaluated JSX element type or inside an
    effect body that never runs outside a real render), so these three
    additions are the same "just enough to make module-level evaluation
    succeed" bar as the original four exports, not real implementations. */
function View() {
  return null;
}
function Text() {
  return null;
}
function Pressable() {
  return null;
}
function ScrollView() {
  return null;
}
const Alert = {
  alert: () => {},
};
const StyleSheet = {
  create: (styles) => styles,
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
};

module.exports = { View, Text, Pressable, ScrollView, Alert, StyleSheet };

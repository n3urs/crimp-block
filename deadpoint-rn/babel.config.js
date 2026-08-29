module.exports = {
  // `babel.config.js` at the project root is read by BOTH Metro (the real
  // app bundle) and Jest (via babel-jest, see jest.config.js) — it is not
  // Jest-only. Tasks 2/5/8 grew a hand-rolled preset list here
  // (@babel/preset-env + @babel/preset-typescript + a manual JSX plugin)
  // purely to get plain-TS test files running under Jest, without
  // checking whether that same file also governs the real Metro build.
  // It does, and the hand-rolled list was missing two things Metro needs
  // for real: Flow-type stripping (react-native's own source ships Flow
  // syntax — see the expo-secure-store/react-native-url-polyfill Jest
  // mocks' own doc comments for where this was first noticed, but only
  // worked around for tests, never fixed for the real build) and the
  // react-native-worklets Babel plugin that makes `useSharedValue`/
  // `withTiming`/`withSpring`/gesture-handler `.onUpdate()` callbacks
  // (already used in Task 7's ExerciseRow, and load-bearing for Task 9's
  // swipe carousel) actually run on the UI thread rather than silently
  // executing as ordinary JS on the JS thread. `babel-preset-expo`
  // (pinned to the same 57.0.9 this project's `expo` package already
  // resolves internally — added as a real devDependency rather than
  // relying on its previous, fragile nested resolution under
  // node_modules/expo/node_modules) is the single preset Expo itself
  // uses for exactly this: JSX, Flow-stripping, TypeScript, and automatic
  // reanimated/worklets plugin insertion when those packages are
  // installed (they are). It replaces the entire hand-rolled list, not
  // just adds to it — babel-jest applies the same preset for tests too,
  // so Jest and Metro now compile identically instead of diverging.
  presets: ['babel-preset-expo'],
};

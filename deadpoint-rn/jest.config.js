module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  /** All mocked because their real implementations are native-only and
      cannot run under plain Node (testEnvironment: 'node', no RN/jest-expo
      preset): react-native-url-polyfill/auto transitively requires the
      'react-native' package for Platform.OS, which ships Flow syntax this
      project's babel-preset-env/typescript transform doesn't strip;
      expo-secure-store's main entry resolves to a compiled native binding
      that only exists inside an actual iOS/Android build; react-native
      itself and react-native-gesture-handler (added for Task 8's
      SetsTally, whose test imports the co-located `totalSetsFor` helper
      from a .tsx file that also imports both) ship ESM entries that throw
      "Must use import to load ES Module" under this same node-only setup.
      react-native-reanimated (added for Task 9's useSwipeCarousel) ships
      the same kind of ESM-only entry and throws identically.
      react-native-safe-area-context (added when DailyCard.tsx started
      using useSafeAreaInsets() to fix a real safe-area bug) pulls in
      react-native's own codegenNativeComponent.js and throws the same way.
      @bacons/apple-targets (added for Task 3's syncForecast) references the
      ambient `expo` global expo-modules-core injects at native app
      startup and throws "expo is not defined" the same way.
      See the mock files in __mocks__/ for what each stands in for and why
      a no-op/stub is sufficient for the tests that need them. */
  moduleNameMapper: {
    '^react-native-url-polyfill/auto$': '<rootDir>/__mocks__/react-native-url-polyfill-auto.js',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^react-native-gesture-handler$': '<rootDir>/__mocks__/react-native-gesture-handler.js',
    '^react-native-reanimated$': '<rootDir>/__mocks__/react-native-reanimated.js',
    '^react-native-safe-area-context$': '<rootDir>/__mocks__/react-native-safe-area-context.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    '^@bacons/apple-targets$': '<rootDir>/__mocks__/@bacons/apple-targets.js',
  },
};

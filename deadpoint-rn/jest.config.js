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
  /** Both mocked because their real implementations are native-only and
      cannot run under plain Node (testEnvironment: 'node', no RN/jest-expo
      preset): react-native-url-polyfill/auto transitively requires the
      'react-native' package for Platform.OS, which ships Flow syntax this
      project's babel-preset-env/typescript transform doesn't strip;
      expo-secure-store's main entry resolves to a compiled native binding
      that only exists inside an actual iOS/Android build. See the mock
      files in __mocks__/ for what each stands in for and why a no-op is
      sufficient for src/data/supabase.ts's tests. */
  moduleNameMapper: {
    '^react-native-url-polyfill/auto$': '<rootDir>/__mocks__/react-native-url-polyfill-auto.js',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
  },
};

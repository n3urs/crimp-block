module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
  // Added for Task 8 (SetsTally): neither preset above transforms JSX —
  // preset-typescript only strips types, and this project's Jest config
  // (testEnvironment: 'node', no jest-expo/react-native preset — see
  // jest.config.js's own comments) never needed a JSX transform until this
  // task's component test imports a .tsx file that actually renders
  // elements. `runtime: 'automatic'` matches expo/tsconfig.base's
  // `"jsx": "react-jsx"` (tsc's own JSX mode for this project), so Jest and
  // tsc agree on how JSX compiles.
  plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]],
};

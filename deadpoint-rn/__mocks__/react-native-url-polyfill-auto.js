/** Jest mock for 'react-native-url-polyfill/auto', mapped in jest.config.js.
    The real module is side-effect-only: on native it swaps globalThis.URL /
    URLSearchParams for a polyfilled implementation, and does nothing on web.
    It also transitively pulls in the real 'react-native' package to read
    Platform.OS, which ships Flow syntax this project's plain
    babel-preset-env/typescript transform can't parse, and which this
    project's jest.config.js (testEnvironment: 'node', no RN preset) never
    needed until this task. Under Jest's node environment, Node's built-in
    URL/URLSearchParams are already spec-compliant, so there is nothing to
    polyfill and no native module to reach for — a no-op is the correct
    stand-in here, not a workaround. */
module.exports = {};

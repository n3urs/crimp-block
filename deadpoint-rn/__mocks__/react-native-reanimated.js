/** Jest mock for 'react-native-reanimated', mapped in jest.config.js.
    Same class of problem as react-native-gesture-handler.js and
    react-native.js in this directory: the real module's entry
    (lib/module/index.js) ships ESM `import`/`export` syntax, confirmed
    empirically — requiring it directly under this project's
    jest.config.js (testEnvironment: 'node', default
    transformIgnorePatterns excludes node_modules, no jest-expo/react-native
    preset) throws "Must use import to load ES Module" before a single
    line of test code runs.

    Added for Task 9 (useSwipeCarousel): __tests__/carousel.test.ts only
    needs `require('../src/components/daily-card/useSwipeCarousel')` to
    succeed so it can reach the pure, exported `nextIndex` helper — it
    never calls `useSwipeCarousel()` itself, and none of
    Easing/runOnJS/useSharedValue/withSpring/withTiming are invoked at
    module scope in that file (they're only referenced inside the hook's
    function body). A bare no-op stub is therefore sufficient for the
    module to load; it does NOT simulate real shared values, worklet
    scheduling, spring/timing physics, or cross-thread synchronization —
    see Task 9's report for why none of that can be verified without a
    real device/dev-client build. Extend this file, don't fork it, if a
    future task's test needs more of the real API surface. */
const Easing = {
  out: (curve) => curve,
  inOut: (curve) => curve,
  ease: (t) => t,
};

function runOnJS(fn) {
  return fn;
}

function useSharedValue(initial) {
  return { value: initial };
}

function withSpring(toValue) {
  return toValue;
}

function withTiming(toValue) {
  return toValue;
}

module.exports = { Easing, runOnJS, useSharedValue, withSpring, withTiming };

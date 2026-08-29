/** Jest mock for 'react-native-gesture-handler', mapped in jest.config.js.
    Same reasoning as __mocks__/react-native.js in this directory: the real
    package transitively requires 'react-native', which cannot load under
    this project's plain-node Jest config.

    Added for Task 8 (SetsTally): __tests__/setsTally.test.ts only needs
    `require('../src/components/daily-card/SetsTally')` to succeed so it
    can reach the co-located `totalSetsFor` export — it never constructs or
    fires a real gesture (SetsTally's `.minDuration()`/`.runOnJS()`/
    `.onStart()`/`.onEnd()` calls happen inside the component function
    body, not at module top level, so they are never even invoked by that
    test). This chainable builder stub is kept minimally functional anyway
    (rather than a bare empty object) so a future component-level gesture
    test has something to build on without a rewrite. It does NOT simulate
    real touch sequences, timing, or exclusivity resolution — see Task 8's
    report for that gap. */
function chainableGesture() {
  const gesture = {
    minDuration: () => gesture,
    maxDuration: () => gesture,
    runOnJS: () => gesture,
    onStart: () => gesture,
    onEnd: () => gesture,
    onTouchesDown: () => gesture,
    minDistance: () => gesture,
    simultaneousWithExternalGesture: () => gesture,
    onUpdate: () => gesture,
  };
  return gesture;
}

const Gesture = {
  LongPress: () => chainableGesture(),
  Tap: () => chainableGesture(),
  Pan: () => chainableGesture(),
  Exclusive: (...gestures) => gestures,
};

function GestureDetector({ children }) {
  return children ?? null;
}

module.exports = { Gesture, GestureDetector };

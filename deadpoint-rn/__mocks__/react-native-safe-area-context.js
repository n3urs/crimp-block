/** Jest mock for 'react-native-safe-area-context', mapped in jest.config.js.
    Same class of problem as the other __mocks__ files in this directory:
    the real module's entry pulls in react-native's own
    codegenNativeComponent.js, which throws "Must use import to load ES
    Module" under this project's plain-node Jest config.

    Added when DailyCard.tsx started using useSafeAreaInsets() (a real
    device bug Oscar caught live: the week strip rendered behind the
    Dynamic Island/status bar with no safe-area handling at all).
    __tests__/dailyCard.test.ts calls the hook-free `CardBody` directly,
    never `DailyCard` itself, so `useSafeAreaInsets` is never actually
    invoked by that test — this only needs to make module-load succeed.
    Zero insets is a reasonable, honest default regardless (matches
    running with no notch/Dynamic Island) — this does NOT simulate real
    per-device inset values. */
function useSafeAreaInsets() {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function SafeAreaProvider({ children }) {
  return children ?? null;
}

module.exports = { useSafeAreaInsets, SafeAreaProvider };

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colours } from '../src/design/colours';

export default function RootLayout() {
  const [loaded] = useFonts({
    'ArchivoBlack-Regular': require('../assets/fonts/ArchivoBlack-Regular.ttf'),
    'RobotoMono-Bold': require('../assets/fonts/RobotoMono-Bold.ttf'),
    'RobotoMono-Medium': require('../assets/fonts/RobotoMono-Medium.ttf'),
    'SpaceMono-Bold': require('../assets/fonts/SpaceMono-Bold.ttf'),
  });

  // Holding on the app's own background colour rather than white avoids
  // a light flash on launch against this dark UI.
  if (!loaded) return <View style={{ flex: 1, backgroundColor: Colours.bg }} />;

  // GestureHandlerRootView must wrap the whole app, not just the screens
  // that use a gesture — react-native-gesture-handler throws a real
  // runtime error otherwise ("GestureDetector must be used as a
  // descendant of GestureHandlerRootView"), caught live on a real device
  // build: no task through 12 added this, and no test could have caught
  // it (Jest never renders a real gesture-handler component tree here).
  //
  // SafeAreaProvider: react-native-safe-area-context has been an
  // installed dependency since Task 1 but was never actually wired up —
  // confirmed live on device, real bug Oscar caught: WeekStrip rendered
  // starting at y=0, sitting behind the Dynamic Island/status bar/time.
  // Unlike SwiftUI (safe-area-respecting by default unless a view opts
  // out with .ignoresSafeArea() — confirmed DailyCardView itself never
  // does; only its background does, NativeAppView.swift:148), RN views
  // extend edge-to-edge by default and need this explicitly. Provider
  // goes here, at the true app root; the actual top-inset padding is
  // applied in DailyCard.tsx via useSafeAreaInsets(), on the padded
  // content only — the background still bleeds edge-to-edge, matching
  // Swift's ignoresSafeArea() being on the background alone.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colours.bg } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

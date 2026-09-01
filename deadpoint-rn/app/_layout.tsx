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
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colours.bg } }}>
          {/* Route name is group-qualified ("(main)/calendar", not
              "calendar") because app/(main) has no _layout.tsx of its own —
              the group is "transparent" and every screen inside it is a
              direct child of THIS root Stack, keyed by its full path
              relative to app/. Confirmed against the installed expo-router
              build (Task 6 Step 1): app/index.tsx's own doc comment already
              established that expo-router strips group segments only from
              the URL used for navigation (router.push('/calendar')), not
              from a screen's internal name in the navigator tree — and no
              other _layout.tsx exists to make "(main)" its own navigator.
              'modal' is a valid `presentation` value on native-stack (the
              navigator expo-router's <Stack> wraps): confirmed directly
              against node_modules/expo-router/build/react-navigation/
              native-stack/types.d.ts (`presentation?: Exclude<ScreenProps
              ['stackPresentation'], 'push'> | 'card'`) and node_modules/
              react-native-screens' StackPresentationTypes, which includes
              'modal'. There is no standalone @react-navigation/native-stack
              package installed — expo-router vendors its own fork under
              build/react-navigation/native-stack and build/fork/
              native-stack, so the brief's literal grep path assumption
              (a top-level @react-navigation/native-stack package) doesn't
              match this install, though the underlying claim it was
              checking for holds. */}
          <Stack.Screen name="(main)/calendar" options={{ presentation: 'modal' }} />
          {/* Weight editing modal (Task 1, this plan) — direct port of
              WeightEditView.swift. Not group-qualified like the calendar
              screen above: app/weight-edit.tsx lives directly under app/,
              not inside the (main) group, so its route name is just
              "weight-edit", matching its file path relative to app/. */}
          <Stack.Screen name="weight-edit" options={{ presentation: 'modal' }} />
          {/* Day picker modal (Task 2, this plan) — direct port of
              DayPickerView.swift. Backdating/editing a previous
              (non-today) day tapped in DailyCard's WeekStrip. Same
              not-group-qualified reasoning as weight-edit above:
              app/day-picker.tsx lives directly under app/, so its route
              name is just "day-picker". */}
          <Stack.Screen name="day-picker" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

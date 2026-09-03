import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colours } from '../src/design/colours';
import { configureRevenueCat } from '../src/data/subscription';

export default function RootLayout() {
  const [loaded] = useFonts({
    'ArchivoBlack-Regular': require('../assets/fonts/ArchivoBlack-Regular.ttf'),
    'RobotoMono-Bold': require('../assets/fonts/RobotoMono-Bold.ttf'),
    'RobotoMono-Medium': require('../assets/fonts/RobotoMono-Medium.ttf'),
    'SpaceMono-Bold': require('../assets/fonts/SpaceMono-Bold.ttf'),
  });

  // Once, at true app root. PAYWALL_ENABLED is still false (Task 2 of
  // this plan) so nothing reads the resulting entitlement state yet —
  // this just gets RevenueCat's SDK primed for when Task 4 turns the
  // gate on. The placeholder API key in subscription.ts can't reach
  // RevenueCat's servers; catch+log rather than letting a bad key (or
  // any future real misconfiguration) crash launch.
  useEffect(() => {
    try {
      configureRevenueCat();
    } catch (e) {
      console.error('configureRevenueCat failed:', e);
    }
  }, []);

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
          {/* Settings modal (Task 2, this plan) — direct port of
              SettingsView.swift. Reached from the daily card's gear icon.
              Same not-group-qualified reasoning as weight-edit/day-picker
              above: app/settings.tsx lives directly under app/, so its
              route name is just "settings". */}
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          {/* Plan overview modal (Task 2, this plan) — direct port of
              PlanSheetView.swift. Reached from the daily card's phase
              badge. Same not-group-qualified reasoning as weight-edit/
              day-picker/settings above: app/plan.tsx lives directly under
              app/, so its route name is just "plan". */}
          <Stack.Screen name="plan" options={{ presentation: 'modal' }} />
          {/* Phase-detail drill-down modal (Task 3, this plan) — direct
              port of PlanSheetView.swift's PhaseDetailView. Pushed from a
              phase row on app/plan.tsx with just the array index into
              engine.phases. Same not-group-qualified reasoning as the
              other screens above: app/plan-phase.tsx lives directly
              under app/, so its route name is just "plan-phase". */}
          <Stack.Screen name="plan-phase" options={{ presentation: 'modal' }} />
          {/* Subscription paywall (Task 3, this plan) — direct port
              structurally similar to the modals above (app/paywall.tsx
              lives directly under app/, so its route name is just
              "paywall"), but deliberately NOT given `presentation:
              'modal'` like every screen above: a modal is
              swipe-dismissable on iOS, which would let anyone swipe past
              a screen meant to be a hard gate. `gestureEnabled: false`
              closes the other half of that same gap: 'card' presentation
              (the default, used here) still supports the interactive
              edge-swipe-back gesture on iOS by default when there IS a
              screen underneath to reveal — a defeated hard gate is a real
              payment bypass, not a cosmetic issue, so this doesn't rely
              on every future caller remembering to navigate here with
              `router.replace` rather than `router.push` (Task 3's own
              report flagged exactly this as worth hardening rather than
              trusting caller discipline alone). Nobody can reach this
              route yet — PAYWALL_ENABLED is still false and no caller
              navigates here (Task 4 wires the actual gate); this
              registration only makes the route addressable for manual/
              deep-link verification now and for Task 4 to route into
              later. */}
          <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

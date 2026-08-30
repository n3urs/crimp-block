import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colours.bg } }} />
    </GestureHandlerRootView>
  );
}

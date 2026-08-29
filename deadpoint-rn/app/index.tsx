import { Text, View } from 'react-native';
import { Colours } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';

export default function TempFontCheck() {
  return (
    <View style={{ flex: 1, backgroundColor: Colours.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: Colours.fg, ...Fonts.heading(32) }}>Deadpoint</Text>
    </View>
  );
}

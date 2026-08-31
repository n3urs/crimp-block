// TEMPORARY — deleted once DayCell.tsx (Task 4) proves the real partial-
// border rendering works on device. This only exists to isolate whether
// react-native-svg itself renders at all before building UI on top of it,
// same practice as Phase 3 Task 1 proving expo-audio first.
import React from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

export function SvgProof() {
  return (
    <View style={{ width: 100, height: 100 }}>
      <Svg width={100} height={100}>
        <Line x1={0} y1={0} x2={100} y2={100} stroke="#F2B134" strokeWidth={3} />
        <Line x1={100} y1={0} x2={0} y2={100} stroke="#4FB3A5" strokeWidth={3} />
      </Svg>
    </View>
  );
}

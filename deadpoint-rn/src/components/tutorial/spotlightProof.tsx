// TEMPORARY — deleted once the real spotlight system (Task 7) proves the
// same technique works for real tutorial steps. Renders one real button
// and a spotlight hole around it; tapping the button should still work
// (the hole lets the tap through), tapping anywhere else should not.
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TutorialTargetProvider, useTutorialTarget, type TutorialTargetMap } from './TutorialTargetContext';

function ProofTarget({ onPress }: { onPress: () => void }) {
  const ref = useTutorialTarget('proofButton');
  return (
    <Pressable ref={ref} onPress={onPress} style={styles.target}>
      <Text style={styles.targetText}>TAP ME</Text>
    </Pressable>
  );
}

interface Rect { x: number; y: number; width: number; height: number; }

export function SpotlightProof() {
  const targetsRef = useRef<TutorialTargetMap>(new Map());
  const [tapCount, setTapCount] = useState(0);
  const [hole, setHole] = useState<Rect | null>(null);

  const measure = () => {
    const ref = targetsRef.current.get('proofButton');
    ref?.current?.measureInWindow((x, y, width, height) => setHole({ x, y, width, height }));
  };

  return (
    <View style={styles.root}>
      <TutorialTargetProvider targetsRef={targetsRef}>
        <View style={styles.stage}>
          <ProofTarget onPress={() => setTapCount((c) => c + 1)} />
        </View>
      </TutorialTargetProvider>
      <Pressable onPress={measure} style={styles.measureButton}><Text style={styles.targetText}>MEASURE + SPOTLIGHT</Text></Pressable>
      <Text style={styles.count}>Real taps registered: {tapCount}</Text>

      {hole != null && (
        <>
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path
              d={`M0,0 H${400} V${800} H0 Z M${hole.x},${hole.y} H${hole.x + hole.width} V${hole.y + hole.height} H${hole.x} Z`}
              fill="black" fillOpacity={0.75} fillRule="evenodd"
            />
          </Svg>
          {/* Four absorbing rectangles around the hole — real taps outside
              these (i.e. inside the hole) fall through to ProofTarget. */}
          <Pressable style={[styles.absorb, { top: 0, left: 0, right: 0, height: hole.y }]} onPress={() => {}} />
          <Pressable style={[styles.absorb, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} onPress={() => {}} />
          <Pressable style={[styles.absorb, { top: hole.y, height: hole.height, left: 0, width: hole.x }]} onPress={() => {}} />
          <Pressable style={[styles.absorb, { top: hole.y, height: hole.height, left: hole.x + hole.width, right: 0 }]} onPress={() => {}} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { padding: 40, alignItems: 'center' },
  target: { backgroundColor: '#F2B134', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  targetText: { fontWeight: '700' },
  measureButton: { backgroundColor: '#4FB3A5', padding: 12, margin: 20, borderRadius: 8, alignItems: 'center' },
  count: { textAlign: 'center', color: '#fff' },
  absorb: { position: 'absolute' },
});

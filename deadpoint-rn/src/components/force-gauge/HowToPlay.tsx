// src/components/force-gauge/HowToPlay.tsx
/** Three short lines for the waiting screen: how the pull controls the bird.
    It takes a few goes to get the feel of it, and the gym station is
    walk-up, so the screen itself has to say it. Wording matches the physics
    (flappyPhysics.ts): pulling adds upward speed, easing off lets gravity
    win, and a steady moderate pull (~6.4 kg of the 10 kg range) holds the
    bird level (hence "hovers"). `unit` scales everything, like GymLeaderboard. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Fonts } from '../../design/fonts';

const UP = '#7CE38B';
const DOWN = '#FF8A3D';
const LEVEL = '#FFD34D';

export const HOW_TO_PLAY_LINES = [
  { kind: 'up', text: 'PULL HARDER TO CLIMB' },
  { kind: 'down', text: 'EASE OFF TO DROP' },
  { kind: 'level', text: 'FIND THE PULL THAT HOVERS' },
] as const;

const PATHS = {
  up: 'M12 20 V5 M6 11 L12 5 L18 11',
  down: 'M12 4 V19 M6 13 L12 19 L18 13',
  level: 'M3 12 H21 M8 7 L3 12 L8 17 M16 7 L21 12 L16 17',
} as const;
const COLOURS = { up: UP, down: DOWN, level: LEVEL } as const;

export function HowToPlay({ unit }: { unit: number }) {
  const icon = unit * 0.62;
  return (
    <View style={[styles.card, { borderRadius: unit * 0.3, paddingVertical: unit * 0.28, paddingHorizontal: unit * 0.4, gap: unit * 0.16 }]}>
      {HOW_TO_PLAY_LINES.map((line) => (
        <View key={line.kind} style={[styles.row, { gap: unit * 0.3 }]}>
          <Svg width={icon} height={icon} viewBox="0 0 24 24">
            <Path d={PATHS[line.kind]} fill="none" stroke={COLOURS[line.kind]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={[styles.text, { fontSize: unit * 0.4 }]} numberOfLines={1} adjustsFontSizeToFit>
            {line.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(10,14,22,0.74)', alignSelf: 'stretch', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { ...Fonts.mono(14, 'bold'), color: '#FFFFFF', letterSpacing: 1, flex: 1 },
});

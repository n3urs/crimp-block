import React, { useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { TutorialTargetMap } from './TutorialTargetContext';
import type { useTutorialController } from './TutorialController';

interface Rect { x: number; y: number; width: number; height: number; }

const CORNER_RADIUS = 14;
const HOLE_PADDING_X = 8;
const HOLE_PADDING_Y = 10;

export function TutorialOverlay({
  controller, targetsRef, isActive,
}: {
  controller: ReturnType<typeof useTutorialController>;
  targetsRef: React.RefObject<TutorialTargetMap>;
  isActive: boolean;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [measureFailed, setMeasureFailed] = useState(false);
  const screen = Dimensions.get('window');

  useEffect(() => {
    if (!isActive || controller.currentStep == null) { setRect(null); return; }
    const targetID = controller.currentStep.targetID;
    const measure = () => {
      const ref = targetsRef.current?.get(targetID);
      if (!ref?.current) { setMeasureFailed(true); return; }
      ref.current.measureInWindow((x, y, width, height) => {
        if (width === 0 && height === 0) { setMeasureFailed(true); return; }
        setMeasureFailed(false);
        setRect({ x: x - HOLE_PADDING_X, y: y - HOLE_PADDING_Y, width: width + HOLE_PADDING_X * 2, height: height + HOLE_PADDING_Y * 2 });
      });
    };
    measure();
    const id = setTimeout(measure, 150);
    return () => clearTimeout(id);
  }, [isActive, controller.currentStep, targetsRef]);

  if (!isActive || controller.currentStep == null) return null;
  const step = controller.currentStep;

  if (step.fullScreenSwipeDemo) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[StyleSheet.absoluteFill, styles.dimLight]} pointerEvents="none" />
        <BigSwipeArrow screenHeight={screen.height} screenWidth={screen.width} />
        <CaptionCard
          step={step} stepIndex={controller.stepIndex} totalSteps={controller.steps.length}
          onSkip={controller.skip} screen={screen}
          anchorRect={{ x: 0, y: screen.height * 0.55, width: screen.width, height: 1 }}
        />
      </View>
    );
  }

  if (measureFailed || rect == null) {
    // The step's target isn't on screen at all — without this branch the
    // overlay would render nothing at all (no spotlight, no caption,
    // critically no SKIP), stranding the walkthrough with no way out.
    return (
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.dimHeavy]} onPress={controller.advance} />
        <CaptionCard
          step={step} stepIndex={controller.stepIndex} totalSteps={controller.steps.length}
          onSkip={controller.skip} screen={screen} footerOverride="Tap anywhere to continue"
          anchorRect={{ x: 0, y: screen.height * 0.32, width: screen.width, height: 1 }}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path
          d={`M0,0 H${screen.width} V${screen.height} H0 Z M${rect.x},${rect.y} H${rect.x + rect.width} V${rect.y + rect.height} H${rect.x} Z`}
          fill="black" fillOpacity={0.75} fillRule="evenodd"
        />
        {/* Dark outer stroke behind a light inner one, so the ring stays
            visible against a bright target (a single near-white ring
            disappeared against the amber DONE button — reported directly
            in the Swift version). */}
        <Path d={roundedRectPath(rect, CORNER_RADIUS)} stroke="rgba(0,0,0,0.55)" strokeWidth={6} fill="none" />
        <Path d={roundedRectPath(rect, CORNER_RADIUS)} stroke={Colours.fg} strokeWidth={2.5} fill="none" />
      </Svg>
      {step.showsSwipeHint && <SwipeHintBadge x={rect.x + rect.width / 2} y={Math.max(30, rect.y - 30)} />}
      {/* Four absorbing rectangles around the hole — a real tap only
          reaches the actual control underneath through the hole itself. */}
      <Pressable style={[styles.absorb, { top: 0, left: 0, right: 0, height: Math.max(0, rect.y) }]} onPress={() => {}} />
      <Pressable style={[styles.absorb, { top: rect.y + rect.height, left: 0, right: 0, bottom: 0 }]} onPress={() => {}} />
      <Pressable style={[styles.absorb, { top: rect.y, height: rect.height, left: 0, width: Math.max(0, rect.x) }]} onPress={() => {}} />
      <Pressable style={[styles.absorb, { top: rect.y, height: rect.height, left: rect.x + rect.width, right: 0 }]} onPress={() => {}} />
      <CaptionCard step={step} stepIndex={controller.stepIndex} totalSteps={controller.steps.length} onSkip={controller.skip} screen={screen} anchorRect={rect} />
    </View>
  );
}

function roundedRectPath(r: Rect, radius: number): string {
  const x = r.x, y = r.y, w = r.width, h = r.height, rad = Math.min(radius, w / 2, h / 2);
  return `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`;
}

function CaptionCard({
  step, stepIndex, totalSteps, onSkip, screen, anchorRect, footerOverride,
}: {
  step: { title: string; body: string; fullScreenSwipeDemo?: boolean };
  stepIndex: number; totalSteps: number; onSkip: () => void; screen: { width: number; height: number };
  anchorRect: Rect; footerOverride?: string;
}) {
  const [height, setHeight] = useState(200);
  const cardWidth = Math.min(320, screen.width - 40);
  const gap = 12;
  const fitsBelow = anchorRect.y + anchorRect.height + gap + height < screen.height;
  const top = fitsBelow ? anchorRect.y + anchorRect.height + gap : Math.max(20, anchorRect.y - gap - height);

  return (
    <View
      style={[styles.caption, { width: cardWidth, top: Math.min(top, screen.height - height - 20), left: (screen.width - cardWidth) / 2 }]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <View style={styles.captionHeader}>
        <Text style={styles.captionCounter}>{stepIndex + 1} OF {totalSteps}</Text>
        <Pressable onPress={onSkip}><Text style={styles.captionSkip}>SKIP</Text></Pressable>
      </View>
      <Text style={styles.captionTitle}>{step.title}</Text>
      <Text style={styles.captionBody}>{step.body}</Text>
      <Text style={styles.captionFooter}>{footerOverride ?? (step.fullScreenSwipeDemo ? 'Swipe the card to continue' : 'Tap the highlighted area to continue')}</Text>
    </View>
  );
}

function BigSwipeArrow({ screenWidth, screenHeight }: { screenWidth: number; screenHeight: number }) {
  return (
    <View style={[styles.arrowRow, { top: screenHeight * 0.42 - 45, width: screenWidth }]} pointerEvents="none">
      <Text style={styles.arrowGlyph}>‹</Text>
      <Text style={styles.arrowLabel}>SWIPE</Text>
      <Text style={styles.arrowGlyph}>›</Text>
    </View>
  );
}

function SwipeHintBadge({ x, y }: { x: number; y: number }) {
  return (
    <View style={[styles.swipeBadge, { left: x - 45, top: y - 15 }]} pointerEvents="none">
      <Text style={styles.swipeBadgeText}>‹ SWIPE ›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dimHeavy: { backgroundColor: 'rgba(0,0,0,0.75)' },
  dimLight: { backgroundColor: 'rgba(0,0,0,0.35)' },
  absorb: { position: 'absolute' },
  caption: {
    position: 'absolute', padding: 16, borderRadius: 14,
    backgroundColor: Colours.s1, borderWidth: 1, borderColor: Colours.s3,
  },
  captionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  captionCounter: { ...Fonts.mono(10, 'bold'), color: Colours.faint },
  captionSkip: { ...Fonts.mono(10, 'bold'), color: Colours.faint },
  captionTitle: { fontSize: 19, fontWeight: '800', color: Colours.fg, marginBottom: 8 },
  captionBody: { fontSize: 13.5, color: Colours.dim, marginBottom: 8 },
  captionFooter: { ...Fonts.mono(10, 'semibold'), color: Colours.faint },
  arrowRow: { position: 'absolute', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, height: 90 },
  arrowGlyph: { fontSize: 46, fontWeight: '700', color: Colours.fg },
  arrowLabel: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 3 },
  swipeBadge: {
    position: 'absolute', width: 90, paddingVertical: 7, borderRadius: 999,
    backgroundColor: Colours.s1, borderWidth: 1, borderColor: 'rgba(237,235,229,0.4)', alignItems: 'center',
  },
  swipeBadgeText: { ...Fonts.mono(11, 'bold'), color: Colours.fg, letterSpacing: 1.5 },
});

import React, { useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path, Polyline } from 'react-native-svg';
import { Colours, resolveColour } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import type { TutorialTargetMap } from './TutorialTargetContext';
import { ARROW_SIZE, computeCaptionLayout } from './captionLayout';
import type { useTutorialController } from './TutorialController';

interface Rect { x: number; y: number; width: number; height: number; }

const CORNER_RADIUS = 14;
// The brand amber, used for every "this is the bit to act on" mark in the
// overlay. resolveColour rather than a literal so it tracks the palette.
const ACCENT = resolveColour('--gorse');
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
      <PulseRing rect={rect} />
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

/** A ring that breathes outwards from the spotlight. The static white
    ring the SVG already draws is legible but sits still, and on a screen
    where everything else is dimmed that read as decoration rather than as
    the thing to press: every person who has been through this tutorial
    waited for it to advance by itself. Movement is what the eye lands on
    first, so the target gets some. */
function PulseRing({ rect }: { rect: Rect }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = 0;
    pulse.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse, rect.x, rect.y]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.12 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: rect.x, top: rect.y, width: rect.width, height: rect.height,
          borderRadius: CORNER_RADIUS, borderWidth: 2.5, borderColor: Colours.fg,
        },
        style,
      ]}
    />
  );
}

/** Sits just outside the spotlight's edge, over the highlighted box itself
    (position from captionLayout.ts), and bounces towards it. `direction` is
    which way the box is from the arrow. Absolutely positioned in the
    overlay's own coordinates — NOT inside the caption card, whose centre
    has nothing to do with where the box is. */
function PointerArrow({ direction, left, top }: { direction: 'up' | 'down'; left: number; top: number }) {
  const bounce = useSharedValue(0);
  useEffect(() => {
    bounce.value = withRepeat(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [bounce]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (direction === 'up' ? -1 : 1) * bounce.value * 7 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: ARROW_SIZE, height: ARROW_SIZE }, style]}>
      <Svg width={ARROW_SIZE} height={ARROW_SIZE} viewBox="0 0 24 24" style={{ transform: [{ rotate: direction === 'up' ? '180deg' : '0deg' }] }}>
        <Polyline points="6 9 12 15 18 9" fill="none" stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M12 3 V14" stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function roundedRectPath(r: Rect, radius: number): string {
  const x = r.x, y = r.y, w = r.width, h = r.height, rad = Math.min(radius, w / 2, h / 2);
  return `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`;
}

function CaptionCard({
  step, stepIndex, totalSteps, onSkip, screen, anchorRect, footerOverride,
}: {
  step: { title: string; body: string; targetLabel?: string; fullScreenSwipeDemo?: boolean };
  stepIndex: number; totalSteps: number; onSkip: () => void; screen: { width: number; height: number };
  anchorRect: Rect; footerOverride?: string;
}) {
  const [height, setHeight] = useState(200);
  const cardWidth = Math.min(320, screen.width - 40);
  const instruction = footerOverride ?? (step.fullScreenSwipeDemo
    ? 'SWIPE THE CARD'
    : `TAP ${step.targetLabel ?? 'THE HIGHLIGHTED AREA'}`);
  // The swipe-demo and measure-failed steps have no single spot to point
  // at — their instruction is about the whole screen.
  const pointsAtSomething = !step.fullScreenSwipeDemo && footerOverride == null;
  const layout = computeCaptionLayout({ hole: anchorRect, screen, cardHeight: height, showArrow: pointsAtSomething });

  return (
    <>
    {layout.arrow != null && <PointerArrow direction={layout.arrow.direction} left={layout.arrow.left} top={layout.arrow.top} />}
    <View
      style={[styles.caption, { width: cardWidth, top: layout.top, left: (screen.width - cardWidth) / 2 }]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <View style={styles.captionHeader}>
        <Text style={styles.captionCounter}>{stepIndex + 1} OF {totalSteps}</Text>
        {/* Was a bare 10px word with no padding — Oscar reported it as hard
            to hit. Same look, but the negative margin lets the padding grow
            the real touch box without moving the label or the card. */}
        <Pressable onPress={onSkip} hitSlop={12} style={styles.captionSkipButton} accessibilityRole="button" accessibilityLabel="Skip the tutorial">
          <Text style={styles.captionSkip}>SKIP</Text>
        </Pressable>
      </View>
      <Text style={styles.captionTitle}>{step.title}</Text>
      <Text style={styles.captionBody}>{step.body}</Text>
      {/* Was 10px grey type on the last line, which read as a caption
          rather than an instruction. */}
      <View style={styles.captionInstruction}>
        <Text style={styles.captionInstructionText}>{instruction}</Text>
      </View>
    </View>
    </>
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
  captionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  captionSkipButton: { paddingVertical: 10, paddingHorizontal: 14, marginVertical: -10, marginRight: -14 },
  captionCounter: { ...Fonts.mono(10, 'bold'), color: Colours.faint },
  captionSkip: { ...Fonts.mono(10, 'bold'), color: Colours.faint },
  captionTitle: { fontSize: 19, fontWeight: '800', color: Colours.fg, marginBottom: 8 },
  captionBody: { fontSize: 13.5, color: Colours.dim, marginBottom: 8 },
  captionInstruction: {
    marginTop: 4, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: 'rgba(242,177,52,0.14)', borderWidth: 1, borderColor: 'rgba(242,177,52,0.4)',
  },
  captionInstructionText: { ...Fonts.mono(12, 'bold'), color: ACCENT, letterSpacing: 0.8 },
  arrowRow: { position: 'absolute', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, height: 90 },
  arrowGlyph: { fontSize: 46, fontWeight: '700', color: Colours.fg },
  arrowLabel: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 3 },
  swipeBadge: {
    position: 'absolute', width: 90, paddingVertical: 7, borderRadius: 999,
    backgroundColor: Colours.s1, borderWidth: 1, borderColor: 'rgba(237,235,229,0.4)', alignItems: 'center',
  },
  swipeBadgeText: { ...Fonts.mono(11, 'bold'), color: Colours.fg, letterSpacing: 1.5 },
});

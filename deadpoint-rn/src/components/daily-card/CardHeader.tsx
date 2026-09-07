/** Port of `header`/`formattedDate` in DailyCardView.swift (lines
    978-1036). Matches the web app's `.top` row: an outlined phase badge
    (accent shows in the text/border, not as a background) and the date,
    nothing else. This component only wires `onTapPhaseBadge`/
    `onTapSettings`/`onTapCalendar` — the plan/settings modals themselves
    are not-yet-built screens (see the task brief). */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';
import { useTutorialTarget } from '../tutorial/TutorialTargetContext';

export interface CardHeaderProps {
  /** state.phaseName */
  phaseName: string;
  /** state.block.w — isDeload is derived here (`weekNumber === 4`),
      matching Swift's inline `state.block.w == 4` check, rather than
      taking a separate boolean prop. */
  weekNumber: number;
  /** state.accent */
  accent: string;
  /** state.today, "yyyy-MM-dd" */
  today: string;
  /** Opens the not-yet-built plan modal (Swift's `showPlan = true`). */
  onTapPhaseBadge: () => void;
  /** Opens the not-yet-built settings modal (Swift's `showSettings =
      true`). */
  onTapSettings: () => void;
  /** Optional — nil on the non-signed-in card in Swift too ("nil
      everywhere except the real signed-in card"). */
  onTapCalendar?: () => void;
}

/** Verbatim per the task brief — verified directly before the brief was
    written (`formatHeaderDate('2026-08-29') === 'Sat, 29 Aug'`).
    `Intl.DateTimeFormat`'s own `.format()` output omits the comma
    Swift's `"EEE, d MMM"` format includes ("Sat 29 Aug", not "Sat, 29
    Aug"), so the string is built from `.formatToParts()` instead of the
    formatter's own formatted string. `dateStr` is parsed with the
    local-time `Date(year, monthIndex, day)` constructor, not `new
    Date(dateString)` — the latter parses as UTC midnight and can
    silently shift a day in negative-UTC-offset timezones once
    reformatted in local time. */
export function formatHeaderDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('day')} ${get('month')}`;
}

/** Dependency-free stand-in for SF Symbol "chevron.down" — no icon font
    is part of this codebase (checked, same finding as ExerciseRow's
    InfoIcon: no @expo/vector-icons, no other icon usage anywhere under
    src/). U+2304 DOWN ARROWHEAD is not an emoji-presentation character,
    so it renders as a plain, tintable glyph rather than a colour emoji. */
function ChevronDownIcon({ color }: { color: string }) {
  return <Text style={[styles.chevron, { color }]}>⌄</Text>;
}

/** Dependency-free stand-in for SF Symbol "gearshape". U+2699 GEAR is
    also not emoji-presentation by default, so `color` is respected —
    same reasoning as ChevronDownIcon above. */
function GearIcon({ color, size }: { color: string; size: number }) {
  return <Text style={{ fontSize: size, color }}>⚙</Text>;
}

/** Dependency-free stand-in for SF Symbol "calendar". Unlike the two
    glyphs above, there is no non-emoji Unicode calendar character
    (U+1F4C5 CALENDAR is emoji-presentation and ignores `color` entirely
    on iOS), so this one is built from plain Views instead: a bordered
    body, a header rule, and two short "binding" ticks. */
function CalendarIcon({ color, size }: { color: string; size: number }) {
  const stroke = Math.max(1, size * 0.09);
  const headerHeight = size * 0.22;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          top: headerHeight,
          left: 0,
          right: 0,
          bottom: 0,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: size * 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: headerHeight,
          left: 0,
          right: 0,
          height: stroke,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: size * 0.24,
          width: stroke,
          height: headerHeight + size * 0.12,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: size * 0.24,
          width: stroke,
          height: headerHeight + size * 0.12,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const RIGHT_ICON_SIZE = 17;

export function CardHeader({
  phaseName,
  weekNumber,
  accent,
  today,
  onTapPhaseBadge,
  onTapSettings,
  onTapCalendar,
}: CardHeaderProps) {
  const isDeload = weekNumber === 4;
  const badgeLabel = `${phaseName.toUpperCase()} · WK ${weekNumber}${isDeload ? ' · DELOAD' : ''}`;
  const phaseBadgeRef = useTutorialTarget('phaseBadge');
  const settingsRef = useTutorialTarget('settingsGear');

  return (
    <View style={styles.header}>
      <Pressable
        ref={phaseBadgeRef}
        onPress={onTapPhaseBadge}
        style={styles.badge}
        accessibilityRole="button"
        accessibilityLabel={`View training plan details, ${badgeLabel}`}
      >
        <Text style={[styles.badgeText, { color: accent }]}>{badgeLabel}</Text>
        <ChevronDownIcon color={accent} />
      </Pressable>

      <View style={styles.rightGroup}>
        <Text style={styles.date}>{formatHeaderDate(today)}</Text>
        {onTapCalendar != null && (
          <Pressable
            onPress={onTapCalendar}
            style={styles.iconButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
          >
            <CalendarIcon color={Colours.dim} size={RIGHT_ICON_SIZE} />
          </Pressable>
        )}
        <Pressable
          ref={settingsRef}
          onPress={onTapSettings}
          style={styles.iconButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <GearIcon color={Colours.dim} size={RIGHT_ICON_SIZE} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colours.s1,
    borderWidth: 1,
    borderColor: Colours.s3,
  },
  badgeText: {
    ...Fonts.mono(12, 'bold'),
  },
  chevron: {
    fontSize: 8,
    fontWeight: '700',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    ...Fonts.mono(10.5, 'medium'),
    color: Colours.faint,
    textTransform: 'uppercase',
  },
  // Was `paddingLeft: 8` only — a ~17x17 real tap target (icon size, no
  // vertical/right padding at all), well under Apple's 44x44pt minimum.
  // Oscar reported these two specifically ("settings and calendar...
  // sometimes needing what feels like a double-tap"). `padding: 10` grows
  // the real touchable box on every edge (not just hitSlop, which two
  // adjacent icon buttons would otherwise steal from each other); the
  // hitSlop={8} on each Pressable above tops it up further.
  iconButton: {
    padding: 10,
  },
});

/** Port of `header`/`formattedDate` in DailyCardView.swift (lines
    978-1036). Matches the web app's `.top` row: an outlined phase badge
    (accent shows in the text/border, not as a background) and the date,
    nothing else. This component only wires `onTapPhaseBadge`/
    `onTapSettings`/`onTapCalendar` — the plan/settings modals themselves
    are not-yet-built screens (see the task brief). */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
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

/** The three header icons, drawn as strokes with react-native-svg
    (already a dependency — the tutorial overlay and the force gauge both
    use it) rather than the Unicode glyphs and hand-stacked Views they
    replace.

    The old versions were "dependency-free stand-ins": U+2304 for the
    chevron, U+2699 GEAR for settings, and a calendar assembled from four
    absolutely-positioned Views because no non-emoji calendar character
    exists. The gear in particular renders at whatever weight the
    platform's fallback font draws it — visibly lighter and smaller than
    everything around it, and Oscar reported both as too small to see or
    hit. Drawn paths share one stroke weight with each other and with the
    exercise rows' own chevron. */
function ChevronDownIcon({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="6 9 12 15 18 9" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GearIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3.2} fill="none" stroke={color} strokeWidth={2} />
      <Path
        d="M19.4 14.5a1.6 1.6 0 0 0 .33 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.33 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.12a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .33-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.12a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.33-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.33H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.12a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.33 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.12a1.6 1.6 0 0 0-1.47 1z"
        fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function CalendarIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={16} rx={2.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M3 10h18" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M8 3v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M16 3v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// 17 was the icon's whole tap target once (see iconButton below). Now
// both the drawing and the box around it are sized to be seen and hit:
// 21 + 2*11 padding = 43pt, plus hitSlop 8.
const RIGHT_ICON_SIZE = 21;

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
  // No separator before DELOAD, unlike between phase and week: on a
  // deload week the badge sits right up against the date (reported
  // live), and the row genuinely runs out of width on a 402pt screen
  // once the date and both icon buttons have taken their share. Dropping
  // the middle "·" buys back the space without losing a word.
  const badgeLabel = `${phaseName.toUpperCase()} · WK ${weekNumber}${isDeload ? ' DELOAD' : ''}`;
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
        {/* Shrink-to-fit rather than truncate. A deload week's label is
            genuinely wider than the space left once the date and both
            icon buttons have taken theirs, and "WK 4 DEL…" hides the one
            word that matters most that week. adjustsFontSizeToFit gives
            back those few points by dropping at most 15% of the size,
            and only on the weeks that need it — every other week still
            renders at the full 12pt. */}
        <Text
          style={[styles.badgeText, { color: accent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {badgeLabel}
        </Text>
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
    // A deload week appends " · DELOAD" to the badge, which on a phase
    // name like "Max Strength" leaves it all but touching the date —
    // reported live. space-between alone guarantees nothing once the two
    // sides are wide enough to meet, so this reserves the gap outright.
    gap: 8,
  },
  badge: {
    // Shrink the badge, never the date or the icon buttons: with a long
    // phase name AND a deload suffix the row can genuinely run out of
    // width, and truncating the label (numberOfLines={1} above) is much
    // better than shoving the gear off the edge of the screen.
    flexShrink: 1,
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
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
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
    padding: 11,
  },
});

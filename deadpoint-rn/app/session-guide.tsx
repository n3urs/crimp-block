// app/session-guide.tsx
/** Direct port of SessionGuideView.swift (phase-a-engine-extraction branch)
    — the standing reference page pulled up from the small "GUIDE" pill
    under a session's title in DailyCard.tsx (only shown where that
    session actually has one; programs.js's only session with one today
    is climbHard's "Board Session Guide"). Reached via
    router.push('/session-guide', { key }) from card.tsx's and
    tutorial.tsx's onTapGuide — both were wired to `() => {}` no-ops until
    now. Registered in app/_layout.tsx with `presentation: 'modal'`, same
    pattern as day-picker.tsx/plan.tsx/settings.tsx.

    Unlike those screens this one needs no engine/store resolution at
    all: src/engine/index.ts's sessionInfo(key) and
    sessionColourVarName(key) are both pure `program.sessions[key]`
    lookups with zero session-log dependency (confirmed directly against
    their implementations), so this screen only needs `program` and the
    `key` route param — reading `program.sessions[key]` directly rather
    than constructing a whole engine just to call a function that would
    do the same lookup. It DOES need profile resolution now (see
    resolveUserProgram.ts): `program` used to be resolved from email
    alone (`PROGRAMS[email] ?? PROGRAMS.default`), which meant a real
    customer's session guide would silently come from the generic
    default program, not their own template — no guide content exists
    in src/engine/templates.js yet (only programs.js's hand-authored
    accounts have one today), so this had no visible effect YET, but
    would have quietly kept being wrong the moment a template guide is
    ever authored. Fixed the same way as every other screen rather than
    leaving this one call site still wrong.

    Two deliberate departures from the Swift source, both to match this
    RN app's OWN already-established conventions rather than copy Swift's
    literally:
    - Header is a fixed, non-scrolling bar with a text "CLOSE" button
      (day-picker.tsx/plan.tsx/settings.tsx's shared convention), not
      Swift's title-plus-xmark-icon row that scrolls away with the
      content — this app has no icon component for Swift's `xmark`
      SF Symbol, and already has its own consistent modal-dismiss idiom.
    - Section gap uses this codebase's own 20pt scale (plan.tsx's `list`
      style) rather than Swift's 26pt — a spacing-scale match, not a
      layout change; the divider-as-its-own-list-item structure (only
      between sections, never trailing the last one) is kept faithful to
      SessionGuideView's ForEach. */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useSession } from '../src/data/useSession';
import { useProfile } from '../src/data/useProfile';
import { resolveUserProgram } from '../src/engine/resolveUserProgram';

interface GuideSection {
  heading: string;
  body: string;
}

interface SessionGuide {
  title: string;
  sections: GuideSection[];
}

export default function SessionGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? '';
  const profile = useProfile(userId);
  const program = useMemo(() => resolveUserProgram(email, profile.row), [email, profile.row]);

  // Same shape EngineBridge.SessionGuide/GuideSection defined in Swift —
  // { title, sections: [{ heading, body }] } — sourced straight from
  // programs.js, not modelled through the engine (see top doc comment).
  const guide: SessionGuide | undefined = program.sessions?.[key]?.guide;
  const accent = resolveColour(program.sessions?.[key]?.c ?? '--gorse');

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {(guide?.title ?? 'Guide').toUpperCase()}
        </Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      {/* guide should always be defined here — the pill that opens this
          screen only renders when DailyCard.tsx's own `guide` prop is
          non-null — but a nonexistent/renamed key falling through a stale
          deep link or a future program edit denies gracefully rather than
          crashing on `guide.sections.map`. */}
      {guide != null && (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 20 + insets.bottom }]}>
          {guide.sections.flatMap((section, index) => {
            const items = [
              <View key={`section-${index}`} style={styles.section}>
                <Text style={[styles.sectionHeading, { color: accent }]}>{section.heading.toUpperCase()}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>,
            ];
            if (index < guide.sections.length - 1) {
              items.push(<View key={`divider-${index}`} style={styles.divider} />);
            }
            return items;
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, gap: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colours.fg, flexShrink: 1 },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  list: { padding: 20, paddingTop: 0, gap: 20 },
  section: { gap: 8 },
  sectionHeading: { ...Fonts.mono(12, 'bold') },
  sectionBody: { fontSize: 14.5, color: Colours.dim, lineHeight: 21 },
  divider: { height: 1, backgroundColor: Colours.s2 },
});

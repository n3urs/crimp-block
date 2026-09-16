// src/components/settings/SettingsList.tsx
/** Grouped-list building blocks for app/settings.tsx: a titled group card
    whose rows are separated by inset hairlines, and a row with a tinted
    icon tile, title, optional subtitle and a trailing chevron, external
    arrow or control. Icons are authored SVG (stroke paths after Feather,
    MIT) — this project has no icon library. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { Colours } from '../../design/colours';
import { Fonts } from '../../design/fonts';

export type IconName =
  | 'target' | 'sliders' | 'restore' | 'hash' | 'clock' | 'activity' | 'hangboard'
  | 'play' | 'shield' | 'file' | 'mail' | 'logout' | 'trash' | 'chevron' | 'external';

function Glyph({ name }: { name: IconName }) {
  switch (name) {
    case 'target':
      return (<><Circle cx={12} cy={12} r={10} /><Circle cx={12} cy={12} r={6} /><Circle cx={12} cy={12} r={2} /></>);
    case 'sliders':
      return (
        <>
          <Line x1={4} y1={21} x2={4} y2={14} /><Line x1={4} y1={10} x2={4} y2={3} />
          <Line x1={12} y1={21} x2={12} y2={12} /><Line x1={12} y1={8} x2={12} y2={3} />
          <Line x1={20} y1={21} x2={20} y2={16} /><Line x1={20} y1={12} x2={20} y2={3} />
          <Line x1={1} y1={14} x2={7} y2={14} /><Line x1={9} y1={8} x2={15} y2={8} /><Line x1={17} y1={16} x2={23} y2={16} />
        </>
      );
    case 'restore':
      return (<><Polyline points="1 4 1 10 7 10" /><Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>);
    case 'hash':
      return (
        <>
          <Line x1={4} y1={9} x2={20} y2={9} /><Line x1={4} y1={15} x2={20} y2={15} />
          <Line x1={10} y1={3} x2={8} y2={21} /><Line x1={16} y1={3} x2={14} y2={21} />
        </>
      );
    case 'clock':
      return (<><Circle cx={12} cy={12} r={10} /><Polyline points="12 6 12 12 16 14" /></>);
    case 'activity':
      return <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />;
    case 'hangboard':
      return (<><Rect x={2} y={7} width={20} height={10} rx={3} /><Line x1={6} y1={12} x2={9} y2={12} /><Line x1={15} y1={12} x2={18} y2={12} /></>);
    case 'play':
      return (<><Circle cx={12} cy={12} r={10} /><Polygon points="10 8 16 12 10 16 10 8" /></>);
    case 'shield':
      return <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
    case 'file':
      return (
        <>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" /><Line x1={16} y1={13} x2={8} y2={13} /><Line x1={16} y1={17} x2={8} y2={17} />
        </>
      );
    case 'mail':
      return (<><Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><Polyline points="22,6 12,13 2,6" /></>);
    case 'logout':
      return (<><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Polyline points="16 17 21 12 16 7" /><Line x1={21} y1={12} x2={9} y2={12} /></>);
    case 'trash':
      return (
        <>
          <Polyline points="3 6 5 6 21 6" />
          <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </>
      );
    case 'chevron':
      return <Polyline points="9 18 15 12 9 6" />;
    case 'external':
      return (<><Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><Polyline points="15 3 21 3 21 9" /><Line x1={10} y1={14} x2={21} y2={3} /></>);
  }
}

export function Icon({ name, colour, size = 18 }: { name: IconName; colour: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Glyph name={name} />
      </G>
    </Svg>
  );
}

export function SettingsGroup({ title, footer, children }: { title: string; footer?: React.ReactNode; children: React.ReactNode }) {
  const rows = React.Children.toArray(children);
  if (rows.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.card}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.divider} />}
            {row}
          </React.Fragment>
        ))}
      </View>
      {footer}
    </View>
  );
}

export function SettingsRow({
  icon, tint, title, subtitle, trailing, onPress, destructive, disabled, accessibilityLabel, accessibilityRole = 'button',
}: {
  icon: IconName;
  tint: string;
  title: string;
  subtitle?: string | null;
  trailing?: 'chevron' | 'external' | React.ReactElement;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
}) {
  const content = (
    <>
      <View style={[styles.tile, { backgroundColor: `${tint}26` }]}>
        <Icon name={icon} colour={tint} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, destructive && styles.titleDestructive]} numberOfLines={1}>{title}</Text>
        {subtitle != null && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {trailing === 'chevron' && <Icon name="chevron" colour={Colours.faint} size={16} />}
      {trailing === 'external' && <Icon name="external" colour={Colours.faint} size={15} />}
      {React.isValidElement(trailing) && trailing}
    </>
  );

  if (onPress == null) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.rowDisabled]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
    >
      {content}
    </Pressable>
  );
}

const TILE = 30;
const ROW_PAD_X = 14;
const ROW_GAP = 12;

const styles = StyleSheet.create({
  group: { gap: 8 },
  groupTitle: { ...Fonts.mono(11, 'bold'), color: Colours.dim, letterSpacing: 1.2, paddingHorizontal: 4 },
  card: { backgroundColor: Colours.s1, borderRadius: 12, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colours.s3, marginLeft: ROW_PAD_X + TILE + ROW_GAP },

  row: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, paddingHorizontal: ROW_PAD_X, paddingVertical: 12, minHeight: 56 },
  rowPressed: { backgroundColor: Colours.s2 },
  rowDisabled: { opacity: 0.5 },
  tile: { width: TILE, height: TILE, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: Colours.fg },
  titleDestructive: { color: Colours.restC },
  subtitle: { fontSize: 12.5, lineHeight: 17, color: Colours.dim },
});

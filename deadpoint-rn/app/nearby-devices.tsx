// app/nearby-devices.tsx
/** "Gauge not showing up?" — lists what the phone can hear from nearby
    Bluetooth devices so a gauge the app doesn't recognise (or mis-reads)
    can be diagnosed without anyone needing the hardware in front of them.

    Each row can be shared on its own: name, signal, services and the raw
    broadcast bytes, never the device address. For a supported broadcast
    gauge (WH-C06) the row also shows its decoded live reading, so it can be
    compared against the scale's own display to check units and offsets.
    Reached from the force-gauge screen while it isn't scanning or
    connected; registered in app/_layout.tsx as a modal. */
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { Subscription } from 'react-native-ble-plx';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { ensureAndroidPermission, getManager, waitForUsableBluetooth } from '../src/data/forceGauge/useForceGauge';
import { classifyAdvertisement } from '../src/data/forceGauge/gaugeDiscovery';
import { parseWhc06Advertisement } from '../src/data/forceGauge/whc06';
import { companyIdOf, deviceReport, manufacturerHex, type NearbyDeviceInfo } from '../src/data/forceGauge/nearbyReport';

const ACCENT = resolveColour('--gorse');
const MAX_ROWS = 40;

/** Recognised gauges first, then strongest signal (the gauge is the one
    held right next to the phone), then the rest. Devices that broadcast no
    name and no data are noise and left out. */
function sortedRows(devices: Map<string, NearbyDeviceInfo>): NearbyDeviceInfo[] {
  return [...devices.values()]
    .filter((d) => d.name != null || d.manufacturerData != null)
    .sort((a, b) => {
      if ((a.recognisedAs != null) !== (b.recognisedAs != null)) return a.recognisedAs != null ? -1 : 1;
      return (b.rssi ?? -999) - (a.rssi ?? -999);
    })
    .slice(0, MAX_ROWS);
}

export default function NearbyDevices() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<NearbyDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const heardRef = useRef(new Map<string, NearbyDeviceInfo>());

  useEffect(() => {
    let cancelled = false;
    const stateSub: { current: Subscription | null } = { current: null };
    (async () => {
      if (!(await ensureAndroidPermission())) {
        setError('Bluetooth permission was refused. Allow it in Settings, then reopen this screen.');
        return;
      }
      const ble = getManager();
      try {
        await waitForUsableBluetooth(ble, stateSub);
        if (cancelled) return;
        await ble.startDeviceScan(null, { allowDuplicates: true }, (scanError, found) => {
          if (scanError) { setError(scanError.message); return; }
          if (!found) return;
          const name = found.localName ?? found.name ?? null;
          const gauge = classifyAdvertisement({ serviceUUIDs: found.serviceUUIDs, name, manufacturerData: found.manufacturerData });
          let reading: string | null = null;
          if (gauge?.kind === 'whc06') {
            const { kg } = parseWhc06Advertisement(found.manufacturerData, name);
            if (kg != null) reading = `${kg.toFixed(2)} kg`;
          }
          heardRef.current.set(found.id, {
            id: found.id, name, rssi: found.rssi, serviceUUIDs: found.serviceUUIDs ?? [],
            manufacturerData: found.manufacturerData, recognisedAs: gauge ? gauge.name : null, reading,
          });
        });
      } catch (e: any) {
        setError(e?.message ?? 'Could not start scanning.');
      }
    })();
    // A broadcast gauge sends ~8 packets a second; redraw twice a second.
    const timer = setInterval(() => { if (!cancelled) setRows(sortedRows(heardRef.current)); }, 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stateSub.current?.remove();
      getManager().stopDeviceScan().catch(() => {});
    };
  }, []);

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 12 + insets.bottom }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>NEARBY BLUETOOTH</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>
      <Text style={styles.body}>
        Switch your gauge on and hold it right next to your phone. Its row should appear near the top with the
        strongest signal. Supported today: Tindeq Progressor and WeiHeng WH-C06. If yours isn't recognised, tap
        SHARE on its row and send us the details — only that one device is shared.
      </Text>
      {error != null && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={styles.empty}>{error == null ? 'Listening…' : ''}</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, item.recognisedAs != null && styles.cardRecognised]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name ?? 'Unnamed device'}</Text>
                <Text style={styles.meta}>
                  {item.rssi != null ? `${item.rssi} dBm` : 'signal ?'} · company {companyIdOf(item.manufacturerData) ?? '-'}
                </Text>
              </View>
              <Pressable
                onPress={() => Share.share({ message: deviceReport(item) }).catch((e) => console.error('nearby: share failed:', e))}
                style={styles.share}
                accessibilityRole="button"
                accessibilityLabel={`Share details of ${item.name ?? 'this device'}`}
              >
                <Text style={styles.shareText}>SHARE</Text>
              </Pressable>
            </View>
            {item.recognisedAs != null ? (
              <Text style={styles.recognised}>
                ✓ {item.recognisedAs}{item.reading != null ? ` — reads ${item.reading}. Check it matches your scale's display.` : ''}
              </Text>
            ) : (
              <Text style={styles.hex} numberOfLines={2}>{manufacturerHex(item.manufacturerData)}</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },
  body: { fontSize: 13, color: Colours.dim, lineHeight: 19, marginBottom: 14 },
  error: { fontSize: 13, color: Colours.restC, marginBottom: 10 },
  empty: { fontSize: 14, color: Colours.dim, textAlign: 'center', marginTop: 30 },
  card: { backgroundColor: Colours.s1, borderRadius: 8, padding: 14, gap: 8 },
  cardRecognised: { borderWidth: 1, borderColor: ACCENT },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { ...Fonts.mono(14, 'bold'), color: Colours.fg },
  meta: { ...Fonts.mono(11, 'medium'), color: Colours.dim, marginTop: 2 },
  share: { backgroundColor: Colours.s2, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 14 },
  shareText: { ...Fonts.mono(11, 'bold'), color: ACCENT, letterSpacing: 1 },
  recognised: { fontSize: 13, color: Colours.fg, lineHeight: 18 },
  hex: { ...Fonts.mono(11, 'medium'), color: Colours.faint },
});

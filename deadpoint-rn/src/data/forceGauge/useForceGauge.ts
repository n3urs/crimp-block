// src/data/forceGauge/useForceGauge.ts
/** Scans for, connects to, and streams live readings from a force gauge.
    Two kinds are supported:
      - the Tindeq Progressor, and Oscar's homemade gauge (LetticeTindik),
        a real Progressor BLE emulator verified against its firmware
        (stage3_bringup.ino): connect, subscribe, stream;
      - the WeiHeng WH-C06 hanging scale, which never accepts a connection
        and instead broadcasts its reading in its advertising packets (see
        whc06.ts): the app just listens for those. Its zero is done in the
        app, since it has no zero command.
    Which kind a device is comes from gaugeDiscovery.ts. Not unit tested directly, same as every other thin native-wrapper
    hook in this project (useSession.ts, tones.ts): there's no way to
    exercise a real BLE radio/device under Jest. protocol.ts (the byte
    parsing this hook calls into) IS fully unit tested. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Subscription } from 'react-native-ble-plx';
import {
  PROGRESSOR_SERVICE_UUID,
  PROGRESSOR_DATA_CHAR_UUID,
  PROGRESSOR_CONTROL_CHAR_UUID,
  CMD,
  parseNotification,
  encodeCommand,
  bytesToBase64,
  base64ToBytes,
  isNewMeasurementEpoch,
} from './protocol';
import { classifyAdvertisement, type GaugeKind } from './gaugeDiscovery';
import { parseWhc06Advertisement } from './whc06';

// One shared manager for the app's lifetime — a BleManager owns real
// native radio resources and isn't meant to be recreated per screen visit.
let manager: BleManager | null = null;
export function getManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

export type ForceGaugeStatus = 'idle' | 'scanning' | 'scanDone' | 'connecting' | 'connected' | 'error';

export interface GraphPoint {
  tSec: number;
  kg: number;
}

export interface FoundGauge {
  id: string;
  name: string;
  kind: GaugeKind;
}

/** How much history the graph keeps on screen. */
export const GRAPH_WINDOW_SEC = 20;
// The gauge acks TARE straight away, then averages ~200 samples (~0.6 s at
// 320 SPS) with the stream paused, so this covers the whole zeroing.
const TARE_SETTLE_MS = 700;
const SCAN_WINDOW_MS = 10_000;
// iOS never times a connection attempt out on its own — without this a
// gauge that stops answering mid-connect leaves the screen on CONNECTING
// forever.
const CONNECT_TIMEOUT_MS = 10_000;
// A WH-C06 broadcasts about 8 times a second while it's on, so a few seconds
// of silence means it has switched itself off (or gone out of range).
const WHC06_LIVENESS_MS = 6_000;

const UNUSABLE_STATE_MESSAGES: Partial<Record<State, string>> = {
  [State.PoweredOff]: 'Bluetooth is turned off. Switch it on, then scan again.',
  [State.Unauthorized]: "Deadpoint isn't allowed to use Bluetooth. Allow it in your phone's Settings, then scan again.",
  [State.Unsupported]: "This device doesn't support Bluetooth.",
};

export async function ensureAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // Android 12+ (API 31) needs these requested at runtime on top of the
  // manifest entries; on older versions the request resolves granted.
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

/** iOS reports Unknown for a moment after the manager is created, and for
    as long as the first-run permission prompt is up — scanning in that
    window fails with "BluetoothLE is in unknown state". */
export function waitForUsableBluetooth(ble: BleManager, subRef: { current: Subscription | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    subRef.current?.remove();
    subRef.current = ble.onStateChange((state) => {
      if (state === State.PoweredOn) {
        subRef.current?.remove();
        resolve();
      } else if (UNUSABLE_STATE_MESSAGES[state]) {
        subRef.current?.remove();
        reject(new Error(UNUSABLE_STATE_MESSAGES[state]));
      }
    }, true);
  });
}

export function useForceGauge() {
  const [status, setStatus] = useState<ForceGaugeStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devices, setDevices] = useState<FoundGauge[]>([]);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [peak, setPeak] = useState(0);
  const [points, setPoints] = useState<GraphPoint[]>([]);
  const [taring, setTaring] = useState(false);

  const deviceIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const streamStartSecRef = useRef<number | null>(null);
  // The raw (un-offset) seconds of the most recent sample plotted — kept
  // separately from streamStartSecRef purely to detect a measurement-
  // epoch boundary (see isNewMeasurementEpoch in protocol.ts); the
  // points array itself only ever stores the already-offset tSec.
  const lastRawSecRef = useRef<number | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateSubRef = useRef<Subscription | null>(null);
  const monitorSubRef = useRef<Subscription | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);
  // WH-C06 (broadcast-only) state: which kind we're on, its silence timer,
  // and the in-app zero (the scale has no zero command to send).
  const kindRef = useRef<GaugeKind | null>(null);
  const livenessRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardRef = useRef(false);
  const zeroOffsetRef = useRef(0);
  const lastRawKgRef = useRef(0);
  const whcStartMsRef = useRef(0);

  const fail = useCallback((message: string) => {
    setStatus('error');
    setErrorMessage(message);
  }, []);

  // Every scan must be stopped through here: a scan left running keeps its
  // listener attached, and the next scan's listener stacks on top — both
  // then fire for the same gauge and fight over one connection.
  const stopScan = useCallback(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    manager?.stopDeviceScan().catch(() => {});
  }, []);

  const clearLiveness = useCallback(() => {
    if (livenessRef.current) clearTimeout(livenessRef.current);
    livenessRef.current = null;
  }, []);

  const teardownConnection = useCallback(() => {
    clearLiveness();
    monitorSubRef.current?.remove();
    monitorSubRef.current = null;
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    const id = deviceIdRef.current;
    deviceIdRef.current = null;
    // Also cancels a connection that's still pending, so closing the screen
    // mid-connect doesn't leave the gauge's single connection slot taken.
    if (id) manager?.cancelDeviceConnection(id).catch(() => {});
  }, [clearLiveness]);

  useEffect(() => () => {
    stateSubRef.current?.remove();
    stopScan();
    teardownConnection();
  }, [stopScan, teardownConnection]);

  const reset = useCallback(() => {
    setPeak(0);
    setPoints([]);
    streamStartSecRef.current = null;
  }, []);

  const onNotification = useCallback((base64Value: string) => {
    const { samples: raw } = parseNotification(base64ToBytes(base64Value));
    if (raw.length === 0) return;
    // The gauge reads a hair below zero at rest (sensor noise around the
    // tare point, not a real negative pull) — floor it here, the one
    // place a sample turns into app state, so the stat and the graph
    // never dip below 0 rather than clamping each display separately.
    const samples = raw.map((s) => ({ ...s, kg: Math.max(0, s.kg) }));
    setCurrent(samples[samples.length - 1].kg);
    setPeak((p) => Math.max(p, ...samples.map((s) => s.kg)));

    // See isNewMeasurementEpoch's own doc comment: the device's elapsed-
    // time counter can drop back on its own (a ~71.6-minute uint32
    // wraparound, or a fresh restart), with no tare/reset from here.
    // Detected BEFORE touching streamStartSecRef, and only current/peak
    // above are allowed to keep going through it unaffected — those
    // readings stay physically valid across the boundary; only the
    // graph's time axis needs a fresh baseline.
    const newEpoch = isNewMeasurementEpoch(samples[0].usSinceStart / 1e6, lastRawSecRef.current);
    if (newEpoch) streamStartSecRef.current = null;
    lastRawSecRef.current = samples[samples.length - 1].usSinceStart / 1e6;

    setPoints((prev) => {
      if (streamStartSecRef.current == null) streamStartSecRef.current = samples[0].usSinceStart / 1e6;
      const startSec = streamStartSecRef.current;
      const base = newEpoch ? [] : prev;
      const merged = [...base, ...samples.map((s) => ({ tSec: s.usSinceStart / 1e6 - startSec, kg: s.kg }))];
      const cutoff = merged[merged.length - 1].tSec - GRAPH_WINDOW_SEC;
      return merged.filter((p) => p.tSec >= cutoff);
    });
  }, []);

  const scan = useCallback(async () => {
    if (busyRef.current) return;
    stopScan();
    clearLiveness();
    kindRef.current = null;
    setDevices([]);
    setErrorMessage(null);
    setStatus('scanning');

    if (!(await ensureAndroidPermission())) {
      fail('Bluetooth permission was refused. Allow it in Settings to use the force gauge.');
      return;
    }

    const ble = getManager();
    try {
      await waitForUsableBluetooth(ble, stateSubRef);
      // Unfiltered: a broadcast-only gauge (WH-C06) has no service to filter
      // on. classifyAdvertisement keeps only supported gauges in the list.
      // allowDuplicates so iOS keeps delivering a broadcast gauge's repeats.
      await ble.startDeviceScan(null, { allowDuplicates: true }, (scanError, found) => {
        if (scanError) {
          stopScan();
          fail(scanError.message);
          return;
        }
        if (!found) return;
        const gauge = classifyAdvertisement({
          serviceUUIDs: found.serviceUUIDs,
          name: found.localName ?? found.name,
          manufacturerData: found.manufacturerData,
        });
        if (!gauge) return;
        setDevices((prev) => prev.some((d) => d.id === found.id)
          ? prev
          : [...prev, { id: found.id, name: gauge.name, kind: gauge.kind }]);
      });
    } catch (e: any) {
      stopScan();
      fail(e?.message ?? 'Could not start scanning.');
      return;
    }

    scanTimerRef.current = setTimeout(() => {
      stopScan();
      setStatus((s) => (s === 'scanning' ? 'scanDone' : s));
    }, SCAN_WINDOW_MS);
  }, [clearLiveness, fail, stopScan]);

  /** One reading heard from a broadcast-only gauge, in kilograms. Feeds the
      same current/peak/graph the Progressor path does; the first one is
      what turns "connecting" into "connected". */
  const onAdvertisedReading = useCallback((rawKg: number) => {
    heardRef.current = true;
    lastRawKgRef.current = rawKg;
    const kg = Math.max(0, rawKg - zeroOffsetRef.current);
    const tSec = (Date.now() - whcStartMsRef.current) / 1000;
    setStatus((st) => (st === 'connecting' ? 'connected' : st));
    setCurrent(kg);
    setPeak((p) => Math.max(p, kg));
    setPoints((prev) => {
      const cutoff = tSec - GRAPH_WINDOW_SEC;
      return [...prev, { tSec, kg }].filter((pt) => pt.tSec >= cutoff);
    });
  }, []);

  /** Silence from a broadcast-only gauge means it switched off or left
      range. Re-armed by every packet. */
  const armLiveness = useCallback(() => {
    if (livenessRef.current) clearTimeout(livenessRef.current);
    livenessRef.current = setTimeout(() => {
      livenessRef.current = null;
      stopScan();
      fail(heardRef.current
        ? 'Lost the force gauge. Switch it off and on again, then scan again.'
        : "Couldn't hear the force gauge. Make sure it's switched on and close by, then try again.");
    }, WHC06_LIVENESS_MS);
  }, [fail, stopScan]);

  /** "Connecting" to a WH-C06 is just listening to its broadcasts. */
  const connectBroadcast = useCallback(async (gauge: FoundGauge) => {
    if (busyRef.current) return;
    busyRef.current = true;
    stopScan();
    teardownConnection();
    kindRef.current = 'whc06';
    heardRef.current = false;
    zeroOffsetRef.current = 0;
    lastRawKgRef.current = 0;
    setErrorMessage(null);
    setDeviceName(gauge.name);
    setCurrent(0);
    reset();
    setStatus('connecting');
    try {
      const ble = getManager();
      await waitForUsableBluetooth(ble, stateSubRef);
      whcStartMsRef.current = Date.now();
      armLiveness();
      await ble.startDeviceScan(null, { allowDuplicates: true }, (scanError, found) => {
        if (scanError) {
          stopScan();
          clearLiveness();
          fail(scanError.message);
          return;
        }
        if (!found || found.id !== gauge.id) return;
        const { kg } = parseWhc06Advertisement(found.manufacturerData, found.localName ?? found.name);
        if (kg == null) return;
        armLiveness();
        onAdvertisedReading(kg);
      });
    } catch (e: any) {
      stopScan();
      clearLiveness();
      fail(e?.message ?? "Couldn't listen for the force gauge.");
    } finally {
      busyRef.current = false;
    }
  }, [armLiveness, clearLiveness, fail, onAdvertisedReading, reset, stopScan, teardownConnection]);

  const connect = useCallback(async (gauge: FoundGauge) => {
    if (gauge.kind === 'whc06') {
      await connectBroadcast(gauge);
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    stopScan();
    teardownConnection();
    kindRef.current = 'progressor';
    setErrorMessage(null);
    setDeviceName(gauge.name);
    setCurrent(0);
    reset();
    setStatus('connecting');

    const ble = getManager();
    deviceIdRef.current = gauge.id;
    try {
      const device = await ble.connectToDevice(gauge.id, { timeout: CONNECT_TIMEOUT_MS });
      await device.discoverAllServicesAndCharacteristics();

      monitorSubRef.current = ble.monitorCharacteristicForDevice(
        device.id,
        PROGRESSOR_SERVICE_UUID,
        PROGRESSOR_DATA_CHAR_UUID,
        (monitorError, characteristic) => {
          if (monitorError) return; // fires on disconnect too; handled below
          if (characteristic?.value) onNotification(characteristic.value);
        }
      );
      disconnectSubRef.current = ble.onDeviceDisconnected(device.id, () => {
        teardownConnection();
        fail('Lost connection to the force gauge. Scan again to reconnect.');
      });

      await ble.writeCharacteristicWithResponseForDevice(
        device.id,
        PROGRESSOR_SERVICE_UUID,
        PROGRESSOR_CONTROL_CHAR_UUID,
        bytesToBase64(encodeCommand(CMD.START_WEIGHT_MEAS))
      );
      setStatus('connected');
    } catch (e: any) {
      teardownConnection();
      fail(`Couldn't connect to ${gauge.name}: ${e?.message ?? 'unknown error'}. Make sure it's switched on and close by, then try again.`);
    } finally {
      busyRef.current = false;
    }
  }, [connectBroadcast, fail, onNotification, reset, stopScan, teardownConnection]);

  /** Zeroes the gauge itself (its own TARE command), then clears peak and
      graph — both were measured against the old zero. */
  const tare = useCallback(async () => {
    // A broadcast-only gauge (WH-C06) has no zero command to send, so zero
    // it here: treat whatever it reads right now as the new zero.
    if (kindRef.current === 'whc06') {
      if (taring) return;
      setTaring(true);
      zeroOffsetRef.current = lastRawKgRef.current;
      reset();
      setCurrent(0);
      setTimeout(() => setTaring(false), 300);
      return;
    }
    const id = deviceIdRef.current;
    if (!id || taring) return;
    setTaring(true);
    try {
      await getManager().writeCharacteristicWithResponseForDevice(
        id,
        PROGRESSOR_SERVICE_UUID,
        PROGRESSOR_CONTROL_CHAR_UUID,
        bytesToBase64(encodeCommand(CMD.TARE_SCALE))
      );
    } catch {
      // A failed write here means the link dropped; onDeviceDisconnected shows that.
    }
    setTimeout(() => {
      reset();
      setTaring(false);
    }, TARE_SETTLE_MS);
  }, [reset, taring]);

  return { status, errorMessage, devices, deviceName, current, peak, points, taring, scan, connect, reset, tare };
}

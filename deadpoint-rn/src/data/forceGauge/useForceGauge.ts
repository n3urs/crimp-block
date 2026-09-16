// src/data/forceGauge/useForceGauge.ts
/** Scans for, connects to, and streams live readings from Oscar's
    homemade force gauge (LetticeTindik) — a real Tindeq Progressor BLE
    emulator, verified against the actual firmware (stage3_bringup.ino).
    Not unit tested directly, same as every other thin native-wrapper
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
} from './protocol';

// One shared manager for the app's lifetime — a BleManager owns real
// native radio resources and isn't meant to be recreated per screen visit.
let manager: BleManager | null = null;
function getManager(): BleManager {
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

const UNUSABLE_STATE_MESSAGES: Partial<Record<State, string>> = {
  [State.PoweredOff]: 'Bluetooth is turned off. Switch it on, then scan again.',
  [State.Unauthorized]: "Deadpoint isn't allowed to use Bluetooth. Allow it in your phone's Settings, then scan again.",
  [State.Unsupported]: "This device doesn't support Bluetooth.",
};

async function ensureAndroidPermission(): Promise<boolean> {
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
function waitForUsableBluetooth(ble: BleManager, subRef: { current: Subscription | null }): Promise<void> {
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
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateSubRef = useRef<Subscription | null>(null);
  const monitorSubRef = useRef<Subscription | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);

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

  const teardownConnection = useCallback(() => {
    monitorSubRef.current?.remove();
    monitorSubRef.current = null;
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    const id = deviceIdRef.current;
    deviceIdRef.current = null;
    // Also cancels a connection that's still pending, so closing the screen
    // mid-connect doesn't leave the gauge's single connection slot taken.
    if (id) manager?.cancelDeviceConnection(id).catch(() => {});
  }, []);

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
    const { samples } = parseNotification(base64ToBytes(base64Value));
    if (samples.length === 0) return;
    setCurrent(samples[samples.length - 1].kg);
    setPeak((p) => Math.max(p, ...samples.map((s) => s.kg)));
    setPoints((prev) => {
      if (streamStartSecRef.current == null) streamStartSecRef.current = samples[0].usSinceStart / 1e6;
      const startSec = streamStartSecRef.current;
      const merged = [...prev, ...samples.map((s) => ({ tSec: s.usSinceStart / 1e6 - startSec, kg: s.kg }))];
      const cutoff = merged[merged.length - 1].tSec - GRAPH_WINDOW_SEC;
      return merged.filter((p) => p.tSec >= cutoff);
    });
  }, []);

  const scan = useCallback(async () => {
    if (busyRef.current) return;
    stopScan();
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
      // Filtered to the Progressor service, so only compatible gauges list.
      await ble.startDeviceScan([PROGRESSOR_SERVICE_UUID], null, (scanError, found) => {
        if (scanError) {
          stopScan();
          fail(scanError.message);
          return;
        }
        if (!found) return;
        setDevices((prev) => prev.some((d) => d.id === found.id)
          ? prev
          : [...prev, { id: found.id, name: found.localName ?? found.name ?? 'Force gauge' }]);
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
  }, [fail, stopScan]);

  const connect = useCallback(async (gauge: FoundGauge) => {
    if (busyRef.current) return;
    busyRef.current = true;
    stopScan();
    teardownConnection();
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
  }, [fail, onNotification, reset, stopScan, teardownConnection]);

  /** Zeroes the gauge itself (its own TARE command), then clears peak and
      graph — both were measured against the old zero. */
  const tare = useCallback(async () => {
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

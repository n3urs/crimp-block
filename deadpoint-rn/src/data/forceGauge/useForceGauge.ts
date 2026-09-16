// src/data/forceGauge/useForceGauge.ts
/** Scans for, connects to, and streams live readings from Oscar's
    homemade force gauge (LetticeTindik) — a real Tindeq Progressor BLE
    emulator, verified against the actual firmware (stage3_bringup.ino).
    Not unit tested directly, same as every other thin native-wrapper
    hook in this project (useSession.ts, tones.ts): there's no way to
    exercise a real BLE radio/device under Jest. protocol.ts (the byte
    parsing this hook calls into) IS fully unit tested — that's where
    the actual correctness risk lives; this hook is verified live,
    against the real gauge, on device. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, type Device } from 'react-native-ble-plx';
import {
  PROGRESSOR_SERVICE_UUID,
  PROGRESSOR_DATA_CHAR_UUID,
  PROGRESSOR_CONTROL_CHAR_UUID,
  CMD,
  parseNotification,
  encodeCommand,
  bytesToBase64,
  base64ToBytes,
  type WeightSample,
} from './protocol';

// One shared manager for the app's lifetime — same reasoning as
// tones.ts's lazily-created, reused-forever AudioPlayer instances:
// a BleManager owns real native radio resources and isn't meant to be
// recreated per screen visit.
let manager: BleManager | null = null;
function getManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

export type ForceGaugeStatus = 'idle' | 'requestingPermission' | 'scanning' | 'connecting' | 'connected' | 'error';

export interface GraphPoint {
  tSec: number;
  kg: number;
}

/** How much history the graph keeps on screen — matches the reference
    apps' own live-session view (a few tens of seconds, not the whole
    session), so a long hang doesn't slow the redraw down. */
const GRAPH_WINDOW_SEC = 20;

async function ensureAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // Android 12+ (API 31) split BLUETOOTH_SCAN/CONNECT into their own
  // dangerous, runtime-requestable permissions — the manifest entries
  // the config plugin adds aren't enough on their own. Older Android
  // versions don't have these permission names at all; requesting an
  // unknown permission on those OS versions is a no-op that resolves
  // granted, so this doesn't need an SDK-version branch of its own.
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

export function useForceGauge() {
  const [status, setStatus] = useState<ForceGaugeStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [peak, setPeak] = useState(0);
  const [points, setPoints] = useState<GraphPoint[]>([]);

  const deviceIdRef = useRef<string | null>(null);
  const streamStartSecRef = useRef<number | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);

  const cleanup = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    const id = deviceIdRef.current;
    deviceIdRef.current = null;
    if (id) getManager().cancelDeviceConnection(id).catch(() => {});
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const reset = useCallback(() => {
    setPeak(0);
    setPoints([]);
    streamStartSecRef.current = null;
  }, []);

  const onNotification = useCallback((base64Value: string) => {
    const { samples } = parseNotification(base64ToBytes(base64Value));
    if (samples.length === 0) return;
    const last = samples[samples.length - 1];
    setCurrent(last.kg);
    setPeak((p) => Math.max(p, ...samples.map((s) => s.kg)));
    setPoints((prev) => {
      if (streamStartSecRef.current == null) streamStartSecRef.current = samples[0].usSinceStart / 1e6;
      const startSec = streamStartSecRef.current;
      const added = samples.map((s) => ({ tSec: s.usSinceStart / 1e6 - startSec, kg: s.kg }));
      const merged = [...prev, ...added];
      const cutoff = merged[merged.length - 1].tSec - GRAPH_WINDOW_SEC;
      const trimmed = merged.filter((p) => p.tSec >= cutoff);
      return trimmed;
    });
  }, []);

  const scan = useCallback(async () => {
    setErrorMessage(null);
    setStatus('requestingPermission');
    const granted = await ensureAndroidPermission();
    if (!granted) {
      setStatus('error');
      setErrorMessage('Bluetooth permission was refused — enable it in Settings to use the force gauge.');
      return;
    }

    setStatus('scanning');
    const ble = getManager();
    ble.startDeviceScan([PROGRESSOR_SERVICE_UUID], null, async (scanError, scanned) => {
      if (scanError) {
        setStatus('error');
        setErrorMessage(scanError.message);
        return;
      }
      if (!scanned) return;

      ble.stopDeviceScan();
      setStatus('connecting');
      try {
        const connected: Device = await ble.connectToDevice(scanned.id);
        await connected.discoverAllServicesAndCharacteristics();
        deviceIdRef.current = connected.id;
        setDeviceName(connected.name ?? scanned.name ?? 'Force gauge');

        subscriptionRef.current = ble.monitorCharacteristicForDevice(
          connected.id,
          PROGRESSOR_SERVICE_UUID,
          PROGRESSOR_DATA_CHAR_UUID,
          (monitorError, characteristic) => {
            if (monitorError) return; // fires on disconnect too; onDisconnected below handles that
            if (characteristic?.value) onNotification(characteristic.value);
          }
        );

        ble.onDeviceDisconnected(connected.id, () => {
          setStatus('idle');
          setDeviceName(null);
          deviceIdRef.current = null;
        });

        await ble.writeCharacteristicWithResponseForDevice(
          connected.id,
          PROGRESSOR_SERVICE_UUID,
          PROGRESSOR_CONTROL_CHAR_UUID,
          bytesToBase64(encodeCommand(CMD.START_WEIGHT_MEAS))
        );

        setStatus('connected');
      } catch (e: any) {
        setStatus('error');
        setErrorMessage(e?.message ?? 'Could not connect to the force gauge.');
      }
    });
  }, [onNotification]);

  const disconnect = useCallback(async () => {
    const id = deviceIdRef.current;
    if (id) {
      // Stop measurement is best-effort — the gauge also auto-shuts-down
      // its stream on disconnect, and a device that's already gone must
      // not block the UI from returning to idle.
      await getManager()
        .writeCharacteristicWithResponseForDevice(
          id,
          PROGRESSOR_SERVICE_UUID,
          PROGRESSOR_CONTROL_CHAR_UUID,
          bytesToBase64(encodeCommand(CMD.STOP_WEIGHT_MEAS))
        )
        .catch(() => {});
    }
    cleanup();
    setStatus('idle');
    setDeviceName(null);
  }, [cleanup]);

  return { status, errorMessage, deviceName, current, peak, points, scan, disconnect, reset };
}

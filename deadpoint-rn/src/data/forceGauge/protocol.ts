// src/data/forceGauge/protocol.ts
/** Pure encode/decode for Oscar's homemade force gauge (LetticeTindik) —
    it emulates the real Tindeq Progressor's BLE GATT profile exactly
    (verified against the actual firmware, stage3_bringup.ino, not
    reverse-engineered), so this is a direct transcription of that
    firmware's own framing, not a guess. No BLE import here at all —
    react-native-ble-plx exchanges characteristic values as base64
    strings; everything below works on plain bytes, so it's testable
    with no native module, no mock BLE stack, no device. */

export const PROGRESSOR_SERVICE_UUID = '7e4e1701-1ea6-40c9-9dcc-13d34ffead57';
export const PROGRESSOR_DATA_CHAR_UUID = '7e4e1702-1ea6-40c9-9dcc-13d34ffead57';
export const PROGRESSOR_CONTROL_CHAR_UUID = '7e4e1703-1ea6-40c9-9dcc-13d34ffead57';

/** Opcodes this app actually sends. The firmware also defines calibration/
    RFD commands — deliberately not implemented on the device side (its
    own comment: "letting an app overwrite the calibration we just spent
    an evening on would be a bad trade"), so there's no reason to send
    them from here either. */
export const CMD = {
  TARE_SCALE: 100,
  START_WEIGHT_MEAS: 101,
  STOP_WEIGHT_MEAS: 102,
} as const;

/** Notification type byte — the first byte of every [type][len][payload]
    frame the device sends. Only WEIGHT_MEAS is consumed here; the others
    are recognised so a malformed/unexpected frame is distinguishable from
    a real weight sample rather than silently mis-parsed as one. */
export const RES = {
  CMD_RESPONSE: 0,
  WEIGHT_MEAS: 1,
  RFD_PEAK: 2,
  RFD_PEAK_SERIES: 3,
  LOW_PWR_WARNING: 4,
} as const;

export interface WeightSample {
  kg: number;
  /** Microseconds since this measurement started (device's own
      `measStartCyc` reference, from firmware's onSample()) — NOT a wall
      clock, and not comparable across a stop/start cycle. */
  usSinceStart: number;
}

export interface ParsedNotification {
  type: number;
  /** Populated only when `type === RES.WEIGHT_MEAS`; empty otherwise. */
  samples: WeightSample[];
}

/** Firmware's own framing (stage3_bringup.ino sendResponse()/onSample()):
    byte 0 = type, byte 1 = payload length, then the payload itself —
    for WEIGHT_MEAS, repeated 8-byte (float32 kg, uint32 us) pairs,
    little-endian (nRF52840 is little-endian; the firmware never swaps
    byte order, so no swap belongs here either). */
export function parseNotification(bytes: Uint8Array): ParsedNotification {
  const type = bytes[0];
  const len = bytes[1];
  const samples: WeightSample[] = [];
  if (type === RES.WEIGHT_MEAS) {
    for (let off = 2; off + 8 <= 2 + len && off + 8 <= bytes.length; off += 8) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + off, 8);
      samples.push({ kg: view.getFloat32(0, true), usSinceStart: view.getUint32(4, true) });
    }
  }
  return { type, samples };
}

/** Every command this app sends is a single opcode byte, no payload —
    matches ctrlWriteCB()'s own `switch (d[0])` reading just the first
    byte for every case used here. */
export function encodeCommand(opcode: number): Uint8Array {
  return new Uint8Array([opcode]);
}

// -- base64 <-> bytes --------------------------------------------------
// react-native-ble-plx reads/writes characteristic values as base64
// strings. Hand-rolled rather than relying on global atob/btoa (Hermes
// version support isn't worth gambling a real device connection on) or
// pulling in a dependency for 20 lines for a book-keeping detail app.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 == null ? 0 : b1 >> 4)];
    out += b1 == null ? '=' : B64_CHARS[((b1 & 0x0f) << 2) | (b2 == null ? 0 : b2 >> 6)];
    out += b2 == null ? '=' : B64_CHARS[b2 & 0x3f];
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v0 = B64_CHARS.indexOf(clean[i]);
    const v1 = B64_CHARS.indexOf(clean[i + 1]);
    const v2 = i + 2 < clean.length ? B64_CHARS.indexOf(clean[i + 2]) : -1;
    const v3 = i + 3 < clean.length ? B64_CHARS.indexOf(clean[i + 3]) : -1;
    out[outIdx++] = (v0 << 2) | (v1 >> 4);
    if (v2 >= 0) out[outIdx++] = ((v1 & 0x0f) << 4) | (v2 >> 2);
    if (v3 >= 0) out[outIdx++] = ((v2 & 0x03) << 6) | v3;
  }
  return out;
}

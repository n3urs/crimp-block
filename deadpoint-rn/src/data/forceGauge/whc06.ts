// src/data/forceGauge/whc06.ts
/** Decoder for the WeiHeng WH-C06, a cheap Bluetooth hanging scale that
    many climbers use as a force gauge. Pure bytes-in, kilograms-out, like
    protocol.ts (see __tests__/whc06.test.ts for the format's sources).

    The big difference from the Tindeq Progressor: the WH-C06 never accepts
    a Bluetooth connection. It broadcasts its reading inside its
    advertising packets (manufacturer data, company ID 0x0100) roughly 8
    times a second, so the app has to LISTEN for those packets rather than
    connect. That's why an app that only tries to connect can't see it.

    The manufacturer-data blob (base64, as react-native-ble-plx reports it
    on both iOS and Android) is the 2-byte company ID in wire order
    (00 01) followed by the payload. Payload bytes 10-11 are an unsigned
    big-endian count of HUNDREDTHS of whatever unit the scale is set to; the
    low nibble of payload byte 14 names that unit. Not from a manufacturer
    spec — from three open-source implementations that agree — so anything
    that doesn't fit is rejected rather than guessed at. */
import { base64ToBytes } from './protocol';

export const WHC06_NAME = 'IF_B7';
const COMPANY_LO = 0x00;
const COMPANY_HI = 0x01; // company ID 0x0100, little-endian on the wire
const MIN_PAYLOAD = 12; // enough to read bytes 10 and 11
const SIGNATURE_MIN_PAYLOAD = 17;
/** The scale's rated capacity. A count that converts to more than this can't
    be a real reading (and rules out other devices that share the company ID). */
const CAPACITY_KG = 300;

export interface Whc06Reading {
  /** True when this advertisement is from a WH-C06. */
  isGauge: boolean;
  /** The reading in kilograms, or null if this packet carries none we trust. */
  kg: number | null;
}

const NOT_A_GAUGE: Whc06Reading = { isGauge: false, kg: null };

function kilogramsFor(count: number, unitNibble: number | null): number {
  const value = count / 100;
  switch (unitNibble) {
    case 0:
    case 2:
      return value * 0.45359237; // pounds
    case 3:
      return value * 6.35029318; // stone
    case 4:
      return value * 0.5; // jin
    default:
      return value; // 1 = kg, and the fallback for unknown or missing
  }
}

export function parseWhc06Advertisement(
  manufacturerDataBase64: string | null | undefined,
  localName: string | null | undefined,
): Whc06Reading {
  if (!manufacturerDataBase64) return NOT_A_GAUGE;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(manufacturerDataBase64);
  } catch {
    return NOT_A_GAUGE;
  }
  if (bytes.length < 2 || bytes[0] !== COMPANY_LO || bytes[1] !== COMPANY_HI) return NOT_A_GAUGE;
  const payload = bytes.subarray(2);

  const namedRight = localName === WHC06_NAME;
  const signed = payload.length >= SIGNATURE_MIN_PAYLOAD && payload[0] === 0x02 && payload[1] === 0x03;
  if (!namedRight && !signed) return NOT_A_GAUGE;
  if (payload.length < MIN_PAYLOAD) return { isGauge: true, kg: null };

  const count = (payload[10] << 8) | payload[11];
  const unit = payload.length > 14 ? payload[14] & 0x0f : null;
  const kg = kilogramsFor(count, unit);
  return { isGauge: true, kg: kg <= CAPACITY_KG ? kg : null };
}

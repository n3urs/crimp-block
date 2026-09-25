// src/data/forceGauge/nearbyReport.ts
/** Formatting for the "gauge not showing up?" diagnostic
    (app/nearby-devices.tsx): what the phone hears from one Bluetooth
    device, as a short text someone can send us. Deliberately leaves out
    the device's address — the name, signal, services and broadcast bytes
    are what's needed to add support for a gauge. */
import { base64ToBytes } from './protocol';

export interface NearbyDeviceInfo {
  id: string;
  name: string | null;
  rssi: number | null;
  serviceUUIDs: string[];
  manufacturerData: string | null;
  /** Friendly name if the app already supports this device. */
  recognisedAs: string | null;
  /** Its decoded live reading, if it's a supported broadcast-only gauge. */
  reading: string | null;
}

function bytesOf(base64: string | null | undefined): Uint8Array | null {
  if (!base64) return null;
  try {
    return base64ToBytes(base64);
  } catch {
    return null;
  }
}

export function manufacturerHex(base64: string | null | undefined): string {
  const bytes = bytesOf(base64);
  if (!bytes || bytes.length === 0) return '-';
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** The Bluetooth company ID: the first two bytes, little-endian. */
export function companyIdOf(base64: string | null | undefined): string | null {
  const bytes = bytesOf(base64);
  if (!bytes || bytes.length < 2) return null;
  return `0x${((bytes[1] << 8) | bytes[0]).toString(16).padStart(4, '0')}`;
}

export function deviceReport(d: NearbyDeviceInfo): string {
  return [
    'Deadpoint gauge report',
    `Name: ${d.name ?? '(none)'}`,
    `Signal: ${d.rssi != null ? `${d.rssi} dBm` : '-'}`,
    `Services: ${d.serviceUUIDs.length > 0 ? d.serviceUUIDs.join(', ') : '(none)'}`,
    `Manufacturer data: ${manufacturerHex(d.manufacturerData)}`,
    `Company ID: ${companyIdOf(d.manufacturerData) ?? '-'}`,
    `Recognised as: ${d.recognisedAs ? `${d.recognisedAs}${d.reading ? ` (reading ${d.reading})` : ''}` : 'not recognised'}`,
  ].join('\n');
}

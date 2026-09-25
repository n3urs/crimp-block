/** The "gauge not showing up?" diagnostic (app/nearby-devices.tsx): turns
    what the phone hears from one Bluetooth device into a short text report
    someone can send us, so an unsupported gauge can be added without
    anyone needing the hardware in front of them. */
import { companyIdOf, deviceReport, manufacturerHex } from '../src/data/forceGauge/nearbyReport';
import { bytesToBase64 } from '../src/data/forceGauge/protocol';

const blob = bytesToBase64(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x0a, 0xff]));

test('manufacturer data is shown as spaced hex, and empty as a dash', () => {
  expect(manufacturerHex(blob)).toBe('00 01 02 03 0a ff');
  expect(manufacturerHex(null)).toBe('-');
  expect(manufacturerHex('')).toBe('-');
});

test('the company ID is the first two bytes, little-endian, as 0xNNNN', () => {
  expect(companyIdOf(blob)).toBe('0x0100');
  expect(companyIdOf(bytesToBase64(new Uint8Array([0x4c, 0x00, 1])))).toBe('0x004c');
  expect(companyIdOf(null)).toBeNull();
  expect(companyIdOf(bytesToBase64(new Uint8Array([0x01])))).toBeNull();
});

test('the report carries everything needed to add support, and none of the device address', () => {
  const report = deviceReport({
    id: 'AA:BB:CC:DD:EE:FF', name: 'IF_B7', rssi: -52, serviceUUIDs: [], manufacturerData: blob,
    recognisedAs: 'WH-C06 force gauge', reading: '12.34 kg',
  });
  expect(report).toContain('Name: IF_B7');
  expect(report).toContain('Signal: -52 dBm');
  expect(report).toContain('Manufacturer data: 00 01 02 03 0a ff');
  expect(report).toContain('Company ID: 0x0100');
  expect(report).toContain('Recognised as: WH-C06 force gauge (reading 12.34 kg)');
  expect(report).not.toContain('AA:BB');
});

test('an unrecognised, unnamed device is reported as such', () => {
  const report = deviceReport({ id: 'x', name: null, rssi: null, serviceUUIDs: ['ffe0'], manufacturerData: null, recognisedAs: null, reading: null });
  expect(report).toContain('Name: (none)');
  expect(report).toContain('Services: ffe0');
  expect(report).toContain('Recognised as: not recognised');
});

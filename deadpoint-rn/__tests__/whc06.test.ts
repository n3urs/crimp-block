/** WeiHeng WH-C06 — a cheap Bluetooth hanging scale that many climbers use
    as a force gauge. It never accepts a Bluetooth connection: it broadcasts
    its reading inside its advertising packets (manufacturer data, company
    ID 0x0100), about 8 times a second. So the app must LISTEN, not connect.

    Layout (from three independent open-source implementations that agree:
    sebws/Crane, TheLastKiwi/Dyna, Asherlc/hang-ten): the blob is the 2-byte
    company ID (0x0100, little-endian on the wire: 00 01) followed by the
    payload. Payload bytes 10-11 are an unsigned big-endian count of
    HUNDREDTHS of whatever unit the scale is set to; the low nibble of
    payload byte 14 says which unit (0 or 2 = lb, 1 = kg, 3 = stone,
    4 = jin). Unknown or missing unit means kg. The scale tops out at 300 kg. */
import { parseWhc06Advertisement } from '../src/data/forceGauge/whc06';
import { bytesToBase64 } from '../src/data/forceGauge/protocol';

/** Builds a manufacturer-data blob as the phone reports it: company ID
    first (00 01), then a payload with the count and unit where the scale
    puts them. */
function blob(opts: { count: number; unit?: number; length?: number; signature?: boolean; companyId?: [number, number] }): string {
  const length = opts.length ?? 17;
  const payload = new Uint8Array(length);
  if (opts.signature !== false) { payload[0] = 0x02; payload[1] = 0x03; }
  payload[10] = (opts.count >> 8) & 0xff;
  payload[11] = opts.count & 0xff;
  if (opts.unit != null && length > 14) payload[14] = opts.unit;
  const [lo, hi] = opts.companyId ?? [0x00, 0x01];
  return bytesToBase64(new Uint8Array([lo, hi, ...payload]));
}

test('a kilogram reading is the count divided by 100', () => {
  const r = parseWhc06Advertisement(blob({ count: 1234, unit: 1 }), null);
  expect(r.isGauge).toBe(true);
  expect(r.kg).toBeCloseTo(12.34, 5);
});

test('pounds, stone and jin are converted to kilograms, for both lb codes', () => {
  expect(parseWhc06Advertisement(blob({ count: 1234, unit: 0 }), null).kg).toBeCloseTo(12.34 * 0.45359237, 5);
  expect(parseWhc06Advertisement(blob({ count: 1234, unit: 2 }), null).kg).toBeCloseTo(12.34 * 0.45359237, 5);
  expect(parseWhc06Advertisement(blob({ count: 1234, unit: 3 }), null).kg).toBeCloseTo(12.34 * 6.35029318, 4);
  expect(parseWhc06Advertisement(blob({ count: 1234, unit: 4 }), null).kg).toBeCloseTo(6.17, 5);
});

test('only the low nibble of the unit byte is the unit', () => {
  expect(parseWhc06Advertisement(blob({ count: 1000, unit: 0x11 }), null).kg).toBeCloseTo(10, 5);
  expect(parseWhc06Advertisement(blob({ count: 1000, unit: 0xa4 }), null).kg).toBeCloseTo(5, 5);
});

test('a short payload with no unit byte, or an unknown unit, is read as kilograms', () => {
  expect(parseWhc06Advertisement(blob({ count: 500, length: 12, signature: false }), 'IF_B7').kg).toBeCloseTo(5, 5);
  expect(parseWhc06Advertisement(blob({ count: 500, unit: 9 }), null).kg).toBeCloseTo(5, 5);
});

test('zero is a valid reading (an unloaded scale), not "no reading"', () => {
  expect(parseWhc06Advertisement(blob({ count: 0, unit: 1 }), null).kg).toBe(0);
});

test('anything past the 300 kg capacity is rejected, after unit conversion', () => {
  expect(parseWhc06Advertisement(blob({ count: 65535, unit: 1 }), null).kg).toBeNull(); // 655.35 kg
  expect(parseWhc06Advertisement(blob({ count: 65535, unit: 0 }), null).kg).toBeCloseTo(655.35 * 0.45359237, 3); // 297 kg in lb
});

test('it is recognised by its name, or by the 02 03 signature, on company 0x0100', () => {
  expect(parseWhc06Advertisement(blob({ count: 100, unit: 1, signature: false }), 'IF_B7').isGauge).toBe(true);
  expect(parseWhc06Advertisement(blob({ count: 100, unit: 1 }), null).isGauge).toBe(true);
  expect(parseWhc06Advertisement(blob({ count: 100, unit: 1, signature: false }), 'Something else').isGauge).toBe(false);
});

test('a different company ID, missing data, or a too-short payload is not the gauge', () => {
  expect(parseWhc06Advertisement(blob({ count: 100, unit: 1, companyId: [0x4c, 0x00] }), 'IF_B7').isGauge).toBe(false);
  expect(parseWhc06Advertisement(null, 'IF_B7')).toEqual({ isGauge: false, kg: null });
  expect(parseWhc06Advertisement('', 'IF_B7')).toEqual({ isGauge: false, kg: null });
  const tooShort = bytesToBase64(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x00, 0x00]));
  expect(parseWhc06Advertisement(tooShort, 'IF_B7').kg).toBeNull();
});

import {
  parseNotification,
  encodeCommand,
  bytesToBase64,
  base64ToBytes,
  CMD,
  RES,
} from '../src/data/forceGauge/protocol';

/** Builds a WEIGHT_MEAS frame exactly the way the firmware's
    sendResponse()/onSample() do: [type][len][8-byte pairs...]. */
function buildWeightFrame(pairs: { kg: number; us: number }[]): Uint8Array {
  const bytes = new Uint8Array(2 + pairs.length * 8);
  bytes[0] = RES.WEIGHT_MEAS;
  bytes[1] = pairs.length * 8;
  pairs.forEach((p, i) => {
    const view = new DataView(bytes.buffer, 2 + i * 8, 8);
    view.setFloat32(0, p.kg, true);
    view.setUint32(4, p.us, true);
  });
  return bytes;
}

test('parses a single-sample WEIGHT_MEAS frame', () => {
  const frame = buildWeightFrame([{ kg: 48.1, us: 1234567 }]);
  const parsed = parseNotification(frame);
  expect(parsed.type).toBe(RES.WEIGHT_MEAS);
  expect(parsed.samples).toHaveLength(1);
  expect(parsed.samples[0].kg).toBeCloseTo(48.1, 4);
  expect(parsed.samples[0].usSinceStart).toBe(1234567);
});

test('parses the real 2-samples-per-packet shape the firmware actually sends (SAMPLES_PER_PKT=2)', () => {
  const frame = buildWeightFrame([
    { kg: 12.5, us: 100000 },
    { kg: 12.8, us: 112500 },
  ]);
  expect(frame).toHaveLength(18); // 2 + 2*8, the exact packet size D3 in the plan targets
  const parsed = parseNotification(frame);
  expect(parsed.samples.map((s) => s.kg)).toEqual([expect.closeTo(12.5, 4), expect.closeTo(12.8, 4)]);
  expect(parsed.samples.map((s) => s.usSinceStart)).toEqual([100000, 112500]);
});

test('a negative reading (assistance / band-off-the-hook) round-trips correctly', () => {
  const frame = buildWeightFrame([{ kg: -3.2, us: 500 }]);
  expect(parseNotification(frame).samples[0].kg).toBeCloseTo(-3.2, 4);
});

test('non-WEIGHT_MEAS frames report their type with no samples, not a mis-parse', () => {
  const frame = new Uint8Array([RES.CMD_RESPONSE, 4, 1, 2, 3, 4]);
  const parsed = parseNotification(frame);
  expect(parsed.type).toBe(RES.CMD_RESPONSE);
  expect(parsed.samples).toEqual([]);
});

test('encodeCommand is a single opcode byte, matching ctrlWriteCB reading only d[0]', () => {
  expect(Array.from(encodeCommand(CMD.START_WEIGHT_MEAS))).toEqual([101]);
  expect(Array.from(encodeCommand(CMD.TARE_SCALE))).toEqual([100]);
});

describe('base64 codec (hand-rolled, no atob/btoa dependency)', () => {
  test('round-trips arbitrary byte lengths, including ones needing padding', () => {
    for (const len of [0, 1, 2, 3, 4, 8, 18]) {
      const original = new Uint8Array(len).map((_, i) => (i * 37 + 11) % 256);
      expect(base64ToBytes(bytesToBase64(original))).toEqual(original);
    }
  });

  test('a real 18-byte WEIGHT_MEAS packet round-trips through base64 unchanged', () => {
    const frame = buildWeightFrame([
      { kg: 48.1, us: 1000 },
      { kg: 47.9, us: 1125 },
    ]);
    const roundTripped = base64ToBytes(bytesToBase64(frame));
    expect(parseNotification(roundTripped)).toEqual(parseNotification(frame));
  });

  test('bytesToBase64 matches a known reference value', () => {
    // "man" -> "bWFu" is the standard textbook base64 example.
    const bytes = new Uint8Array([0x6d, 0x61, 0x6e]);
    expect(bytesToBase64(bytes)).toBe('bWFu');
    expect(Array.from(base64ToBytes('bWFu'))).toEqual([0x6d, 0x61, 0x6e]);
  });
});

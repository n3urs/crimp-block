/** classifyAdvertisement — decides, for every Bluetooth device the scan
    hears, whether it is a force gauge the app can use and which kind. The
    scan is no longer filtered to the Tindeq Progressor's service (a
    broadcast-only gauge like the WeiHeng WH-C06 has no service to filter
    on), so this is what keeps every unrelated headphone and watch out of
    the list while still finding every supported gauge. */
import { classifyAdvertisement } from '../src/data/forceGauge/gaugeDiscovery';
import { PROGRESSOR_SERVICE_UUID, bytesToBase64 } from '../src/data/forceGauge/protocol';

const whc06Blob = bytesToBase64(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0, 0, 0, 0, 0, 0, 0x01, 0xf4, 0, 0, 0x01, 0, 0]));

test('a device advertising the Progressor service is a Progressor, whatever it is called', () => {
  expect(classifyAdvertisement({ serviceUUIDs: [PROGRESSOR_SERVICE_UUID], name: 'MyGauge', manufacturerData: null }))
    .toEqual({ kind: 'progressor', name: 'MyGauge' });
  expect(classifyAdvertisement({ serviceUUIDs: [PROGRESSOR_SERVICE_UUID.toUpperCase()], name: null, manufacturerData: null }))
    .toEqual({ kind: 'progressor', name: 'Force gauge' });
});

test('a Progressor whose service UUID was not in the packet is still found by its name', () => {
  expect(classifyAdvertisement({ serviceUUIDs: null, name: 'Progressor_1234', manufacturerData: null })?.kind).toBe('progressor');
  expect(classifyAdvertisement({ serviceUUIDs: null, name: 'LetticeTindik', manufacturerData: null })?.kind).toBe('progressor');
});

test('a WH-C06 is recognised from its broadcast, and given a friendly name', () => {
  expect(classifyAdvertisement({ serviceUUIDs: null, name: 'IF_B7', manufacturerData: whc06Blob }))
    .toEqual({ kind: 'whc06', name: 'WH-C06 force gauge' });
});

test('unrelated devices are ignored', () => {
  expect(classifyAdvertisement({ serviceUUIDs: ['180f'], name: 'AirPods', manufacturerData: bytesToBase64(new Uint8Array([0x4c, 0x00, 1, 2, 3])) })).toBeNull();
  expect(classifyAdvertisement({ serviceUUIDs: null, name: null, manufacturerData: null })).toBeNull();
});

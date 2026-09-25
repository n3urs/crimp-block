/** The device-level kiosk flag: set by typing the kiosk email at sign-in,
    cleared by the hidden staff exit. Local to the device, no account. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getKioskMode, setKioskMode } from '../src/data/deviceFlags';

beforeEach(async () => { await AsyncStorage.clear(); });

test('off by default', async () => {
  expect(await getKioskMode()).toBe(false);
});

test('turning it on survives a fresh read, and turning it off clears it', async () => {
  await setKioskMode(true);
  expect(await getKioskMode()).toBe(true);
  await setKioskMode(false);
  expect(await getKioskMode()).toBe(false);
});

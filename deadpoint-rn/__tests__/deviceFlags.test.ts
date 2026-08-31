import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHasSeenWelcome, setHasSeenWelcome, hasSeenBuiltInTutorial, markBuiltInTutorialSeen } from '../src/data/deviceFlags';

beforeEach(async () => { await AsyncStorage.clear(); });

test('getHasSeenWelcome is false before it has ever been set', async () => {
  expect(await getHasSeenWelcome()).toBe(false);
});

test('setHasSeenWelcome persists true', async () => {
  await setHasSeenWelcome();
  expect(await getHasSeenWelcome()).toBe(true);
});

test('hasSeenBuiltInTutorial is false for an email that has never been marked', async () => {
  expect(await hasSeenBuiltInTutorial('oscar@sullivanltd.co.uk')).toBe(false);
});

test('markBuiltInTutorialSeen is keyed per email, not global', async () => {
  await markBuiltInTutorialSeen('oscar@sullivanltd.co.uk');
  expect(await hasSeenBuiltInTutorial('oscar@sullivanltd.co.uk')).toBe(true);
  expect(await hasSeenBuiltInTutorial('joepearce2005@icloud.com')).toBe(false);
});

test('email keys are case-insensitive, matching how programs.js itself keys accounts', async () => {
  await markBuiltInTutorialSeen('Oscar@SullivanLtd.co.uk');
  expect(await hasSeenBuiltInTutorial('oscar@sullivanltd.co.uk')).toBe(true);
});

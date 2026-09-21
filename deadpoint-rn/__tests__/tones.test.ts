/** Real bug, reproduced on device: on iOS `player.play()` is a synchronous
    native call but `player.seekTo()` is async, and tones.play() used to fire
    `seekTo(0); play()` without waiting. A cue that had already finished
    sits at the end of its clip, so `play()` ran first, made no sound, and
    only THEN did the queued seek rewind it — every second beep on each cue
    was silent. These pin the ordering, and that players exist before the
    first beep is asked for (lazy creation made the first cue after launch
    silent too: the source hadn't finished downloading yet). */
const mockEvents: string[] = [];
const mockPendingSeeks: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
const mockCreate = jest.fn(() => ({
  seekTo: () => new Promise<void>((resolve, reject) => {
    mockEvents.push('seekTo');
    mockPendingSeeks.push({ resolve, reject });
  }),
  play: () => { mockEvents.push('play'); },
}));

jest.mock('expo-audio', () => ({ createAudioPlayer: mockCreate }));
jest.mock('../assets/audio/tone-ready.wav', () => 1);
jest.mock('../assets/audio/tone-go.wav', () => 2);
jest.mock('../assets/audio/tone-stop.wav', () => 3);
jest.mock('../assets/audio/tone-done.wav', () => 4);

const flush = () => new Promise<void>((r) => setImmediate(r));

function freshTones(): typeof import('../src/components/timers/tones') {
  jest.resetModules();
  return require('../src/components/timers/tones');
}

beforeEach(() => {
  mockEvents.length = 0;
  mockPendingSeeks.length = 0;
  mockCreate.mockClear();
});

test('play() does not start playback until the rewind has finished', async () => {
  const tones = freshTones();
  tones.preloadTones();

  tones.play('go');
  await flush();
  expect(mockEvents).toEqual(['seekTo']);

  mockPendingSeeks[0].resolve();
  await flush();
  expect(mockEvents).toEqual(['seekTo', 'play']);
});

test('preloadTones() creates all four players up front, and play() reuses them', () => {
  const tones = freshTones();
  tones.preloadTones();
  expect(mockCreate).toHaveBeenCalledTimes(4);
  expect(mockCreate.mock.calls.every((c: any[]) => c[1]?.downloadFirst === true)).toBe(true);

  tones.play('stop');
  tones.play('done');
  expect(mockCreate).toHaveBeenCalledTimes(4);
});

test('a failed rewind is logged, not thrown as an unhandled rejection', async () => {
  const tones = freshTones();
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  tones.play('ready');
  mockPendingSeeks[0].reject(new Error('seek failed'));
  await flush();

  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});

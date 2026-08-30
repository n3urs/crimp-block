import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CUES = ['ready', 'go', 'stop', 'done'] as const;

test.each(CUES)('tone-%s.wav is a valid, non-trivial mono 16-bit PCM WAV file', (cue) => {
  const path = join(__dirname, '..', 'assets', 'audio', `tone-${cue}.wav`);
  const buffer = readFileSync(path);

  expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
  expect(buffer.readUInt16LE(20)).toBe(1); // PCM
  expect(buffer.readUInt16LE(22)).toBe(1); // mono
  expect(buffer.readUInt32LE(24)).toBe(44100); // sample rate
  expect(buffer.readUInt16LE(34)).toBe(16); // bits per sample

  // A real melody, not an empty/truncated file — the shortest cue (go,
  // two 0.2s notes starting 0.09s apart) still renders to ~0.29s of audio.
  expect(statSync(path).size).toBeGreaterThan(44100 * 0.25 * 2); // > 0.25s of 16-bit mono
});

test('done is the longest cue (4 overlapping notes vs. 1-2 for the others)', () => {
  const size = (cue: string) => statSync(join(__dirname, '..', 'assets', 'audio', `tone-${cue}.wav`)).size;
  expect(size('done')).toBeGreaterThan(size('ready'));
  expect(size('done')).toBeGreaterThan(size('go'));
  expect(size('done')).toBeGreaterThan(size('stop'));
});

#!/usr/bin/env node
// Generates the 4 timer tone cues as WAV files, porting the exact
// harmonic/envelope synthesis math from ios/Shared/IntervalTonePlayer.swift
// (pianoish() + the `melodies` table) so the RN app's pre-rendered tones
// match the current app's melody, pitches, and envelope shape as closely
// as a pre-rendered file can (see the Phase 3 design spec's Decision 1 for
// why this is pre-rendered rather than synthesized live in RN). Run once;
// output is committed under assets/audio/, never regenerated at build or
// test time.
//
// Usage: node scripts/generate-tones.mjs

import { writeFileSync, mkdirSync } from 'node:fs';

const SAMPLE_RATE = 44100;

/** [frequency Hz, start offset seconds] per note, one melody per cue —
    copied verbatim from IntervalTonePlayer.swift's `melodies` table:
      ready: G5 repeated twice (an alert, not a direction)
      go:    E5 -> A5, rising
      stop:  A5 -> E5, falling (go's own two notes, reversed)
      done:  C5 -> E5 -> G5 -> C6, a small fanfare */
const MELODIES = {
  ready: [[784, 0], [784, 0.22]],
  go: [[659, 0], [880, 0.09]],
  stop: [[880, 0], [659, 0.11]],
  done: [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.36]],
};

/** cue === 'done' notes are 0.3s long; every other cue's notes are 0.2s —
    matches `duration: cue == .done ? 0.3 : 0.2` in
    IntervalTonePlayer.swift's play(_:). */
function noteDuration(cue) {
  return cue === 'done' ? 0.3 : 0.2;
}

/** Direct port of IntervalTonePlayer.pianoish(frequency:duration:format:):
    a fundamental plus two quieter harmonics, quick linear attack then an
    exponential-ish decay to ~10% by the note's end — a cheap, believable
    approximation of a struck, piano/bell-like note. Returns one note's
    samples as plain numbers in [-1, 1] (well under that in practice; see
    the 0.45 gain comment below), not yet quantized to any bit depth. */
function pianoish(frequency, duration) {
  const frameCount = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float64Array(frameCount);
  const attack = 0.008;
  for (let frame = 0; frame < frameCount; frame++) {
    const t = frame / SAMPLE_RATE;
    const envelope = t < attack
      ? t / attack
      : Math.pow(0.1, (t - attack) / (duration - attack));
    const fundamental = Math.sin(2 * Math.PI * frequency * t);
    const secondHarmonic = Math.sin(2 * Math.PI * frequency * 2 * t) * 0.28;
    const thirdHarmonic = Math.sin(2 * Math.PI * frequency * 3 * t) * 0.12;
    // 0.45 gain, matching IntervalTonePlayer.swift's own comment: reported
    // too soft to hear over a real gym at the original 0.3, and the
    // worst-case constructive peak across all three harmonic layers
    // (~1.4) still leaves real headroom before clipping at 1.0 even here.
    samples[frame] = (fundamental + secondHarmonic + thirdHarmonic) * envelope * 0.45;
  }
  return samples;
}

/** Additively mixes every note in a melody into one buffer, each starting
    at its own offset — this is what AVAudioEngine's mixer node does in
    real time when IntervalTonePlayer schedules overlapping buffers, and a
    single pre-rendered file has to do the same mixing up front. `done`'s
    4 notes genuinely overlap this way: note 2 starts at 0.11s while note
    1 (0.3s long) is still decaying. */
function renderMelody(cue) {
  const duration = noteDuration(cue);
  const notes = MELODIES[cue];
  const totalSeconds = Math.max(...notes.map(([, at]) => at + duration));
  const totalFrames = Math.ceil(totalSeconds * SAMPLE_RATE);
  const mix = new Float64Array(totalFrames);
  for (const [frequency, at] of notes) {
    const note = pianoish(frequency, duration);
    const startFrame = Math.round(at * SAMPLE_RATE);
    for (let i = 0; i < note.length; i++) {
      mix[startFrame + i] += note[i];
    }
  }
  return mix;
}

/** Minimal mono 16-bit PCM WAV writer. No dependency needed for a format
    this small and well-specified — a 44-byte header followed by raw
    little-endian PCM samples. */
function toWavBuffer(samples) {
  const numFrames = samples.length;
  const bytesPerSample = 2;
  const dataSize = numFrames * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numFrames; i++) {
    // Clamp before quantizing — the worst-case constructive peak is
    // documented above as safely under 1.0, but clamp defensively anyway
    // since this runs with no listening ear attached.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buffer;
}

mkdirSync(new URL('../assets/audio/', import.meta.url), { recursive: true });
for (const cue of Object.keys(MELODIES)) {
  const wav = toWavBuffer(renderMelody(cue));
  const outPath = new URL(`../assets/audio/tone-${cue}.wav`, import.meta.url);
  writeFileSync(outPath, wav);
  console.log(`wrote ${outPath.pathname} (${wav.length} bytes)`);
}

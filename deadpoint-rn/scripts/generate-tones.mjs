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
function pianoish(frequency, duration, gain = 0.45) {
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
    samples[frame] = (fundamental + secondHarmonic + thirdHarmonic) * envelope * gain;
  }
  return samples;
}

/** Additively mixes every note in a melody into one buffer, each starting
    at its own offset — this is what AVAudioEngine's mixer node does in
    real time when IntervalTonePlayer schedules overlapping buffers, and a
    single pre-rendered file has to do the same mixing up front. `done`'s
    4 notes genuinely overlap this way: note 2 starts at 0.11s while note
    1 (0.3s long) is still decaying. */
function renderNotes(notes, duration, gain) {
  const totalSeconds = Math.max(...notes.map(([, at]) => at + duration));
  const totalFrames = Math.ceil(totalSeconds * SAMPLE_RATE);
  const mix = new Float64Array(totalFrames);
  for (const [frequency, at] of notes) {
    const note = pianoish(frequency, duration, gain);
    const startFrame = Math.round(at * SAMPLE_RATE);
    for (let i = 0; i < note.length; i++) {
      mix[startFrame + i] += note[i];
    }
  }
  return mix;
}

function renderMelody(cue) {
  return renderNotes(MELODIES[cue], noteDuration(cue), 0.45);
}

/** Flappy Bird mode's cues (added 24 Sep 2026). Not ports of anything in the
    Swift app — written to Oscar's own brief: "subtle, not too jarring, nice
    beeps when you go through the pipes and a nice ding when you get above
    your high score, maybe a death sound. Make them all kind of nice and
    soft." Same struck-bell timbre as the timer cues (pianoish) so they read
    as the same app, at well under half their gain: the timers have to carry
    over a real gym, these play every second or two in someone's hands and
    must never startle. */
const GAME_CUES = {
  // One short, quiet bell note per pipe — a tick, not a jingle. Slightly
  // longer than the first cut (0.14s) with a fade to zero: Oscar liked the
  // sound but said it "cuts off very sharply at the end and almost clips".
  pipe: () => fadeOut(renderNotes([[784, 0]], 0.22, 0.2), 110),
  // A soft two-note "ding-ding" upwards, only when a run passes the player's own best.
  best: () => fadeOut(renderNotes([[1319, 0], [1760, 0.09]], 0.5, 0.26), 180),
  // A gentle falling glide, A4 -> A3: reads as "oh well", not as an alarm.
  death: () => fadeOut(glide(440, 220, 0.45, 0.3), 140),
  // Launch game (26 Sep 2026). A soft tick per second of the 3 s charge.
  tick: () => fadeOut(renderNotes([[1047, 0]], 0.12, 0.2), 60),
  // Lift-off: a rushing whoosh with a low thump under it.
  launch: () => fadeOut(mix(whoosh(1.1, 0.25), glide(120, 45, 0.5, 0.28)), 300),
  // One bright ding per landmark passed (rooftops, clouds, the Moon...).
  zone: () => fadeOut(renderNotes([[1568, 0]], 0.3, 0.16), 120),
  // Coming to a stop at the top: a soft rising arpeggio.
  landed: () => fadeOut(renderNotes([[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]], 0.5, 0.16), 200),
};

/** Adds two buffers, the shorter one padded with silence. */
function mix(a, b) {
  const out = new Float64Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

/** Filtered noise swelling up and away: white noise through a one-pole
    low-pass whose cutoff sweeps up fast then back down, under a swell-and-
    decay envelope. Seeded, so re-running the script gives the same file. */
function whoosh(duration, gain) {
  const frameCount = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float64Array(frameCount);
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let y = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const u = frame / frameCount;
    const cutoffHz = 300 + 5200 * Math.sin(Math.PI * Math.min(1, u * 1.4)) ** 2;
    const a = 1 - Math.exp((-2 * Math.PI * cutoffHz) / SAMPLE_RATE);
    y += a * (rand() * 2 - 1 - y);
    const envelope = u < 0.12 ? u / 0.12 : Math.pow(0.04, (u - 0.12) / 0.88);
    samples[frame] = y * envelope * gain * 2.2;
  }
  return samples;
}

/** Smooths the end of a rendered cue: a raised-cosine fade to exactly zero
    over the last `ms`. pianoish() and glide() decay to only ~10% / ~5% of
    their peak by the final sample, so a buffer that simply ends there stops
    a still-ringing note with an audible click. Applied to the GAME cues
    only — the timer cues are deliberately left byte-identical. */
function fadeOut(samples, ms) {
  const n = Math.min(samples.length, Math.round((ms / 1000) * SAMPLE_RATE));
  const start = samples.length - n;
  for (let i = 0; i < n; i++) {
    samples[start + i] *= 0.5 * (1 + Math.cos(Math.PI * (i / n)));
  }
  return samples;
}

/** A sine that sweeps exponentially (i.e. evenly in pitch) from one
    frequency to another, with a quick attack and a decay to ~5%. The phase is
    ACCUMULATED per sample rather than computed as sin(2*pi*f(t)*t), which
    would chirp far faster than intended because the frequency itself is
    changing. A quiet second harmonic keeps it audible on a phone speaker,
    which barely reproduces the low fundamental. */
function glide(fromHz, toHz, duration, gain) {
  const frameCount = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float64Array(frameCount);
  const attack = 0.01;
  let phase = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const t = frame / SAMPLE_RATE;
    const hz = fromHz * Math.pow(toHz / fromHz, t / duration);
    phase += (2 * Math.PI * hz) / SAMPLE_RATE;
    const envelope = t < attack ? t / attack : Math.pow(0.05, (t - attack) / (duration - attack));
    samples[frame] = (Math.sin(phase) + Math.sin(phase * 2) * 0.3) * envelope * gain;
  }
  return samples;
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
for (const [name, render] of Object.entries(GAME_CUES)) {
  const wav = toWavBuffer(render());
  const outPath = new URL(`../assets/audio/game-${name}.wav`, import.meta.url);
  writeFileSync(outPath, wav);
  console.log(`wrote ${outPath.pathname} (${wav.length} bytes)`);
}

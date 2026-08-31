// src/components/timers/tones.ts
/** Plays the 4 pre-rendered timer tone cues (see scripts/generate-tones.mjs
    and the Phase 3 design spec's Decision 1 for why these are pre-rendered
    files rather than live RN synthesis). One shared player per cue,
    created lazily on first use and reused for the app's whole lifetime —
    mirrors why IntervalTonePlayer.swift's engine/player pair is a
    long-lived instance rather than recreated per play() call.

    Not unit tested directly — like every other thin native-wrapper module
    in this project (useSession.ts, supabase.ts), this is verified live on
    a real device (Task 6), not under Jest. */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

export type Cue = 'ready' | 'go' | 'stop' | 'done';

const SOURCES: Record<Cue, number> = {
  ready: require('../../../assets/audio/tone-ready.wav'),
  go: require('../../../assets/audio/tone-go.wav'),
  stop: require('../../../assets/audio/tone-stop.wav'),
  done: require('../../../assets/audio/tone-done.wav'),
};

let players: Record<Cue, AudioPlayer> | null = null;

/** `downloadFirst: true` is load-bearing, not a tuning knob — confirmed
    live on a real device build: without it, createAudioPlayer()'s default
    path (resolveSource(), synchronous, no download) hands the native
    player a bundled asset's raw Metro dev-server URI before it has ever
    been downloaded to a local file, and every cue then failed to play
    with a native `[MediaToolbox] FigFilePlayer signalled err=-12864`
    (unsupported/undecodable file), with no JS-visible error at all —
    `play()`/`seekTo()` return normally, the app never crashes, the tone
    just silently never sounds. Root cause, found by reading expo-audio's
    own installed source (node_modules/expo-audio/src/ExpoAudio.ts and
    utils/resolveSource.ts): `resolveSourceWithDownload()` — only used
    when `downloadFirst: true` — has an explicit, self-documented fix for
    exactly this ("iOS AVPlayer fails to load the asset if the type is
    not set or can't be inferred"), which the default synchronous path
    skips entirely. */
function ensureLoaded(): Record<Cue, AudioPlayer> {
  if (!players) {
    players = {
      ready: createAudioPlayer(SOURCES.ready, { downloadFirst: true }),
      go: createAudioPlayer(SOURCES.go, { downloadFirst: true }),
      stop: createAudioPlayer(SOURCES.stop, { downloadFirst: true }),
      done: createAudioPlayer(SOURCES.done, { downloadFirst: true }),
    };
  }
  return players;
}

/** Replays a cue from the start even if it's already mid-playback — a
    rapid double-tap (or the interval timer's own fast phase changes)
    should always restart the cue cleanly, matching
    IntervalTonePlayer.swift's own scheduleBuffer/play() pair, which never
    leaves a stale half-played buffer blocking a new one. */
export function play(cue: Cue): void {
  const player = ensureLoaded()[cue];
  player.seekTo(0);
  player.play();
}

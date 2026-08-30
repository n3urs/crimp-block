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

function ensureLoaded(): Record<Cue, AudioPlayer> {
  if (!players) {
    players = {
      ready: createAudioPlayer(SOURCES.ready),
      go: createAudioPlayer(SOURCES.go),
      stop: createAudioPlayer(SOURCES.stop),
      done: createAudioPlayer(SOURCES.done),
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

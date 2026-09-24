/** Configures the app's audio session once, as a module-scope side effect
    imported from the true app root (app/_layout.tsx) — same pattern
    subscription.ts already uses, and for the same reason: a previous
    useEffect-based version of that call raced a child screen's own check
    on cold launch, so this fires before any screen exists to race against.

    Never configured before this fix. expo-audio only ever calls iOS's
    AVAudioSession.setCategory from inside its own native setAudioMode(),
    which is reachable ONLY via this JS setAudioModeAsync call (confirmed
    by reading the installed AudioModule.swift directly, not assumed) —
    so with this never called, every rest-timer/interval chime this app
    has ever played ran under iOS's untouched default session category,
    .soloAmbient, which does not mix with anything. That is why a rest
    timer finishing over Bluetooth Apple Music stopped the music instead
    of sounding over it, and why the behaviour was inconsistent rather
    than reliably broken: with no category ever set, what actually
    happened depended on whatever state the session was left in by
    whatever last touched it, not on anything this app controlled.

    interruptionMode: 'duckOthers', deliberately not 'mixWithOthers' —
    confirmed against Oscar's own live report: the wanted behaviour is
    Apple Music quieting for the chime and coming back after, not the
    chime playing at full volume over un-lowered music.

    shouldPlayInBackground stays false, matching enableBackgroundPlayback:
    false already set on the expo-audio config plugin in app.json — that
    flag exists specifically to satisfy Apple's Guideline 2.5.4 rejection
    on build 24 (see deadpoint-appstore-resubmission). true here would
    silently reopen exactly what that fix closed. */
import { setAudioModeAsync } from 'expo-audio';

export const DEFAULT_AUDIO_MODE = {
  playsInSilentMode: true,
  interruptionMode: 'duckOthers',
  shouldPlayInBackground: false,
  allowsRecording: false,
} as const;

/** Flappy Bird mode's own session setting, applied while its screen is up
    and undone on the way out (see FlappyBirdGame.tsx). The game plays a
    quiet blip every second or two, and under 'duckOthers' each one would
    dip the user's music and let it back up again — a pumping effect that
    is exactly the "jarring" the sounds are meant to avoid. Mixing lets
    them sit softly over whatever's playing instead. Silent-mode behaviour
    is deliberately unchanged, matching the timers. */
export const GAME_AUDIO_MODE = { ...DEFAULT_AUDIO_MODE, interruptionMode: 'mixWithOthers' } as const;

setAudioModeAsync(DEFAULT_AUDIO_MODE).catch((e) => console.error('audioMode setup failed:', e));

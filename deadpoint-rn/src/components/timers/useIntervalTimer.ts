/** Thin wrapper over intervalTimerLogic.ts's pure state machine — owns the
    actual ticking (IntervalTimerController.swift's own
    Timer.scheduledTimer(withTimeInterval: 0.2...)), pause/resume,
    mute, and tone playback. Not unit tested directly (see this plan's
    Global Constraints on hooks) — verified live on device in Task 6. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntervalConfig } from '../../engine/types';
import { Motion } from '../../design/motion';
import { play } from './tones';
import { advancePhase, leadingInt, statusText, toneForPhase, type Phase, type PhaseState } from './intervalTimerLogic';

export interface IntervalTimerState {
  phase: Phase;
  set: number;
  rep: number;
  sets: number;
  reps: number;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  isPaused: boolean;
  isMuted: boolean;
  phaseEndMs: number | null;
  statusText: string;
}

/** Time to put the phone down and get hands on the board before the first
    rep starts counting — same 5s as IntervalTimerController.readySecs. */
const READY_SECS = 5;

function durationFor(phase: Phase, onSecs: number, offSecs: number, setRestSecs: number): number {
  if (phase === 'ready') return READY_SECS;
  if (phase === 'on') return onSecs;
  if (phase === 'off') return offSecs;
  if (phase === 'setrest') return setRestSecs;
  return 0; // 'done'
}

export function useIntervalTimer() {
  const [state, setState] = useState<IntervalTimerState | null>(null);
  // Mirrors `state` so runTick/finish/pause/resume/toggleMute can read the
  // CURRENT value synchronously without the setState-updater-function
  // form — avoids calling finish() (which itself calls setState) from
  // inside another setState updater, which would risk running twice
  // under React 18 strict mode's double-invoke-to-catch-side-effects
  // behaviour for updater functions.
  const stateRef = useRef<IntervalTimerState | null>(null);
  const configRef = useRef<{ onSecs: number; offSecs: number; setRestSecs: number; sets: number; reps: number }>({
    onSecs: 0, offSecs: 0, setRestSecs: 0, sets: 1, reps: 1,
  });
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutedRef = useRef(false);

  const setAndTrack = useCallback((next: IntervalTimerState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (tickRef.current != null) { clearInterval(tickRef.current); tickRef.current = null; }
    if (doneClearRef.current != null) { clearTimeout(doneClearRef.current); doneClearRef.current = null; }
  }, []);

  const playIfUnmuted = useCallback((cue: Parameters<typeof play>[0]) => {
    if (!isMutedRef.current) play(cue);
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    playIfUnmuted('done');
    const s = stateRef.current;
    if (s) {
      setAndTrack({
        ...s, phase: 'done', remainingSeconds: 0, phaseEndMs: null,
        statusText: statusText({ phase: 'done', set: s.set, rep: s.rep }, s.sets, s.reps),
      });
    }
    doneClearRef.current = setTimeout(() => setAndTrack(null), Motion.intervalDoneAutoClearMs);
  }, [clearTimers, playIfUnmuted, setAndTrack]);

  const runTick = useCallback(() => {
    const s = stateRef.current;
    if (s == null || s.isPaused || s.phaseEndMs == null) return;
    const remaining = Math.max(0, Math.ceil((s.phaseEndMs - Date.now()) / 1000));
    if (remaining > 0) {
      setAndTrack({ ...s, remainingSeconds: remaining });
      return;
    }

    const next = advancePhase({ phase: s.phase, set: s.set, rep: s.rep }, s.sets, s.reps);
    if (next === 'finish') {
      finish();
      return;
    }
    const total = durationFor(next.phase, configRef.current.onSecs, configRef.current.offSecs, configRef.current.setRestSecs);
    playIfUnmuted(toneForPhase(next.phase) ?? 'stop');
    setAndTrack({
      ...s, phase: next.phase, set: next.set, rep: next.rep,
      totalSeconds: total, remainingSeconds: total, phaseEndMs: Date.now() + total * 1000,
      statusText: statusText(next, s.sets, s.reps),
    });
  }, [finish, playIfUnmuted, setAndTrack]);

  const start = useCallback((config: IntervalConfig, setRestSecs: number, sets: number, label: string) => {
    clearTimers();
    configRef.current = { onSecs: config.on, offSecs: config.off, setRestSecs, sets: Math.max(1, sets), reps: Math.max(1, config.reps) };
    playIfUnmuted('ready');
    const readyPhase: PhaseState = { phase: 'ready', set: 1, rep: 1 };
    setAndTrack({
      phase: 'ready', set: 1, rep: 1, sets: configRef.current.sets, reps: configRef.current.reps,
      label, totalSeconds: READY_SECS, remainingSeconds: READY_SECS, isPaused: false, isMuted: isMutedRef.current,
      phaseEndMs: Date.now() + READY_SECS * 1000, statusText: statusText(readyPhase, configRef.current.sets, configRef.current.reps),
    });
    tickRef.current = setInterval(runTick, Motion.intervalControllerTickMs);
  }, [clearTimers, playIfUnmuted, runTick, setAndTrack]);

  const stop = useCallback(() => {
    clearTimers();
    setAndTrack(null);
  }, [clearTimers, setAndTrack]);

  /** Freezes the countdown in place — phaseEndMs goes null so runTick's
      guard above skips ticking, and remainingSeconds stays exactly where
      it was; resume() re-anchors phaseEndMs to "now + whatever was left"
      rather than recomputing anything about where in the set/rep sequence
      you are, so a pause never skips or repeats a phase. Matches
      IntervalTimerController.pause()/resume() exactly. */
  const pause = useCallback(() => {
    const s = stateRef.current;
    if (s && s.phase !== 'done' && !s.isPaused) setAndTrack({ ...s, isPaused: true, phaseEndMs: null });
  }, [setAndTrack]);

  const resume = useCallback(() => {
    const s = stateRef.current;
    if (s && s.isPaused) setAndTrack({ ...s, isPaused: false, phaseEndMs: Date.now() + s.remainingSeconds * 1000 });
  }, [setAndTrack]);

  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
    const s = stateRef.current;
    if (s) setAndTrack({ ...s, isMuted: isMutedRef.current });
  }, [setAndTrack]);

  // Belt-and-braces cleanup if the owning screen ever unmounts mid-timer
  // (e.g. navigating away without hitting STOP) — without this the tick
  // interval and the done-state auto-clear timeout would keep firing
  // forever against a detached stateRef, including continuing to play
  // audible tones. Same precedent as useRestTimer.ts's own unmount effect.
  useEffect(() => () => clearTimers(), [clearTimers]);

  return { state, start, stop, pause, resume, toggleMute };
}

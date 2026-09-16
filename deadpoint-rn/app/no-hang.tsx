// app/no-hang.tsx
/** Follow-along for Emil Abrahamsson's sub-max daily fingerboard routine.
    Setup (pick board, start) while the timer is idle; board, grip and
    countdown while it runs. Same useIntervalTimer as the plan's repeaters;
    TIMER_CONFIG in src/noHang/protocol.ts maps the 20 reps onto it.
    Nothing is logged. Leaving the screen stops the timer (the hook clears
    its ticker on unmount). */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useIntervalTimer, type IntervalTimerState } from '../src/components/timers/useIntervalTimer';
import { BoardDiagram } from '../src/noHang/BoardDiagram';
import { GripDiagram } from '../src/noHang/GripDiagram';
import { BOARDS, TIMER_CONFIG, TOTAL_REPS, displayedGrip, parseBoardId, type BoardId } from '../src/noHang/protocol';

const ACCENT = resolveColour('--gorse');
const BOARD_KEY = 'noHangBoard';
const RULES = [
  'Feet stay on the floor. Take some weight off, never a full hang.',
  'About 40% effort, 30–50% on the two-finger grips. Unsure? Go lighter.',
  '20 reps of 10s on, 20s rest. Leave 6 hours before the next session.',
];

function phaseColour(phase: IntervalTimerState['phase']): string {
  if (phase === 'ready') return Colours.readyC;
  if (phase === 'on' || phase === 'done') return Colours.go;
  return Colours.restC;
}

function phaseWord(state: IntervalTimerState): string {
  if (state.isPaused) return 'PAUSED';
  if (state.phase === 'ready') return 'GET READY';
  if (state.phase === 'on') return 'HANG';
  if (state.phase === 'done') return 'DONE';
  return 'REST';
}

export default function NoHang() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { state, start, stop, pause, resume, toggleMute } = useIntervalTimer();
  const [boardId, setBoardId] = useState<BoardId>('bm1000');
  const chosenRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(BOARD_KEY)
      .then((raw) => { if (!chosenRef.current) setBoardId(parseBoardId(raw)); })
      .catch(() => {});
  }, []);

  const chooseBoard = (id: BoardId) => {
    chosenRef.current = true;
    setBoardId(id);
    AsyncStorage.setItem(BOARD_KEY, id).catch(() => {});
  };

  const board = BOARDS[boardId];
  const boardWidth = screenWidth - 40;

  return (
    <View style={[styles.root, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>NO-HANG ROUTINE</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      {state == null ? (
        <>
          <View style={styles.toggle}>
            {(['bm1000', 'bm2000'] as const).map((id) => {
              const selected = id === boardId;
              return (
                <Pressable
                  key={id}
                  onPress={() => chooseBoard(id)}
                  style={[styles.toggleOption, selected && styles.toggleOptionSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={BOARDS[id].name}
                >
                  <Text style={[styles.toggleText, selected && styles.toggleTextSelected]}>BEASTMAKER {BOARDS[id].shortName}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.setupBody}>
            <BoardDiagram board={board} width={boardWidth} />
            <Text style={styles.holdLabel}>{board.holdLabel}</Text>
            <View style={styles.rules}>
              {RULES.map((rule) => (
                <View key={rule} style={styles.ruleRow}>
                  <View style={styles.ruleDot} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => start(TIMER_CONFIG.interval, TIMER_CONFIG.setRestSecs, TIMER_CONFIG.sets, 'No-hang routine')}
            style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Start the routine"
          >
            <Text style={styles.startText}>START · 10 MIN</Text>
          </Pressable>
        </>
      ) : (
        <FollowAlong
          state={state}
          boardWidth={boardWidth}
          boardId={boardId}
          onPause={pause}
          onResume={resume}
          onStop={stop}
          onToggleMute={toggleMute}
        />
      )}
    </View>
  );
}

function FollowAlong({
  state, boardWidth, boardId, onPause, onResume, onStop, onToggleMute,
}: {
  state: IntervalTimerState;
  boardWidth: number;
  boardId: BoardId;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}) {
  const shown = displayedGrip(state.phase, state.set);
  const isDone = state.phase === 'done';
  const detail = isDone
    ? `All ${TOTAL_REPS} reps done`
    : shown.isNext
      ? `Up next, rep ${shown.rep} of ${TOTAL_REPS}${shown.isChange ? ' · change grip' : ''}`
      : `Rep ${shown.rep} of ${TOTAL_REPS}`;

  return (
    <>
      <View style={styles.followBody}>
        <BoardDiagram board={BOARDS[boardId]} width={boardWidth} />

        <View style={styles.gripPanel}>
          <GripDiagram fingers={shown.grip.fingers} />
          <Text style={styles.gripName}>{shown.grip.name.toUpperCase()}</Text>
          <Text style={[styles.gripDetail, shown.isChange && !isDone && { color: ACCENT }]}>{detail}</Text>
        </View>

        <View
          style={[styles.countdownCard, { backgroundColor: phaseColour(state.phase) }, state.isPaused && styles.countdownPaused]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${phaseWord(state)}, ${state.remainingSeconds} seconds`}
        >
          <Text style={styles.phaseWord}>{phaseWord(state)}</Text>
          {!isDone && <Text style={styles.countdown}>{state.remainingSeconds}</Text>}
        </View>
      </View>

      {!isDone && (
        <View style={styles.controls}>
          <ControlButton label={state.isPaused ? 'RESUME' : 'PAUSE'} onPress={state.isPaused ? onResume : onPause} />
          <ControlButton label={state.isMuted ? 'UNMUTE' : 'MUTE'} onPress={onToggleMute} />
          <ControlButton label="STOP" onPress={onStop} />
        </View>
      )}
    </>
  );
}

function ControlButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
      accessibilityRole="button"
      accessibilityLabel={label.toLowerCase()}
    >
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 17, fontWeight: '700', color: Colours.fg },
  close: { ...Fonts.mono(12, 'bold'), color: Colours.faint },

  toggle: { flexDirection: 'row', backgroundColor: Colours.s1, borderRadius: 8, padding: 4, gap: 4 },
  toggleOption: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  toggleOptionSelected: { backgroundColor: Colours.s3 },
  toggleText: { ...Fonts.mono(12, 'bold'), color: Colours.dim, letterSpacing: 1 },
  toggleTextSelected: { color: Colours.fg },

  setupBody: { flex: 1, justifyContent: 'center', gap: 12 },
  holdLabel: { ...Fonts.mono(12, 'medium'), color: ACCENT, textAlign: 'center' },
  rules: { gap: 10, marginTop: 20 },
  ruleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ruleDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colours.s4, marginTop: 7 },
  ruleText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colours.dim },

  startButton: { paddingVertical: 16, borderRadius: 8, alignItems: 'center', backgroundColor: ACCENT },
  startButtonPressed: { opacity: 0.85 },
  startText: { ...Fonts.mono(13, 'bold'), color: Colours.bg, letterSpacing: 1 },

  followBody: { flex: 1, gap: 20 },
  gripPanel: { alignItems: 'center', gap: 10 },
  gripName: { ...Fonts.heading(24), color: Colours.fg, textAlign: 'center' },
  gripDetail: { ...Fonts.mono(12, 'medium'), color: Colours.dim, textAlign: 'center' },

  countdownCard: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  countdownPaused: { opacity: 0.45 },
  phaseWord: { ...Fonts.mono(15, 'bold'), color: Colours.bg, letterSpacing: 2 },
  countdown: { ...Fonts.timerDigits(104), color: Colours.bg },

  controls: { flexDirection: 'row', gap: 12, marginTop: 16 },
  controlButton: { flex: 1, paddingVertical: 16, borderRadius: 8, alignItems: 'center', backgroundColor: Colours.s2 },
  controlButtonPressed: { backgroundColor: Colours.s3 },
  controlText: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1 },
});

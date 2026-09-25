// app/gym.tsx
/** Gym station: a phone or tablet left next to the force gauge as a
    walk-up Flappy Bird game with a weekly top-5. Reached from Settings →
    Tools → Gym station.

    Unattended by design: it scans for the gauge and connects on its own,
    retries if the gauge isn't found or the connection drops, keeps the
    screen awake, and needs no taps to play (pull to start, release and
    pull to go again). The only touch input is typing a name when a score
    makes the board, and that times out by itself so an abandoned prompt
    can't block the next person.

    The board is per-device (see gymBoard.ts) — it's the station's
    scoreboard, not anyone's account data. The promo line at the bottom is
    the one place the station advertises; edit PROMO_LINE when the launch
    code changes. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colours, resolveColour } from '../src/design/colours';
import { Fonts } from '../src/design/fonts';
import { useForceGauge } from '../src/data/forceGauge/useForceGauge';
import { getKioskMode, setKioskMode } from '../src/data/deviceFlags';
import { FlappyBirdGame } from '../src/components/force-gauge/FlappyBirdGame';
import {
  addToBoard, cleanName, loadBoard, qualifiesForBoard, saveBoard, thisWeeksBoard, type BoardEntry,
} from '../src/data/forceGauge/gymBoard';

const ACCENT = resolveColour('--gorse');
const RETRY_MS = 4000;
const NAME_TIMEOUT_MS = 25000;
const PROMO_LINE = 'Deadpoint · smarter climbing training · getdeadpoint.co.uk · free week: DEADPOINTLAUNCH';

const noop = () => {};

export default function Gym() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // A tablet on a stand is often landscape: put the board beside the game
  // there instead of squashing the game between header and board.
  const { width, height } = useWindowDimensions();
  const landscape = width > height * 1.1;
  // A kiosk device (typed the kiosk email at sign-in, see kiosk.ts) can't
  // leave this screen: no EXIT, no Android back. Staff switch it off by
  // holding the title for 3 seconds. `null` while the flag is being read, so
  // EXIT never flashes up on a kiosk.
  const [kiosk, setKiosk] = useState<boolean | null>(null);
  useEffect(() => { getKioskMode().then(setKiosk).catch(() => setKiosk(false)); }, []);
  useEffect(() => {
    if (kiosk !== true) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [kiosk]);
  const staffSignOut = () => {
    Alert.alert('Leave the gym station?', 'This device goes back to the normal sign-in screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try { await setKioskMode(false); } catch (e) { console.error('gym: clearing kiosk mode failed:', e); }
          router.replace('/');
        },
      },
    ]);
  };
  const { status, devices, points, scan, connect } = useForceGauge();

  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [pending, setPending] = useState<number | null>(null); // a score waiting for a name
  const [name, setName] = useState('');
  const boardRef = useRef<BoardEntry[]>([]);
  boardRef.current = board;

  useEffect(() => {
    loadBoard().then((stored) => setBoard(thisWeeksBoard(stored, Date.now())));
  }, []);

  // Find and hold the gauge without anyone touching the screen.
  useEffect(() => { scan(); }, [scan]);
  useEffect(() => {
    if ((status === 'scanning' || status === 'scanDone') && devices.length > 0) {
      connect(devices[0]);
      return;
    }
    if (status === 'scanDone' || status === 'error') {
      const t = setTimeout(scan, RETRY_MS);
      return () => clearTimeout(t);
    }
  }, [status, devices, connect, scan]);

  const weekBest = board.length > 0 ? board[0].score : 0;

  const onGameOver = useCallback((score: number) => {
    if (qualifiesForBoard(boardRef.current, score, Date.now())) {
      setName('');
      setPending(score);
    }
  }, []);

  const commit = useCallback((score: number, rawName: string) => {
    const now = Date.now();
    const next = addToBoard(boardRef.current, { name: cleanName(rawName), score, at: now }, now);
    setBoard(next);
    saveBoard(next);
    setPending(null);
  }, []);

  // An abandoned name prompt saves itself, so it can't hang over the game.
  useEffect(() => {
    if (pending == null) return;
    const t = setTimeout(() => commit(pending, name), NAME_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending, name, commit]);

  const isLive = status === 'connected';

  return (
    <View style={[styles.root, { paddingTop: 16 + insets.top, paddingBottom: 12 + insets.bottom }]}>
      <View style={styles.headerRow}>
        <Pressable onLongPress={kiosk === true ? staffSignOut : undefined} delayLongPress={3000} accessible={false}>
          <Text style={styles.title}>GYM STATION</Text>
        </Pressable>
        {kiosk === false && (
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.exitButton} accessibilityRole="button" accessibilityLabel="Exit gym station">
            <Text style={styles.exit}>EXIT</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.body, landscape && styles.bodyLandscape]}>
        <View style={styles.main}>
          {isLive ? (
            <FlappyBirdGame points={points} highScore={weekBest} onNewHighScore={noop} onGameOver={onGameOver} />
          ) : (
            <View style={styles.connecting}>
              <ActivityIndicator color={ACCENT} />
              <Text style={styles.connectingText}>
                {status === 'connecting' ? 'Connecting to the force gauge…' : 'Looking for the force gauge…'}
              </Text>
              <Text style={styles.connectingHint}>Switch the gauge on and keep it close to this device.</Text>
            </View>
          )}
        </View>

        <View style={landscape ? styles.sideLandscape : undefined}>
          <View style={styles.board} accessible accessibilityLabel="This week's top scores">
            <Text style={styles.boardTitle}>THIS WEEK</Text>
            {board.length === 0 ? (
              <Text style={styles.boardEmpty}>No scores yet. Be the first.</Text>
            ) : (
              board.map((entry, i) => (
                <View key={`${entry.at}-${i}`} style={styles.boardRow}>
                  <Text style={[styles.rank, i === 0 && { color: ACCENT }]}>{i + 1}</Text>
                  <Text style={[styles.boardName, i === 0 && { color: ACCENT }]} numberOfLines={1}>{entry.name}</Text>
                  <Text style={[styles.boardScore, i === 0 && { color: ACCENT }]}>{entry.score}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.promo} numberOfLines={3}>{PROMO_LINE}</Text>
        </View>
      </View>

      <Modal visible={pending != null} transparent animationType="fade" onRequestClose={() => pending != null && commit(pending, name)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>MADE THE BOARD</Text>
            <Text style={styles.modalScore}>{pending}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="YOUR NAME"
              placeholderTextColor={Colours.faint}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={() => pending != null && commit(pending, name)}
              style={styles.modalInput}
            />
            <Pressable
              onPress={() => pending != null && commit(pending, name)}
              style={styles.modalSave}
              accessibilityRole="button"
              accessibilityLabel="Save score"
            >
              <Text style={styles.modalSaveText}>SAVE</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colours.bg, paddingHorizontal: 16 },
  // Title centred, not left: iPadOS windowed mode draws its window-control
  // dots over the top-left corner.
  headerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  title: { ...Fonts.mono(13, 'bold'), color: Colours.fg, letterSpacing: 1.5 },
  exitButton: { position: 'absolute', right: 0 },
  exit: { ...Fonts.mono(11, 'bold'), color: Colours.faint },
  body: { flex: 1 },
  bodyLandscape: { flexDirection: 'row', gap: 12 },
  main: { flex: 1 },
  sideLandscape: { width: 300, justifyContent: 'space-between' },
  connecting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  connectingText: { fontSize: 16, color: Colours.fg, textAlign: 'center' },
  connectingHint: { fontSize: 13, color: Colours.dim, textAlign: 'center', paddingHorizontal: 24 },
  board: { backgroundColor: Colours.s1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10, gap: 4 },
  boardTitle: { ...Fonts.mono(10, 'bold'), color: Colours.dim, letterSpacing: 1.2, marginBottom: 2 },
  boardEmpty: { fontSize: 13, color: Colours.dim },
  boardRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rank: { ...Fonts.mono(13, 'bold'), color: Colours.dim, width: 16 },
  boardName: { ...Fonts.mono(14, 'bold'), color: Colours.fg, flex: 1 },
  boardScore: { ...Fonts.timerDigits(20), color: Colours.fg },
  promo: { ...Fonts.mono(10, 'medium'), color: Colours.dim, textAlign: 'center', marginTop: 10 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: Colours.s1, borderRadius: 12, padding: 20, alignItems: 'center', gap: 12 },
  modalTitle: { ...Fonts.mono(12, 'bold'), color: Colours.dim, letterSpacing: 1.2 },
  modalScore: { ...Fonts.timerDigits(56), color: ACCENT },
  modalInput: { ...Fonts.mono(20, 'bold'), color: '#FFFFFF', backgroundColor: Colours.s2, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14, width: '100%', textAlign: 'center' },
  modalSave: { backgroundColor: ACCENT, borderRadius: 8, paddingVertical: 14, alignItems: 'center', width: '100%' },
  modalSaveText: { ...Fonts.mono(13, 'bold'), color: Colours.bg, letterSpacing: 1 },
});

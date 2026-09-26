// src/data/forceGauge/gymBoard.ts
/** The gym station's weekly top-5 (app/gym.tsx). Pure ranking rules plus
    a thin AsyncStorage wrapper; the board lives on the station's own
    device and never syncs to an account — it's a shared scoreboard for
    whoever walks up, not anyone's personal record.

    Only the current week (Monday 00:00 local onward) counts, so the board
    resets itself and last week's scores never block a newcomer. */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BoardEntry { name: string; score: number; at: number }

export const BOARD_SIZE = 5;
const KEY = 'gymBoard';

export function weekStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday).getTime();
}

/** This week's board: ONE entry per name (the best score under it wins, so
    someone's repeat tries never stack up), best first, earlier wins a tie,
    top five. Two people with the same first name tell themselves apart by
    typing a surname initial ("ISAAC P"). */
export function thisWeeksBoard(entries: BoardEntry[], nowMs: number): BoardEntry[] {
  const start = weekStartMs(nowMs);
  const best = new Map<string, BoardEntry>();
  for (const x of entries) {
    if (x.at < start) continue;
    const prev = best.get(x.name);
    if (!prev || x.score > prev.score || (x.score === prev.score && x.at < prev.at)) best.set(x.name, x);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, BOARD_SIZE);
}

export function qualifiesForBoard(entries: BoardEntry[], score: number, nowMs: number): boolean {
  if (score <= 0) return false;
  const board = thisWeeksBoard(entries, nowMs);
  return board.length < BOARD_SIZE || score > board[BOARD_SIZE - 1].score;
}

export function addToBoard(entries: BoardEntry[], entry: BoardEntry, nowMs: number): BoardEntry[] {
  return thisWeeksBoard([...entries, entry], nowMs);
}

export function cleanName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10) || 'ANON';
}

const isEntry = (x: any): x is BoardEntry =>
  x != null && typeof x.name === 'string' && Number.isFinite(x.score) && Number.isFinite(x.at);

/** Corrupt or foreign stored data reads as an empty board rather than
    breaking the station. */
export async function loadBoard(): Promise<BoardEntry[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export async function saveBoard(entries: BoardEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // best effort: a broken cache must never break the station
  }
}

/** Wipes the board (the gym station's hidden staff menu: for when the
    station has just been set up and its test scores shouldn't be on show). */
export async function clearBoard(): Promise<void> {
  await saveBoard([]);
}

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

/** This week's entries, best first (earlier wins a tie), top five. */
export function thisWeeksBoard(entries: BoardEntry[], nowMs: number): BoardEntry[] {
  const start = weekStartMs(nowMs);
  return entries
    .filter((x) => x.at >= start)
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
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 10) || 'ANON';
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

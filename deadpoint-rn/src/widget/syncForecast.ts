/** Writes engine.forecast()'s output into the App Group's shared storage
    the Swift widget reads — the JS half of the "app writes, widget reads"
    contract fixed by Task 2's SharedStore (targets/widget/Forecast.swift):
    App Group group.uk.co.sullivanltd.crimpblock, key "forecast.v1", a raw
    JSON string (Swift reads it via UserDefaults.string(forKey:), so this
    must call ExtensionStorage.set with a string, never the payload object
    directly — that would route through the native setObject call instead
    and Swift's .string(forKey:) would read nothing).

    buildForecastPayload is the pure half (colour-var → hex resolution +
    the Codable envelope) and is unit tested directly. syncForecast is the
    impure native-write wrapper; per this project's stance on hooks/impure
    glue (see useRestTimer.ts, useIntervalTimer.ts) it is not unit tested —
    verified live instead, see the task-3 report. */
import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import { resolveColour } from '../design/colours';

const APP_GROUP = 'group.uk.co.sullivanltd.crimpblock';
const STORAGE_KEY = 'forecast.v1';
// Matches the "kind" string CrimpBlockWidget.swift's StaticConfiguration
// registers itself under — reloadWidget needs it to target this widget.
const WIDGET_KIND = 'CrimpBlockWidget';
// Matches CrimpBlockWidget.swift's own 14-day TimelineProvider loop — the
// widget's timeline only ever looks as far ahead as this payload provides.
const FORECAST_DAYS = 14;

interface ForecastExercise {
  t: string;
  m: string;
}

/** Shape of one entry from engine.forecast(days) — `colour` here is a
    CSS-variable name like "--gorse", not yet resolved to hex (matches
    engine-core.js's own documented behaviour). */
interface ForecastDay {
  date: string;
  key: string;
  name: string;
  where: string;
  colour: string;
  logged: boolean;
  phase: string;
  cue: string;
  exercises: ForecastExercise[];
}

interface ForecastEngine {
  forecast(days: number): ForecastDay[];
}

export interface ForecastPayload {
  v: 1;
  generated: string;
  days: ForecastDay[];
}

/** Pure: resolves each day's colour var to hex and wraps the result in the
    envelope Forecast.swift's SharedStore.load() decodes. */
export function buildForecastPayload(
  engine: ForecastEngine,
  resolveColourFn: (varName: string) => string
): ForecastPayload {
  return {
    v: 1,
    generated: new Date().toISOString(),
    days: engine.forecast(FORECAST_DAYS).map((d) => ({ ...d, colour: resolveColourFn(d.colour) })),
  };
}

/** iOS-only; a no-op on Android — there is no widget target to write for. */
export async function syncForecast(engine: ForecastEngine): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const payload = buildForecastPayload(engine, resolveColour);
    new ExtensionStorage(APP_GROUP).set(STORAGE_KEY, JSON.stringify(payload));
    ExtensionStorage.reloadWidget(WIDGET_KIND);
  } catch (e) {
    console.error('syncForecast failed:', e);
  }
}

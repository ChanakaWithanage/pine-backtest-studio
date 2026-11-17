import type { Candle } from '../types';
import { inferIntervalMinutes } from './csv.ts';

const DAY_MS = 86_400_000;
export const MAX_TOTAL_CANDLES = 400_000;

export interface HistoryCoverage {
  first: string;
  last: string;
  count: number;
  sourceMinutes: number;
  spanDays: number;
  years: number;
  weekdayGaps: number;
}

/** Calendar UTC date of a candle's open, never browser-local time. */
export function utcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Combine yearly/monthly CSV files. Identical overlap is OK, but OHLCV
 * conflicts are rejected rather than silently choosing one price feed.
 */
export function mergeCandleBatches(batches: Candle[][]): Candle[] {
  if (!batches.length || batches.every(b => b.length === 0)) {
    throw new Error('No candles found in the selected files.');
  }
  const intervals = batches.filter(b => b.length > 1).map(inferIntervalMinutes);
  if (new Set(intervals).size > 1) {
    throw new Error('Imported files use different source timeframes. Select files with the same candle interval.');
  }
  const all = batches.flat();
  if (all.length > MAX_TOTAL_CANDLES + 100_000) {
    throw new Error('Too many candles selected. Import at most 400,000 candles across the files.');
  }
  all.sort((a, b) => a.time - b.time);
  const result: Candle[] = [];
  for (const candle of all) {
    const previous = result[result.length - 1];
    if (previous && previous.time === candle.time) {
      if (['open', 'high', 'low', 'close', 'volume'].some(key =>
        previous[key as keyof Candle] !== candle[key as keyof Candle])) {
        throw new Error(
          'Conflicting OHLCV candles for ' + new Date(candle.time).toISOString() +
          '. Do not merge different providers or bid/ask feeds.'
        );
      }
      continue; // Deduplicate identical overlap.
    }
    result.push(candle);
  }
  if (result.length > MAX_TOTAL_CANDLES) {
    throw new Error('This dataset exceeds the 400,000-candle browser limit. Import a shorter period.');
  }
  return result;
}

/** Weekday gap counter is a heuristic, not an authoritative market calendar. */
export function getHistoryCoverage(candles: Candle[]): HistoryCoverage | null {
  if (!candles.length) return null;
  const first = utcDay(candles[0].time);
  const last = utcDay(candles[candles.length - 1].time);
  const days = Math.floor((Date.parse(last) - Date.parse(first)) / DAY_MS) + 1;
  let weekdayGaps = 0;
  const minutes = inferIntervalMinutes(candles);
  if (minutes) {
    const intervalMs = minutes * 60_000;
    // Count omitted weekday intervals, excluding Saturdays and Sundays only.
    for (let i = 1; i < candles.length; i += 1) {
      const prior = candles[i - 1].time;
      const next = candles[i].time;
      if (next - prior <= intervalMs) continue;
      // This gap check is intentionally limited to manageable spans.
      const skipped = Math.min(Math.floor((next - prior) / intervalMs) - 1, 14 * 1440 / minutes);
      for (let j = 1; j <= skipped; j += 1) {
        const at = prior + intervalMs * j;
        const day = new Date(at).getUTCDay();
        if (day !== 0 && day !== 6) weekdayGaps++;
      }
    }
  }
  return {
    first, last, count: candles.length, sourceMinutes: minutes,
    spanDays: days, years: days / 365.2425, weekdayGaps
  };
}

/** Return a clear blocker instead of running only the intersection of requested dates and loaded data. */
export function checkRequestedCoverage(candles: Candle[], start: string, end: string): string | null {
  if (!candles.length) return 'No historical candles loaded. Import a CSV to backtest.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) {
    return 'Choose valid start and end dates.';
  }
  if (start > end) return 'Start date must be on or before end date.';
  const first = utcDay(candles[0].time);
  const last = utcDay(candles[candles.length - 1].time);
  if (start < first || end > last) {
    return 'Requested ' + start + ' to ' + end + ', but loaded data only covers ' +
      first + ' to ' + last + '. The date picker cannot fetch missing candles. Import older historical data before running this range.';
  }
  return null;
}

/** Calendar-year lookback anchored on the latest candle, not an artificial future date. */
export function pastYearsFromLastCandle(candles: Candle[], years: number): { start: string; end: string } {
  if (!candles.length) throw new Error('No candles loaded.');
  const latest = new Date(candles[candles.length - 1].time);
  const earliest = new Date(latest);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - years);
  return { start: utcDay(earliest.getTime()), end: utcDay(latest.getTime()) };
}

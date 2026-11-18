/**
 * Parse user-selected archives entirely in the browser.
 * No remote downloads, subscriptions, or redistribution of price data.
 * Supports regular CSVs and vendor .json/.json.gz or .zip archives.
 */
import { decompressSync, strFromU8, unzipSync } from 'fflate';
import type { Candle } from '../types';
import { parseCsv, parseTimestamp } from './csv.ts';
import { MAX_TOTAL_CANDLES, mergeCandleBatches } from './history.ts';

const MAX_SINGLE_BYTES = 90 * 1024 * 1024;
const MAX_UNCOMPRESSED = 120 * 1024 * 1024;
const MAX_ARCHIVE_PARTS = 25;

function validateCandles(candles: Candle[], name: string): Candle[] {
  if (candles.length < 2) throw new Error(name + ': at least two candles are required.');
  if (candles.length > MAX_TOTAL_CANDLES) throw new Error(name + ': exceeds the 400,000-bar limit.');
  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    if (!Number.isFinite(bar.time) || bar.time <= 0 ||
        ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
        bar.low <= 0 || bar.high < Math.max(bar.low, bar.open, bar.close) ||
        bar.low > Math.min(bar.open, bar.close) || bar.volume < 0) {
      throw new Error(name + ': invalid OHLCV at candle ' + (i + 1) + '.');
    }
    if (i > 0 && bar.time === candles[i - 1].time) {
      throw new Error(name + ': duplicate timestamp at ' + new Date(bar.time).toISOString());
    }
  }
  return candles;
}

function parseObjectCandles(text: string, name: string): Candle[] {
  let root: unknown;
  try { root = JSON.parse(text); }
  catch { throw new Error(name + ': invalid JSON data.'); }
  const arr = Array.isArray(root) ? root :
    root && typeof root === 'object' && Array.isArray((root as { data?: unknown }).data)
      ? (root as { data: unknown[] }).data : null;
  if (!arr) throw new Error(name + ': JSON must be a candle array or contain a data array.');
  if (arr.length > MAX_TOTAL_CANDLES) throw new Error(name + ': too many candles.');
  const bars = arr.map((item, i): Candle => {
    if (!item || typeof item !== 'object') throw new Error(name + ': invalid candle at row ' + (i + 1));
    const r = item as Record<string, unknown>;
    const timestamp = r.ts ?? r.timestamp ?? r.time ?? r.datetime ?? r.date;
    const time = typeof timestamp === 'number'
      ? (timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp)
      : parseTimestamp(String(timestamp ?? ''));
    return {
      time,
      open: Number(r.o ?? r.open),
      high: Number(r.h ?? r.high),
      low: Number(r.l ?? r.low),
      close: Number(r.c ?? r.close),
      volume: Number(r.v ?? r.volume ?? 0)
    };
  });
  bars.sort((a, b) => a.time - b.time);
  return validateCandles(bars, name);
}

function readHistoryBytes(bytes: Uint8Array, name: string): Candle[] {
  if (bytes.byteLength > MAX_UNCOMPRESSED) throw new Error(name + ': exceeds the 120 MB decompression limit.');
  const lower = name.toLowerCase();
  if (lower.endsWith('.gz')) {
    const unpacked = decompressSync(bytes);
    if (unpacked.byteLength > MAX_UNCOMPRESSED) throw new Error(name + ': decompressed data exceeds 120 MB.');
    return readHistoryBytes(unpacked, name.slice(0, -3));
  }
  const text = strFromU8(bytes);
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCsv(text);
  if (lower.endsWith('.json')) return parseObjectCandles(text, name);
  throw new Error(name + ': only CSV, JSON, GZ or ZIP historical data files are supported.');
}

/** Decode all supported parts in a user-provided archive. Never construct fake missing candles. */
export function parseHistoryArchive(bytes: Uint8Array, name: string): Candle[][] {
  if (bytes.byteLength > MAX_SINGLE_BYTES) throw new Error(name + ': file exceeds 90 MB.');
  if (!name.toLowerCase().endsWith('.zip')) return [readHistoryBytes(bytes, name)];
  const archive = unzipSync(bytes, {
    filter: entry => {
      if (entry.originalSize > MAX_UNCOMPRESSED) throw new Error(entry.name + ': too large.');
      return /\.(csv|txt|json|json\.gz)$/i.test(entry.name) && !entry.name.startsWith('__MACOSX/');
    }
  });
  const parts = Object.entries(archive).filter(([path]) => /\.(csv|txt|json|json\.gz)$/i.test(path));
  if (!parts.length) throw new Error(name + ': no supported CSV/JSON files in ZIP.');
  if (parts.length > MAX_ARCHIVE_PARTS) throw new Error('ZIP includes more than 25 historical files.');
  const totalBytes = parts.reduce((total, [, body]) => total + body.byteLength, 0);
  if (totalBytes > MAX_UNCOMPRESSED) throw new Error('ZIP expands beyond the 120 MB limit.');
  return parts.map(([path, body]) => readHistoryBytes(body, path));
}

export async function importHistoryFiles(files: File[], onFile?: (index: number, count: number) => void): Promise<Candle[]> {
  if (!files.length || files.length > 25) throw new Error('Select between 1 and 25 history files.');
  let count = 0;
  const groups: Candle[][] = [];
  for (const file of files) {
    if (file.size > MAX_SINGLE_BYTES) throw new Error(file.name + ': file exceeds 90 MB.');
    onFile?.(++count, files.length);
    groups.push(...parseHistoryArchive(new Uint8Array(await file.arrayBuffer()), file.name));
  }
  if (groups.length > MAX_ARCHIVE_PARTS) throw new Error('Selected archives include more than 25 total historical files.');
  return mergeCandleBatches(groups);
}

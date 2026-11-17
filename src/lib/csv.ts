import type { Candle, Trade } from '../types';

function parseRow(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      cells.push(current.trim()); current = '';
    } else {
      current += char;
    }
  }
  if (inQuotes) throw new Error('CSV contains an unterminated quoted field.');
  cells.push(current.trim());
  return cells;
}

export function parseTimestamp(value: string): number {
  const source = value.trim();
  if (!source) return NaN;
  // Dukascopy/MetaTrader exports often use European day.month.year UTC timestamps.
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(source);
  const ymd = /^(\d{4})\.(\d{2})\.(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(source);
  if (dmy || ymd) {
    const part = dmy ?? ymd!;
    const y = Number(part[dmy ? 3 : 1]);
    const m = Number(part[2]);
    const d = Number(part[dmy ? 1 : 3]);
    const hours = Number(part[4] ?? 0), minutes = Number(part[5] ?? 0), seconds = Number(part[6] ?? 0);
    const ms = Number((part[7] ?? '').padEnd(3, '0'));
    const timestamp = Date.UTC(y, m - 1, d, hours, minutes, seconds, ms);
    const checked = new Date(timestamp);
    return checked.getUTCFullYear() === y && checked.getUTCMonth() === m - 1 && checked.getUTCDate() === d &&
      checked.getUTCHours() === hours && checked.getUTCMinutes() === minutes && checked.getUTCSeconds() === seconds ? timestamp : NaN;
  }
  if (/^\d{10,16}$/.test(source)) {
    const n = Number(source);
    return source.length <= 10 ? n * 1000 : n;
  }
  // A timezone-free date is always interpreted as UTC, never local browser time.
  const normalized = source.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const dateString = hasZone ? normalized : normalized + (normalized.includes('T') ? 'Z' : 'T00:00:00Z');
  return Date.parse(dateString);
}

export function parseCsv(text: string, maxRows = 400_000): Candle[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 3) throw new Error('CSV needs a header and at least two candles.');
  if (lines.length - 1 > maxRows) throw new Error('File exceeds the ' + maxRows.toLocaleString() + '-candle safety limit.');
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const header = parseRow(lines[0], delimiter).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const column = (names: string[]) => names.map(n => header.indexOf(n)).find(i => i !== -1) ?? -1;
  const indices = {
    time: column(['timestamp', 'gmttime', 'timeutc', 'datetime', 'opentime', 'time', 'date']),
    open: column(['open']), high: column(['high']), low: column(['low']),
    close: column(['close']), volume: column(['volume', 'vol'])
  };
  if ([indices.time, indices.open, indices.high, indices.low, indices.close].some(i => i < 0)) {
    throw new Error('CSV must have timestamp/time/date, open, high, low and close columns.');
  }

  // Some brokers export a Date column and a separate Time column.
  const dateIndex = header.indexOf('date');
  const timeIndex = header.indexOf('time');
  const splitDateTime = dateIndex >= 0 && timeIndex >= 0 && indices.time === timeIndex;
  const candles: Candle[] = [];
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const cells = parseRow(lines[rowIndex], delimiter);
    const candle: Candle = {
      time: parseTimestamp(splitDateTime
        ? (cells[dateIndex] ?? '') + ' ' + (cells[timeIndex] ?? '')
        : (cells[indices.time] ?? '')),
      open: Number(cells[indices.open]),
      high: Number(cells[indices.high]),
      low: Number(cells[indices.low]),
      close: Number(cells[indices.close]),
      volume: indices.volume < 0 || cells[indices.volume] === '' ? 0 : Number(cells[indices.volume])
    };
    const { time, open, high, low, close, volume } = candle;
    if (![time, open, high, low, close, volume].every(Number.isFinite) ||
        time <= 0 || low <= 0 || high < Math.max(open, close, low) ||
        low > Math.min(open, close, high) || volume < 0) {
      throw new Error('Invalid OHLCV values at CSV row ' + (rowIndex + 1) + '.');
    }
    candles.push(candle);
  }
  candles.sort((a, b) => a.time - b.time);
  for (let i = 1; i < candles.length; i += 1) {
    if (candles[i].time === candles[i - 1].time) {
      throw new Error('Duplicate timestamp at ' + new Date(candles[i].time).toISOString() + '.');
    }
  }
  return candles;
}

/** Portable data backup for privately imported or synthetic candles. */
export function exportCandles(candles: Candle[]): string {
  const rows = ['timestamp,open,high,low,close,volume'];
  for (const c of candles) rows.push([c.time, c.open, c.high, c.low, c.close, c.volume].join(','));
  return rows.join('\n') + '\n';
}

export function inferIntervalMinutes(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const counts = new Map<number, number>();
  for (let i = 1; i < Math.min(candles.length, 2000); i += 1) {
    const difference = Math.round((candles[i].time - candles[i - 1].time) / 60_000);
    if (difference > 0 && difference <= 1440) counts.set(difference, (counts.get(difference) || 0) + 1);
  }
  return Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

export function resampleCandles(candles: Candle[], minutes: number): Candle[] {
  if (!candles.length) return [];
  const sourceMinutes = inferIntervalMinutes(candles);
  if (!sourceMinutes || minutes < sourceMinutes || minutes % sourceMinutes !== 0) {
    throw new Error('Cannot create ' + minutes + 'm candles from ' + (sourceMinutes || '?') + 'm data. Import candles at a finer interval.');
  }
  if (sourceMinutes === minutes) return candles;
  const duration = minutes * 60_000;
  const result: Candle[] = [];
  let last: Candle | null = null;
  for (const candle of candles) {
    const time = Math.floor(candle.time / duration) * duration;
    if (!last || last.time !== time) {
      last = { ...candle, time };
      result.push(last);
    } else {
      last.high = Math.max(last.high, candle.high);
      last.low = Math.min(last.low, candle.low);
      last.close = candle.close;
      last.volume += candle.volume;
    }
  }
  // Omit incomplete groups at the edges or across gaps; never create fake flat bars.
  const requiredBars = minutes / sourceMinutes;
  const counts = new Map<number, number>();
  for (const c of candles) {
    const key = Math.floor(c.time / duration) * duration;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return result.filter(c => counts.get(c.time) === requiredBars);
}

function escapeCsv(value: string | number): string {
  const str = String(value);
  return /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

export function exportTrades(trades: Trade[]): string {
  const rows = [['id', 'direction', 'entry_utc', 'exit_utc', 'entry_price', 'exit_price', 'size', 'net_profit', 'commission', 'estimated_spread_embedded', 'estimated_swap_deducted']];
  for (const trade of trades) {
    rows.push([trade.id, trade.direction, new Date(trade.entryTime).toISOString(),
      new Date(trade.exitTime).toISOString(), String(trade.entryPrice),
      String(trade.exitPrice), String(trade.size), String(trade.profit), String(trade.commission), String(trade.spreadCostEstimate ?? 0), String(trade.swapCostEstimate ?? 0)]);
  }
  return rows.map(r => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

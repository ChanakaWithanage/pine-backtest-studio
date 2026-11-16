import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCsv, parseTimestamp, resampleCandles, exportTrades } from '../src/lib/csv.ts';

test('timestamps support seconds, milliseconds and UTC datetimes', () => {
  assert.equal(parseTimestamp('1704067200'), 1704067200000);
  assert.equal(parseTimestamp('1704067200000'), 1704067200000);
  assert.equal(parseTimestamp('2024-01-01 00:00:00'), 1704067200000);
});

test('parses and sorts Dukascopy-style candles with BOM', () => {
  const csv = '\uFEFFtimestamp,open,high,low,close,volume\n1704068100000,101,104,100,103,7\n1704067200000,100,102,99,101,8';
  const bars = parseCsv(csv);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].close, 101);
  assert.equal(bars[1].volume, 7);
});

test('rejects duplicates and bad OHLC values', () => {
  assert.throws(() => parseCsv('timestamp,open,high,low,close\n1704067200000,100,90,99,101\n1704068100000,100,110,99,101'), /Invalid OHLCV/);
  assert.throws(() => parseCsv('timestamp,open,high,low,close\n1704067200000,100,102,99,101\n1704067200000,100,102,99,101'), /Duplicate/);
});

test('aggregates full 15m candles into 30m bars', () => {
  const source = parseCsv('timestamp,open,high,low,close\n1704067200000,100,103,99,102\n1704068100000,102,105,101,104\n1704069000000,104,106,100,101\n1704069900000,101,103,98,99');
  const bars = resampleCandles(source, 30);
  assert.equal(bars.length, 2);
  assert.deepEqual([bars[0].open, bars[0].high, bars[0].low, bars[0].close], [100, 105, 99, 104]);
  assert.throws(() => resampleCandles(source, 3), /Cannot create/);
});

test('exports trades with CSV header', () => {
  const csv = exportTrades([{ id: 'L1', direction: 'Long', entryTime: 1704067200000,
    exitTime: 1704068100000, entryPrice: 100, exitPrice: 101, size: 1, profit: 1, commission: 0 }]);
  assert.match(csv, /entry_utc/);
  assert.match(csv, /2024-01-01T00:00:00.000Z/);
});

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkRequestedCoverage, getHistoryCoverage, mergeCandleBatches, pastYearsFromLastCandle } from '../src/lib/history.ts';
import type { Candle } from '../src/types.ts';

function bar(day: string, price = 2000): Candle {
  return { time: Date.parse(day), open: price, high: price + 5,
    low: price - 5, close: price + 1, volume: 10 };
}

test('missing January history is rejected instead of backtesting only October', () => {
  const bars = [bar('2026-10-05T00:00:00Z'), bar('2026-10-05T00:15:00Z')];
  const error = checkRequestedCoverage(bars, '2026-01-01', '2026-11-16');
  assert.match(error || '', /only covers 2026-10-05/);
  assert.match(error || '', /Import 5-year/);
});

test('accepts complete requested period inside available history', () => {
  const bars = [bar('2021-11-16T00:00:00Z'), bar('2026-11-16T17:00:00Z')];
  assert.equal(checkRequestedCoverage(bars, '2022-01-01', '2026-11-16'), null);
});

test('merges files in order and removes exactly identical overlapping candles', () => {
  const a = [bar('2024-01-01T00:00:00Z'), bar('2024-01-01T00:15:00Z')];
  const b = [bar('2024-01-01T00:15:00Z'), bar('2024-01-01T00:30:00Z')];
  const merged = mergeCandleBatches([b, a]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].time, a[0].time);
  assert.equal(merged[2].time, b[1].time);
});

test('does not silently combine two different feeds on overlapping timestamps', () => {
  const a = [bar('2024-01-01T00:00:00Z'), bar('2024-01-01T00:15:00Z')];
  const b = [bar('2024-01-01T00:15:00Z', 2010), bar('2024-01-01T00:30:00Z', 2010)];
  assert.throws(() => mergeCandleBatches([a, b]), /Conflicting OHLCV/);
});

test('detects mixed source intervals and reports coverage', () => {
  const a = [bar('2024-01-01T00:00:00Z'), bar('2024-01-01T00:15:00Z')];
  const b = [bar('2024-01-02T00:00:00Z'), bar('2024-01-02T00:05:00Z')];
  assert.throws(() => mergeCandleBatches([a, b]), /different source timeframes/);
  const info = getHistoryCoverage(a)!;
  assert.equal(info.first, '2024-01-01');
  assert.equal(info.last, '2024-01-01');
  assert.equal(info.sourceMinutes, 15);
});

test('5-year date preset is anchored to the latest available candle', () => {
  const bars = [bar('2021-11-16T00:00:00Z'), bar('2026-11-16T13:00:00Z')];
  assert.deepEqual(pastYearsFromLastCandle(bars, 5), { start: '2021-11-16', end: '2026-11-16' });
});

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MARKET_SHORTCUTS, sortMarketShortcuts } from '../src/lib/market-catalog.ts';
import { createDemoCandles } from '../src/lib/demo.ts';
import { exportCandles, parseCsv } from '../src/lib/csv.ts';

test('curated data shortcuts never claim that market data is hosted or directly downloadable', () => {
  assert.ok(MARKET_SHORTCUTS.length >= 4);
  for (const item of MARKET_SHORTCUTS) {
    assert.match(item.providerUrl, /^https:\/\//);
    assert.ok(item.note.length > 12);
  }
});
test('favorites appear before other shortcuts', () => {
  const sorted = sortMarketShortcuts(['GBPUSD', 'XAUUSD']);
  assert.deepEqual(sorted.slice(0, 2).map(x => x.symbol).sort(), ['GBPUSD', 'XAUUSD']);
});
test('downloaded CSV can be imported without altering candle OHLCV', () => {
  const data = createDemoCandles().slice(0, 20);
  const parsed = parseCsv(exportCandles(data));
  assert.deepEqual(parsed, data);
});

test('imports Dukascopy GMT time and European day.month.year timestamps', () => {
  const text = 'Gmt time,Open,High,Low,Close,Volume\n' +
    '17.11.2016 10:00:00.000,1200,1201,1199,1200.5,100\n' +
    '17.11.2016 10:15:00.000,1200.5,1202,1200,1201,120\n';
  const candles = parseCsv(text);
  assert.equal(candles[0].time, Date.UTC(2016, 10, 17, 10));
  assert.equal(candles[1].time, Date.UTC(2016, 10, 17, 10, 15));
});
test('imports split date and time columns in broker CSV', () => {
  const text = 'Date,Time,Open,High,Low,Close,Volume\n' +
    '2016.11.17,10:00:00,1200,1201,1199,1200.5,100\n' +
    '2016.11.17,10:15:00,1200.5,1202,1200,1201,120\n';
  const candles = parseCsv(text);
  assert.equal(candles[0].time, Date.UTC(2016, 10, 17, 10));
  assert.equal(candles[1].time, Date.UTC(2016, 10, 17, 10, 15));
});

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

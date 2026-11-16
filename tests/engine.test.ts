import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runBacktest } from '../src/lib/backtest.ts';
import { createDemoCandles, EXAMPLE_SCRIPT } from '../src/lib/demo.ts';

test('PineTS executes a native v6 strategy against custom OHLCV candles', { timeout: 60_000 }, async () => {
  const candles = createDemoCandles().slice(0, 500);
  const results = await runBacktest(EXAMPLE_SCRIPT, candles);
  assert.ok(Number.isFinite(results.netProfit));
  assert.ok(Number.isFinite(results.initialCapital));
  assert.ok(Array.isArray(results.trades));
  assert.ok(results.equity.length >= 1);
  assert.ok(results.winRate >= 0 && results.winRate <= 100);
  for (const trade of results.trades) {
    assert.ok(Number.isFinite(trade.entryTime));
    assert.ok(Number.isFinite(trade.entryPrice));
    assert.ok(Number.isFinite(trade.profit));
  }
});

test('rejects indicator scripts that contain no strategy declaration', async () => {
  await assert.rejects(() => runBacktest('//@version=6\nindicator("No trades")', createDemoCandles()), /strategy/);
});

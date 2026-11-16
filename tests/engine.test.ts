import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PineTS } from 'pinets';
import { runBacktest } from '../src/lib/backtest.ts';
import { buildCsvPineProvider } from '../src/lib/csv-provider.ts';
import { createDemoCandles, EMA_TEST_SCRIPT } from '../src/lib/demo.ts';

test('PineTS executes native Pine v6 EMA strategy and generates trades', { timeout: 60_000 }, async () => {
  const r = await runBacktest(EMA_TEST_SCRIPT, createDemoCandles().slice(0, 500));
  assert.ok(Number.isFinite(r.netProfit));
  assert.ok(r.trades.length > 0, 'EMA sample must generate closed trades');
  assert.ok(r.winRate >= 0 && r.winRate <= 100);
});

test('custom gold provider passes correct 15-minute close and contract metadata', { timeout: 60_000 }, async () => {
  const candles = createDemoCandles().slice(0, 250);
  const feed = buildCsvPineProvider(candles, { pointvalue: 1, mincontract: 0.01, mintick: 0.01 });
  assert.equal(feed.marketData[0].closeTime - feed.marketData[0].openTime, 900000);
  const ctx = await new PineTS(feed.provider, feed.tickerId, feed.timeframe).run(String.raw`//@version=6
indicator("Metadata")
plot(syminfo.pointvalue, "point")
plot(syminfo.mincontract, "step")
plot(time_close - time, "duration")
plot(math.floor(200 / (close * 0.01 * syminfo.pointvalue) / syminfo.mincontract) * syminfo.mincontract, "qty")
`);
  assert.equal(ctx.plots['point'].data[0].value, 1);
  assert.equal(ctx.plots['step'].data[0].value, 0.01);
  assert.equal(ctx.plots['duration'].data[0].value, 900000);
  assert.ok(ctx.plots['qty'].data[0].value > 0);
});

test('Pine strategy can open and close an order using symbol minimum contract', { timeout: 60_000 }, async () => {
  const script = String.raw`//@version=6
strategy("Symbol quantity")
if bar_index == 1
    strategy.entry("Meta", strategy.long, qty=syminfo.mincontract)
if bar_index == 4
    strategy.close("Meta")
`;
  const r = await runBacktest(script, createDemoCandles().slice(0, 250));
  assert.equal(r.trades.length, 1);
  assert.ok(r.trades[0].size > 0);
  assert.equal(r.pendingOrders, 0);
});

test('rejects indicator-only scripts', async () => {
  await assert.rejects(() => runBacktest('//@version=6\nindicator("No trades")', createDemoCandles()), /strategy/);
});

test('rejects invalid gold contract metadata', async () => {
  await assert.rejects(() => runBacktest(EMA_TEST_SCRIPT, createDemoCandles().slice(0, 50), {
    pointvalue: 0, mincontract: 1, mintick: 0.01
  }), /pointvalue/);
});

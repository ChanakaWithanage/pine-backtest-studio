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
  console.log('EMA_SMOKE', JSON.stringify({ trades: results.trades.length, pending: results.pendingOrders, open: results.openTrades, net: results.netProfit }));
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

test('gold-style session and risk sizing receive valid timestamp and symbol metadata', { timeout: 60_000 }, async () => {
  const candles = createDemoCandles().slice(0, 250);
  const script = `//@version=6
strategy("Metadata Smoke Test", initial_capital=10000)
var float observedClose = na
if bar_index == 1
    observedClose := time_close - time
    strategy.entry("Meta", strategy.long, qty = math.floor(200 / (close * 0.01 * syminfo.pointvalue) / syminfo.mincontract) * syminfo.mincontract)
if bar_index == 4
    strategy.close("Meta")
plot(observedClose, "bar_duration")
`;
  const basic = `//@version=6
strategy("Basic")
if bar_index == 1
    strategy.entry("L", strategy.long, qty=1)
if bar_index == 4
    strategy.close("L")
`;
  const basicResult = await runBacktest(basic, candles);
  console.log('BASIC_SMOKE', JSON.stringify({ trades: basicResult.trades.length, pending: basicResult.pendingOrders, open: basicResult.openTrades }));
  const { PineTS } = await import('pinets');
  const { buildCsvPineProvider } = await import('../src/lib/csv-provider.ts');
  const feed = buildCsvPineProvider(candles, { pointvalue: 1, mincontract: 0.01, mintick: 0.01 });
  const ctx = await new PineTS(feed.provider, feed.tickerId, feed.timeframe).run(`//@version=6
indicator("metadata")
plot(syminfo.pointvalue, "point")
plot(syminfo.mincontract, "step")
plot(time_close - time, "duration")
`);
  console.log('SYMBOL_META', JSON.stringify({ info: feed.symbolInfo, point: ctx.plots['point']?.data.slice(-2), step: ctx.plots['step']?.data.slice(-2), duration: ctx.plots['duration']?.data.slice(-2) }));
  const r = await runBacktest(script, candles, { pointvalue: 1, mincontract: 0.01, mintick: 0.01 });
  console.log('GOLD_SMOKE', JSON.stringify({ trades: r.trades.length, pending: r.pendingOrders, open: r.openTrades, net: r.netProfit, warnings: r.warnings }));
  assert.equal(r.trades.length, 1, 'known strategy must close a risk-sized order');
  assert.ok(r.trades[0].size > 0);
});

test('rejects invalid gold contract metadata', async () => {
  const candles = createDemoCandles().slice(0, 50);
  await assert.rejects(
    () => runBacktest(EXAMPLE_SCRIPT, candles, { pointvalue: 0, mincontract: 1, mintick: 0.01 }),
    /pointvalue/
  );
});

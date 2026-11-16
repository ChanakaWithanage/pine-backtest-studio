import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { DEFAULT_FEES, planCommissions } from '../src/lib/commissions.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { createDemoCandles } from '../src/lib/demo.ts';

const defaultGold = readFileSync(new URL('../samples/gold-breakout-15m.pine', import.meta.url), 'utf8');

test('Gold Breakout 15M explicitly charges $0.40 cash_per_order; default auto does not double-charge', () => {
  const outcome = planCommissions(defaultGold, DEFAULT_FEES);
  assert.equal(outcome.source, 'pine');
  assert.equal(outcome.ratePercent, null);
  assert.equal(outcome.overridden, false);
  assert.equal(outcome.script, defaultGold);
  assert.match(outcome.declaration, /cash_per_order/);
  assert.match(outcome.declaration, /0\.4/);
});

test('explicit override replaces both existing Pine fees with 0.05% per fill', () => {
  const outcome = planCommissions(defaultGold, { percent: 0.05, overridePine: true });
  assert.equal(outcome.source, 'app');
  assert.equal(outcome.overridden, true);
  assert.match(outcome.script, /commission_type\s*=\s*strategy\.commission\.percent/);
  assert.match(outcome.script, /commission_value\s*=\s*0\.05/);
  assert.doesNotMatch(outcome.script, /commission_type\s*=\s*strategy\.commission\.cash_per_order/);
  assert.equal((outcome.script.match(/commission_value\s*=/g) || []).length, 1);
  assert.ok(outcome.script.includes('Gold Breakout 15M Strategy'));
  // Source editor is not altered by the runtime rewrite.
  assert.match(defaultGold, /commission_type\s*=\s*strategy\.commission\.cash_per_order/);
});

test('script with no declared commission gets Binance-style default exactly once', () => {
  const code = '//@version=6\nstrategy("none", overlay=true)\nif bar_index == 1\n    strategy.entry("L", strategy.long)';
  const run = planCommissions(code);
  assert.equal(run.source, 'app');
  assert.equal(run.overridden, false);
  assert.match(run.script, /commission_value\s*=\s*0\.05/);
  assert.equal((run.script.match(/commission_type\s*=/g) || []).length, 1);
});

test('explicit zero commission is respected in auto mode instead of being replaced', () => {
  const code = '//@version=6\nstrategy("Zero", commission_value=0)';
  assert.equal(planCommissions(code).source, 'pine');
  assert.equal(planCommissions(code).script, code);
});

test('parser ignores fake fees in comments, quoted titles and nested calls', () => {
  const code = [
    '//@version=6',
    '// strategy("fake", commission_value=20)',
    'strategy(title="Fake commission_value=300 and strategy(", ',
    '  shorttitle = "X", overlay = true, default_qty_value = math.max(1, 2))',
    'if bar_index == 1',
    '    strategy.entry("L", strategy.long)'
  ].join('\n');
  const r = planCommissions(code);
  assert.equal(r.source, 'app');
  assert.match(r.script, /default_qty_value\s*=\s*math\.max\(1,\s*2\)/);
  assert.equal((r.script.match(/commission_value\s*=\s*0\.05/g) || []).length, 1);
});

test('fee guard rejects invalid negative, NaN and unrealistic percentages', () => {
  for (const percent of [-1, NaN, Infinity, 10]) {
    assert.throws(() => planCommissions(defaultGold, { percent, overridePine: true }), /Fee rate/);
  }
});

test('PineTS charges entry and exit cash fees once, not 0.05% again', { timeout: 60_000 }, async () => {
  const strategy = String.raw`//@version=6
strategy("Cash Fee", initial_capital=10000,
         commission_type=strategy.commission.cash_per_order, commission_value=0.4)
if bar_index == 2
    strategy.entry("L", strategy.long, qty=2)
if bar_index == 7
    strategy.close("L")`;
  const bars = createDemoCandles().slice(0, 70);
  const actual = await runBacktest(strategy, bars);
  assert.equal(actual.fees.source, 'pine');
  assert.equal(actual.fees.actualType, 'cash_per_order');
  assert.equal(actual.fees.actualValue, 0.4);
  assert.equal(actual.trades.length, 1);
  assert.ok(Math.abs(actual.trades[0].commission - 0.8) < 1e-8);
  assert.equal(actual.fees.closedTradeCommissions, actual.trades[0].commission);
  assert.ok(Math.abs(actual.netProfit - actual.trades[0].profit) < 1e-6);
});

test('PineTS percent fee is charged on both notional legs when explicitly overriding Pine', { timeout: 60_000 }, async () => {
  const strategy = String.raw`//@version=6
strategy("Percent Fee", initial_capital=10000,
         commission_type=strategy.commission.cash_per_order, commission_value=0.4)
if bar_index == 2
    strategy.entry("L", strategy.long, qty=2)
if bar_index == 7
    strategy.close("L")`;
  const bars = createDemoCandles().slice(0, 70);
  const actual = await runBacktest(strategy, bars, undefined, { percent: 0.05, overridePine: true });
  assert.equal(actual.fees.source, 'app');
  assert.equal(actual.fees.overridden, true);
  assert.equal(actual.fees.actualType, 'percent');
  assert.equal(actual.fees.actualValue, 0.05);
  assert.equal(actual.trades.length, 1);
  const t = actual.trades[0];
  const expected = t.size * (t.entryPrice + t.exitPrice) * 0.0005;
  assert.ok(Math.abs(t.commission - expected) < 1e-6,
    'entry + exit commission must equal 0.05% of each fill notional');
  assert.ok(Math.abs(actual.netProfit - t.profit) < 1e-6);
});

test('missing Pine fee defaults to 0.05% and setting 0% disables fees', { timeout: 60_000 }, async () => {
  const script = String.raw`//@version=6
strategy("No fees")
if bar_index == 2
    strategy.entry("L", strategy.long, qty=1)
if bar_index == 7
    strategy.close("L")`;
  const bars = createDemoCandles().slice(0, 70);
  const auto = await runBacktest(script, bars);
  const none = await runBacktest(script, bars, undefined, { percent: 0, overridePine: false });
  assert.equal(auto.fees.source, 'app');
  assert.equal(auto.fees.actualValue, 0.05);
  assert.ok(auto.trades[0].commission > 0);
  assert.equal(none.trades[0].commission, 0);
  assert.ok(none.netProfit > auto.netProfit);
});

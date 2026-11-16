import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { DEFAULT_BYBIT, DEFAULT_FEES, estimatedUtcRollovers, planExecutionCosts } from '../src/lib/commissions.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { createDemoCandles } from '../src/lib/demo.ts';

const gold = readFileSync(new URL('../samples/gold-breakout-15m.pine', import.meta.url), 'utf8');
const zero = { ...DEFAULT_BYBIT, enabled: true, mode: 'zero-fee' as const, spreadUsd: 0.5 };
const tight = { ...DEFAULT_BYBIT, enabled: true, mode: 'tight-spread' as const, spreadUsd: 0.2 };

const script = `//@version=6
strategy("Bybit test", initial_capital=10000, commission_type=strategy.commission.cash_per_order,
 commission_value=0.4, slippage=1)
if bar_index == 2
    strategy.entry("L", strategy.long, qty=2)
if bar_index == 7
    strategy.close("L")`;

test('Bybit Zero-Fee overwrites existing Pine fee and slippage rather than stacking', () => {
  const r = planExecutionCosts(gold, { ...DEFAULT_FEES, bybit: zero }, 1, 0.01);
  assert.equal(r.source, 'bybit');
  assert.equal(r.bybit?.mode, 'zero-fee');
  assert.equal(r.bybit?.ticksPerFill, 25);
  assert.equal(r.bybit?.appliedSpreadUsd, 0.5);
  assert.match(r.script, /commission_type\s*=\s*strategy\.commission\.cash_per_contract/);
  assert.match(r.script, /commission_value\s*=\s*0(?:,|\s)/);
  assert.match(r.script, /slippage\s*=\s*25/);
  assert.equal((r.script.match(/commission_value\s*=/g) ?? []).length, 1);
  assert.equal((r.script.match(/slippage\s*=/g) ?? []).length, 1);
  assert.match(gold, /commission_value\s*=\s*0\.4/);
  assert.match(gold, /slippage\s*=\s*0/);
});

test('Bybit Tight-Spread $6/lot means $3/lot on each fill, not $12 total', () => {
  const r = planExecutionCosts(gold, { ...DEFAULT_FEES, bybit: tight }, 1, 0.01);
  assert.equal(r.bybit?.ticksPerFill, 10);
  assert.equal(r.bybit?.appliedSpreadUsd, 0.2);
  assert.match(r.script, /commission_value\s*=\s*0\.03/);
  assert.equal((r.script.match(/commission_value\s*=/g) ?? []).length, 1);
  const twoHundredOunces = planExecutionCosts(gold, { ...DEFAULT_FEES, bybit: tight }, 100, 0.01);
  assert.match(twoHundredOunces.script, /commission_value\s*=\s*3(?:,|\s)/);
});

test('Spread is conservatively rounded UP to whole adverse price ticks', () => {
  const r = planExecutionCosts(gold, { ...DEFAULT_FEES, bybit: { ...zero, spreadUsd: 0.25 } }, 1, 0.01);
  assert.equal(r.bybit?.ticksPerFill, 13);
  assert.equal(r.bybit?.appliedSpreadUsd, 0.26);
});

test('Bybit mode disabled retains Pine settings unchanged', () => {
  const r = planExecutionCosts(gold, { ...DEFAULT_FEES, bybit: { ...zero, enabled: false } }, 1, 0.01);
  assert.equal(r.source, 'pine');
  assert.equal(r.script, gold);
});

test('Invalid Bybit assumptions cannot silently enter a simulation', () => {
  for (const patch of [{ spreadUsd: -0.1 }, { ouncesPerLot: 0 }, { commissionPerLotUsd: 1001 }, { overnightUsdPerLot: NaN }]) {
    assert.throws(() => planExecutionCosts(gold, {
      ...DEFAULT_FEES, bybit: { ...tight, ...patch }
    }, 1, 0.01), /must be between/);
  }
});

test('Zero-Fee mode embeds spread in PineTS fills but has no extra commission', { timeout: 60_000 }, async () => {
  const candles = createDemoCandles().slice(0, 90);
  const control = await runBacktest(script, candles, undefined, { percent: 0, overridePine: true });
  const out = await runBacktest(script, candles, undefined, { ...DEFAULT_FEES, bybit: zero });
  assert.equal(out.fees.source, 'bybit');
  assert.equal(out.trades.length, 1);
  assert.equal(out.trades[0].commission, 0);
  assert.equal(out.fees.closedTradeCommissions, 0);
  assert.ok(out.trades[0].entryPrice > control.trades[0].entryPrice, 'buy entry incurs adverse spread');
  assert.ok(out.trades[0].exitPrice < control.trades[0].exitPrice, 'sell exit incurs adverse spread');
  assert.ok(out.netProfit < control.netProfit);
  assert.ok(Math.abs(out.trades[0].spreadCostEstimate! - 1) < 1e-9);
  assert.ok(Math.abs(out.fees.bybit!.closedSpreadCostEstimate - 1) < 1e-9);
  assert.ok(Math.abs(out.netProfit - out.trades[0].profit) < 1e-8);
});

test('Tight-Spread models exactly one $6/lot roundtrip fee and the spread', { timeout: 60_000 }, async () => {
  const candles = createDemoCandles().slice(0, 90);
  const out = await runBacktest(script, candles, undefined, { ...DEFAULT_FEES, bybit: tight });
  assert.equal(out.trades.length, 1);
  assert.equal(out.fees.actualType, 'cash_per_contract');
  assert.ok(Math.abs(out.trades[0].commission - 0.12) < 1e-7); // 2oz / 100oz × $6.
  assert.equal(out.fees.bybit?.commissionPerLotUsd, 6);
  assert.equal(out.fees.bybit?.ticksPerFill, 10);
  assert.ok(Math.abs(out.fees.bybit!.closedSpreadCostEstimate - 0.4) < 1e-8);
  assert.ok(Math.abs(out.fees.bybit!.totalCostEstimate - 0.52) < 1e-7);
  assert.ok(Math.abs(out.netProfit - out.trades[0].profit) < 1e-8);
});

test('Optional rollover is incorporated into net P&L, win rate and cost breakdown', { timeout: 60_000 }, async () => {
  const overnightScript = `//@version=6
strategy("Hold", initial_capital=10000, commission_value=0)
if bar_index == 2
    strategy.entry("L", strategy.long, qty=2)
if bar_index == 180
    strategy.close("L")`;
  const candles = createDemoCandles().slice(0, 230);
  const a = await runBacktest(overnightScript, candles, undefined,
    { ...DEFAULT_FEES, bybit: { ...zero, spreadUsd: 0, overnightUsdPerLot: 0 } });
  const b = await runBacktest(overnightScript, candles, undefined,
    { ...DEFAULT_FEES, bybit: { ...zero, spreadUsd: 0, overnightUsdPerLot: 10 } });
  assert.equal(a.trades.length, 1);
  assert.equal(b.trades.length, 1);
  const rollovers = estimatedUtcRollovers(b.trades[0].entryTime, b.trades[0].exitTime);
  assert.ok(rollovers > 0);
  const expected = rollovers * 2 / 100 * 10;
  assert.ok(Math.abs((a.netProfit - b.netProfit) - expected) < 1e-7);
  assert.ok(Math.abs(b.fees.bybit!.swapCostEstimate - expected) < 1e-7);
  assert.ok(Math.abs(b.trades[0].profit - (a.trades[0].profit - expected)) < 1e-7);
});

test('Crossing UTC midnight counts one approximate rollover even for short holds', () => {
  const a = Date.parse('2026-01-05T23:55:00Z'), b = Date.parse('2026-01-06T00:05:00Z');
  assert.equal(estimatedUtcRollovers(a, b), 1);
  assert.equal(estimatedUtcRollovers(b, b), 0);
  assert.equal(estimatedUtcRollovers(b, a), 0);
});

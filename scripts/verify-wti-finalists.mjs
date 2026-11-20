#!/usr/bin/env node
/**
 * Pre-development period validation of WTI 15m ORB finalists.
 * This period was not used when choosing 09:30/10:00 long-only settings.
 * ATR and EMA filters stay OFF; fixed SL, costs and session close unchanged.
 */
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { mergeCandleBatches } from '../src/lib/history.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const manifest = JSON.parse(readFileSync('public/history/wti/manifest.json', 'utf8'));
const all = mergeCandleBatches(manifest.files.map(part => parseCsv(readFileSync('public' + part.file, 'utf8'))));
const base = readFileSync('samples/wti-oil-breakout-15m.pine', 'utf8');
const scenarios = [
  { id: '09:30-10:30 Long only', fromH: 9, fromM: 30, toH: 10, toM: 30, long: true, short: false },
  { id: '10:00-11:00 Long only', fromH: 10, fromM: 0, toH: 11, toM: 0, long: true, short: false },
  { id: '08:00-09:00 Both baseline', fromH: 8, fromM: 0, toH: 9, toM: 0, long: true, short: true },
  { id: '09:30-10:30 Both', fromH: 9, fromM: 30, toH: 10, toM: 30, long: true, short: true },
  { id: '03:00-04:00 Long only', fromH: 3, fromM: 0, toH: 4, toM: 0, long: true, short: false },
];
function pineFor(a) {
  let source = base;
  for (const [name, oldValue, value] of [
    ['rangeStartHourInput', 8, a.fromH], ['rangeStartMinuteInput', 0, a.fromM],
    ['rangeEndHourInput', 9, a.toH], ['rangeEndMinuteInput', 0, a.toM],
  ]) {
    const old = name + ' = input.int(' + oldValue + ',';
    if (source.split(old).length !== 2) throw Error('Missing: ' + old);
    source = source.replace(old, name + ' = input.int(' + value + ',');
  }
  for (const [name, value] of [['allowLongInput',a.long],['allowShortInput',a.short]]) {
    const old = name + ' = input.bool(true,';
    if (source.split(old).length !== 2) throw Error('Missing: ' + old);
    source = source.replace(old,name + ' = input.bool(' + value + ',');
  }
  if (!source.includes('useRangeFilterInput = input.bool(false,') ||
      !source.includes('bufferAtrInput = input.float(0.0,') ||
      !source.includes('useTrendInput = input.bool(false,')) throw Error('Unexpected active filter.');
  return source;
}
const periods = [
  { id: 'earlier-unseen', from: '2025-11-21', to: '2026-06-01' },
  { id: 'complete-one-year', from: '2025-11-21', to: '2026-11-21' }
];
for (const period of periods) {
  const candles = all.filter(c => {
    const day = new Date(c.time).toISOString().slice(0,10);
    return day >= period.from && day < period.to;
  });
  console.log('PERIOD', period.id, candles.length, 'candles');
  for (const scenario of scenarios) {
    const results = await runBacktest(pineFor(scenario), candles, { pointvalue: 100, mincontract: 1, mintick: 0.01 }, DEFAULT_FEES);
    console.log('RESULT '+JSON.stringify({
      period: period.id, scenario: scenario.id, count: candles.length,
      trades: results.trades.length, net: +results.netProfit.toFixed(2),
      winRate: +results.winRate.toFixed(1),
      profitFactor: results.profitFactor === null ? null : +results.profitFactor.toFixed(3),
      drawdown: +results.maxDrawdown.toFixed(2),
      commission: +results.fees.closedTradeCommissions.toFixed(2)
    }));
    if (global.gc) global.gc();
  }
}

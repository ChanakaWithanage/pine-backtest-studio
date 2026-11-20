#!/usr/bin/env node
// WTI 15-minute SESSION and DIRECTION study.
// Reads the exact Pine strategy without introducing ATR/EMA filtering.
// Development: Jun 1 - Aug 31, 2026. Holdout: Sep 1 - Nov 20, 2026.
// Uses original strategy stop-loss, session close, position sizing and fees.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { mergeCandleBatches } from '../src/lib/history.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const manifest = JSON.parse(readFileSync('public/history/wti/manifest.json', 'utf8'));
const data = mergeCandleBatches(manifest.files.map(part => parseCsv(readFileSync('public' + part.file, 'utf8'))));
if (data.length !== manifest.candleCount || data.length < 12000) throw Error('Historical WTI candles missing.');
const base = readFileSync('samples/wti-oil-breakout-15m.pine', 'utf8');
const contract = { pointvalue: 100, mincontract: 1, mintick: 0.01 };
// All sessions in NY local time, including DST shifts; 1-hour ORB only.
const sessions = [
  { id: '03:00-04:00', startH: 3, startM: 0, endH: 4, endM: 0 },
  { id: '07:00-08:00', startH: 7, startM: 0, endH: 8, endM: 0 },
  { id: '08:00-09:00', startH: 8, startM: 0, endH: 9, endM: 0 },
  { id: '09:00-10:00', startH: 9, startM: 0, endH: 10, endM: 0 },
  { id: '09:30-10:30', startH: 9, startM: 30, endH: 10, endM: 30 },
  { id: '10:00-11:00', startH: 10, startM: 0, endH: 11, endM: 0 },
];
const directions = [
  { id: 'Both', long: true, short: true },
  { id: 'Long only', long: true, short: false },
  { id: 'Short only', long: false, short: true },
];
const periods = [
  { id: 'development', from: '2026-06-01', to: '2026-09-01' },
  { id: 'holdout', from: '2026-09-01', to: '2026-11-21' }
];
function replaceNumber(src, name, expected, next) {
  const prefix = name + ' = input.int(';
  const original = prefix + expected + ',';
  if (src.split(original).length !== 2) throw new Error('Input mismatch for ' + name);
  return src.replace(original, prefix + next + ',');
}
function replaceFlag(src, name, expected, next) {
  const original = name + ' = input.bool(' + expected + ',';
  if (src.split(original).length !== 2) throw new Error('Input mismatch for ' + name);
  return src.replace(original, name + ' = input.bool(' + next + ',');
}
function tailored(session, side) {
  let source = base;
  source = replaceNumber(source, 'rangeStartHourInput', 8, session.startH);
  source = replaceNumber(source, 'rangeStartMinuteInput', 0, session.startM);
  source = replaceNumber(source, 'rangeEndHourInput', 9, session.endH);
  source = replaceNumber(source, 'rangeEndMinuteInput', 0, session.endM);
  source = replaceFlag(source, 'allowLongInput', 'true', String(side.long));
  source = replaceFlag(source, 'allowShortInput', 'true', String(side.short));
  // These are intentionally unchanged: no EMA, ATR-based range filter or ATR buffer.
  for (const guard of [
    'useTrendInput = input.bool(false,',
    'useRangeFilterInput = input.bool(false,',
    'bufferAtrInput = input.float(0.0,',
    'slPctInput = input.float(0.8,',
    'riskPctInput = input.float(1.0,',
    'commission_value   = 2.5,',
    'slippage           = 1,'
  ]) {
    if (!source.includes(guard)) throw new Error('Unexpected WTI strategy settings: ' + guard);
  }
  return source;
}
const rows = [];
for (const period of periods) {
  const candleRange = data.filter(candle => {
    const date = new Date(candle.time).toISOString().slice(0, 10);
    return date >= period.from && date < period.to;
  });
  if (candleRange.length < 3000) throw new Error('Insufficient history in ' + period.id);
  console.log('PERIOD', period.id, period.from, period.to, candleRange.length, 'real 15m candles');
  for (const session of sessions) {
    for (const side of directions) {
      const res = await runBacktest(tailored(session, side), candleRange, contract, DEFAULT_FEES);
      const row = {
        period: period.id,
        session: session.id,
        direction: side.id,
        candles: candleRange.length,
        trades: res.trades.length,
        wins: res.trades.filter(t => t.profit > 0).length,
        net: +res.netProfit.toFixed(2),
        profitFactor: res.profitFactor === null ? null : +res.profitFactor.toFixed(3),
        winRate: +res.winRate.toFixed(1),
        maxDrawdown: +res.maxDrawdown.toFixed(2),
        commission: +res.fees.closedTradeCommissions.toFixed(2)
      };
      rows.push(row);
      console.log('RESULT ' + JSON.stringify(row));
      if (!Number.isFinite(row.net) || !Number.isFinite(row.maxDrawdown)) throw Error('Non-finite result');
      if (global.gc) global.gc();
    }
  }
}
const development = rows.filter(r => r.period === 'development');
const candidates = development
  .filter(r => r.trades >= 15)
  .sort((a,b) => (b.profitFactor ?? -1) - (a.profitFactor ?? -1) || b.net - a.net);
const candidatesTop = candidates.slice(0,5);
const summary = candidatesTop.map(r => ({
  development: r,
  holdout: rows.find(h => h.period === 'holdout' && h.session === r.session && h.direction === r.direction)
}));
console.log('TOP_DEVELOPMENT ' + JSON.stringify(summary));
console.log('BASELINE ' + JSON.stringify(rows.filter(r => r.session === '08:00-09:00' && r.direction === 'Both')));
writeFileSync('/tmp/wti-session-sweep.json', JSON.stringify({
  caveat: 'Only sessions and trade direction varied. ATR and EMA filters OFF. One-hour ORB, 14:30 New York exit. No optimisation of stop/fees.',
  source: manifest.instrument,
  priceType: manifest.priceType,
  rows,
  summary
},null,2));

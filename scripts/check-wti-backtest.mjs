#!/usr/bin/env node
/**
 * Execute the actual WTI Pine script on downloaded Dukascopy candles in CI.
 * Independent PineTS execution: not a TradingView backtest.
 */
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { mergeCandleBatches } from '../src/lib/history.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const manifest = JSON.parse(readFileSync('public/history/wti/manifest.json', 'utf8'));
const parts = manifest.files.map(part => parseCsv(readFileSync('public' + part.file, 'utf8')));
const all = mergeCandleBatches(parts);
if (all.length !== manifest.candleCount) throw new Error('WTI manifest count mismatch.');
// Run the complete imported one-year WTI 15m dataset.
const candles = all;
const code = readFileSync('samples/wti-oil-breakout-15m.pine', 'utf8');
const contract = { pointvalue: 100, mincontract: 1, mintick: 0.01 };
const results = await runBacktest(code, candles, contract, DEFAULT_FEES);
console.log('[WTI STRATEGY] candles:', candles.length);
console.log('[WTI STRATEGY] closed trades:', results.trades.length);
console.log('[WTI STRATEGY] net P&L:', results.netProfit.toFixed(2));
console.log('[WTI STRATEGY] win rate:', results.winRate.toFixed(1), '%');
console.log('[WTI STRATEGY] profit factor:', results.profitFactor);
if (!Number.isFinite(results.netProfit)) throw new Error('WTI strategy net P&L not finite.');
if (!results.trades.length) throw new Error('WTI strategy did not close any trades on the recent downloaded candles.');

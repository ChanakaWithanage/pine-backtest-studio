#!/usr/bin/env node
// S&P 500 15m opening-range session × direction study on actual Dukascopy
// USA500.IDX/USD BID index CFD candles. No ATR or EMA filters.
// Development: 2026-06-01 to 2026-09-01 (exclusive).
// Validation: 2026-09-01 through 2026-11-20.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { mergeCandleBatches } from '../src/lib/history.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const manifest = JSON.parse(readFileSync('public/history/sp500/manifest.json', 'utf8'));
if (manifest.instrument !== 'USA500.IDX/USD' || manifest.priceType !== 'bid' ||
    manifest.timeframeMinutes !== 15) throw Error('Unexpected S&P 500 feed.');
const data = mergeCandleBatches(manifest.files.map(part => parseCsv(readFileSync('public' + part.file, 'utf8'))));
if (data.length !== manifest.candleCount || data.length < 12000) throw Error('Historical S&P 500 candles missing.');
const base = readFileSync('samples/sp500-opening-range-breakout-15m.pine', 'utf8');
// The Dukascopy index CFD: $0.01 per 0.01-point move, or $1 per index point.
// This is NOT the CME ES ($50/point) or MES ($5/point) futures contract.
const contract = { pointvalue: 1, mincontract: 1, mintick: 0.01 };
const sessions = [
  { id: '03:00–04:00', startH: 3, startM: 0, endH: 4, endM: 0 },
  { id: '08:30–09:30', startH: 8, startM: 30, endH: 9, endM: 30 },
  { id: '09:00–09:30', startH: 9, startM: 0, endH: 9, endM: 30 },
  { id: '09:30–09:45', startH: 9, startM: 30, endH: 9, endM: 45 },
  { id: '09:30–10:00', startH: 9, startM: 30, endH: 10, endM: 0 },
  { id: '09:30–10:30', startH: 9, startM: 30, endH: 10, endM: 30 },
  { id: '10:00–11:00', startH: 10, startM: 0, endH: 11, endM: 0 },
  { id: '11:00–12:00', startH: 11, startM: 0, endH: 12, endM: 0 }
];
const sides = [
  { id: 'Both', long: true, short: true },
  { id: 'Long only', long: true, short: false },
  { id: 'Short only', long: false, short: true },
];
const periods = [
  { id: 'development', from: '2026-06-01', to: '2026-09-01' },
  { id: 'validation', from: '2026-09-01', to: '2026-11-21' }
];
function repInt(src, name, oldValue, newValue) {
  const exact = name + ' = input.int(' + oldValue + ',';
  if (src.split(exact).length !== 2) throw Error('Unexpected input: '+exact);
  return src.replace(exact, name + ' = input.int(' + newValue + ',');
}
function repBool(src, name, oldValue, newValue) {
  const exact = name + ' = input.bool(' + oldValue + ',';
  if (src.split(exact).length !== 2) throw Error('Unexpected input: '+exact);
  return src.replace(exact, name + ' = input.bool(' + newValue + ',');
}
function makePine(session,side) {
  let code = base;
  code = repInt(code,'rangeStartHourInput',9,session.startH);
  code = repInt(code,'rangeStartMinuteInput',30,session.startM);
  code = repInt(code,'rangeEndHourInput',10,session.endH);
  code = repInt(code,'rangeEndMinuteInput',0,session.endM);
  code = repBool(code,'allowLongInput','true',String(side.long));
  code = repBool(code,'allowShortInput','true',String(side.short));
  for (const required of [
    'useTrendInput = input.bool(false,',
    'useRangeFilterInput = input.bool(false,',
    'bufferAtrInput = input.float(0.0,',
    'slPctInput = input.float(0.4,',
    'riskPctInput = input.float(1.0,',
    'closeHourPartInput = input.int(15,',
    'closeMinutePartInput = input.int(45,',
    'commission_value   = 2.5,',
    'slippage           = 1,'
  ]) if (!code.includes(required)) throw Error('S&P 500 parameters drifted: '+required);
  return code;
}
const rows=[];
for (const p of periods) {
  const candles=data.filter(c=>{
    const date=new Date(c.time).toISOString().slice(0,10);
    return date>=p.from && date<p.to;
  });
  if (candles.length<3000) throw Error('Too few S&P 500 candles for '+p.id);
  console.log('PERIOD '+JSON.stringify({id:p.id,from:p.from,to:p.to,candles:candles.length}));
  for(const session of sessions) for(const side of sides) {
    const res=await runBacktest(makePine(session,side),candles,contract,DEFAULT_FEES);
    const row={
      period:p.id,session:session.id,direction:side.id,bars:candles.length,
      trades:res.trades.length,winRate:+res.winRate.toFixed(1),
      net:+res.netProfit.toFixed(2),
      profitFactor:res.profitFactor===null?null:+res.profitFactor.toFixed(3),
      maxDrawdown:+res.maxDrawdown.toFixed(2),
      commission:+res.fees.closedTradeCommissions.toFixed(2)
    };
    if (!Number.isFinite(row.net)||!Number.isFinite(row.maxDrawdown))throw Error('Invalid simulation result');
    rows.push(row);
    console.log('RESULT '+JSON.stringify(row));
    if (global.gc) global.gc();
  }
}
const development=rows.filter(x=>x.period==='development').sort((a,b)=>b.net-a.net);
const top=development.filter(x=>x.trades>=15).slice(0,8).map(x=>({
  development:x,
  validation:rows.find(y=>y.period==='validation' && y.session===x.session && y.direction===x.direction)
}));
const report={title:'S&P 500 15m session and direction study',instrument:manifest.instrument,source:manifest.provider,
  priceType:manifest.priceType,from:manifest.requestedFrom,toExclusive:manifest.requestedToExclusive,
  assumptions:'PineTS, CFD pointvalue=$1/index point, mincontract=1, tick=0.01, 0.4% SL, 1% risk, 15:45 NY close, Pine cash commission $2.50 per CFD per side, 1-tick slippage, no ATR or EMA.',
  rows,top};
console.log('TOP '+JSON.stringify(top));
console.log('BASELINE '+JSON.stringify(rows.filter(x=>x.session==='09:30–10:00'&&x.direction==='Both')));
writeFileSync('/tmp/sp500-session-research.json',JSON.stringify(report,null,2)+'\n');

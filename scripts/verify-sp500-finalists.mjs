#!/usr/bin/env node
// Independent early-period + entire-year validation of S&P 500 15m breakout finalists.
// Selection based on June–August 2026; 2025-11-21 to 2026-05-31 not used for selection.
// No ATR, no EMA, 0.4% SL, same costs and contract sizing.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { mergeCandleBatches } from '../src/lib/history.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const m=JSON.parse(readFileSync('public/history/sp500/manifest.json','utf8'));
const all=mergeCandleBatches(m.files.map(p=>parseCsv(readFileSync('public'+p.file,'utf8'))));
if(all.length!==m.candleCount)throw Error('Incomplete S&P 500 index CFD dataset');
const base=readFileSync('samples/sp500-opening-range-breakout-15m.pine','utf8');
const scenarios=[
  { id:'09:30–10:30 Short only', fromH:9,fromM:30,toH:10,toM:30,long:false,short:true },
  { id:'09:30–10:00 Short only', fromH:9,fromM:30,toH:10,toM:0,long:false,short:true },
  { id:'10:00–11:00 Short only', fromH:10,fromM:0,toH:11,toM:0,long:false,short:true },
  { id:'08:30–09:30 Short only', fromH:8,fromM:30,toH:9,toM:30,long:false,short:true },
  { id:'03:00–04:00 Short only', fromH:3,fromM:0,toH:4,toM:0,long:false,short:true },
  { id:'09:00–09:30 Both', fromH:9,fromM:0,toH:9,toM:30,long:true,short:true },
  { id:'09:30–10:00 Both original', fromH:9,fromM:30,toH:10,toM:0,long:true,short:true }
];
function pine(a) {
  let s=base;
  for(const [name,original,value] of [
    ['rangeStartHourInput',9,a.fromH],['rangeStartMinuteInput',30,a.fromM],
    ['rangeEndHourInput',10,a.toH],['rangeEndMinuteInput',0,a.toM],
  ]){
    const before=name+' = input.int('+original+',';
    if(s.split(before).length!==2)throw Error('Unexpected session input '+name);
    s=s.replace(before,name+' = input.int('+value+',');
  }
  for(const [name,value] of [['allowLongInput',a.long],['allowShortInput',a.short]]){
    const before=name+' = input.bool(true,';
    if(s.split(before).length!==2)throw Error('Unexpected side '+name);
    s=s.replace(before,name+' = input.bool('+value+',');
  }
  for(const required of [
    'useTrendInput = input.bool(false,',
    'useRangeFilterInput = input.bool(false,',
    'bufferAtrInput = input.float(0.0,',
    'slPctInput = input.float(0.4,',
    'commission_value   = 2.5,',
    'slippage           = 1,'
  ]) if(!s.includes(required))throw Error('Changed strategy assumptions '+required);
  return s;
}
const periods=[
  { id:'earlier-unseen',from:'2025-11-21',to:'2026-06-01' },
  { id:'full-year',from:'2025-11-21',to:'2026-11-21' }
];
const rows=[];
for(const p of periods){
  const candles=all.filter(c=>{const t=new Date(c.time).toISOString().slice(0,10);return t>=p.from && t<p.to});
  console.log('PERIOD '+JSON.stringify({id:p.id,candles:candles.length}));
  for(const scenario of scenarios){
    const r=await runBacktest(pine(scenario),candles,{pointvalue:1,mincontract:1,mintick:0.01},DEFAULT_FEES);
    const row={period:p.id,scenario:scenario.id,candles:candles.length,trades:r.trades.length,
      net:+r.netProfit.toFixed(2),winRate:+r.winRate.toFixed(1),
      profitFactor:r.profitFactor===null?null:+r.profitFactor.toFixed(3),
      maxDrawdown:+r.maxDrawdown.toFixed(2),commission:+r.fees.closedTradeCommissions.toFixed(2)};
    if(!Number.isFinite(row.net))throw Error('Invalid backtest result');
    console.log('RESULT '+JSON.stringify(row));
    rows.push(row);
    if(global.gc)global.gc();
  }
}
console.log('FINAL '+JSON.stringify(rows.filter(x=>x.period==='full-year').sort((a,b)=>b.net-a.net)));
writeFileSync('/tmp/sp500-finalists.json',JSON.stringify({instrument:m.instrument,candleCount:all.length,
  costs:'$2.50 cash per CFD per side and 1 tick slippage as in Pine source; not verified market bid-ask spread',
  rows},null,2)+'\n');

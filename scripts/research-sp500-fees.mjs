#!/usr/bin/env node
// S&P 500 full-year sensitivity: unchanged 15m short-only breakout settings,
// no ATR/EMA filters; vary only illustrative cash commission per CFD per side.
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { mergeCandleBatches } from '../src/lib/history.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const m=JSON.parse(readFileSync('public/history/sp500/manifest.json','utf8'));
const data=mergeCandleBatches(m.files.map(p=>parseCsv(readFileSync('public'+p.file,'utf8'))));
const base=readFileSync('samples/sp500-opening-range-breakout-15m.pine','utf8');
for(const end of [30,0]) {
  const endHour=end===30?10:10;
  const endMinute=end;
  // Two configurations: 09:30–10:30 and 09:30–10:00.
  let code=base.replace('rangeEndMinuteInput = input.int(0,','rangeEndMinuteInput = input.int('+endMinute+',');
  if(endMinute===30)code=code.replace('rangeEndHourInput = input.int(10,','rangeEndHourInput = input.int('+endHour+',');
  code=code.replace('allowLongInput = input.bool(true,','allowLongInput = input.bool(false,');
  for(const q of [
    'useTrendInput = input.bool(false,',
    'useRangeFilterInput = input.bool(false,',
    'bufferAtrInput = input.float(0.0,',
    'slPctInput = input.float(0.4,'
  ])if(!code.includes(q))throw Error('Unexpected strategy configuration '+q);
  for(const fee of [2.5,1,0]){
    const adapted=code.replace('commission_value   = 2.5,','commission_value   = '+fee+',');
    const r=await runBacktest(adapted,data,{pointvalue:1,mincontract:1,mintick:0.01},DEFAULT_FEES);
    console.log('RESULT '+JSON.stringify({session:'09:30–10:'+String(endMinute).padStart(2,'0'),
      commissionPerContractPerSide:fee,candles:data.length,trades:r.trades.length,
      net:+r.netProfit.toFixed(2),winRate:+r.winRate.toFixed(1),
      profitFactor:r.profitFactor===null?null:+r.profitFactor.toFixed(3),
      maxDrawdown:+r.maxDrawdown.toFixed(2),
      commission:+r.fees.closedTradeCommissions.toFixed(2)}));
    if(global.gc)global.gc();
  }
}

#!/usr/bin/env node
/**
 * PineTS length-class champion validation for the original user Gold strategy.
 * All sessions GMT+3, 1% SL, one unit, initial $300, zero commission,
 * 15 x $0.01 slippage per fill => $0.30 round trip.
 * Prefer 2018/2019/2022 for selection, report 2023 as holdout. Do not rank based on 2023; holdout is reported separately.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';
const SOURCE = readFileSync('research/gold-mt5-original-2026.pine','utf8');
const marker=SOURCE.indexOf('// 9. PLOTS & VISUALS');
if(marker<0)throw Error('Visual removal marker missing.');
const strategy=SOURCE.slice(0,marker);
for (const required of [
  'initial_capital    = 300,','commission_value   = 0.0,',
  'slippage           = 15,','slPctInput = input.float(1.0,',
  'tzInput = input.string("GMT+3",'
]) if(!strategy.includes(required))throw Error('Changed underlying Gold source: '+required);
const candidates=[
  {start:16,end:18,close:22}, // 2h, all 4 positive in first pass
  {start:9,end:12,close:22},  // 3h
  {start:15,end:18,close:22}, // 3h lower drawdown
  {start:13,end:17,close:22}, // 4h alternative
  {start:12,end:18,close:22}, // 6h
  {start:6,end:12,close:22},  // 6h
  {start:11,end:18,close:22}, // 7h
  {start:10,end:18,close:22}, // 8h
  {start:8,end:18,close:23},  // 10h
  {start:6,end:18,close:23}   // 12h
];
function make(c){
  let code=strategy;
  for(const [name,a,b] of [['rangeFromInput',0,c.start],
    ['rangeToInput',7,c.end],['closeHourInput',20,c.close]]){
    const old=name+' = input.int('+a+',';
    if(code.split(old).length!==2)throw Error('Unexpected Pine input '+name);
    code=code.replace(old,name+' = input.int('+b+',');
  }
  return code;
}
const years=[2018,2019,2022,2023];
const candles=new Map(years.map(year=>{
  const d=parseCsv(readFileSync('data/gold-research/xauusd-bid-m15-'+year+'.csv','utf8'));
  if(d.length<18000)throw Error('Missing XAUUSD candles in '+year);
  return [year,d];
}));
const rows=[];
for(const config of candidates){
  const script=make(config);
  for(const year of years){
    const r=await runBacktest(script,candles.get(year),{pointvalue:1,mincontract:1,mintick:0.01},DEFAULT_FEES);
    const result={...config,duration:config.end-config.start,year,
      net:+r.netProfit.toFixed(2),trades:r.trades.length,
      winRate:+r.winRate.toFixed(1),
      profitFactor:r.profitFactor===null?null:+r.profitFactor.toFixed(3),
      maxDrawdown:+r.maxDrawdown.toFixed(2)};
    rows.push(result);
    console.log('DURATION_RESULT '+JSON.stringify(result));
    if(global.gc)global.gc();
  }
}
const grouped=candidates.map(c=>{
  const r=rows.filter(x=>x.start===c.start&&x.end===c.end&&x.close===c.close);
  const train=r.filter(x=>x.year!==2023),holdout=r.find(x=>x.year===2023);
  return {...c,
    trainNet:+train.reduce((sum,x)=>sum+x.net,0).toFixed(2),
    trainPositive:train.filter(x=>x.net>0).length,
    validation2023:holdout.net,
    totalNet:+r.reduce((sum,x)=>sum+x.net,0).toFixed(2),
    allPositive:r.filter(x=>x.net>0).length,
    maxDrawdown:Math.max(...r.map(x=>x.maxDrawdown)),
    perYear:r.map(x=>({year:x.year,net:x.net,pf:x.profitFactor,trades:x.trades,dd:x.maxDrawdown}))
  };
});
grouped.sort((a,b)=>b.trainPositive-a.trainPositive ||
  b.trainNet-a.trainNet || a.maxDrawdown-b.maxDrawdown);
console.log('DURATION_RANKED '+JSON.stringify(grouped));
mkdirSync('data/gold-research/results',{recursive:true});
writeFileSync('data/gold-research/results/gold-pinets-duration-champions.json',
  JSON.stringify({assumptions:'Original exact Pine trading code, 15m XAUUSD BID, GMT+3, $0.30 spread round trip, 0 commission, $300 initial fixed 1 unit',
    years,rows,rankedTraining:grouped},null,2)+'\n');

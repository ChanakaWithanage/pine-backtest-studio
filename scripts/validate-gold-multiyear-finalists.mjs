#!/usr/bin/env node
/**
 * PineTS cross-check of the real user-supplied Gold Breakout 15m Pine v6 script.
 * Input spread is already in the source: 15 XAUUSD ticks PER fill, $0.01/tick,
 * zero commission. Two fills => $0.30 price impact per trade, 1 gold unit.
 *
 * Removes visual-only plotting/dashboard and Chrome-pixel-bridge code for
 * PineTS throughput, leaving all calculations and strategy orders unchanged.
 * Reports results independently for each requested calendar year.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const years=[2018,2019,2022,2023];
const raw=readFileSync('research/gold-mt5-original-2026.pine','utf8');
const marker=raw.indexOf('// 9. PLOTS & VISUALS');
if(marker<0)throw Error('Missing visual-only section; cannot prove unchanged order logic');
const tradeOnly=raw.slice(0,marker);
for(const expected of [
  'initial_capital    = 300,',
  'default_qty_value  = 1,',
  'commission_type    = strategy.commission.cash_per_order,',
  'commission_value   = 0.0,',
  'slippage           = 15,',
  'rangeFromInput = input.int(0,',
  'rangeToInput = input.int(7,',
  'closeHourInput = input.int(20,',
  'tzInput = input.string("GMT+3",',
  'sizeModeInput = input.string(SIZE_FIXED,',
  'slPctInput = input.float(1.0,',
  'strategy.entry("Long"',
  'strategy.entry("Short"',
  'strategy.close_all(comment = "Time exit "'
]) if(!tradeOnly.includes(expected))throw Error('Original trade logic changed: '+expected);
const summary=JSON.parse(readFileSync('data/gold-research/results/gold-session-summary.json','utf8'));
const selections=[{start:0,end:7,close:20,duration:7,origin:'user-original'}];
for(const [origin,collection,num] of [
  ['best-train',summary.topTrain,2],
  ['best-cross-year',summary.topCrossYear,2],
  ['best-all-years-expost',summary.topExPost,1]
]){
  for(const row of collection.slice(0,num)){
    if(!selections.some(x=>x.start===row.start && x.end===row.end && x.close===row.close)) {
      selections.push({start:row.start,end:row.end,close:row.close,duration:row.duration,origin});
    }
  }
}
if(selections.length>6)selections.length=6;
function variant(c) {
  let code=tradeOnly;
  for(const [input,oldVal,next] of [
    ['rangeFromInput',0,c.start],
    ['rangeToInput',7,c.end],
    ['closeHourInput',20,c.close]
  ]){
    const exact=input+' = input.int('+oldVal+',';
    if(code.split(exact).length!==2)throw Error('Cannot find original Pine input '+input);
    code=code.replace(exact,input+' = input.int('+next+',');
  }
  return code;
}
const compare=JSON.parse(readFileSync('data/gold-research/results/gold-session-all-configs.json','utf8'));
const dataset=new Map();
for(const year of years){
  const d=parseCsv(readFileSync('data/gold-research/xauusd-bid-m15-'+year+'.csv','utf8'));
  if(d.length<18000)throw Error('Incomplete year '+year);
  dataset.set(year,d);
}
const results=[];
console.log('PINETS_START '+JSON.stringify({years,configs:selections,
  note:'execution-only source trim (before visual plots); original strategy entry/exit and sizing unchanged',
  spreadPerRoundTrip:0.30,unit:1,initialCapital:300,
  timezone:'GMT+3 fixed',slippageTicksPerExecution:15,commission:0}));
for(const c of selections){
  const code=variant(c);
  for(const year of years){
    const candles=dataset.get(year);
    let res;
    try{
      res=await runBacktest(code,candles,{pointvalue:1,mincontract:1,mintick:0.01},DEFAULT_FEES);
    }catch(error){
      console.log('PINETS_ERROR '+JSON.stringify({start:c.start,end:c.end,close:c.close,origin:c.origin,year,
        error:error instanceof Error?error.message:String(error)}));
      throw error;
    }
    const approx=compare.find(x=>x.start===c.start&&x.end===c.end&&x.close===c.close);
    const yrProxy=approx?approx['y'+year]:null;
    const row={start:c.start,end:c.end,close:c.close,duration:c.duration,
      origin:c.origin,year,candles:candles.length,
      trades:res.trades.length,net:+res.netProfit.toFixed(2),
      profitFactor:res.profitFactor===null?null:+res.profitFactor.toFixed(3),
      winRate:+res.winRate.toFixed(1),maxDrawdown:+res.maxDrawdown.toFixed(2),
      commissions:+(res.fees.closedTradeCommissions+res.fees.openTradeEntryCommissions).toFixed(2),
      fastProxyNet:yrProxy?.net??null,fastProxyTrades:yrProxy?.trades??null,
      proxyDifference:yrProxy?+(res.netProfit-yrProxy.net).toFixed(2):null};
    results.push(row);
    console.log('PINETS_RESULT '+JSON.stringify(row));
    if(global.gc)global.gc();
  }
}
const byConfig=[];
for(const c of selections){
  const arr=results.filter(x=>x.start===c.start&&x.end===c.end&&x.close===c.close);
  byConfig.push({...c,profitYears:arr.filter(x=>x.net>0).length,
    totalNet:+arr.reduce((sum,x)=>sum+x.net,0).toFixed(2),
    worstYearNet:Math.min(...arr.map(x=>x.net)),
    maxDrawdown:Math.max(...arr.map(x=>x.maxDrawdown)),
    perYear:arr.map(x=>({year:x.year,net:x.net,pf:x.profitFactor,trades:x.trades,maxDrawdown:x.maxDrawdown}))});
}
console.log('PINETS_FINAL '+JSON.stringify(byConfig));
const out='data/gold-research/results/gold-pinets-finalists.json';
writeFileSync(out,JSON.stringify({years,assumptions:{
  source:'Exact original user Pine order logic; stripped visual-only sections for performance',
  '15m':'Dukascopy BID',brokerTime:'Fixed GMT+3',startingCapital:300,
  'spreadPriceRoundTrip':0.30,commission:0,qty:1,slPercent:1},
  rows:results,byConfig},null,2)+'\n');

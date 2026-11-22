#!/usr/bin/env node
/**
 * Compare two fixed configurations of the actual user's Gold Breakout v1.1.0
 * across calendar years from 2010 through the current partial year.
 *
 * Identical Pine order engine for both:
 * - 15m Dukascopy XAUUSD BID
 * - Original fixed GMT+3 server clock (not New York DST mode)
 * - initial capital $10,000 ONLY as a margin-neutral sensitivity, fixed 1-unit position, 1% SL, OCA breakout
 * - zero separate commission; 15 ticks per execution, $0.01/tick:
 *   0.15 adverse at entry + 0.15 adverse at exit = 0.30 per round trip
 * - trade-only trim removes visual/Chrome bridge code, not order calculations
 *
 * Each year starts with $10,000 independently. For comparability, annual P&L
 * is NOT treated as a continuous compounded strategy or a live MT5 account.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';
import { runBacktest } from '../src/lib/backtest.ts';
import { DEFAULT_FEES } from '../src/lib/commissions.ts';

const years = (process.env.GOLD_RESEARCH_YEARS || '')
  .split(',').filter(Boolean).map(s => Number(s));
if (!years.length || years.some(y=>!Number.isInteger(y) || y<2010 || y>new Date().getUTCFullYear())) {
  throw new Error('Provide GOLD_RESEARCH_YEARS comma-separated years >= 2010.');
}
const original=readFileSync('research/gold-mt5-original-2026.pine','utf8');
const visualStart=original.indexOf('// 9. PLOTS & VISUALS');
if(visualStart<0)throw Error('Original Pine visualization marker changed.');
const tradingSource=original.slice(0,visualStart);
for(const line of [
  'initial_capital    = 300,',
  'default_qty_type   = strategy.fixed,',
  'default_qty_value  = 1,',
  'commission_value   = 0.0,',
  'slippage           = 15,',
  'tzModeInput = input.string(TZ_MODE_FIXED,',
  'tzInput = input.string("GMT+3",',
  'rangeFromInput = input.int(0,',
  'rangeToInput = input.int(7,',
  'closeHourInput = input.int(20,',
  'slPctInput = input.float(1.0,',
  'sizeModeInput = input.string(SIZE_FIXED,',
  'strategy.entry("Long"',
  'strategy.entry("Short"',
  'strategy.close_all(comment = "Time exit "'
]){
  if(!tradingSource.includes(line))throw Error('Strategy assumptions changed: '+line);
}
function strategyWithHours(from,to,close){
  let code=tradingSource;
  for(const [name,originalValue,newValue] of [
    ['rangeFromInput',0,from],['rangeToInput',7,to],['closeHourInput',20,close]
  ]){
    const find=name+' = input.int('+originalValue+',';
    if(code.split(find).length!==2)throw Error('Original input not found: '+name);
    code=code.replace(find,name+' = input.int('+newValue+',');
  }
  // Change ONLY initial capital to avoid 5% margin shutting the script down
  // at high modern gold prices. Fixed one-unit exposure and P&L per price
  // point remain identical. All breakout / SL / exit logic is unchanged.
  const originalCapital='initial_capital    = 300,';
  if(code.split(originalCapital).length!==2)throw Error('Initial capital declaration changed');
  return code.replace(originalCapital,'initial_capital    = 10000,');
}
const strategies=[
  {id:'original',rangeStart:0,rangeEnd:7,closeHour:20,source:strategyWithHours(0,7,20)},
  {id:'recommended',rangeStart:7,rangeEnd:11,closeHour:21,source:strategyWithHours(7,11,21)}
];
const contract={pointvalue:1,mincontract:1,mintick:0.01};
const rows=[];
const round2=n=>+n.toFixed(2);
for(const year of years){
  const candles=parseCsv(readFileSync('data/gold-research/xauusd-bid-m15-'+year+'.csv','utf8'));
  const yearStart=Date.UTC(year,0,1);
  const now=new Date();
  const upper=year===now.getUTCFullYear()
    ? Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)
    : Date.UTC(year+1,0,1);
  const required=Math.floor(17_000*(upper-yearStart)/(Date.UTC(year+1,0,1)-yearStart));
  if(candles.length<required || candles[0].time>=yearStart+9*86_400_000 ||
     candles.at(-1).time>=upper || upper-candles.at(-1).time>9*86_400_000) {
    throw new Error('Incomplete or invalid annual XAUUSD candles for '+year+' count '+candles.length);
  }
  console.log('YEAR_DATA_MN '+JSON.stringify({
    year,candles:candles.length,first:new Date(candles[0].time).toISOString(),
    last:new Date(candles.at(-1).time).toISOString(),partial:year===now.getUTCFullYear()}));
  for(const cfg of strategies){
    const result=await runBacktest(cfg.source,candles,contract,DEFAULT_FEES);
    const commissions=round2(result.fees.closedTradeCommissions+result.fees.openTradeEntryCommissions);
    if(Math.abs(commissions)>0.0001)throw Error('Unexpected separate commission in '+year);
    const tradeProfits=result.trades.map(t=>({
      t:t.exitTime, pnl:round2(t.profit), dir:t.direction,
      entryPrice:t.entryPrice,exitPrice:t.exitPrice
    }));
    const row={
      year, partialYear:year===now.getUTCFullYear(),strategy:cfg.id,
      startHourGMT3:cfg.rangeStart,endHourGMT3:cfg.rangeEnd,closeHourGMT3:cfg.closeHour,
      first:new Date(candles[0].time).toISOString(),
      last:new Date(candles.at(-1).time).toISOString(),
      bars:candles.length,trades:result.trades.length,
      net:round2(result.netProfit),
      grossProfit:round2(result.grossProfit),grossLoss:round2(result.grossLoss),
      winRate:round2(result.winRate),
      profitFactor:result.profitFactor===null?null:+result.profitFactor.toFixed(3),
      maxDrawdown:round2(result.maxDrawdown),
      maxDrawdownPercent:round2(result.maxDrawdownPercent),
      commissions,openTrades:result.openTrades,
      totalPriceSpreadPerRoundTrip:0.30,contractPointValue:1,
      positions:result.trades.reduce((x,t)=>{x[t.direction]=(x[t.direction]||0)+1;return x},{Long:0,Short:0}),
      tradesByExit:tradeProfits
    };
    if(!Number.isFinite(row.net)||!Number.isFinite(row.maxDrawdown) || !Number.isFinite(row.maxDrawdownPercent)) {
      throw Error('Non-finite Gold benchmark result '+year+' '+cfg.id);
    }
    rows.push(row);
    console.log('YEAR_RESULT_MN '+JSON.stringify({...row,tradesByExit:undefined}));
    if(global.gc)global.gc();
  }
}
const output='data/gold-research/results';
mkdirSync(output,{recursive:true});
const group=process.env.GOLD_COMPARISON_GROUP || years[0]+'-'+years.at(-1);
writeFileSync(output+'/gold-long-horizon-marginneutral-'+group+'.json',JSON.stringify({
  model:'Original Gold Pine strategy execution-only source (visuals removed)',
  instrument:'Dukascopy XAUUSD BID 15m',years,
  timezone:'Fixed GMT+3',qty:1,initialCapital:10000,
  commissionUSD:0,slippageTicksPerFill:15,
  priceTickUSD:0.01,totalRoundTripSpreadUSD:0.30,
  annualInitialEquityResets:true,
  results:rows
},null,2)+'\n');
const headers=['year','strategy','partial_year','bars','trades','net_usd','gross_profit','gross_loss',
  'win_rate_pct','profit_factor','max_drawdown_usd','max_drawdown_pct','open_trades',
  'long_trades','short_trades','first_utc','last_utc','commission_usd'];
writeFileSync(output+'/gold-long-horizon-marginneutral-'+group+'.csv',
  [headers.join(','),...rows.map(r=>[
    r.year,r.strategy,r.partialYear,r.bars,r.trades,r.net,r.grossProfit,r.grossLoss,
    r.winRate,r.profitFactor??'',r.maxDrawdown,r.maxDrawdownPercent,r.openTrades,
    r.positions.Long,r.positions.Short,r.first,r.last,r.commissions].join(','))].join('\n')+'\n');
console.log('COMPARISON_FINISHED_MN '+JSON.stringify({
  group,years,n:rows.length,
  originals:rows.filter(x=>x.strategy==='original').length,
  recommendations:rows.filter(x=>x.strategy==='recommended').length
}));

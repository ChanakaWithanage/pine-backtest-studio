#!/usr/bin/env node
/**
 * Multi-year XAUUSD 15-minute original-strategy session-search.
 *
 * FAST SEARCH is a transparent bar-by-bar approximation of Pine's broker emulator:
 * same one-per-day OCA breakout, 1% SL, forced time exit, 1 oz fixed,
 * $300 initial capital, zero commission, and $0.15 adverse price per fill
 * = $0.30 total round trip (Dukascopy 0.01 tick, 15 ticks per execution).
 * This is NOT 0.4% commission or $0.30 per order.
 *
 * The exact supplied Pine execution path is separately checked by the
 * PineTS validation stage. Do not confuse fast search and PineTS results.
 *
 * Grid: Fixed GMT+3 as in user's script; 1..8, 10, 12 hour ranges;
 * starts 00..20; close=end+1..23. Year 2023 held out for validation.
 *
 * Original: 00–07 range, close at 20 GMT+3, both directions.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv.ts';

const years = [2018,2019,2022,2023];
const MS_DAY = 86_400_000;
const TWO15 = 15*60_000;
const SPREAD_HALF = 0.15;
const SL_PCT = 0.01;
const INITIAL_CAPITAL = 300;
const MULTIPLIER = 1;
const MIN_MARGIN = 0.05;
const REPORT_DIR = 'data/gold-research/results';
mkdirSync(REPORT_DIR,{recursive:true});
const fullResults=[];

function priceRound(v) {return Math.round(v*100)/100;}
function toDays(candles) {
  const out=[];
  let key=NaN, cur=null;
  for(const c of candles){
    const shifted = c.time + 3*3_600_000;
    const day=Math.floor(shifted/MS_DAY);
    const hour=Math.floor((shifted%MS_DAY)/3_600_000);
    if(day!==key){
      key=day;
      cur={day, bars:[]};
      out.push(cur);
    }
    cur.bars.push({time:c.time,hour,open:c.open,high:c.high,low:c.low,close:c.close});
  }
  return out.slice(1); // Original Pine script skips first loaded broker day.
}
function segmentTouches(a,b,price){
  return (a<=price && b>=price) || (a>=price && b<=price);
}
/**
 * Return a day's first trade and exit; independent of equity.
 * Earliest possible stop entry in the rangeEnd..closeHour window.
 * If both sides get touched in one candle, use the emulator's assumed
 * open -> nearest extreme -> other extreme -> close path.
 * One full $0.30 price spread per closed 1-unit trade.
 */
function simulateDay(bars, start, end, closeHour) {
  let hi=-Infinity,lo=Infinity,rangeN=0;
  for(let i=0;i<bars.length;i++){
    const b=bars[i];
    if(b.hour>=start&&b.hour<end){
      if(b.high>hi)hi=b.high;
      if(b.low<lo)lo=b.low;
      rangeN++;
    }
  }
  if(rangeN===0 || hi<=lo || lo<=0) return null;
  const slLong=priceRound(hi*(1-SL_PCT)), slShort=priceRound(lo*(1+SL_PCT));
  let pos=0,entry=0,sl=0,entryBase=0,entryTime=0,reason='';
  for(let i=0;i<bars.length;i++){
    const b=bars[i];
    if(b.hour<end) continue;
    if(b.hour>=closeHour) {
      if(pos===0)return null;
      const exit= b.open - pos*SPREAD_HALF;
      return {direction:pos,profit:+(pos*(exit-entry)*MULTIPLIER).toFixed(2),
        entry,exit,entryTime,exitTime:b.time,reason:'time'};
    }
    // If already holding, a gap past the prior SL closes at the opening price.
    if(pos && ((pos===1&&b.open<=sl)||(pos===-1&&b.open>=sl))) {
      const exit=b.open-pos*SPREAD_HALF;
      return {direction:pos,profit:+(pos*(exit-entry)*MULTIPLIER).toFixed(2),
        entry,exit,entryTime,exitTime:b.time,reason:'stop-gap'};
    }
    // Gap through a pending stop: fill at the next open, not the stop line.
    if(!pos && b.open>=hi) {
      pos=1;entryBase=b.open;entry=entryBase+SPREAD_HALF;sl=slLong;entryTime=b.time;
    } else if(!pos&&b.open<=lo) {
      pos=-1;entryBase=b.open;entry=entryBase-SPREAD_HALF;sl=slShort;entryTime=b.time;
    }
    // Nearest extreme defines Pine historical broker emulator's synthetic path.
    const highFirst=(b.high-b.open) < (b.open-b.low);
    const path=highFirst?[b.open,b.high,b.low,b.close]:[b.open,b.low,b.high,b.close];
    for(let j=0;j<3;j++){
      const from=path[j],to=path[j+1];
      if(!pos){
        if(to>from && segmentTouches(from,to,hi)){
          pos=1;entryBase=hi;entry=hi+SPREAD_HALF;sl=slLong;entryTime=b.time;
        } else if(to<from && segmentTouches(from,to,lo)){
          pos=-1;entryBase=lo;entry=lo-SPREAD_HALF;sl=slShort;entryTime=b.time;
        }
      } else if ((pos===1 && to<from && segmentTouches(from,to,sl)) ||
                 (pos===-1 && to>from && segmentTouches(from,to,sl))) {
        const exit=sl-pos*SPREAD_HALF;
        return {direction:pos,profit:+(pos*(exit-entry)*MULTIPLIER).toFixed(2),
          entry,exit,entryTime,exitTime:b.time,reason:'stop'};
      }
    }
    if(pos){
      // Original Pine adjusts % stop from actual filled entry on its next
      // confirmed bar close, not continuously while the bar is forming.
      sl=priceRound(entry*(1-pos*SL_PCT));
    }
  }
  return null; // Missing close-session candle: don't invent an exit.
}
function aggregate(days,start,end,closeHour,cap=true){
  let equity=INITIAL_CAPITAL,peak=equity,maxDD=0;
  let grossWin=0,grossLoss=0,wins=0,n=0,longs=0,shorts=0,marginSkipped=0;
  let stopped=0, timed=0, gaps=0;
  for(const day of days){
    const trade=simulateDay(day.bars,start,end,closeHour);
    if(!trade)continue;
    if(cap && equity < trade.entry*MIN_MARGIN) {
      marginSkipped++;
      continue;
    }
    if(trade.direction===1)longs++;else shorts++;
    n++; equity+=trade.profit;
    if(trade.profit>0){grossWin+=trade.profit;wins++;}
    else grossLoss+=-trade.profit;
    if(trade.reason==='time')timed++;
    else if(trade.reason==='stop-gap')gaps++;
    else stopped++;
    if(equity>peak)peak=equity;
    maxDD=Math.max(maxDD,peak-equity);
  }
  return {net:+(equity-INITIAL_CAPITAL).toFixed(2),trades:n,wins,
    winRate:n?+(100*wins/n).toFixed(1):0,
    pf:grossLoss?+(grossWin/grossLoss).toFixed(3):null,
    maxDD:+maxDD.toFixed(2),longs,shorts,
    skippedForMargin:marginSkipped,stopped,timed,gaps};
}
const all={};
for(const year of years){
  const file='data/gold-research/xauusd-bid-m15-'+year+'.csv';
  const data=parseCsv(readFileSync(file,'utf8'));
  if(data.length<18000 || data[0].time>=Date.parse(year+'-01-10'))throw Error('Insufficient '+year+' data');
  all[year]=toDays(data);
  console.log('DATA '+JSON.stringify({year,candles:data.length,days:all[year].length,
    first:new Date(data[0].time).toISOString(),last:new Date(data.at(-1).time).toISOString()}));
}
const configs=[];
for(let start=0;start<=20;start++){
  for(const duration of [1,2,3,4,5,6,7,8,10,12]){
    const end=start+duration;
    if(end>=23)continue;
    for(let close=end+1;close<=23;close++){
      configs.push({start,end,close,duration});
    }
  }
}
console.log('GRID '+JSON.stringify({configurations:configs.length,years:years.length,
  totalParameterYearTrials:configs.length*years.length,
  fixedTZ:'GMT+3',original:'00-07/20',fee:'USD 0.15 adverse per fill, USD 0.30 per round trip, no commission',
  stopPercent:1,positionQty:1,startingEquity:300,marginPercent:5}));
const rows=[];
for(const cfg of configs){
  const yearly={};
  for(const year of years){
    yearly[year]=aggregate(all[year],cfg.start,cfg.end,cfg.close);
  }
  const train=[yearly[2018],yearly[2019],yearly[2022]];
  const allFour=years.map(y=>yearly[y]);
  const trainProfitYears=train.filter(x=>x.net>0).length;
  const allProfitYears=allFour.filter(x=>x.net>0).length;
  const trainNets=train.map(x=>x.net);
  const trainTrades=train.reduce((n,x)=>n+x.trades,0);
  const minTrain=Math.min(...trainNets);
  const sumTrain=trainNets.reduce((n,x)=>n+x,0);
  const totalNet=allFour.reduce((sum,x)=>sum+x.net,0);
  const minNet=Math.min(...allFour.map(x=>x.net));
  const worstDD=Math.max(...allFour.map(x=>x.maxDD));
  const sumPF=allFour.map(x=>x.pf).filter(x=>x!==null);
  const row={...cfg,trainProfitYears,allProfitYears,trainNet:+sumTrain.toFixed(2),
    trainMinNet:+minTrain.toFixed(2),trainTrades,
    validation2023:yearly[2023].net,
    totalNet:+totalNet.toFixed(2),minNet:+minNet.toFixed(2),
    worstDD,medianPF:sumPF.sort((a,b)=>a-b)[Math.floor(sumPF.length/2)]??null,
    y2018:yearly[2018],y2019:yearly[2019],y2022:yearly[2022],y2023:yearly[2023]};
  rows.push(row);
}
// Select candidates using 2018/2019/2022 ONLY.
// 2023 is a holdout and must not influence the candidate ranking.
const eligible=rows.filter(x=>x.trainTrades>=80
  && x.y2018.trades>=18 && x.y2019.trades>=18 && x.y2022.trades>=18
  && x.worstDD <= 350);
eligible.sort((a,b)=>b.trainProfitYears-a.trainProfitYears ||
  b.trainMinNet-a.trainMinNet ||
  b.trainNet-a.trainNet ||
  a.worstDD-b.worstDD);
const bestTrain=eligible.slice(0,30);
const robustAll=[...rows].filter(x=>x.trainTrades>=80&&x.allProfitYears>=3)
  .sort((a,b)=>b.allProfitYears-a.allProfitYears||b.minNet-a.minNet||b.totalNet-a.totalNet).slice(0,30);
const bestByTotal=[...rows].filter(x=>x.trainTrades>=80)
  .sort((a,b)=>b.totalNet-a.totalNet).slice(0,30);
const baseline=rows.find(x=>x.start===0&&x.end===7&&x.close===20);
console.log('BASELINE '+JSON.stringify(baseline));
console.log('TOP_TRAIN '+JSON.stringify(bestTrain.slice(0,15)));
console.log('TOP_CROSS_YEAR '+JSON.stringify(robustAll.slice(0,15)));
console.log('TOP_EXPOST '+JSON.stringify(bestByTotal.slice(0,10)));
console.log('STATISTICS '+JSON.stringify({
  totalConfigs:rows.length,eligible:eligible.length,
  trainProfit3of3:rows.filter(x=>x.trainProfitYears===3).length,
  allProfit4of4:rows.filter(x=>x.allProfitYears===4).length,
  trainPositiveHoldoutPositive:rows.filter(x=>x.trainProfitYears===3&&x.validation2023>0).length
}));
writeFileSync(REPORT_DIR+'/gold-session-all-configs.json',JSON.stringify(rows)+'\n');
const cols=['start','end','close','duration','trainProfitYears','allProfitYears','trainNet',
  'trainMinNet','validation2023','totalNet','minNet','worstDD','medianPF',
  'net2018','net2019','net2022','net2023','trades2018','trades2019','trades2022','trades2023'];
const csv=[cols.join(','),...rows.map(r=>[
  r.start,r.end,r.close,r.duration,r.trainProfitYears,r.allProfitYears,r.trainNet,
  r.trainMinNet,r.validation2023,r.totalNet,r.minNet,r.worstDD,r.medianPF,
  ...years.map(y=>r['y'+y].net),...years.map(y=>r['y'+y].trades)
].join(','))].join('\n')+'\n';
writeFileSync(REPORT_DIR+'/gold-session-all-configs.csv',csv);
writeFileSync(REPORT_DIR+'/gold-session-summary.json',JSON.stringify({
  instrument:'Dukascopy XAUUSD BID 15m',
  note:'Fast bar-path simulator for large parameter sweep; finalists require PineTS replication.',
  assumptions:{startingEquity:300,qty:1,pointvalue:1,tick:0.01,spreadTotal:0.30,
    slippagePerFill:0.15,commission:0,slPercent:1,timezone:'Fixed GMT+3',
    closeRule:'next bar open',holding:'one trade per broker day'},
  years,baseline,topTrain:bestTrain,topCrossYear:robustAll,topExPost:bestByTotal.slice(0,10),
  counts:{total:rows.length,eligible:eligible.length,
    allFourPositive:rows.filter(x=>x.allProfitYears===4).length}},null,2)+'\n');
console.log('WROTE '+REPORT_DIR);

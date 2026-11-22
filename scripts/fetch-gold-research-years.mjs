#!/usr/bin/env node
/**
 * Fetch user-requested XAUUSD BID 15m calendar years for research only.
 * Never included in public dist/, never committed to Git.
 * Uses Dukascopy Node (the same source as the Gold Studio hosted feed).
 */
import { spawn } from 'node:child_process';
import { mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';

const years = (process.env.GOLD_RESEARCH_YEARS || '2018,2019,2022,2023')
  .split(',').map(s => Number(s.trim()));
if (!years.length || new Set(years).size !== years.length ||
  years.some(y => !Number.isInteger(y) || y < 2003 || y > new Date().getUTCFullYear())) {
  throw Error('Invalid GOLD_RESEARCH_YEARS');
}
const folder = 'data/gold-research';
await mkdir(folder, { recursive: true });
const deadline = Date.now() + 18 * 60_000;

function date(y) { return y + '-01-01'; }
function download(y) {
  return new Promise((resolve, reject) => {
    const file = 'xauusd-bid-m15-' + y + '.csv';
    const args = [
      '--no-install', 'dukascopy-node', '-i', 'xauusd',
      '-from', date(y), '-to', date(y + 1),
      '-t', 'm15', '-p', 'bid', '-f', 'csv', '-v',
      '-dir', folder, '-fn', file.replace('.csv', ''),
      '--batch-size', '16', '--batch-pause', '250',
      '--retries', '3', '--request-interval', '35', '--waf-mode', 'off'
    ];
    console.log('[GOLD RESEARCH] downloading', y);
    const child = spawn('npx', args, { shell: process.platform === 'win32', stdio: ['ignore','pipe','pipe'] });
    let errTail = '';
    const poll = setInterval(() => { if (Date.now() > deadline) child.kill('SIGKILL'); }, 2000);
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', buffer => {
        const chunk = String(buffer);
        if (/error|fail|403|429/i.test(chunk)) errTail = chunk.slice(-700);
        if (process.env.GOLD_RESEARCH_VERBOSE === '1') process.stdout.write('['+y+'] '+chunk);
      });
    }
    child.on('error', e => { clearInterval(poll); reject(e); });
    child.on('close', code => {
      clearInterval(poll);
      code === 0 ? resolve(file) : reject(new Error('Dukascopy year '+y+' failed: '+(errTail||code)));
    });
  });
}
async function verify(y, filename) {
  const file=folder+'/'+filename;
  const info=await stat(file);
  if (info.size < 700_000 || info.size > 24*1024*1024) throw Error('Unexpected XAUUSD file size: '+y+':'+info.size);
  const lines=readline.createInterface({input:createReadStream(file),crlfDelay:Infinity});
  let first=null,last=null,count=0,min=Infinity,max=-Infinity;
  for await (const line of lines) {
    if (line.startsWith('timestamp,') || !line.trim()) continue;
    const [time,open,high,low,close] = line.split(',').slice(0,5).map(Number);
    if (![time,open,high,low,close].every(Number.isFinite) ||
      time < Date.parse(date(y)) || time >= Date.parse(date(y+1)) ||
      (last!==null && time<=last) || open<=0 || high<Math.max(open,close,low) || low>Math.min(open,close) ) {
      throw Error('Bad XAUUSD OHLCV or time sequence in '+y);
    }
    if (first===null)first=time;
    last=time;
    min=Math.min(min,low); max=Math.max(max,high);
    count++;
  }
  if (count < 18_000 || first-Date.parse(date(y)) > 9*86_400_000 ||
    Date.parse(date(y+1))-last > 9*86_400_000) throw Error('Missing substantial historical XAUUSD coverage for '+y+': '+count);
  console.log('[GOLD RESEARCH] YEAR '+JSON.stringify({year:y,candles:count,first:new Date(first).toISOString(),last:new Date(last).toISOString(),minPrice:+min.toFixed(2),maxPrice:+max.toFixed(2),bytes:info.size}));
  return {year:y,filename,file,count,first,last,min,max};
}
let cursor=0;
const outputs=[];
async function worker() {
  while(cursor<years.length) {
    const year=years[cursor++];
    const file=await download(year);
    outputs.push(await verify(year,file));
  }
}
await Promise.all(Array.from({length:Math.min(2,years.length)},()=>worker()));
outputs.sort((a,b)=>a.year-b.year);
await writeFile(folder+'/manifest.json',JSON.stringify({
  provider:'Dukascopy',instrument:'XAUUSD',price:'BID',interval:'15m',
  downloaded:new Date().toISOString(),years:outputs
},null,2)+'\n');
console.log('[GOLD RESEARCH] complete',outputs.map(x=>x.year+':'+x.count).join(', '));

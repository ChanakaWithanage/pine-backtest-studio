#!/usr/bin/env node
/**
 * Build-time import of a third-party dataset explicitly marked CC BY 4.0 by
 * its publisher. This is NOT Dukascopy's directly downloaded data.
 * Credit: Yllvar/fx-historical-data (Hugging Face), CC BY 4.0.
 *
 * The process intentionally fails if the source is inaccessible or has a
 * different shape; a deployed "10 year" label must never use synthetic data.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const SOURCE = 'https://huggingface.co/datasets/Yllvar/fx-historical-data/resolve/main/XAUUSD/XAUUSD_M15.parquet';
const SOURCE_PAGE = 'https://huggingface.co/datasets/Yllvar/fx-historical-data/tree/main/XAUUSD';
const EXPECTED_SHA = '252a193f6cc509cb92f13edfc49e48c0ad99a18597f94c7c81dd0cf16813446f';
const DAY = 86_400_000;
const toDay = n => new Date(n).toISOString().slice(0, 10);
const isNum = n => Number.isFinite(n);
const output = new URL('../public/open-gold/', import.meta.url);

const response = await fetch(SOURCE, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
if (!response.ok) throw new Error('Licensed Gold data not available: HTTP ' + response.status);
const bytes = await response.arrayBuffer();
if (bytes.byteLength < 300_000 || bytes.byteLength > 50_000_000) {
  throw new Error('Licensed Gold parquet size is invalid: ' + bytes.byteLength);
}
const digest = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
if (digest !== EXPECTED_SHA) {
  throw new Error('Licensed data file has changed. Review provider update and revise pinned SHA-256 before publishing. Current SHA: ' + digest);
}
const rows = await parquetReadObjects({ file: bytes, compressors });
if (rows.length < 150_000 || rows.length > 600_000) {
  throw new Error('Unexpected Gold M15 row count: ' + rows.length);
}
console.log('[gold] Parquet rows', rows.length, 'first row example:', JSON.stringify(rows[0], (_, v) => typeof v === 'bigint' ? String(v) : v).slice(0, 600));

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'bigint') {
    if (value > 100000000000000000n) return Number(value / 1000000n);
    if (value > 100000000000000n) return Number(value / 1000n);
    if (value > 100000000000n) return Number(value);
    return Number(value) * 1000;
  }
  if (typeof value === 'number') {
    if (value > 1e17) return Math.round(value / 1e6);
    if (value > 1e14) return Math.round(value / 1e3);
    return value > 1e11 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d+$/.test(text)) return toTimestamp(BigInt(text));
    const utc = text.replace(' ', 'T');
    return Date.parse(/Z$|[+-]\d{2}:?\d{2}$/i.test(utc) ? utc : utc + 'Z');
  }
  return NaN;
}

function parseBar(record, i) {
  const o = record.open ?? record.Open ?? record.o;
  const h = record.high ?? record.High ?? record.h;
  const l = record.low ?? record.Low ?? record.l;
  const c = record.close ?? record.Close ?? record.c;
  const v = record.volume ?? record.Volume ?? record.tick_volume ?? record.TickVolume ?? record.v ?? 0;
  const time = toTimestamp(record.Time ?? record.time ?? record.timestamp ?? record.Timestamp ?? record.date ?? record.Date ?? record.ts);
  const bar = { time, open: Number(o), high: Number(h), low: Number(l), close: Number(c), volume: Number(v) };
  if (![bar.time,bar.open,bar.high,bar.low,bar.close,bar.volume].every(isNum) ||
      bar.time < Date.UTC(2000,0,1) || bar.time > Date.now() + DAY ||
      bar.open < 100 || bar.open > 10_000 ||
      bar.low <= 0 || bar.high < Math.max(bar.low,bar.open,bar.close) ||
      bar.low > Math.min(bar.open,bar.close) || bar.volume < 0) {
    throw new Error('Invalid or wrong-unit Gold OHLCV row ' + i + ': ' + JSON.stringify(record,(_,v)=>typeof v==='bigint'?String(v):v).slice(0,450));
  }
  return bar;
}
const all = rows.map(parseBar).sort((a,b)=>a.time-b.time);
const latest = new Date(all.at(-1).time);
const startDate = new Date(all.at(-1).time);
startDate.setUTCFullYear(startDate.getUTCFullYear()-10);
const selected = all.filter(c=>c.time>=startDate.getTime());
if (selected.length < 170_000 || selected.length > 400_000) {
  throw new Error('Expected approximately ten years of M15 data, got ' + selected.length);
}
for(let i=1;i<selected.length;i++) {
  if (selected[i].time <= selected[i-1].time) throw new Error('Overlapping/duplicate Gold candles near '+toDay(selected[i].time));
}
const years = new Map();
for (const c of selected) {
  const year = new Date(c.time).getUTCFullYear();
  if (!years.has(year)) years.set(year,[]);
  years.get(year).push(c);
}
if (years.size < 10) throw new Error('Gold data does not span ten calendar years: '+[...years.keys()]);
await mkdir(output,{recursive:true});
const files=[];
for (const [year,group] of years.entries()) {
  const file='xauusd-m15-'+year+'.csv';
  const csv=['timestamp,open,high,low,close,volume',...group.map(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].join(','))].join('\n')+'\n';
  await writeFile(new URL(file,output),csv);
  files.push({file:'/open-gold/'+file,count:group.length,first:group[0].time,last:group.at(-1).time,bytes:Buffer.byteLength(csv)});
}
const manifest={
  schemaVersion:1,instrument:'XAUUSD',timeframeMinutes:15,
  provider:'Yllvar/fx-historical-data',providerUrl:SOURCE_PAGE,
  sourceUrl:SOURCE, sourceSha256:digest, license:'CC-BY-4.0',
  licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  derivation:'Publisher describes the dataset as derived from Dukascopy market feeds.',
  priceType:'source as published',timezone:'UTC',
  generatedAt:new Date().toISOString(),first:selected[0].time,last:selected.at(-1).time,
  count:selected.length,files,
};
await writeFile(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
await writeFile(new URL('ATTRIBUTION.txt',output),
 'XAUUSD 15-minute historical data by Yllvar/fx-historical-data (Hugging Face)\n'+
 'Source: '+SOURCE_PAGE+'\nLicense: Creative Commons Attribution 4.0 International (CC BY 4.0)\n'+
 'Modified: sliced to the final 10 years in the source, converted from Parquet to yearly UTC CSV; OHLCV prices not modified.\n'+
 'Independent third-party feed, not TVC:GOLD, Bybit TradFi, or Binance PAXGUSDT.\n');
console.log('[gold] Produced '+selected.length.toLocaleString()+' real M15 bars, '+toDay(selected[0].time)+' -> '+toDay(selected.at(-1).time)+', in '+files.length+' UTC-year files. No synthetic candles.');

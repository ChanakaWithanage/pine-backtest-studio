#!/usr/bin/env node
/**
 * Cloudflare Pages build-time personal-history loader.
 *
 * Uses no browser-side trading API or fake price series. Runs only when CF_PAGES=1
 * (or GOLD_HISTORY_BUILD=1), never during normal npm test/build in GitHub CI.
 *
 * Data licensing: Dukascopy's personal-use terms apply. Cloudflare Pages' static
 * assets are public unless protected with Cloudflare Access. The site owner must
 * enable Access before making a private personal dataset available on a live site.
 * No downloaded OHLCV is committed to Git.
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const enabled = process.env.CF_PAGES === '1' || process.env.GOLD_HISTORY_BUILD === '1';
if (!enabled) {
  console.log('[history] Local/CI build: no data fetch (Cloudflare Pages fetches in its build).');
  process.exit(0);
}
const base = new Date();
const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1));
const start = new Date(end);
start.setUTCFullYear(start.getUTCFullYear() - 5);
if (process.env.GOLD_HISTORY_SMOKE === '1') {
  start.setTime(end.getTime() - 4 * 86_400_000);
}
const fmt = date => date.toISOString().slice(0, 10);
const root = fileURLToPath(new URL('../public/history/', import.meta.url));
await mkdir(root, { recursive: true });
const segments = [];
for (let left = new Date(start); left < end;) {
  const nextYear = new Date(Date.UTC(left.getUTCFullYear() + 1, 0, 1));
  const right = nextYear < end ? nextYear : end;
  segments.push({
    from: fmt(left), to: fmt(right),
    filename: 'xauusd-bid-15m-' + fmt(left) + '-' + fmt(right) + '.csv'
  });
  left = right;
}
const maxAgeMs = 17 * 60_000;
const maxFileSize = 24 * 1024 * 1024;
const deadline = Date.now() + maxAgeMs;

function downloadOne(segment) {
  return new Promise((resolve, reject) => {
    const identifier = segment.from.slice(0, 7);
    const args = [
      '--no-install', 'dukascopy-node',
      '-i', 'xauusd', '-from', segment.from, '-to', segment.to,
      '-t', 'm15', '-p', 'bid', '-f', 'csv', '-v',
      '-dir', root, '-fn', segment.filename.replace('.csv', ''),
      '--batch-size', '16', '--batch-pause', '250', '--retries', '3',
      '--request-interval', '30', '--waf-mode', 'off'
    ];
    const child = spawn('npx', args, { shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let lastError = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', buffer => {
        const output = String(buffer);
        if (/error|fail|403|429/i.test(output)) lastError = output.slice(-600);
        if (process.env.GOLD_HISTORY_VERBOSE === '1') process.stdout.write('[' + identifier + '] ' + output);
      });
    }
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error('Historical data download for ' + segment.from + ' failed (' + code + '). ' + lastError)));
    const poll = setInterval(() => {
      if (Date.now() > deadline) {
        child.kill('SIGKILL');
        clearInterval(poll);
        reject(new Error('Five-year download exceeded the Cloudflare build safety deadline.'));
      }
    }, 2000);
    child.once('close', () => clearInterval(poll));
  });
}

async function inspect(segment) {
  const path = root + segment.filename;
  const info = await stat(path);
  if (info.size < 500 || info.size > maxFileSize) throw new Error('Invalid size for ' + segment.filename);
  const rows = readline.createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let count = 0, first = null, last = null;
  for await (const line of rows) {
    if (line.startsWith('timestamp,') || !line.trim()) continue;
    const pieces = line.split(',');
    if (pieces.length < 5) throw new Error('Invalid CSV row in ' + segment.filename);
    const timestamp = Number(pieces[0]);
    if (!Number.isFinite(timestamp) || timestamp < Date.parse(segment.from) ||
        timestamp >= Date.parse(segment.to) || (last !== null && timestamp <= last)) {
      throw new Error('Incorrect or unsorted historical candle in ' + segment.filename);
    }
    if (first === null) first = timestamp;
    last = timestamp; count++;
  }
  if (!count) throw new Error('No candles downloaded for ' + segment.from);
  return { file: '/history/' + segment.filename, count, first, last, bytes: info.size };
}

console.log('[history] Fetching', fmt(start), 'to', fmt(end), 'UTC (exclusive),', segments.length, 'segments.');
// Limited concurrency avoids hammering the data provider.
let cursor = 0;
async function worker() {
  while (cursor < segments.length) {
    const segment = segments[cursor++];
    console.log('[history] Downloading', segment.from, 'to', segment.to);
    await downloadOne(segment);
  }
}
await Promise.all(Array.from({ length: Math.min(2, segments.length) }, () => worker()));
const files = [];
for (const segment of segments) files.push(await inspect(segment));
const total = files.reduce((n, f) => n + f.count, 0);
if (process.env.GOLD_HISTORY_SMOKE !== '1' && total < 90_000) {
  throw new Error('Only ' + total + ' candles returned. Refusing to label an incomplete download as five-year history.');
}
const manifest = {
  schemaVersion: 1,
  instrument: 'XAUUSD',
  provider: 'Dukascopy',
  priceType: 'bid',
  timeframeMinutes: 15,
  requestedFrom: fmt(start),
  requestedToExclusive: fmt(end),
  generatedAt: new Date().toISOString(),
  candleCount: total,
  files
};
await writeFile(root + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('[history] Verified', total.toLocaleString(), 'actual XAUUSD bid candles from',
  new Date(files[0].first).toISOString(), 'through', new Date(files.at(-1).last).toISOString());
console.log('[history] Static output will be copied into dist/history/ during Vite build.');

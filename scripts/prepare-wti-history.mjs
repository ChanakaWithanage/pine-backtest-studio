#!/usr/bin/env node
/**
 * Build-time WTI research dataset: one calendar year of Dukascopy
 * LIGHT.CMD/USD 15-minute BID candles, separate from Gold history.
 *
 * Never commit downloaded candles to Git. Static Cloudflare Pages assets
 * are public unless the deployment is protected with access controls.
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const enabled = process.env.CF_PAGES === '1' || process.env.WTI_HISTORY_BUILD === '1';
if (!enabled) {
  console.log('[WTI] Local/CI build: no WTI download. Run WTI_HISTORY_BUILD=1 npm run build to fetch.');
  process.exit(0);
}
const DAY = 86_400_000;
const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
const start = new Date(end);
start.setUTCFullYear(start.getUTCFullYear() - 1);
const smoke = process.env.WTI_HISTORY_SMOKE === '1';
if (smoke) start.setTime(end.getTime() - 10 * DAY);
const iso = date => date.toISOString().slice(0, 10);
const dir = fileURLToPath(new URL('../public/history/wti/', import.meta.url));
await mkdir(dir, { recursive: true });
const segments = [];
for (let left = new Date(start); left < end;) {
  const nextYear = new Date(Date.UTC(left.getUTCFullYear() + 1, 0, 1));
  const right = nextYear < end ? nextYear : end;
  segments.push({
    from: iso(left), to: iso(right),
    filename: 'wti-bid-15m-' + iso(left) + '-' + iso(right) + '.csv'
  });
  left = right;
}
const deadline = Date.now() + 15 * 60_000;
function downloadOne(segment) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-install', 'dukascopy-node', '-i', 'lightcmdusd',
      '-from', segment.from, '-to', segment.to, '-t', 'm15', '-p', 'bid',
      '-f', 'csv', '-v', '-dir', dir, '-fn', segment.filename.replace('.csv', ''),
      '--batch-size', '12', '--batch-pause', '400',
      '--retries', '3', '--request-interval', '45', '--waf-mode', 'off'
    ];
    const child = spawn('npx', args, { shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let lastError = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', data => {
        const value = String(data);
        if (/error|fail|403|429/i.test(value)) lastError = value.slice(-600);
        if (process.env.WTI_HISTORY_VERBOSE === '1') process.stdout.write('[WTI] ' + value);
      });
    }
    const poll = setInterval(() => {
      if (Date.now() > deadline) child.kill('SIGKILL');
    }, 2000);
    child.on('error', error => { clearInterval(poll); reject(error); });
    child.on('close', code => {
      clearInterval(poll);
      code === 0 ? resolve() : reject(new Error('WTI download failed for ' + segment.from + ': ' + (lastError || 'exit ' + code)));
    });
  });
}
async function inspect(segment) {
  const file = dir + segment.filename;
  const info = await stat(file);
  if (info.size < 500 || info.size > 24 * 1024 * 1024) {
    throw new Error('WTI segment size out of bounds: ' + segment.filename);
  }
  const reader = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let count = 0, first = null, last = null;
  for await (const line of reader) {
    if (/^timestamp,/i.test(line) || !line.trim()) continue;
    const cells = line.split(',');
    if (cells.length < 5) throw new Error('Invalid WTI OHLC row.');
    const [timestamp, open, high, low, close] = cells.slice(0,5).map(Number);
    if (![timestamp, open, high, low, close].every(Number.isFinite) ||
        low <= 0 || high < Math.max(open, low, close) || low > Math.min(open, close) ||
        timestamp < Date.parse(segment.from) || timestamp >= Date.parse(segment.to) ||
        (last !== null && timestamp <= last)) {
      throw new Error('Invalid WTI candle values or timestamps in ' + segment.filename);
    }
    if (first === null) first = timestamp;
    last = timestamp;
    count++;
  }
  if (count < (smoke ? 100 : 1000)) throw new Error('Too few WTI candles in ' + segment.filename);
  return { file: '/history/wti/' + segment.filename, count, first, last, bytes: info.size };
}
console.log('[WTI] Downloading Dukascopy LIGHT.CMD/USD BID 15m from', iso(start), 'through', iso(end), 'exclusive UTC');
await Promise.all(segments.map(segment => downloadOne(segment)));
const files = [];
for (const segment of segments) files.push(await inspect(segment));
const total = files.reduce((sum, file) => sum + file.count, 0);
if (!smoke && (total < 12_000 || files[0].first - start.getTime() > 10 * DAY ||
  end.getTime() - files.at(-1).last > 10 * DAY)) {
  throw new Error('WTI historical data incomplete: ' + total + ' candles in requested year.');
}
const manifest = {
  schemaVersion: 1,
  instrument: 'LIGHT.CMD/USD',
  provider: 'Dukascopy',
  priceType: 'bid',
  timeframeMinutes: 15,
  requestedFrom: iso(start),
  requestedToExclusive: iso(end),
  generatedAt: new Date().toISOString(),
  candleCount: total,
  files
};
await writeFile(dir + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('[WTI] Validated', total.toLocaleString(), '15m BID candles:', new Date(files[0].first).toISOString(), 'to', new Date(files.at(-1).last).toISOString());

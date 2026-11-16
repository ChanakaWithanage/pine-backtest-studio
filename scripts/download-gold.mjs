#!/usr/bin/env node
/**
 * Personal research: download up to five years of Dukascopy XAUUSD history.
 *
 * npm run download:gold
 * npm run download:gold -- 2021-11-16 2026-11-17 m15
 *
 * Dates use UTC. The upper bound is exclusive; tomorrow includes today's
 * already-published bars. Output stays local in data/, never committed.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const now = new Date();
const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
const pastFive = new Date(tomorrow);
pastFive.setUTCFullYear(pastFive.getUTCFullYear() - 5);
const iso = d => d.toISOString().slice(0, 10);

const [from = iso(pastFive), to = iso(tomorrow), timeframe = 'm15'] = process.argv.slice(2);
if (![from, to].every(s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)))) {
  console.error('Dates must be valid YYYY-MM-DD UTC dates.');
  process.exit(1);
}
if (!['m1', 'm5', 'm15', 'm30', 'h1', 'h4', 'd1'].includes(timeframe)) {
  console.error('Unsupported interval. For five years of 15m candles, choose m15.');
  process.exit(1);
}
if (from >= to) {
  console.error('From date must be before to date (exclusive).');
  process.exit(1);
}
await mkdir('data', { recursive: true });
const cmd = 'npx';
const filename = 'xauusd-' + timeframe + '-bid-' + from + '-' + to;
const args = [
  '--yes', 'dukascopy-node', '-i', 'xauusd', '-from', from, '-to', to,
  '-t', timeframe, '-f', 'csv', '-v', '-dir', './data', '-fn', filename,
  '--cache', '--retries', '3', '--batch-size', '5', '--batch-pause', '1500'
];
console.log('Downloading Dukascopy XAUUSD', timeframe, 'from', from, 'to', to, '(exclusive UTC)');
console.log('Expected file:', 'data/' + filename + '.csv');
console.log('For personal research use; do not redistribute data without permission.');
const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('error', err => { console.error(err.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });

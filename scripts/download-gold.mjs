#!/usr/bin/env node
/**
 * Download historical Dukascopy XAUUSD data outside the browser.
 * Usage: npm run download:gold -- 2023-11-16 2026-11-16 m15
 * Output is deliberately ignored by Git because data licensing and file size vary.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const [from = '2023-11-16', to = '2026-11-16', timeframe = 'm15'] = process.argv.slice(2);
if (![from, to].every(s => /^\d{4}-\d{2}-\d{2}$/.test(s))) {
  console.error('Dates must use YYYY-MM-DD.');
  process.exit(1);
}
if (!['m1', 'm5', 'm15', 'm30', 'h1', 'h4', 'd1'].includes(timeframe)) {
  console.error('Unsupported interval. Try m15.');
  process.exit(1);
}
if (from >= to) {
  console.error('From date must be before to date (exclusive).');
  process.exit(1);
}
await mkdir('data', { recursive: true });
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  'dukascopy-node', '-i', 'xauusd', '-from', from, '-to', to,
  '-t', timeframe, '-f', 'csv', '-v', '-dir', './data', '--cache',
  '--retries', '3', '--batch-pause', '1000'
];
const child = spawn(cmd, args, { stdio: 'inherit', shell: false });
child.on('error', err => { console.error(err.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });

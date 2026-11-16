import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runBacktest } from '../src/lib/backtest.ts';
import { createDemoCandles } from '../src/lib/demo.ts';

test('the original Gold Breakout 15M v1.1.0 is shipped as default source', () => {
  const content = readFileSync(new URL('../samples/gold-breakout-15m.pine', import.meta.url), 'utf8');
  assert.match(content, /^\/\/@version=6/);
  assert.match(content, /Gold Breakout 15M Strategy/);
  assert.match(content, /Version: 1\.1\.0/);
  assert.match(content, /strategy\s*\(/);
  assert.ok(content.length > 50_000, 'expect the full original strategy, not a simplified example');
});


test('default Gold Breakout v1.1.0 can be compiled and evaluated by PineTS', { timeout: 90_000 }, async () => {
  const source = readFileSync(new URL('../samples/gold-breakout-15m.pine', import.meta.url), 'utf8');
  const outcome = await runBacktest(source, createDemoCandles().slice(0, 350));
  assert.ok(Number.isFinite(outcome.netProfit));
  assert.ok(Array.isArray(outcome.trades));
});

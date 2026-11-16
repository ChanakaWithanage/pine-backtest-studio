import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

test('the original Gold Breakout 15M v1.1.0 is shipped as default source', () => {
  const content = readFileSync(new URL('../samples/gold-breakout-15m.pine', import.meta.url), 'utf8');
  assert.match(content, /^\/\/@version=6/);
  assert.match(content, /Gold Breakout 15M Strategy/);
  assert.match(content, /Version: 1\.1\.0/);
  assert.match(content, /strategy\s*\(/);
  assert.ok(content.length > 50_000, 'expect the full original strategy, not a simplified example');
});

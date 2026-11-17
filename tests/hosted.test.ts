import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseHostedManifest } from '../src/lib/hosted.ts';

test('accepts valid Dukascopy 15m history manifest', () => {
  const manifest = {
    schemaVersion: 1, instrument: 'XAUUSD', provider: 'Dukascopy',
    priceType: 'bid', timeframeMinutes: 15, requestedFrom: '2021-11-16',
    requestedToExclusive: '2026-11-17', generatedAt: '2026-11-16T00:00:00Z',
    candleCount: 2,
    files: [{ file: '/history/xauusd-bid-15m-2021-11-16-2022-01-01.csv',
      count: 2, first: 1637020800000, last: 1637021700000, bytes: 1200 }]
  };
  assert.equal(parseHostedManifest(manifest).files.length, 1);
  assert.throws(() => parseHostedManifest({ ...manifest, candleCount: 3 }), /Invalid candle count/);
  assert.throws(() => parseHostedManifest({ ...manifest, instrument: 'TVC:GOLD' }), /Unrecognized/);
  assert.throws(() => parseHostedManifest({ ...manifest,
    files: [{ ...manifest.files[0], file: 'https://evil.example/file.csv' }] }), /invalid data file/);
});


test('accepts eleven yearly segments needed for ten years of XAUUSD', () => {
  const files = Array.from({ length: 11 }, (_, i) => ({
    file: '/history/xauusd-bid-15m-' + (2016 + i) + '-01-01-' + (2017 + i) + '-01-01.csv',
    count: 1,
    first: Date.UTC(2016 + i, 0, 2),
    last: Date.UTC(2016 + i, 0, 2),
    bytes: 1200
  }));
  const manifest = {
    schemaVersion: 1, instrument: 'XAUUSD', provider: 'Dukascopy',
    priceType: 'bid', timeframeMinutes: 15, requestedFrom: '2016-11-17',
    requestedToExclusive: '2026-11-18', generatedAt: '2026-11-17T00:00:00Z',
    candleCount: files.length, files
  };
  assert.equal(parseHostedManifest(manifest).files.length, 11);
  assert.throws(() => parseHostedManifest({
    ...manifest,
    files: [...files, ...files, ...files],
    candleCount: files.length * 3
  }), /Unrecognized/);
});

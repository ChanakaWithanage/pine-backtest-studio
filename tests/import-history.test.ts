import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { gzipSync, strToU8, zipSync } from 'fflate';
import { parseHistoryArchive, importHistoryFiles } from '../src/lib/import-history.ts';

function goldYear(year: number) {
  const start = Date.UTC(year, 0, 4, 8, 0, 0);
  return [
    { ts: start / 1000, o: 1200, h: 1201, l: 1199, c: 1200.5, v: 50 },
    { ts: (start + 900000) / 1000, o: 1200.5, h: 1202, l: 1200, c: 1201, v: 60 }
  ];
}
test('reads 15-minute Gold candles from JSON.gz without changing OHLC values', () => {
  const bars = parseHistoryArchive(gzipSync(strToU8(JSON.stringify(goldYear(2016)))), 'XAUUSD_2016.json.gz');
  assert.equal(bars.length, 1);
  assert.equal(bars[0].length, 2);
  assert.equal(bars[0][0].time, Date.UTC(2016, 0, 4, 8));
  assert.equal(bars[0][0].close, 1200.5);
  assert.equal(bars[0][1].volume, 60);
});
test('reads ten years of Gold yearly JSON.gz segments from a ZIP', async () => {
  const zipped: Record<string, Uint8Array> = {};
  for (let year = 2016; year <= 2025; year++) {
    zipped['XAUUSD/M15/' + year + '.json.gz'] = gzipSync(strToU8(JSON.stringify(goldYear(year))));
  }
  const data = zipSync(zipped);
  const parts = parseHistoryArchive(data, 'gold-ten-years.zip');
  assert.equal(parts.length, 10);
  const combined = await importHistoryFiles([new File([data], 'gold-ten-years.zip')]);
  assert.equal(combined.length, 20);
  assert.equal(combined[0].time, Date.UTC(2016, 0, 4, 8));
  assert.equal(combined[combined.length - 1].time, Date.UTC(2025, 0, 4, 8, 15));
});
test('rejects invalid source candle values and missing JSON data', () => {
  const bad = JSON.stringify([{ ...goldYear(2026)[0], h: 1198 }, goldYear(2026)[1]]);
  assert.throws(() => parseHistoryArchive(strToU8(bad), 'bad.json'), /invalid OHLCV/);
  assert.throws(() => parseHistoryArchive(strToU8('{}'), 'bad.json'), /candle array/);
});
test('rejects ZIP archives with no supported historical file', () => {
  const zip = zipSync({ 'readme.md': strToU8('not market candles') });
  assert.throws(() => parseHistoryArchive(zip, 'empty.zip'), /no supported/);
});

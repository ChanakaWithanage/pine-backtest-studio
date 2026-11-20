import type { HostedHistoryPart } from './hosted.ts';

export interface Sp500HostedManifest {
  schemaVersion: 1;
  instrument: 'USA500.IDX/USD';
  provider: 'Dukascopy';
  priceType: 'bid';
  timeframeMinutes: 15;
  requestedFrom: string;
  requestedToExclusive: string;
  generatedAt: string;
  candleCount: number;
  files: HostedHistoryPart[];
}

export function parseSp500Manifest(value: unknown): Sp500HostedManifest {
  if (!value || typeof value !== 'object') throw new Error('Missing S&P 500 historical data manifest.');
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== 1 ||
      manifest.instrument !== 'USA500.IDX/USD' ||
      manifest.provider !== 'Dukascopy' ||
      manifest.priceType !== 'bid' ||
      manifest.timeframeMinutes !== 15 ||
      !Array.isArray(manifest.files) ||
      manifest.files.length < 1 || manifest.files.length > 3 ||
      typeof manifest.candleCount !== 'number' ||
      typeof manifest.requestedFrom !== 'string' ||
      typeof manifest.requestedToExclusive !== 'string') {
    throw new Error('Unrecognized S&P 500 data manifest.');
  }
  const files = manifest.files as HostedHistoryPart[];
  const pathPattern = new RegExp('^/history/sp500/sp500-bid-15m-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]csv$');
  if (files.some(part =>
    typeof part.file !== 'string' || !pathPattern.test(part.file) ||
    !Number.isSafeInteger(part.count) || part.count <= 0 ||
    !Number.isFinite(part.first) || !Number.isFinite(part.last) ||
    part.last < part.first || !Number.isFinite(part.bytes) || part.bytes < 500)) {
    throw new Error('Invalid S&P 500 history file in manifest.');
  }
  if (files.reduce((sum, part) => sum + part.count, 0) !== manifest.candleCount ||
      manifest.candleCount < 1 || manifest.candleCount > 100_000) {
    throw new Error('S&P 500 history candle count mismatch.');
  }
  return value as Sp500HostedManifest;
}

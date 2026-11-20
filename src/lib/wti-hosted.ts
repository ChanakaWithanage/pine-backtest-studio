import type { HostedHistoryPart } from './hosted.ts';

export interface WtiHostedManifest {
  schemaVersion: 1;
  instrument: 'LIGHT.CMD/USD';
  provider: 'Dukascopy';
  priceType: 'bid';
  timeframeMinutes: 15;
  requestedFrom: string;
  requestedToExclusive: string;
  generatedAt: string;
  candleCount: number;
  files: HostedHistoryPart[];
}

export function parseWtiManifest(value: unknown): WtiHostedManifest {
  if (!value || typeof value !== 'object') throw new Error('Missing WTI historical data manifest.');
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== 1 ||
      manifest.instrument !== 'LIGHT.CMD/USD' ||
      manifest.provider !== 'Dukascopy' ||
      manifest.priceType !== 'bid' ||
      manifest.timeframeMinutes !== 15 ||
      !Array.isArray(manifest.files) ||
      manifest.files.length < 1 || manifest.files.length > 3 ||
      typeof manifest.candleCount !== 'number' ||
      typeof manifest.requestedFrom !== 'string' ||
      typeof manifest.requestedToExclusive !== 'string') {
    throw new Error('Unrecognized WTI data manifest.');
  }
  const files = manifest.files as HostedHistoryPart[];
  if (files.some(part =>
    typeof part.file !== 'string' ||
    !new RegExp('^/history/wti/wti-bid-15m-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]csv
    !Number.isSafeInteger(part.count) || part.count <= 0 ||
    !Number.isFinite(part.first) || !Number.isFinite(part.last) ||
    part.last < part.first || !Number.isFinite(part.bytes) || part.bytes < 500)) {
    throw new Error('Invalid WTI history file in manifest.');
  }
  if (files.reduce((sum, part) => sum + part.count, 0) !== manifest.candleCount ||
      manifest.candleCount < 1 || manifest.candleCount > 100_000) {
    throw new Error('WTI history candle count mismatch.');
  }
  return value as WtiHostedManifest;
}
).test(part.file) ||
    !Number.isSafeInteger(part.count) || part.count <= 0 ||
    !Number.isFinite(part.first) || !Number.isFinite(part.last) ||
    part.last < part.first || !Number.isFinite(part.bytes) || part.bytes < 500)) {
    throw new Error('Invalid WTI history file in manifest.');
  }
  if (files.reduce((sum, part) => sum + part.count, 0) !== manifest.candleCount ||
      manifest.candleCount < 1 || manifest.candleCount > 100_000) {
    throw new Error('WTI history candle count mismatch.');
  }
  return value as WtiHostedManifest;
}

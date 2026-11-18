export interface HostedHistoryPart {
  file: string;
  count: number;
  first: number;
  last: number;
  bytes: number;
}

export interface HostedHistoryManifest {
  schemaVersion: 1;
  instrument: 'XAUUSD';
  provider: 'Dukascopy';
  priceType: 'bid';
  timeframeMinutes: 15;
  requestedFrom: string;
  requestedToExclusive: string;
  generatedAt: string;
  candleCount: number;
  files: HostedHistoryPart[];
}

export function parseHostedManifest(value: unknown): HostedHistoryManifest {
  if (!value || typeof value !== 'object') throw new Error('Missing historical data manifest.');
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== 1 || manifest.instrument !== 'XAUUSD' ||
      manifest.provider !== 'Dukascopy' || manifest.priceType !== 'bid' ||
      manifest.timeframeMinutes !== 15 || !Array.isArray(manifest.files) ||
      manifest.files.length < 1 || manifest.files.length > 14 ||
      typeof manifest.candleCount !== 'number') {
    throw new Error('Unrecognized XAUUSD history manifest.');
  }
  const files = manifest.files as HostedHistoryPart[];
  if (files.some(part =>
    typeof part.file !== 'string' ||
    !/^\/history\/xauusd-bid-15m-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/.test(part.file) ||
    !Number.isSafeInteger(part.count) || part.count <= 0 ||
    !Number.isFinite(part.first) || !Number.isFinite(part.last) ||
    part.last < part.first || !Number.isFinite(part.bytes) || part.bytes < 500)) {
    throw new Error('History manifest contains an invalid data file.');
  }
  if (files.reduce((n, part) => n + part.count, 0) !== manifest.candleCount ||
      manifest.candleCount < 1 || manifest.candleCount > 400_000) {
    throw new Error('Invalid candle count in history manifest.');
  }
  return value as HostedHistoryManifest;
}


/**
 * Cloudflare Pages can return the site's index.html with HTTP 200 for an
 * unknown /history/manifest.json path (SPA fallback). A HEAD/response.ok
 * check therefore does NOT prove that private Gold history is installed.
 *
 * Return null for absent or HTML fallback responses. Validate the JSON
 * structure before enabling a hosted-history button.
 */
export async function readHostedHistoryManifest(response: Response): Promise<HostedHistoryManifest | null> {
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    throw new Error('Historical manifest request failed (HTTP ' + response.status + ').');
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  // The manifest is small. Limit unexpected payloads rather than accepting a
  // large HTML error page or downloading a large response as "manifest" JSON.
  const body = await response.text();
  if (body.length > 512 * 1024) {
    throw new Error('Historical manifest is unexpectedly large.');
  }
  const trimmed = body.trimStart();
  if (contentType.includes('text/html') || trimmed.startsWith('<')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Historical manifest contains invalid JSON. Check /history/manifest.json.');
  }
  return parseHostedManifest(parsed);
}

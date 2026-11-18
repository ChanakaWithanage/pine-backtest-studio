/** Manifest validation for the credited CC BY 4.0 XAUUSD M15 dataset. */
export interface LicensedGoldYear {
  file: string;
  count: number;
  first: number;
  last: number;
  bytes: number;
}
export interface LicensedGoldManifest {
  schemaVersion: 1;
  instrument: 'XAUUSD';
  timeframeMinutes: 15;
  provider: 'Yllvar/fx-historical-data';
  providerUrl: string;
  license: 'CC-BY-4.0';
  licenseUrl: string;
  generatedAt: string;
  first: number;
  last: number;
  count: number;
  files: LicensedGoldYear[];
}

export function parseLicensedGoldManifest(value: unknown): LicensedGoldManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Gold history manifest is missing.');
  const obj = value as Record<string, unknown>;
  if (obj.schemaVersion !== 1 || obj.instrument !== 'XAUUSD' || obj.timeframeMinutes !== 15 ||
      obj.provider !== 'Yllvar/fx-historical-data' || obj.license !== 'CC-BY-4.0' ||
      typeof obj.providerUrl !== 'string' ||
      !obj.providerUrl.startsWith('https://huggingface.co/datasets/Yllvar/fx-historical-data') ||
      obj.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/' ||
      !Array.isArray(obj.files) || obj.files.length < 10 || obj.files.length > 12 ||
      !Number.isSafeInteger(obj.count) || (obj.count as number) < 170_000 ||
      (obj.count as number) > 400_000 ||
      !Number.isFinite(obj.first) || !Number.isFinite(obj.last)) {
    throw new Error('Gold history manifest has an invalid source, license or coverage.');
  }
  const files = obj.files as LicensedGoldYear[];
  if (files.some(x => !x || typeof x.file !== 'string' ||
      !/^\/open-gold\/xauusd-m15-20\d{2}\.csv$/.test(x.file) ||
      !Number.isSafeInteger(x.count) || x.count <= 0 ||
      !Number.isFinite(x.first) || !Number.isFinite(x.last) ||
      x.first > x.last || !Number.isSafeInteger(x.bytes) || x.bytes < 200)) {
    throw new Error('Gold history manifest contains an invalid CSV segment.');
  }
  if (files.some((x, i) => i > 0 &&
      (x.first <= files[i - 1].last || x.file === files[i - 1].file)) ||
      files[0].first !== obj.first || files.at(-1)!.last !== obj.last ||
      files.reduce((n,x) => n+x.count,0) !== obj.count) {
    throw new Error('Gold history manifest segments are inconsistent.');
  }
  return value as LicensedGoldManifest;
}

export async function readLicensedGoldManifest(response: Response): Promise<LicensedGoldManifest | null> {
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error('Gold history manifest unavailable (HTTP '+response.status+').');
  const text=await response.text();
  if (text.length>300_000) throw new Error('Gold history manifest exceeds safe size.');
  if (response.headers.get('content-type')?.includes('text/html') || text.trimStart().startsWith('<')) return null;
  let payload: unknown;
  try { payload=JSON.parse(text); }
  catch { throw new Error('Gold history manifest returned invalid JSON.'); }
  return parseLicensedGoldManifest(payload);
}

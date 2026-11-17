import type { Candle } from '../types';

const DB_NAME = 'pine-backtest-studio-v2';
const STORE = 'datasets';
const VERSION = 1;

export interface SavedDatasetSummary {
  id: string;
  name: string;
  symbol: string;
  savedAt: number;
  count: number;
  first: number;
  last: number;
  interval: number;
}
export interface SavedDataset extends SavedDatasetSummary { candles: Candle[]; }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser storage request failed.'));
  });
}

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Local dataset saving is not supported by this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open local dataset storage.'));
    req.onblocked = () => reject(new Error('Close other tabs of this backtester and try again.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openVault();
  try {
    return await requestResult(fn(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

export async function listSavedDatasets(): Promise<SavedDatasetSummary[]> {
  const all = await withStore<SavedDataset[]>('readonly', store => store.getAll());
  return all.map(({ candles: _candles, ...summary }) => summary)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadSavedDataset(id: string): Promise<SavedDataset> {
  const found = await withStore<SavedDataset | undefined>('readonly', store => store.get(id));
  if (!found) throw new Error('Saved dataset was not found. Browser storage may have been cleared.');
  return found;
}

export async function deleteSavedDataset(id: string): Promise<void> {
  await withStore<undefined>('readwrite', store => store.delete(id));
}

export async function saveDatasetLocally(input: {
  name: string; symbol: string; candles: Candle[]; interval: number;
}): Promise<SavedDatasetSummary> {
  if (!input.candles.length || input.candles.length > 400_000) {
    throw new Error('Choose a valid dataset with at most 400,000 candles.');
  }
  const row: SavedDataset = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2),
    name: input.name.trim().slice(0, 100) || 'Imported OHLCV',
    symbol: input.symbol.trim().slice(0, 24) || 'Unverified',
    savedAt: Date.now(),
    count: input.candles.length,
    first: input.candles[0].time,
    last: input.candles[input.candles.length - 1].time,
    interval: input.interval,
    candles: input.candles
  };
  try {
    await withStore<IDBValidKey>('readwrite', store => store.put(row));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Browser storage is full. Download your CSV and remove older saved datasets.');
    }
    throw error;
  }
  const { candles: _candles, ...summary } = row;
  return summary;
}

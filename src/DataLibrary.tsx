import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Database, Download, Info, Save, Star, Trash2, UploadCloud } from 'lucide-react';
import type { Candle } from './types';
import { exportCandles, inferIntervalMinutes } from './lib/csv';
import { sortMarketShortcuts } from './lib/market-catalog';
import { deleteSavedDataset, listSavedDatasets, loadSavedDataset, saveDatasetLocally, type SavedDatasetSummary } from './lib/dataset-vault';
import './v2.css';

interface Props {
  bars: Candle[];
  name: string;
  demo: boolean;
  onImport: (files: FileList | null) => void;
  onRestore: (bars: Candle[], name: string) => void;
}

const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function downloadCsv(candles: Candle[], label: string) {
  const blob = new Blob([exportCandles(candles)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = label.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataLibrary({ bars, name, demo, onImport, onRestore }: Props) {
  const csvInput = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState('XAUUSD');
  const [dragging, setDragging] = useState(false);
  const [saved, setSaved] = useState<SavedDatasetSummary[]>([]);
  const [status, setStatus] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('pine-v2-favorite-markets') ?? '[]');
      return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];
    } catch { return []; }
  });
  const markets = useMemo(() => sortMarketShortcuts(favorites), [favorites]);

  const refresh = async () => {
    try { setSaved(await listSavedDatasets()); }
    catch { setStatus('Local dataset storage is unavailable in this browser. CSV import and download still work.'); }
  };
  useEffect(() => { void refresh(); }, []);

  function toggleFavorite(symbol: string) {
    setFavorites(previous => {
      const next = previous.includes(symbol) ? previous.filter(s => s !== symbol) : [...previous, symbol];
      try { localStorage.setItem('pine-v2-favorite-markets', JSON.stringify(next)); } catch { /* private browsing */ }
      return next;
    });
  }
  async function remember() {
    if (demo) { setStatus('Import actual market candles before saving a dataset. The current example is synthetic.'); return; }
    try {
      const record = await saveDatasetLocally({
        name, symbol: chosen, interval: inferIntervalMinutes(bars), candles: bars
      });
      await refresh();
      setStatus('Saved ' + record.count.toLocaleString() + ' candles locally. Download a CSV backup as well.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not save dataset.'); }
  }
  async function restore(id: string) {
    try {
      const record = await loadSavedDataset(id);
      setChosen(record.symbol);
      onRestore(record.candles, record.name);
      setStatus('Loaded ' + record.name + '. Confirm instrument settings and cost assumptions.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Saved data is unavailable.'); }
  }
  async function forget(id: string) {
    try { await deleteSavedDataset(id); await refresh(); setStatus('Removed saved data from this browser.'); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to delete data.'); }
  }
  const upload = (files: FileList | null) => {
    if (files?.length) onImport(files);
    if (csvInput.current) csvInput.current.value = '';
  };
  return <section className="v2-library" id="data-library" aria-label="Market data library">
    <header className="v2-library-head">
      <div>
        <small>STEP 1 / MARKET DATA</small>
        <h2>Data library</h2>
        <p>Pick a market, obtain permitted historical candles, and import CSVs here. Pin your most-used markets for next time.</p>
      </div>
      <button className="v2-plain-btn" onClick={() => downloadCsv(bars, (demo ? 'synthetic-example' : name) + '-' + date(bars[0].time))}>
        <Download size={16}/> Download current CSV
      </button>
    </header>
    <div className="v2-cards">
      {markets.map(market => <article className={'v2-market ' + (chosen === market.symbol ? 'chosen' : '')} key={market.symbol}>
        <div className="v2-market-header">
          <div><small>{market.category} · {market.suggestedTimeframe}</small><strong>{market.symbol}</strong><span>{market.name}</span></div>
          <button title="Favorite market" aria-label={(favorites.includes(market.symbol) ? 'Remove ' : 'Add ') + market.symbol + ' favorite'} aria-pressed={favorites.includes(market.symbol)} className={'v2-fav ' + (favorites.includes(market.symbol) ? 'active' : '')} onClick={() => toggleFavorite(market.symbol)}><Star size={18} fill={favorites.includes(market.symbol) ? 'currentColor' : 'none'}/></button>
        </div>
        <p>{market.description}</p>
        <div className="v2-market-actions">
          <button onClick={() => { setChosen(market.symbol); setStatus('Selected ' + market.symbol + '. This does not load or verify a price feed. Import the matching CSV to continue.'); }}>{chosen === market.symbol ? 'Selected' : 'Select'}</button>
          <a href={market.providerUrl} target="_blank" rel="noreferrer" title={market.provider}>Get historical data <ArrowUpRight size={14}/></a>
        </div>
        {chosen === market.symbol && <small className="v2-tip">{market.note}</small>}
      </article>)}
    </div>
    <div className="v2-data-actions">
      <div className={'v2-drop ' + (dragging ? 'dragging' : '')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}>
        <UploadCloud size={28}/>
        <strong>Drag and drop your historical CSV files</strong>
        <p>Upload multiple files from the same market and timeframe. The data is processed in your browser, not sent to our server.</p>
        <input ref={csvInput} type="file" multiple accept=".csv,text/csv" hidden onChange={e => upload(e.target.files)} aria-label="Import historical price CSV"/>
        <button className="v2-accent-btn" onClick={() => csvInput.current?.click()}><UploadCloud size={15}/> Choose CSV files</button>
        <small>CSV columns: timestamp, open, high, low, close; volume is optional. UTC preferred.</small>
      </div>
      <div className="v2-saved">
        <div className="v2-saved-title"><Database size={19}/><strong>My saved datasets</strong><small>Private to this browser</small></div>
        <p>Save imported data for reuse on this device. Download a CSV backup; browser storage can be cleared or evicted.</p>
        <div className="v2-saved-controls">
          <button disabled={demo} onClick={() => void remember()}><Save size={14}/> Save current dataset</button>
          <button onClick={() => downloadCsv(bars, (demo ? 'synthetic-example' : name) + '-' + date(bars[0].time))}><Download size={14}/> Export CSV</button>
        </div>
        {saved.length ? <ul className="v2-saved-list">{saved.map(item => <li key={item.id}>
          <div><strong>{item.name}</strong><small>{item.symbol} (user label) · {item.interval}m · {item.count.toLocaleString()} bars · {date(item.first)}–{date(item.last)}</small></div>
          <button onClick={() => void restore(item.id)} aria-label={'Load ' + item.name}>Load</button>
          <button onClick={() => void forget(item.id)} aria-label={'Delete ' + item.name} title="Remove dataset"><Trash2 size={15}/></button>
        </li>)}</ul> : <div className="v2-no-saved">No saved datasets yet. Import a CSV, then select “Save current dataset.”</div>}
        {status && <p role="status" className="v2-status">{status}</p>}
      </div>
    </div>
    <p className="v2-disclaimer"><Info size={15}/> Market shortcuts open external provider pages. No third-party historical market data is bundled, redistributed, or automatically fetched. All imported symbols and prices remain unverified.</p>
  </section>;
}

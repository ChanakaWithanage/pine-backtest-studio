import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight, CircleAlert, Clock3, Code2, Download, FileCode2, FileDown, FolderOpen, Github, Info, Layers3, Play, RotateCcw, Settings2, ShieldCheck, UploadCloud } from 'lucide-react';
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, type UTCTimestamp } from 'lightweight-charts';
import { createDemoCandles } from './lib/demo';
import GoldBreakoutSource from '../samples/gold-breakout-15m.pine?raw';
import WtiBreakoutSource from '../samples/wti-oil-breakout-15m.pine?raw';
import BacktestAnalysis from './BacktestAnalysis';
import { DEFAULT_CONTRACT } from './lib/csv-provider';
import { DEFAULT_FEES, DEFAULT_BYBIT, planExecutionCosts, type FeeSettings, type BybitSettings } from './lib/commissions';
import { BybitSettingsPanel, BybitResultsPanel } from './BybitComponents';
import { parseHostedManifest } from './lib/hosted';
import { parseWtiManifest } from './lib/wti-hosted';
import { checkRequestedCoverage, getHistoryCoverage, mergeCandleBatches, pastYearsFromLastCandle } from './lib/history';
import { exportTrades, inferIntervalMinutes, parseCsv, resampleCandles } from './lib/csv';
import type { Candle, Results, Trade, ContractSettings, WorkerResponse } from './types';

const REPO = 'https://github.com/ChanakaWithanage/pine-backtest-studio';
const HISTORY_URL = import.meta.env.VITE_GOLD_HISTORY_URL?.trim() || '';
const WTI_CONTRACT: ContractSettings = { pointvalue: 100, mincontract: 1, mintick: 0.01 };
const OPTIONS = [{ value: 3, label: '3 minutes' }, { value: 5, label: '5 minutes' }, { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' }, { value: 60, label: '1 hour' }, { value: 240, label: '4 hours' }];
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const money = (n: number) => Number.isFinite(n) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n) : '—';
const num = (n: number, digits = 2) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const utc = (ms: number) => Number.isFinite(ms) ? new Date(ms).toLocaleString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const DEMO = createDemoCandles();

function save(text: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PriceChart({ bars, trades }: { bars: Candle[]; trades: Trade[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !bars.length) return;
    const chart = createChart(ref.current, {
      autoSize: true, height: 340,
      layout: { background: { type: ColorType.Solid, color: '#111b29' }, textColor: '#91a0b2', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: '#1d2a3a' }, horzLines: { color: '#1d2a3a' } },
      timeScale: { timeVisible: true, borderColor: '#27394a' },
      rightPriceScale: { borderColor: '#27394a' }
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: '#38c7ac', downColor: '#ef7985', wickUpColor: '#38c7ac', wickDownColor: '#ef7985', borderVisible: false, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    const shown = bars.slice(-1500);
    series.setData(shown.map(b => ({ time: Math.floor(b.time / 1000) as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    const beginning = shown[0].time;
    const markers = trades.flatMap(t => {
      const m: Array<{ time: UTCTimestamp; position: 'aboveBar' | 'belowBar'; shape: 'arrowUp' | 'arrowDown'; color: string; text: string }> = [];
      if (t.entryTime >= beginning) m.push({ time: Math.floor(t.entryTime / 1000) as UTCTimestamp, position: t.direction === 'Long' ? 'belowBar' : 'aboveBar', shape: t.direction === 'Long' ? 'arrowUp' : 'arrowDown', color: t.direction === 'Long' ? '#38c7ac' : '#ef7985', text: t.direction === 'Long' ? 'L' : 'S' });
      if (t.exitTime >= beginning) m.push({ time: Math.floor(t.exitTime / 1000) as UTCTimestamp, position: t.direction === 'Long' ? 'aboveBar' : 'belowBar', shape: t.direction === 'Long' ? 'arrowDown' : 'arrowUp', color: '#e5bf70', text: 'X' });
      return m;
    }).sort((a, b) => a.time - b.time);
    if (markers.length) createSeriesMarkers(series, markers);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, trades]);
  return <div className="price-chart" ref={ref} aria-label="Price chart with entry and exit markers" />;
}

/**
 * Official TradingView chart embed. It has NO programmatic candle/strategy data
 * interface. Keep it isolated from the CSV price series and the PineTS engine.
 */
function GoldReferenceChart({ timeframe }: { timeframe: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    inner.style.width = '100%';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: 'TVC:GOLD',
      interval: String(timeframe),
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      withdateranges: true,
      allow_symbol_change: false,
      save_image: false,
      support_host: 'https://www.tradingview.com'
    });
    node.replaceChildren(inner, script);
    return () => node.replaceChildren();
  }, [timeframe]);
  return <div ref={host} className="tv-gold-embed tradingview-widget-container" aria-label="TradingView TVC:GOLD reference chart" />;
}

function EquityChart({ results }: { results: Results | null }) {
  if (!results || results.equity.length < 2) return <div className="empty-equity"><BarChart3 size={25}/>{results ? 'No closed trades in this period' : 'Run a strategy to display the equity curve'}</div>;
  const values = results.equity.map(p => p.value);
  const low = Math.min(...values), high = Math.max(...values);
  const range = high - low || 1;
  const points = values.map((v, i) => (i === 0 ? 'M' : 'L') + (i / (values.length - 1) * 1000).toFixed(2) + ' ' + (180 - ((v - low) / range) * 140).toFixed(2)).join(' ');
  const good = values[values.length - 1] >= values[0];
  return <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="equity-svg" role="img" aria-label="Realized closed-trade equity">
    <defs><linearGradient id="equity-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={good ? '#38c7ac' : '#ef7985'} stopOpacity=".3"/><stop offset="1" stopColor={good ? '#38c7ac' : '#ef7985'} stopOpacity="0"/></linearGradient></defs>
    {[50,100,150].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="#293748" strokeDasharray="4 5"/>)}
    <path d={points + ' L1000 200 L0 200 Z'} fill="url(#equity-gradient)"/>
    <path d={points} stroke={good ? '#38c7ac' : '#ef7985'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" fill="none"/>
  </svg>;
}

function Metric({ label, value, caption, kind = '' }: { label: string; value: string; caption: string; kind?: string }) {
  return <div className="metric"><div className="metric-label">{label}</div><div className={'metric-value ' + kind}>{value}</div><div className="metric-caption">{caption}</div></div>;
}

export default function App() {
  const [bars, setBars] = useState<Candle[]>(DEMO);
  const [name, setName] = useState('Synthetic sample');
  const [demo, setDemo] = useState(true);
  const [code, setCode] = useState(GoldBreakoutSource);
  const [scriptName, setScriptName] = useState('gold-breakout-15m.pine');
  const [tf, setTf] = useState(15);
  const [chartView, setChartView] = useState<'backtest' | 'reference'>('backtest');
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState('');
  const [dataSource, setDataSource] = useState<'demo' | 'csv' | 'dukascopy' | 'wti'>('demo');
  const autoLoadStarted = useRef(false);
  const historyRequestSeq = useRef(0);
  const csvModeRef = useRef<'replace' | 'append'>('replace');
  const [contract, setContract] = useState<ContractSettings>({ ...DEFAULT_CONTRACT });
  const [fees, setFees] = useState<FeeSettings>({ ...DEFAULT_FEES, bybit: { ...DEFAULT_BYBIT } });
  const [start, setStart] = useState(day(DEMO[0].time));
  const [end, setEnd] = useState(day(DEMO[DEMO.length - 1].time));
  const [results, setResults] = useState<Results | null>(null);
  const updateBybit = (changes: Partial<BybitSettings>) => {
    setFees(previous => ({ ...previous, bybit: { ...(previous.bybit ?? DEFAULT_BYBIT), ...changes } }));
    setResults(null);
  };
  const [usedBars, setUsedBars] = useState(0);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<'editor' | 'guide'>('editor');
  const [showCount, setShowCount] = useState(10);
  const csvRef = useRef<HTMLInputElement>(null);
  const pineRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    // Cloudflare builds generate /history/manifest.json. When missing (e.g.
    // local dev) the app stays in its clearly marked synthetic demo state.
    if (autoLoadStarted.current) return;
    autoLoadStarted.current = true;
    void loadCloudflareHistory(true, new URLSearchParams(window.location.search).get('market') === 'wti' ? 'wti' : 'gold');
  }, []);
  const feePreview = useMemo(() => {
    try { return { plan: planExecutionCosts(code, fees, contract.pointvalue, contract.mintick), error: '' }; }
    catch (e) { return { plan: null, error: e instanceof Error ? e.message : 'Invalid strategy commission setup.' }; }
  }, [code, fees, contract.pointvalue, contract.mintick]);
  const interval = useMemo(() => inferIntervalMinutes(bars), [bars]);
  const coverage = useMemo(() => getHistoryCoverage(bars), [bars]);
  const coverageIssue = useMemo(() => checkRequestedCoverage(bars, start, end), [bars, start, end]);
  const selection = useMemo(() => {
    const from = Date.parse(start + 'T00:00:00Z'), to = Date.parse(end + 'T00:00:00Z') + 86400000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return [];
    try { return resampleCandles(bars.filter(b => b.time >= from && b.time < to), tf); } catch { return []; }
  }, [bars, start, end, tf]);
  const stop = () => { workerRef.current?.terminate(); workerRef.current = null; setRunning(false); };
  const reset = () => { historyRequestSeq.current++; stop(); setFees({ ...DEFAULT_FEES, bybit: { ...DEFAULT_BYBIT } }); setDataSource('demo'); setImportMessage(''); setChartView('backtest'); setContract({ ...DEFAULT_CONTRACT }); setBars(DEMO); setName('Synthetic sample'); setDemo(true); setStart(day(DEMO[0].time)); setEnd(day(DEMO[DEMO.length - 1].time)); setTf(15); setResults(null); setError(''); };
  function applyHistory(next: Candle[], label: string, source: 'csv' | 'dukascopy' | 'wti' = 'csv') {
    stop();
    setBars(next);
    setDemo(false);
    setName(label);
    setDataSource(source);
    const sourceInterval = inferIntervalMinutes(next);
    setTf(OPTIONS.some(option => option.value === sourceInterval) ? sourceInterval : 15);
    setStart(day(next[0].time));
    setEnd(day(next[next.length - 1].time));
    setResults(null);
    setUsedBars(0);
    setError('');
    setImportMessage(
      'Loaded ' + next.length.toLocaleString() + ' candles from ' +
      day(next[0].time) + ' through ' + day(next[next.length - 1].time) + ' (UTC).'
    );
  }

  async function importCsv(files?: FileList | null) {
    if (!files?.length) return;
    historyRequestSeq.current++; // Cancel any in-flight automatic import.
    try {
      const selected = Array.from(files);
      if (selected.length > 20) throw new Error('Select at most 20 historical CSV files at once.');
      if (selected.some(file => file.size > 75 * 1024 * 1024)) {
        throw new Error('Each CSV file must be 75 MB or smaller.');
      }
      const total = selected.reduce((sum, file) => sum + file.size, 0);
      if (total > 90 * 1024 * 1024) {
        throw new Error('The combined import exceeds 90 MB. Use fewer files.');
      }
      const incoming = await Promise.all(selected.map(async file => parseCsv(await file.text())));
      const prior = csvModeRef.current === 'append' && !demo ? [bars] : [];
      const merged = mergeCandleBatches([...prior, ...incoming]);
      const label = prior.length ? 'Combined CSV history' :
        selected.length === 1 ? selected[0].name : selected.length + ' combined CSV files';
      applyHistory(merged, label);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CSV history.');
    }
    if (csvRef.current) csvRef.current.value = '';
  }

  /**
   * Load one of the Cloudflare build-generated OHLCV datasets.
   * Manifests are validated before data is allowed into the PineTS engine.
   */
  async function loadCloudflareHistory(auto = false, instrument: 'gold' | 'wti' = 'gold') {
    const seq = ++historyRequestSeq.current;
    const isWti = instrument === 'wti';
    const label = isWti ? 'WTI Oil 1Y' : 'Gold 10Y';
    setLoadingProgress('Checking hosted ' + label + ' history…');
    setFetchingHistory(true);
    try {
      const res = await fetch(isWti ? '/history/wti/manifest.json' : '/history/manifest.json', { cache: 'no-cache' });
      const isJson = (res.headers.get('content-type') || '').includes('json');
      // Static hosting sometimes responds with index.html (HTTP 200) for a
      // missing file. Never parse HTML as historical price data.
      if (auto && (res.status === 404 || !isJson)) {
        setLoadingProgress('');
        return;
      }
      if (!res.ok || !isJson) {
        throw new Error(label + ' history has not been generated on this deployment. Check the Cloudflare build logs and manifest.');
      }
      const manifest = isWti ? parseWtiManifest(await res.json()) : parseHostedManifest(await res.json());
      const groups: Candle[][] = [];
      for (let i = 0; i < manifest.files.length; i++) {
        if (seq !== historyRequestSeq.current) return;
        setLoadingProgress('Loading ' + label + ' segment ' + (i + 1) + '/' + manifest.files.length + '…');
        const part = manifest.files[i];
        const response = await fetch(part.file);
        if (!response.ok) throw new Error('Failed to load ' + part.file + ' (HTTP ' + response.status + ').');
        const csv = await response.text();
        if (csv.length > 24 * 1024 * 1024) throw new Error('Hosted history segment is too large.');
        const parsed = parseCsv(csv);
        if (parsed.length !== part.count ||
            parsed[0].time !== part.first ||
            parsed[parsed.length - 1].time !== part.last) {
          throw new Error('Historical data validation failed for ' + part.file);
        }
        groups.push(parsed);
      }
      const merged = mergeCandleBatches(groups);
      if (merged.length !== manifest.candleCount) throw new Error('Missing historical candles after merge.');
      if (seq !== historyRequestSeq.current) return;
      if (isWti) {
        applyHistory(merged, 'Dukascopy LIGHT.CMD/USD · WTI BID · 15m', 'wti');
        setCode(WtiBreakoutSource);
        setScriptName('wti-oil-breakout-15m.pine');
        setContract({ ...WTI_CONTRACT });
        setChartView('backtest');
        setFees({ ...DEFAULT_FEES, bybit: { ...DEFAULT_BYBIT } });
      } else {
        applyHistory(merged, 'Dukascopy XAUUSD · BID · 15m', 'dukascopy');
        if (!auto) {
          setCode(GoldBreakoutSource);
          setScriptName('gold-breakout-15m.pine');
          setContract({ ...DEFAULT_CONTRACT });
          setChartView('backtest');
          setFees({ ...DEFAULT_FEES, bybit: { ...DEFAULT_BYBIT } });
        }
      }
      setLoadingProgress('');
    } catch (e) {
      if (seq === historyRequestSeq.current) {
        setError('Unable to load ' + label + ' data: ' + (e instanceof Error ? e.message : String(e)));
        setLoadingProgress('');
      }
    } finally {
      if (seq === historyRequestSeq.current) setFetchingHistory(false);
    }
  }

  async function loadHostedHistory() {
    if (!HISTORY_URL) return;
    setFetchingHistory(true);
    setError('');
    try {
      const response = await fetch(HISTORY_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error('History endpoint returned HTTP ' + response.status + '.');
      const text = await response.text();
      if (text.length > 75 * 1024 * 1024) {
        throw new Error('Hosted history exceeds the 75 MB import limit.');
      }
      const parsed = parseCsv(text);
      applyHistory(parsed, 'Hosted OHLCV · source unverified');
    } catch (e) {
      setError('Could not load hosted history. ' +
        (e instanceof Error ? e.message : String(e)) +
        ' Verify the URL, browser CORS policy, and CSV format.');
    } finally {
      setFetchingHistory(false);
    }
  }

  function preset(years: number | 'all') {
    const range = years === 'all'
      ? { start: day(bars[0].time), end: day(bars[bars.length - 1].time) }
      : pastYearsFromLastCandle(bars, years);
    stop();
    setStart(range.start); setEnd(range.end); setResults(null); setError('');
  }

  async function importPine(file?: File) {
    if (!file) return;
    try {
      if (file.size > 250 * 1024) throw new Error('Pine script exceeds the 250 KB editor limit.');
      setCode(await file.text()); setScriptName(file.name); setResults(null); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load script.'); }
    if (pineRef.current) pineRef.current.value = '';
  }
  function run() {
    setError('');
    let data: Candle[];
    try {
      const missing = checkRequestedCoverage(bars, start, end);
      if (missing) throw new Error(missing);
      data = resampleCandles(bars.filter(b => b.time >= Date.parse(start + 'T00:00:00Z') && b.time < Date.parse(end + 'T00:00:00Z') + 86400000), tf);
      if (data.length < 40) throw new Error('Need at least 40 complete candles in your selected date range.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unsupported timeframe.'); return; }
    stop(); setResults(null); setUsedBars(data.length); setRunning(true);
    const id = ++idRef.current;
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (evt: MessageEvent<WorkerResponse>) => {
      if (evt.data.id !== idRef.current) return;
      setRunning(false);
      if (evt.data.type === 'success') setResults(evt.data.results);
      else setError(evt.data.error);
      worker.terminate(); workerRef.current = null;
    };
    worker.onerror = () => { setRunning(false); setError('Backtesting worker failed. Check the browser console.'); worker.terminate(); workerRef.current = null; };
    worker.postMessage({ id, code, candles: data, contract, fees });
  }

  return <div className="app">
    <aside className="rail"><div className="rail-brand"><Layers3 size={25}/></div><div className="rail-links"><span className="rail-link active" title="Backtesting"><BarChart3 size={20}/></span><button className="rail-link" title="Pine editor" onClick={() => { setTab('editor'); document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' }); }}><Code2 size={20}/></button><button className="rail-link" title="Data setup" onClick={() => { setTab('guide'); document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' }); }}><Settings2 size={20}/></button></div><a className="rail-link rail-github" target="_blank" rel="noreferrer" href={REPO} title="GitHub"><Github size={20}/></a></aside>
    <div className="content-shell">
      <header className="topbar"><div className="brand"><Layers3 size={20}/><strong>PINE<span>BACKTEST</span></strong><small>STUDIO</small></div><div className="header-right"><span className="local"><i/> LOCAL RESEARCH WORKSPACE</span><a href={REPO} target="_blank" rel="noreferrer"><Github size={16}/> GitHub <ArrowUpRight size={14}/></a></div></header>
      <main className="main">
        <div className="breadcrumb">WORKSPACE <ChevronRight size={13}/> STRATEGY BACKTESTER</div>
        <div className="headline"><div><div className="eyebrow"><i/> EXTENDED HISTORY ENGINE</div><h1>Strategy Backtester<span>.</span></h1><p>Run Pine Script strategies on your own historical data, beyond chart history limits.</p></div><button className="btn secondary" onClick={reset}><RotateCcw size={15}/> Reset demo</button></div>
        <div className="notice"><Info size={17}/><p><strong>Default strategy: Gold Breakout 15M v1.1.0.</strong> {dataSource === 'dukascopy' ? 'Backtest candles: ten-year Dukascopy XAUUSD BID (15m), not TradingView TVC:GOLD.' : dataSource === 'demo' ? 'Loading real gold candles where available. The temporary demo uses synthetic prices, not actual gold.' : 'Custom CSV imported: its source is not verified as TVC:GOLD.'} The TVC:GOLD chart is a reference only; different gold feeds may produce different trade results.</p></div>
        <section className="data-strip">
          <div className="instrument"><div className="au-icon">Au</div><div><strong>{dataSource === 'dukascopy' ? 'XAUUSD' : 'TVC:GOLD'} <span>{dataSource === 'dukascopy' ? 'DUKASCOPY BID' : 'REFERENCE'}</span></strong><small>{dataSource === 'dukascopy' ? 'Real historical 15m candles · not TVC:GOLD' : demo ? 'Synthetic demo (NOT TVC:GOLD)' : 'Imported OHLCV · source unverified'}</small></div></div>
          <div className="strip-item"><small>DATASET</small><strong title={name}>{name}</strong></div>
          <div className="strip-item"><small>AVAILABLE BARS</small><strong>{bars.length.toLocaleString()}</strong></div>
          <div className="strip-item"><small>DATA INTERVAL</small><strong>{interval || '—'}m</strong></div>
          <div className="strip-item coverage-metric"><small>HISTORY AVAILABLE (UTC)</small><strong>{coverage?.first} → {coverage?.last}</strong><small>{coverage?.years.toFixed(2)} calendar years</small></div>
          <input hidden type="file" multiple accept=".csv,text/csv" ref={csvRef} onChange={e => { void importCsv(e.target.files); }}/>
          <button className="btn primary" disabled={fetchingHistory} onClick={() => { void loadCloudflareHistory(); }}>{fetchingHistory ? loadingProgress || 'Loading 10-year history…' : 'Load 10 years XAUUSD'}</button>
          <button className="btn secondary" onClick={() => { csvModeRef.current = 'replace'; csvRef.current?.click(); }}><UploadCloud size={16}/> Import CSV files</button>
          {!demo && <button className="btn secondary" onClick={() => { csvModeRef.current = 'append'; csvRef.current?.click(); }}>Add more data</button>}
          {HISTORY_URL && <button className="btn secondary" disabled={fetchingHistory} onClick={() => { void loadHostedHistory(); }}>{fetchingHistory ? 'Loading history…' : 'Load hosted history'}</button>}
        </section>
        <section className={'history-coverage ' + (coverageIssue ? 'history-warning' : 'history-ok')}>
          <div className="history-description">
            <Info size={18}/>
            <div>
              <strong>{coverageIssue ? 'Incomplete selected history' : 'Historical data coverage'}</strong>
              <p>{coverageIssue || ('Loaded candles cover ' + coverage?.first + ' through ' + coverage?.last +
                ' (' + coverage?.count.toLocaleString() + ' bars). The date picker filters loaded history; it cannot fetch older prices.')}</p>
              {demo && <p className="demo-history">This is only the October 2026 synthetic demonstration. These trades are not real gold backtest results.</p>}
              {importMessage && <p className="history-import-status">{importMessage}</p>}
            </div>
          </div>
          <button onClick={() => { setTab('guide'); document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' }); }} className="history-guide-link">
            Historical data requirements <ArrowRight size={15}/>
          </button>
        </section>

        <div className="workgrid">
          <div className="leftcol">
            <section className="panel chart-panel"><div className="panel-head"><div><small>MARKET OVERVIEW</small><h2>Price action <span>/ Gold</span></h2></div><div className="chart-source-tabs"><button className={chartView === 'backtest' ? 'selected' : ''} onClick={() => setChartView('backtest')}>Backtest data</button><button className={chartView === 'reference' ? 'selected' : ''} onClick={() => setChartView('reference')}>TVC:GOLD</button></div></div>
              {chartView === 'backtest' ? <><div className="chart-bar"><strong>{dataSource === 'dukascopy' ? 'DUKASCOPY:XAUUSD' : 'IMPORTED:OHLCV'} · {tf}m</strong><span>{dataSource === 'dukascopy' ? 'REAL HISTORICAL BID' : demo ? 'SYNTHETIC DEMO' : 'IMPORTED OHLCV'}</span></div>{selection.length ? <PriceChart bars={selection} trades={results?.trades || []}/> :
                  <div className="empty-equity price-chart-empty">No candles in the selected date range. Load more history or choose available dates.</div>}<div className="panel-foot"><span><Clock3 size={13}/> UTC timestamps</span><span>Last 1,500 chart bars · {results ? usedBars.toLocaleString() + ' simulated' : 'run to calculate trades'}</span></div></>
              : <><div className="chart-bar"><strong>TradingView · TVC:GOLD · {tf}m</strong><span>REFERENCE ONLY</span></div><GoldReferenceChart timeframe={tf}/><div className="reference-note"><Info size={15}/> TradingView provides this display-only chart. The candles are not accessible to PineTS. Backtesting uses the separately imported CSV data, never this widget.</div><div className="panel-foot"><a href="https://www.tradingview.com/symbols/TVC-GOLD/" target="_blank" rel="noreferrer">Open TVC:GOLD on TradingView <ArrowUpRight size={13}/></a><span>Data and strategy results are not synchronized</span></div></>}
            </section>

            <div className="section-heading"><div><small>PERFORMANCE</small><h2>Strategy results</h2></div><span className={'status ' + (results ? 'ready' : '')}>{results ? <Check size={14}/> : <span className="status-ring"/>}{results ? 'BACKTEST COMPLETE' : 'AWAITING BACKTEST'}</span></div>
            <div className="metrics">
              <Metric label="Net profit" value={results ? money(results.netProfit) : '—'} caption={results ? num(results.netProfit / (results.initialCapital || 1) * 100) + '% of capital' : 'Run to calculate'} kind={results ? results.netProfit >= 0 ? 'positive' : 'negative' : ''}/>
              <Metric label="Win rate" value={results ? num(results.winRate, 1) + '%' : '—'} caption={results ? results.trades.length + ' closed trades' : 'Winning / closed trades'}/>
              <Metric label="Profit factor" value={results ? results.profitFactor === null ? 'N/A' : num(results.profitFactor) : '—'} caption="Gross profit / gross loss"/>
              <Metric label="Max drawdown" value={results ? money(results.maxDrawdown) : '—'} caption="PineTS reported drawdown"/>
              <Metric label="Commissions" value={results ? money(results.fees.closedTradeCommissions + results.fees.openTradeEntryCommissions) : '—'}
                caption={results ? (results.fees.source === 'bybit' ? 'Bybit CFD cost mode' : results.fees.source === 'pine' ? 'Pine Script fees' : num(results.fees.configuredRatePercent ?? 0, 3) + '% per execution') : 'Entry and exit fees'}/>
            </div>

            {results?.fees.bybit && <BybitResultsPanel results={results}/>}
            <section className="panel equity-panel"><div className="panel-head"><div><small>ACCOUNT PERFORMANCE</small><h2>Realized equity curve</h2></div>{results && <strong className={results.netProfit >= 0 ? 'positive' : 'negative'}>{money(results.initialCapital + results.netProfit)}</strong>}</div><EquityChart results={results}/><div className="panel-foot"><span>Closed-trade P&L only</span><span>{results ? 'Starting capital ' + money(results.initialCapital) : 'Awaiting results'}</span></div></section>

            {results ? <BacktestAnalysis key={results.periodStart + ':' + results.periodEnd + ':' + results.trades.length}
              results={results}
              source={dataSource === 'dukascopy' ? 'Dukascopy XAUUSD BID (not TVC:GOLD)' : dataSource === 'demo' ? 'Synthetic demonstration (not live market data)' : 'User-imported OHLCV (source unverified)'}/>
              : <div className="panel analysis-awaiting">
                  <div><BarChart3 size={22}/><strong>Advanced performance analysis</strong></div>
                  <p>After running your strategy, explore Sharpe, Sortino, realized drawdown, winning/losing streaks, monthly heatmaps, weekly P&L, and long/short trade breakdowns.</p>
                </div>}


            <section className="panel trades-panel"><div className="panel-head"><div><small>EXECUTION HISTORY</small><h2>Trade log <span className="count">{results?.trades.length || 0}</span></h2></div><button className="text-button" disabled={!results?.trades.length} onClick={() => results && save(exportTrades(results.trades), 'backtest-trades.csv', 'text/csv')}><FileDown size={15}/> Export all CSV</button></div>
              <div className="table-scroll"><table><thead><tr><th>SIDE</th><th>ENTRY (UTC)</th><th>EXIT (UTC)</th><th>ENTRY</th><th>EXIT</th><th>SIZE</th><th>NET P&L</th></tr></thead><tbody>
                {results?.trades.slice(-showCount).reverse().map((t, i) => <tr key={t.id + '-' + i + '-' + t.entryTime}><td><span className={'side ' + t.direction.toLowerCase()}>{t.direction}</span></td><td>{utc(t.entryTime)}</td><td>{utc(t.exitTime)}</td><td>{num(t.entryPrice)}</td><td>{num(t.exitPrice)}</td><td>{num(t.size)}</td><td className={t.profit >= 0 ? 'positive' : 'negative'}>{money(t.profit)}</td></tr>)}
                {!results?.trades.length && <tr><td colSpan={7}><div className="table-empty"><BarChart3 size={21}/>{results ? 'No closed trades in selected range.' : 'Trade executions will appear here after a backtest.'}</div></td></tr>}
              </tbody></table></div>{!!results && results.trades.length > showCount && <div className="more"><button onClick={() => setShowCount(n => n + 25)}>Show more trades <ArrowRight size={14}/></button></div>}</section>
          </div>

          <div className="rightcol" id="editor">
            <section className="panel settings-panel"><div className="panel-head"><div><small>CONFIGURATION</small><h2>Backtest setup</h2></div><Settings2 size={18}/></div>
              <label>Backtest data source</label><div className="locked-field"><span className="mini-au">Au</span><strong>{dataSource === 'dukascopy' ? 'XAUUSD · BID' : 'IMPORTED:OHLCV'}</strong><span>{dataSource === 'dukascopy' ? 'Dukascopy' : 'Unverified'}</span></div>
              <label htmlFor="tf">Timeframe</label><select id="tf" value={tf} onChange={e => { setTf(Number(e.target.value)); setResults(null); }}>{OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <label>Date range <span>UTC / inclusive</span></label><div className="dates"><input type="date" aria-label="Start date" value={start} onChange={e => { setStart(e.target.value); setResults(null); }}/><input type="date" aria-label="End date" value={end} onChange={e => { setEnd(e.target.value); setResults(null); }}/></div>
              <div className="period-presets"><span>Quick range:</span><button onClick={() => preset(1)}>1Y</button><button onClick={() => preset(3)}>3Y</button><button onClick={() => preset(5)}>5Y</button><button onClick={() => preset(10)}>10Y</button><button onClick={() => preset('all')}>All loaded</button></div>
              {coverageIssue && <p className="date-coverage-alert">The chosen dates exceed the loaded dataset. Import older candles before starting the backtest.</p>}
              <div className="bar-count"><ShieldCheck size={14}/>{selection.length.toLocaleString()} complete bars selected</div>
              <details className="contract-settings" open><summary>Gold contract settings <span>Required for risk sizing</span></summary><p>These are simulation assumptions, not verified TVC:GOLD contract specifications. Match your broker/instrument before comparing P&L.</p>
              <div className="contract-fields">
              <label>Point value <input type="number" min="0.000001" step="any" value={contract.pointvalue} onChange={e => { setContract(v => ({ ...v, pointvalue: Number(e.target.value) })); setResults(null); }}/></label>
              <label>Minimum qty/step <input type="number" min="0.000001" step="any" value={contract.mincontract} onChange={e => { setContract(v => ({ ...v, mincontract: Number(e.target.value) })); setResults(null); }}/></label>
              <label>Price tick size <input type="number" min="0.000001" step="any" value={contract.mintick} onChange={e => { setContract(v => ({ ...v, mintick: Number(e.target.value) })); setResults(null); }}/></label>
              </div></details>
              <BybitSettingsPanel settings={fees.bybit ?? DEFAULT_BYBIT} preview={feePreview.plan}
                error={feePreview.error} contract={contract} onChange={updateBybit}/>
              {!fees.bybit?.enabled && <details className="commission-settings" open>
                <summary>Binance futures commissions <span>Default 0.05% per execution, opening and closing</span></summary>
                <div className="commission-rate-row">
                  <label htmlFor="fee-rate">Commission per execution (%)</label>
                  <input id="fee-rate" type="number" min="0" max="5" step="0.005" value={fees.percent}
                    onChange={e => { setFees(v => ({ ...v, percent: Number(e.target.value) })); setResults(null); }}/>
                </div>
                <label className="commission-override">
                  <input type="checkbox" checked={fees.overridePine}
                    onChange={e => { setFees(v => ({ ...v, overridePine: e.target.checked })); setResults(null); }}/>
                  Override any existing Pine Script commission with this percentage
                </label>
                <div className={'commission-policy ' + (feePreview.plan?.source === 'pine' ? 'using-pine' : 'using-app')}>
                  <Info size={15}/>
                  <div>
                    <strong>{feePreview.error ? 'Fee configuration needs attention' :
                      feePreview.plan?.source === 'pine' ? 'Using Pine Script commission (no double charge)' :
                      feePreview.plan?.overridden ? 'Replacing Pine commission with custom rate' :
                      'Using configured Binance-style commission'}
                    </strong>
                    <p>{feePreview.error || feePreview.plan?.description}</p>
                    {feePreview.plan?.source === 'pine' && <small>{feePreview.plan.declaration}</small>}
                  </div>
                </div>
                <p className="commission-caveat">Fees are calculated from executed position notional on both entry and exit; rates may differ for Binance maker/taker, VIP level and discounts. Funding is not included. This XAUUSD backtest is not an actual Binance gold instrument.</p>
              </details>}
              <button className="btn run" disabled={running || fetchingHistory || Boolean(coverageIssue) || Boolean(feePreview.error)} onClick={run}>{running ? <span className="spinner"/> : <Play size={17} fill="currentColor"/>}{running ? 'Running strategy…' : 'Run Backtest'}<ArrowRight size={17}/></button>
              {running && <button className="text-button cancel" onClick={() => { stop(); setError('Backtest cancelled.'); }}>Cancel run</button>}
              <div className="help-note"><Info size={15}/> Calculations run in your browser. Your CSV and Pine source are not uploaded.</div>
            </section>
            <section className="panel code-panel"><div className="tabs"><button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}><Code2 size={15}/> Pine editor</button><button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}><FolderOpen size={15}/> Data guide</button></div>
              {tab === 'editor' ? <><div className="file-header"><FileCode2 size={15}/><strong>{scriptName}</strong><span>v5 / v6</span></div><textarea spellCheck={false} className="editor" aria-label="Pine Script strategy source" value={code} onChange={e => { setCode(e.target.value); setScriptName('untitled.pine'); setResults(null); }}/><div className="editor-footer"><span>{code.split('\n').length} lines</span><input hidden type="file" accept=".pine,.txt,text/plain" ref={pineRef} onChange={e => { void importPine(e.target.files?.[0]); }}/><button onClick={() => pineRef.current?.click()}><FolderOpen size={14}/> Open .pine</button><button onClick={() => save(code, scriptName, 'text/plain')}><Download size={14}/> Save</button></div><p className="editor-note"><Info size={14}/> Use a <strong>strategy()</strong> script. Some TradingView features are not supported by PineTS.</p></>
                : <div className="guide"><h3>Ten years of XAUUSD, no terminal</h3><p>On Cloudflare Pages the site build fetches and validates up to ten years of Dukascopy XAUUSD BID 15-minute history. The site loads it automatically when available; you can also click <strong>Load 10 years XAUUSD</strong>. Verify the displayed first and last dates before running a backtest.</p><p>The included source script is your full <strong>Gold Breakout 15M Strategy v1.1.0</strong>, replacing the EMA demonstration. The simulation uses PineTS, so TradingView-specific behavior and order fills can differ. These are <strong>not TVC:GOLD candles</strong>.</p><p>Cloudflare Pages serves assets publicly by default. Protect your project with Cloudflare Access if this data is for personal use only, and check your provider's data rights.</p><a href={REPO + '#cloudflare-data-build'} target="_blank" rel="noreferrer">Data pipeline and privacy details <ArrowUpRight size={14}/></a></div>}
            </section>
            {error && <div className="error" role="alert"><CircleAlert size={20}/><div><strong>Backtest needs attention</strong><p>{error}</p></div><button onClick={() => setError('')}>×</button></div>}
            {results && results.trades.length === 0 && <section className="zero-diagnostics" role="status"><div className="zero-title"><CircleAlert size={19}/><strong>0 closed trades · diagnostic report</strong></div><p>The engine ran, but did not report closed orders. These checks help distinguish missing price breakouts from unsupported Pine behavior.</p><ul>{results.warnings.slice(0, 6).map((hint, i) => <li key={i}>{hint}</li>)}</ul></section>}
            {results && <div className={results.trades.length ? 'success' : 'zero-success'}><Check size={18}/><div><strong>Calculation finished{results.trades.length ? '' : ' (no closed trades)'}</strong><p>{usedBars.toLocaleString()} bars · {results.trades.length} closed · {results.openTrades} open · {results.pendingOrders} pending</p></div></div>}
            <div className="help-card"><div><Info size={17}/><strong>Research, not execution</strong></div><p>Different gold feeds, tick sizes, spreads and intrabar fills may change results. Validate against a trusted reference before trading.</p><a href={REPO + '#limitations'} target="_blank" rel="noreferrer">Read limitations <ArrowUpRight size={14}/></a></div>
          </div>
        </div>
        <footer>© 2026 Pine Backtest Studio <span>Powered by PineTS & Lightweight Charts · Not affiliated with TradingView</span></footer>
      </main>
    </div>
  </div>;
}

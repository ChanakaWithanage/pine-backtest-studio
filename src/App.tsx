import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight, CircleAlert, Clock3, Code2, Download, FileCode2, FileDown, FolderOpen, Github, Info, Layers3, Play, RotateCcw, Settings2, ShieldCheck, UploadCloud } from 'lucide-react';
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, type UTCTimestamp } from 'lightweight-charts';
import { createDemoCandles, EXAMPLE_SCRIPT } from './lib/demo';
import { exportTrades, inferIntervalMinutes, parseCsv, resampleCandles } from './lib/csv';
import type { Candle, Results, Trade, WorkerResponse } from './types';

const REPO = 'https://github.com/ChanakaWithanage/pine-backtest-studio';
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
  const [code, setCode] = useState(EXAMPLE_SCRIPT);
  const [scriptName, setScriptName] = useState('ema-crossover.pine');
  const [tf, setTf] = useState(15);
  const [start, setStart] = useState(day(DEMO[0].time));
  const [end, setEnd] = useState(day(DEMO[DEMO.length - 1].time));
  const [results, setResults] = useState<Results | null>(null);
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
  const interval = useMemo(() => inferIntervalMinutes(bars), [bars]);
  const selection = useMemo(() => {
    const from = Date.parse(start + 'T00:00:00Z'), to = Date.parse(end + 'T00:00:00Z') + 86400000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return [];
    try { return resampleCandles(bars.filter(b => b.time >= from && b.time < to), tf); } catch { return []; }
  }, [bars, start, end, tf]);
  const stop = () => { workerRef.current?.terminate(); workerRef.current = null; setRunning(false); };
  const reset = () => { stop(); setBars(DEMO); setName('Synthetic sample'); setDemo(true); setStart(day(DEMO[0].time)); setEnd(day(DEMO[DEMO.length - 1].time)); setTf(15); setResults(null); setError(''); };
  async function importCsv(file?: File) {
    if (!file) return;
    try {
      if (file.size > 75 * 1024 * 1024) throw new Error('Maximum CSV size is 75 MB.');
      const parsed = parseCsv(await file.text());
      stop(); setBars(parsed); setDemo(false); setName(file.name);
      setStart(day(parsed[0].time)); setEnd(day(parsed[parsed.length - 1].time));
      setTf(inferIntervalMinutes(parsed) || 15); setResults(null); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load CSV.'); }
    if (csvRef.current) csvRef.current.value = '';
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
      if (start > end) throw new Error('Start date must be before end date.');
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
    worker.postMessage({ id, code, candles: data });
  }

  return <div className="app">
    <aside className="rail"><div className="rail-brand"><Layers3 size={25}/></div><div className="rail-links"><span className="rail-link active" title="Backtesting"><BarChart3 size={20}/></span><button className="rail-link" title="Pine editor" onClick={() => { setTab('editor'); document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' }); }}><Code2 size={20}/></button><button className="rail-link" title="Data setup" onClick={() => { setTab('guide'); document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' }); }}><Settings2 size={20}/></button></div><a className="rail-link rail-github" target="_blank" rel="noreferrer" href={REPO} title="GitHub"><Github size={20}/></a></aside>
    <div className="content-shell">
      <header className="topbar"><div className="brand"><Layers3 size={20}/><strong>PINE<span>BACKTEST</span></strong><small>STUDIO</small></div><div className="header-right"><span className="local"><i/> LOCAL RESEARCH WORKSPACE</span><a href={REPO} target="_blank" rel="noreferrer"><Github size={16}/> GitHub <ArrowUpRight size={14}/></a></div></header>
      <main className="main">
        <div className="breadcrumb">WORKSPACE <ChevronRight size={13}/> STRATEGY BACKTESTER</div>
        <div className="headline"><div><div className="eyebrow"><i/> EXTENDED HISTORY ENGINE</div><h1>Strategy Backtester<span>.</span></h1><p>Run Pine Script strategies on your own historical data, beyond chart history limits.</p></div><button className="btn secondary" onClick={reset}><RotateCcw size={15}/> Reset demo</button></div>
        <div className="notice"><Info size={17}/><p><strong>{demo ? 'Synthetic demo candles.' : 'Imported market data.'}</strong> {demo ? 'Generated data is only for testing the interface and does not represent real gold prices or trading performance.' : 'Backtests depend on your data feed, fill assumptions and PineTS compatibility. Validate against TradingView.'}</p></div>
        <section className="data-strip">
          <div className="instrument"><div className="au-icon">Au</div><div><strong>XAUUSD <span>GOLD</span></strong><small>{demo ? 'Synthetic sample, not real data' : 'User-imported OHLCV candles'}</small></div></div>
          <div className="strip-item"><small>DATASET</small><strong title={name}>{name}</strong></div>
          <div className="strip-item"><small>AVAILABLE BARS</small><strong>{bars.length.toLocaleString()}</strong></div>
          <div className="strip-item"><small>DATA INTERVAL</small><strong>{interval || '—'}m</strong></div>
          <input hidden type="file" accept=".csv,text/csv" ref={csvRef} onChange={e => { void importCsv(e.target.files?.[0]); }}/>
          <button className="btn primary" onClick={() => csvRef.current?.click()}><UploadCloud size={16}/> Import CSV</button>
        </section>

        <div className="workgrid">
          <div className="leftcol">
            <section className="panel chart-panel"><div className="panel-head"><div><small>MARKET OVERVIEW</small><h2>Price action <span>/ XAUUSD</span></h2></div><div className="legend"><i className="bull"/> Bullish <i className="bear"/> Bearish</div></div><div className="chart-bar"><strong>XAUUSD · {tf}m</strong><span>{demo ? 'DEMO DATA' : 'IMPORTED'}</span></div><PriceChart bars={selection.length ? selection : bars} trades={results?.trades || []}/><div className="panel-foot"><span><Clock3 size={13}/> UTC timestamps</span><span>Last 1,500 chart bars · {results ? usedBars.toLocaleString() + ' simulated' : 'run to calculate trades'}</span></div></section>

            <div className="section-heading"><div><small>PERFORMANCE</small><h2>Strategy results</h2></div><span className={'status ' + (results ? 'ready' : '')}>{results ? <Check size={14}/> : <span className="status-ring"/>}{results ? 'BACKTEST COMPLETE' : 'AWAITING BACKTEST'}</span></div>
            <div className="metrics">
              <Metric label="Net profit" value={results ? money(results.netProfit) : '—'} caption={results ? num(results.netProfit / (results.initialCapital || 1) * 100) + '% of capital' : 'Run to calculate'} kind={results ? results.netProfit >= 0 ? 'positive' : 'negative' : ''}/>
              <Metric label="Win rate" value={results ? num(results.winRate, 1) + '%' : '—'} caption={results ? results.trades.length + ' closed trades' : 'Winning / closed trades'}/>
              <Metric label="Profit factor" value={results ? results.profitFactor === null ? 'N/A' : num(results.profitFactor) : '—'} caption="Gross profit / gross loss"/>
              <Metric label="Max drawdown" value={results ? money(results.maxDrawdown) : '—'} caption="PineTS reported drawdown"/>
            </div>

            <section className="panel equity-panel"><div className="panel-head"><div><small>ACCOUNT PERFORMANCE</small><h2>Realized equity curve</h2></div>{results && <strong className={results.netProfit >= 0 ? 'positive' : 'negative'}>{money(results.initialCapital + results.netProfit)}</strong>}</div><EquityChart results={results}/><div className="panel-foot"><span>Closed-trade P&L only</span><span>{results ? 'Starting capital ' + money(results.initialCapital) : 'Awaiting results'}</span></div></section>

            <section className="panel trades-panel"><div className="panel-head"><div><small>EXECUTION HISTORY</small><h2>Trade log <span className="count">{results?.trades.length || 0}</span></h2></div><button className="text-button" disabled={!results?.trades.length} onClick={() => results && save(exportTrades(results.trades), 'backtest-trades.csv', 'text/csv')}><FileDown size={15}/> Export all CSV</button></div>
              <div className="table-scroll"><table><thead><tr><th>SIDE</th><th>ENTRY (UTC)</th><th>EXIT (UTC)</th><th>ENTRY</th><th>EXIT</th><th>SIZE</th><th>NET P&L</th></tr></thead><tbody>
                {results?.trades.slice(-showCount).reverse().map((t, i) => <tr key={t.id + '-' + i + '-' + t.entryTime}><td><span className={'side ' + t.direction.toLowerCase()}>{t.direction}</span></td><td>{utc(t.entryTime)}</td><td>{utc(t.exitTime)}</td><td>{num(t.entryPrice)}</td><td>{num(t.exitPrice)}</td><td>{num(t.size)}</td><td className={t.profit >= 0 ? 'positive' : 'negative'}>{money(t.profit)}</td></tr>)}
                {!results?.trades.length && <tr><td colSpan={7}><div className="table-empty"><BarChart3 size={21}/>{results ? 'No closed trades in selected range.' : 'Trade executions will appear here after a backtest.'}</div></td></tr>}
              </tbody></table></div>{!!results && results.trades.length > showCount && <div className="more"><button onClick={() => setShowCount(n => n + 25)}>Show more trades <ArrowRight size={14}/></button></div>}</section>
          </div>

          <div className="rightcol" id="editor">
            <section className="panel settings-panel"><div className="panel-head"><div><small>CONFIGURATION</small><h2>Backtest setup</h2></div><Settings2 size={18}/></div>
              <label>Market symbol</label><div className="locked-field"><span className="mini-au">Au</span><strong>XAUUSD</strong><span>Imported feed</span></div>
              <label htmlFor="tf">Timeframe</label><select id="tf" value={tf} onChange={e => { setTf(Number(e.target.value)); setResults(null); }}>{OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <label>Date range <span>UTC / inclusive</span></label><div className="dates"><input type="date" aria-label="Start date" value={start} onChange={e => { setStart(e.target.value); setResults(null); }}/><input type="date" aria-label="End date" value={end} onChange={e => { setEnd(e.target.value); setResults(null); }}/></div>
              <div className="bar-count"><ShieldCheck size={14}/>{selection.length.toLocaleString()} complete bars selected</div>
              <button className="btn run" disabled={running} onClick={run}>{running ? <span className="spinner"/> : <Play size={17} fill="currentColor"/>}{running ? 'Running strategy…' : 'Run Backtest'}<ArrowRight size={17}/></button>
              {running && <button className="text-button cancel" onClick={() => { stop(); setError('Backtest cancelled.'); }}>Cancel run</button>}
              <div className="help-note"><Info size={15}/> Calculations run in your browser. Your CSV and Pine source are not uploaded.</div>
            </section>
            <section className="panel code-panel"><div className="tabs"><button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}><Code2 size={15}/> Pine editor</button><button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}><FolderOpen size={15}/> Data guide</button></div>
              {tab === 'editor' ? <><div className="file-header"><FileCode2 size={15}/><strong>{scriptName}</strong><span>v5 / v6</span></div><textarea spellCheck={false} className="editor" aria-label="Pine Script strategy source" value={code} onChange={e => { setCode(e.target.value); setScriptName('untitled.pine'); setResults(null); }}/><div className="editor-footer"><span>{code.split('\n').length} lines</span><input hidden type="file" accept=".pine,.txt,text/plain" ref={pineRef} onChange={e => { void importPine(e.target.files?.[0]); }}/><button onClick={() => pineRef.current?.click()}><FolderOpen size={14}/> Open .pine</button><button onClick={() => save(code, scriptName, 'text/plain')}><Download size={14}/> Save</button></div><p className="editor-note"><Info size={14}/> Use a <strong>strategy()</strong> script. Some TradingView features are not supported by PineTS.</p></>
                : <div className="guide"><h3>Get 3 years of gold</h3><p>Use the included Node.js downloader to create an XAUUSD CSV, then click Import CSV.</p><span>TERMINAL</span><pre>npm run download:gold -- 2023-11-16 2026-11-16 m15</pre><p>Data appears in <code>data/</code>. A 15m file cannot produce genuine 3m bars; download m1 data for that.</p><a href={REPO + '#historical-gold-data'} target="_blank" rel="noreferrer">View setup guide <ArrowUpRight size={14}/></a></div>}
            </section>
            {error && <div className="error" role="alert"><CircleAlert size={20}/><div><strong>Backtest needs attention</strong><p>{error}</p></div><button onClick={() => setError('')}>×</button></div>}
            {results && <div className="success"><Check size={18}/><div><strong>Backtest completed</strong><p>{usedBars.toLocaleString()} bars · {results.trades.length} closed trades · {results.openTrades} open</p></div></div>}
            <div className="help-card"><div><Info size={17}/><strong>Research, not execution</strong></div><p>Different gold feeds, tick sizes, spreads and intrabar fills may change results. Validate against a trusted reference before trading.</p><a href={REPO + '#limitations'} target="_blank" rel="noreferrer">Read limitations <ArrowUpRight size={14}/></a></div>
          </div>
        </div>
        <footer>© 2026 Pine Backtest Studio <span>Powered by PineTS & Lightweight Charts · Not affiliated with TradingView</span></footer>
      </main>
    </div>
  </div>;
}

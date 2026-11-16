import { useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Download, Info, Layers3, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { analyzeBacktest, exportPeriodAnalysis, type DrawdownSnapshot, type PerformanceInsights, type PeriodReturn } from './lib/analytics';
import type { Results } from './types';
import './analysis.css';

const cash = (v: number | null | undefined): string => v == null || !Number.isFinite(v)
  ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
const amount = (v: number | null | undefined, digits = 2): string => v == null || !Number.isFinite(v)
  ? 'N/A' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (v: number | null | undefined): string => v == null || !Number.isFinite(v) ? 'N/A' : amount(v, 2) + '%';

function saveReport(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 750);
}

function Stat({ title, value, hint, polarity = '' }: {
  title: string; value: string; hint: string; polarity?: 'positive' | 'negative' | '';
}) {
  return <div className="insight-stat" title={hint}>
    <span>{title} <Info size={12}/></span>
    <strong className={polarity}>{value}</strong>
    <small>{hint}</small>
  </div>;
}

function DrawdownArea({ data }: { data: DrawdownSnapshot[] }) {
  if (!data.length) return <div className="insight-no-data">Run a backtest to calculate realized drawdown.</div>;
  const first = data[0].time;
  const end = Math.max(first + 1, data[data.length - 1].time);
  const maximum = Math.max(0.001, ...data.map(d => d.percent));
  // When the series becomes large, keep one deepest point per bucket.
  const sample = data.length <= 800 ? data : [data[0],
    ...Array.from({ length: 798 }, (_, i) => {
      const from = 1 + Math.floor((i * (data.length - 2)) / 798);
      const to = 1 + Math.floor(((i + 1) * (data.length - 2)) / 798);
      let worst = data[from];
      for (let j = from + 1; j < Math.max(from + 1, to); j++) {
        if (data[j].percent > worst.percent) worst = data[j];
      }
      return worst;
    }), data[data.length - 1]];
  const points = sample.map(d => {
    const x = 8 + ((d.time - first) / (end - first)) * 984;
    const y = 16 + (d.percent / maximum) * 140;
    return x.toFixed(2) + ',' + y.toFixed(2);
  });
  const line = 'M' + points.join(' L');
  const endY = points[points.length - 1].split(',')[1];
  const area = line + ' L992,16 L8,16 Z';
  const chartRange = new Date(first).toISOString().slice(0, 10) + ' – ' + new Date(end).toISOString().slice(0, 10);
  return <div className="dd-chart">
    <div className="dd-chart-head"><span>0% / equity high</span><span>Drawdown below prior peak</span></div>
    <svg viewBox="0 0 1000 172" preserveAspectRatio="none" role="img" aria-label={'Realized closed-trade drawdown from ' + chartRange + ', deepest ' + pct(maximum)}>
      <defs><linearGradient id="dd-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f38a8f" stopOpacity=".06"/>
        <stop offset="100%" stopColor="#f38a8f" stopOpacity=".27"/>
      </linearGradient></defs>
      {[16, 51, 86, 121, 156].map(y => <line key={y} x1="8" x2="992" y1={y} y2={y} stroke="#2a394b" strokeDasharray="3 5"/>)}
      <path d={area} fill="url(#dd-shade)"/>
      <path d={line} fill="none" stroke="#f0858f" strokeWidth="2.1" vectorEffect="non-scaling-stroke"/>
      <circle cx="992" cy={endY} r="3.4" fill="#f5a0a5"/>
    </svg>
    <div className="dd-chart-foot"><span>{new Date(first).toISOString().slice(0, 7)}</span><span>Worst: {pct(maximum)}</span><span>{new Date(end).toISOString().slice(0, 7)}</span></div>
  </div>;
}

function PeriodBars({ periods }: { periods: PeriodReturn[] }) {
  const visible = periods.slice(-24);
  if (!visible.length) return <div className="insight-no-data">No periods available.</div>;
  const absMax = Math.max(0.01, ...visible.map(p => Math.abs(p.pnl)));
  return <div className="period-scroll" aria-label="Profit and loss over the latest 24 periods">
    <div className="period-columns" style={{ minWidth: Math.max(550, visible.length * 39) }}>
      {visible.map(p => {
        const height = p.pnl ? Math.max(2, (Math.abs(p.pnl) / absMax) * 84) : 0;
        return <div key={p.key} className="period-col" title={p.label + ': ' + cash(p.pnl) + ', ' + p.trades + ' trades'}>
          <div className="period-pos">{p.pnl > 0 && <div className="period-bar gain" style={{ height }}/>}</div>
          <div className="period-neg">{p.pnl < 0 && <div className="period-bar loss" style={{ height }}/>}</div>
          <span className="period-tick">{p.key.slice(-2)}</span>
        </div>;
      })}
    </div>
    <div className="period-legend"><span><i className="gain-key"/> Positive period</span><span><i className="loss-key"/> Negative period</span><span>Most recent {visible.length} periods · UTC</span></div>
  </div>;
}

function Heatmap({ monthly }: { monthly: PeriodReturn[] }) {
  if (!monthly.length) return null;
  const years = Array.from(new Set(monthly.map(p => p.key.slice(0, 4)))).sort();
  const byMonth = new Map(monthly.map(p => [p.key, p]));
  const absolute = Math.max(1, ...monthly.map(p => Math.abs(p.pnl)));
  return <div className="heatmap-scroll">
    <div className="heatmap">
      <div className="heatmap-row"><span className="heatmap-year"/>{
        ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => <span key={m} className="heatmap-head">{m}</span>)}
      </div>
      {years.map(year => <div className="heatmap-row" key={year}>
        <span className="heatmap-year">{year}</span>
        {Array.from({ length: 12 }, (_, m) => {
          const key = year + '-' + String(m + 1).padStart(2, '0');
          const p = byMonth.get(key);
          if (!p) return <span key={key} className="heatmap-cell missing" title={key + ': outside selected date range'}/>;
          const strength = Math.min(.60, .10 + .5 * Math.abs(p.pnl) / absolute);
          const background = p.pnl > 0 ? 'rgba(63,209,171,' + strength + ')'
            : p.pnl < 0 ? 'rgba(239,115,126,' + strength + ')' : 'rgba(70,93,114,.23)';
          return <span key={key} className="heatmap-cell" style={{ background }}
            title={p.label + ': ' + cash(p.pnl) + ' / ' + p.trades + ' closed trades'}>
            {p.trades ? (p.pnl > 0 ? '+' : p.pnl < 0 ? '−' : '·') : ''}
          </span>;
        })}
      </div>)}
    </div>
  </div>;
}

function PeriodTable({ periods }: { periods: PeriodReturn[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = (showAll ? periods : periods.slice(-12)).slice().reverse();
  const total = periods.reduce((sum, p) => sum + p.pnl, 0);
  return <div>
    <div className="period-table-wrapper">
      <table className="period-table"><thead><tr><th>Period (UTC)</th><th>Net P&L</th><th>Trades</th><th>W / L</th><th>Win rate</th></tr></thead>
        <tbody>{visible.map(p => <tr key={p.key}>
          <td><strong>{p.label}</strong></td>
          <td className={p.pnl > 0 ? 'positive' : p.pnl < 0 ? 'negative' : ''}>{cash(p.pnl)}</td>
          <td>{p.trades}</td><td>{p.wins} / {p.losses}</td>
          <td>{p.trades ? pct(p.wins / p.trades * 100) : '—'}</td>
        </tr>)}
          <tr className="period-total"><td>Selected period total</td><td className={total >= 0 ? 'positive' : 'negative'}>{cash(total)}</td><td>{periods.reduce((s, p) => s + p.trades, 0)}</td><td colSpan={2}>Closed trades</td></tr>
        </tbody></table>
    </div>
    {periods.length > 12 && <button className="insight-show-more" onClick={() => setShowAll(v => !v)}>
      {showAll ? 'Show recent 12 periods' : 'View all ' + periods.length + ' periods'}
    </button>}
  </div>;
}

function SideCard({ label, result }: {
  label: string; result: { count: number; net: number; wins: number; winRate: number | null };
}) {
  return <div className="side-card">
    <div className="side-card-head"><span>{label}</span>{label === 'Long trades' ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}</div>
    <strong className={result.net >= 0 ? 'positive' : 'negative'}>{cash(result.net)}</strong>
    <div className="side-stats"><span>{result.count} closed trades</span><span>{result.winRate === null ? 'N/A' : pct(result.winRate)} wins</span></div>
  </div>;
}

function TradeInsights({ analytics }: { analytics: PerformanceInsights }) {
  const count = Math.max(1, analytics.totalTrades);
  return <div className="trade-insights">
    <div className="outcome-meter" aria-label="Trade outcome distribution">
      <div className="outcome-wins" style={{ width: analytics.winners / count * 100 + '%' }}/>
      <div className="outcome-flats" style={{ width: analytics.breakeven / count * 100 + '%' }}/>
      <div className="outcome-losses" style={{ width: analytics.losers / count * 100 + '%' }}/>
    </div>
    <div className="outcome-legend"><span><i className="gain-key"/> {analytics.winners} wins</span><span><i className="flat-key"/> {analytics.breakeven} breakeven</span><span><i className="loss-key"/> {analytics.losers} losses</span></div>
    <div className="trade-stats-grid">
      <Stat title="Average winning trade" value={cash(analytics.averageWin)} hint="Mean realized P&L of profitable closed trades." polarity="positive"/>
      <Stat title="Average losing trade" value={cash(analytics.averageLoss)} hint="Mean realized P&L of losing closed trades." polarity="negative"/>
      <Stat title="Largest winning trade" value={cash(analytics.largestWin)} hint="Highest realized profit from one trade." polarity="positive"/>
      <Stat title="Largest losing trade" value={cash(analytics.largestLoss)} hint="Lowest realized profit from one trade." polarity="negative"/>
      <Stat title="Average trade duration" value={analytics.averageHoldingHours == null ? 'N/A' : amount(analytics.averageHoldingHours, 1) + 'h'} hint="Average entry-to-exit time of closed trades."/>
      <Stat title="Average return / trade" value={cash(analytics.expectancy)} hint="Sum of closed-trade P&L divided by closed-trade count." polarity={analytics.expectancy != null && analytics.expectancy >= 0 ? 'positive' : 'negative'}/>
    </div>
    <div className="side-grid"><SideCard label="Long trades" result={analytics.longs}/><SideCard label="Short trades" result={analytics.shorts}/></div>
  </div>;
}

export default function BacktestAnalysis({ results, source }: { results: Results; source: string }) {
  const insights = useMemo(() => analyzeBacktest(results), [results]);
  const [periodMode, setPeriodMode] = useState<'month' | 'week'>('month');
  const [selectedTab, setSelectedTab] = useState<'risk' | 'periods' | 'trades'>('risk');
  const [showMethodology, setShowMethodology] = useState(false);
  const periods = periodMode === 'month' ? insights.monthly : insights.weekly;
  const latestStreaks = insights.streaks.slice(-24);
  return <section className="insight-section" aria-label="Advanced strategy performance analysis">
    <div className="insight-heading">
      <div><small><Activity size={14}/> ADVANCED PERFORMANCE</small><h2>Backtest deep dive <span>↗</span></h2><p>Risk, streaks and consistency beyond the headline P&L.</p></div>
      <div className="insight-scope"><CalendarDays size={15}/> {new Date(results.periodStart).toISOString().slice(0, 10)} – {new Date(results.periodEnd).toISOString().slice(0, 10)}</div>
    </div>
    <div className="insight-tabs" role="tablist" aria-label="Analysis category">
      <button role="tab" aria-selected={selectedTab === 'risk'} className={selectedTab === 'risk' ? 'active' : ''} onClick={() => setSelectedTab('risk')}><TrendingDown size={16}/> Risk & drawdown</button>
      <button role="tab" aria-selected={selectedTab === 'periods'} className={selectedTab === 'periods' ? 'active' : ''} onClick={() => setSelectedTab('periods')}><CalendarDays size={16}/> Monthly / weekly</button>
      <button role="tab" aria-selected={selectedTab === 'trades'} className={selectedTab === 'trades' ? 'active' : ''} onClick={() => setSelectedTab('trades')}><Layers3 size={16}/> Trades & streaks</button>
    </div>

    {selectedTab === 'risk' && <div className="insight-content">
      <div className="risk-grid">
        <Stat title="Sharpe ratio" value={amount(insights.sharpe)} hint={'Annualized 252-day, realized daily equity returns; zero risk-free rate (' + insights.dailyObservations + ' weekdays).'} polarity={insights.sharpe != null && insights.sharpe < 0 ? 'negative' : ''}/>
        <Stat title="Sortino ratio" value={amount(insights.sortino)} hint="Daily downside deviation, 252-day annualization, zero target return." polarity={insights.sortino != null && insights.sortino < 0 ? 'negative' : ''}/>
        <Stat title="Realized max drawdown" value={pct(insights.maxRealizedDrawdownPct)} hint="Largest closed-trade equity decline relative to a previous peak." polarity="negative"/>
        <Stat title="Annualized growth" value={pct(insights.annualizedReturn)} hint="Compounded growth rate from initial capital to final closed-trade equity over elapsed calendar time." polarity={insights.annualizedReturn != null && insights.annualizedReturn >= 0 ? 'positive' : 'negative'}/>
        <Stat title="Calmar ratio" value={amount(insights.calmar)} hint="Annualized realized growth divided by realized max drawdown percentage."/>
        <Stat title="Recovery to peak" value={pct(insights.currentRealizedDrawdownPct)} hint="Current deficit below the peak of the closed-trade equity curve." polarity={insights.currentRealizedDrawdownPct > 0 ? 'negative' : ''}/>
        <Stat title="Expectancy / trade" value={cash(insights.expectancy)} hint="Average profit/loss per closed trade." polarity={insights.expectancy != null && insights.expectancy >= 0 ? 'positive' : 'negative'}/>
        <Stat title="Avg win / avg loss" value={amount(insights.payoffRatio)} hint="Average winning trade divided by absolute average losing trade."/>
      </div>
      <div className="insight-panel dd-panel">
        <div className="insight-panel-head"><div><small>DOWNSIDE RISK</small><h3>Realized equity drawdown</h3></div><span className="insight-panel-value negative">{cash(insights.maxRealizedDrawdown)} worst</span></div>
        <DrawdownArea data={insights.drawdown}/>
        <div className="drawdown-foot"><div><small>Realized max</small><strong>{pct(insights.maxRealizedDrawdownPct)}</strong></div>
          <div><small>Currently below peak</small><strong>{pct(insights.currentRealizedDrawdownPct)}</strong></div>
          <div><small>PineTS max DD</small><strong>{cash(results.maxDrawdown)}</strong></div></div>
        <p className="insight-annotation"><Info size={14}/> Realized drawdown is calculated only after trades close. PineTS can report a different value because its strategy drawdown uses different equity and fill assumptions.</p>
      </div>
    </div>}

    {selectedTab === 'periods' && <div className="insight-content">
      <div className="insight-panel period-panel">
        <div className="insight-panel-head"><div><small>CONSISTENCY THROUGH TIME</small><h3>Profit / loss by period</h3></div>
          <div className="period-switch"><button className={periodMode === 'month' ? 'active' : ''} onClick={() => setPeriodMode('month')}>Monthly</button><button className={periodMode === 'week' ? 'active' : ''} onClick={() => setPeriodMode('week')}>Weekly</button></div>
        </div>
        <div className="period-snapshot">
          <div><small>Profitable periods</small><strong className="positive">{periods.filter(p => p.pnl > 0).length} / {periods.length}</strong></div>
          <div><small>Best period</small><strong className="positive">{periods.length ? cash(Math.max(...periods.map(p => p.pnl))) : 'N/A'}</strong></div>
          <div><small>Worst period</small><strong className="negative">{periods.length ? cash(Math.min(...periods.map(p => p.pnl))) : 'N/A'}</strong></div>
        </div>
        <PeriodBars periods={periods}/>
        {periodMode === 'month' && <div className="heatmap-section"><h4>Monthly performance map</h4><p>Green = profit, red = loss; shaded by relative magnitude. Blank = outside the selected range.</p><Heatmap monthly={insights.monthly}/></div>}
        <div className="period-actions"><strong>{periodMode === 'month' ? 'Monthly' : 'Weekly'} performance ledger</strong><button onClick={() => saveReport(exportPeriodAnalysis(periods), 'backtest-' + (periodMode === 'month' ? 'monthly' : 'weekly') + '-pnl.csv')}><Download size={14}/> Export CSV</button></div>
        <PeriodTable key={periodMode} periods={periods}/>
      </div>
    </div>}

    {selectedTab === 'trades' && <div className="insight-content">
      <div className="insight-panel streak-panel">
        <div className="insight-panel-head"><div><small>SEQUENTIAL RESULTS</small><h3>Winning and losing streaks</h3></div><BarChart3 size={19}/></div>
        <div className="streak-cards">
          <div><span><TrendingUp size={16}/> Longest winning streak</span><strong className="positive">{insights.longestWinningStreak} <small>trades</small></strong></div>
          <div><span><TrendingDown size={16}/> Longest losing streak</span><strong className="negative">{insights.longestLosingStreak} <small>trades</small></strong></div>
          <div><span><Activity size={16}/> Current streak</span><strong>{insights.currentStreak ? (insights.currentStreak.kind === 'win' ? 'Win × ' : 'Loss × ') + insights.currentStreak.length : '—'}</strong></div>
        </div>
        <h4 className="streak-caption">Most recent streaks <span>left to right, oldest → newest</span></h4>
        {latestStreaks.length ? <div className="streak-history">{latestStreaks.map((streak, i) => <div className={'streak-pill ' + streak.kind} key={i} title={streak.kind + ' × ' + streak.length + ' · ' + cash(streak.pnl) + ' · ' + new Date(streak.end).toISOString().slice(0, 10)}>
          {streak.kind === 'win' ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {streak.length}
        </div>)}</div> : <div className="insight-no-data">No winning or losing streaks yet.</div>}
        <p className="insight-annotation"><Info size={14}/> A streak counts consecutive profitable or losing closed trades. Breakeven trades reset the count.</p>
      </div>
      <div className="insight-panel">
        <div className="insight-panel-head"><div><small>TRADE QUALITY</small><h3>Outcome and direction breakdown</h3></div><span className="insight-panel-value">{insights.totalTrades} closed trades</span></div>
        <TradeInsights analytics={insights}/>
        <div className="weekday-section"><h4>Net P&L by entry weekday <small>(UTC)</small></h4>
          <div className="weekday-list">{insights.byDay.map(day => {
            const maxAbs = Math.max(1, ...insights.byDay.map(d => Math.abs(d.pnl)));
            return <div className="weekday-row" key={day.key} title={day.label + ': ' + cash(day.pnl) + ', ' + day.trades + ' trades'}>
              <span>{day.label}</span>
              <div className="weekday-track"><div className={day.pnl >= 0 ? 'gain' : 'loss'} style={{ width: (Math.abs(day.pnl) / maxAbs) * 100 + '%' }}/></div>
              <strong className={day.pnl >= 0 ? 'positive' : 'negative'}>{cash(day.pnl)}</strong><small>{day.trades} trades</small>
            </div>;
          })}</div>
        </div>
      </div>
    </div>}
    {!insights.reconciled && <div className="insight-reconciliation" role="alert"><ShieldAlert size={17}/><span>Closed-trade P&L {cash(insights.tradeTotal)} does not reconcile with the PineTS net profit {cash(results.netProfit)}. Verify engine reporting before interpreting ratios.</span></div>}
    <div className="analysis-methodology">
      <button onClick={() => setShowMethodology(v => !v)} aria-expanded={showMethodology}><Info size={15}/> How these metrics are calculated <span>{showMethodology ? '−' : '+'}</span></button>
      {showMethodology && <div className="analysis-notes">
        <p><strong>Data:</strong> {source}. {results.trades.length} closed trades, UTC {new Date(results.periodStart).toISOString().slice(0,10)} to {new Date(results.periodEnd).toISOString().slice(0,10)}.</p>
        {insights.notices.map((notice, i) => <p key={i}>{notice}</p>)}
        <p>Calculations are for strategy research. These ratios are not necessarily identical to TradingView's reports, which may use a different return sampling frequency, risk-free benchmark, or equity definition. They do not predict future profits.</p>
      </div>}
    </div>
  </section>;
}

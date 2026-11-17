import { useMemo } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Gauge, Layers3, TrendingUp } from 'lucide-react';
import { analyzeBacktest, type PeriodReturn } from './lib/analytics';
import type { Results } from './types';
import './dashboard.css';

const currency = (n: number | null | undefined) => n == null || !Number.isFinite(n)
  ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
const numeral = (n: number | null | undefined, places = 2) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });

function MiniStat({ title, value, sub, tone = 'blue' }: {
  title: string; value: string; sub: string; tone?: 'blue' | 'green' | 'red' | 'amber';
}) {
  return <div className={'db-stat db-stat-' + tone}>
    <div className="db-stat-label">{title}</div><strong className="db-stat-value" title={value}>{value}</strong>
    <div className="db-stat-desc">{sub}</div>
  </div>;
}

function BalanceChart({ results }: { results: Results | null }) {
  const equity = results?.equity ?? [];
  if (equity.length < 2) return <div className="db-empty-chart"><ChartNoAxesCombined size={32}/><span>Run a backtest to see the balance curve</span></div>;
  const values = equity.map(x => x.value);
  const top = Math.max(...values), bottom = Math.min(...values);
  const padding = Math.max((top - bottom) * .1, Math.abs(top) * .005, 1);
  const low = bottom - padding, range = top + padding - low;
  const path = values.map((v, i) =>
    (i === 0 ? 'M' : 'L') + (i / (values.length - 1) * 1000).toFixed(2) + ' ' + (205 - (v - low) / range * 190).toFixed(2)
  ).join(' ');
  const gain = values.at(-1)! >= values[0];
  return <div className="db-balance">
    <div className="db-balance-labels"><span>{currency(top)}</span><span>{currency((top + bottom) / 2)}</span><span>{currency(bottom)}</span></div>
    <svg viewBox="0 0 1000 225" preserveAspectRatio="none" role="img" aria-label="Realized equity curve across the chosen backtest">
      <defs><linearGradient id="db-balance-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={gain ? '#5b9dff' : '#fa8793'} stopOpacity=".36"/><stop offset="100%" stopColor={gain ? '#5b9dff' : '#fa8793'} stopOpacity=".015"/></linearGradient></defs>
      {[35,99,163,205].map(y => <line key={y} x1="0" y1={y} x2="1000" y2={y} stroke="#26364c" strokeWidth="1"/>)}
      {[100,250,400,550,700,850].map(x => <line key={x} y1="8" y2="214" x1={x} x2={x} stroke="#1d2a3c" strokeWidth="1"/>)}
      <path d={path + ' L1000 225 L0 225 Z'} fill="url(#db-balance-gradient)"/>
      <path d={path} fill="none" stroke={gain ? '#71a8ff' : '#fa8793'} strokeWidth="2.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
    <div className="db-balance-ticks"><span>{new Date(results!.periodStart).toISOString().slice(0, 10)}</span><span>{new Date(results!.periodEnd).toISOString().slice(0, 10)}</span></div>
  </div>;
}

function PeriodChart({ items }: { items: PeriodReturn[] }) {
  const last = items.slice(-18);
  if (!last.length) return <div className="db-empty-chart"><BarChart3 size={28}/><span>Monthly returns appear after a backtest</span></div>;
  const max = Math.max(...last.map(x => Math.abs(x.pnl)), 1);
  return <div className="db-period-wrap"><div className="db-months" role="img" aria-label="Monthly profit and loss bar chart">
    {last.map(x => <div key={x.key} className="db-month" title={x.label + ': ' + currency(x.pnl) + ' · ' + x.trades + ' trades'}>
      <div className="db-month-up">{x.pnl > 0 && <span style={{ height: Math.max(2, Math.abs(x.pnl) / max * 95) + '%' }} />}</div>
      <div className="db-month-axis" />
      <div className="db-month-down">{x.pnl < 0 && <span style={{ height: Math.max(2, Math.abs(x.pnl) / max * 95) + '%' }}/>}</div>
      <small>{x.key.slice(2).replace('-', '/')}</small>
    </div>)}
  </div><div className="db-legend"><span><i className="db-legend-pos"/>Positive month</span><span><i className="db-legend-neg"/>Negative month</span></div></div>;
}

export default function OverviewDashboard({ results, demo }: { results: Results | null; demo: boolean }) {
  const analytics = useMemo(() => results ? analyzeBacktest(results) : null, [results]);
  const trades = analytics?.totalTrades ?? 0;
  const winShare = trades ? analytics!.winners / trades * 100 : 0;
  const lossShare = trades ? analytics!.losers / trades * 100 : 0;
  const byDay = analytics?.byDay ?? [];
  const maxDay = Math.max(...byDay.map(x => Math.abs(x.pnl)), 1);
  const direction = [
    { title: 'Long trades', pnl: analytics?.longs.net ?? 0, count: analytics?.longs.count ?? 0 },
    { title: 'Short trades', pnl: analytics?.shorts.net ?? 0, count: analytics?.shorts.count ?? 0 }
  ];
  const maxSide = Math.max(...direction.map(x => Math.abs(x.pnl)), 1);
  return <section className="db-overview" id="dashboard" aria-label="Backtest overview dashboard">
    <div className="db-overview-heading">
      <div><span className="db-kicker"><Activity size={14}/> OVERVIEW</span><h2>Dashboard</h2><p>{results ? (trades.toLocaleString() + ' completed trades · ' + new Date(results.periodStart).toISOString().slice(0,10) + ' to ' + new Date(results.periodEnd).toISOString().slice(0,10)) : 'Your strategy, performance and risk in one place'}</p></div>
      <span className={'db-run-state ' + (results ? 'is-ready' : '')}><span/>{results ? (demo ? 'Demo results' : 'Backtest complete') : 'Ready for your first run'}</span>
    </div>
    <div className="db-stats">
      <MiniStat title="Total trades" value={results ? trades.toLocaleString() : '—'} sub={results ? analytics!.longs.count + ' long · ' + analytics!.shorts.count + ' short' : 'Completed positions'}/>
      <MiniStat title="Win rate" value={results ? numeral(results.winRate, 1) + '%' : '—'} sub={results ? analytics!.winners + ' wins · ' + analytics!.losers + ' losses' : 'Winning trades'}/>
      <MiniStat title="Net profit / loss" value={results ? currency(results.netProfit) : '—'} sub={results ? numeral(results.netProfit / (results.initialCapital || 1) * 100, 2) + '% of starting balance' : 'Realized return'} tone={results && results.netProfit < 0 ? 'red' : 'green'}/>
      <MiniStat title="Profit factor" value={results ? results.profitFactor == null ? 'N/A' : numeral(results.profitFactor) : '—'} sub="Gross profit / gross loss" tone="amber"/>
      <MiniStat title="Max drawdown" value={results ? currency(results.maxDrawdown) : '—'} sub="PineTS reported" tone="red"/>
      <MiniStat title="Sharpe ratio" value={results ? numeral(analytics!.sharpe) : '—'} sub="Risk-adjusted returns" tone="amber"/>
      <MiniStat title="Avg win / avg loss" value={results ? currency(analytics!.averageWin) : '—'} sub={results ? 'Loss ' + currency(analytics!.averageLoss) : 'Trade payoff'}/>
      <MiniStat title="Expectancy / trade" value={results ? currency(analytics!.expectancy) : '—'} sub="Average realized P&L" tone={results && (analytics?.expectancy ?? 0) < 0 ? 'red' : 'green'}/>
    </div>
    <div className="db-main-charts">
      <article className="db-panel"><div className="db-panel-head"><h3><TrendingUp size={17}/> Balance curve</h3><span>{results ? currency(results.initialCapital + results.netProfit) : 'Waiting for results'}</span></div><BalanceChart results={results}/></article>
      <article className="db-panel"><div className="db-panel-head"><h3><BarChart3 size={17}/> P&amp;L by month</h3><span>{analytics ? analytics.monthly.length + ' periods' : 'Monthly breakdown'}</span></div><PeriodChart items={analytics?.monthly ?? []}/></article>
    </div>
    <div className="db-breakdown">
      <article className="db-panel"><div className="db-panel-head"><h3><Gauge size={17}/> Win / loss</h3><span>{trades} closed</span></div>
        <div className="db-donut-layout"><div className="db-donut" style={{ background: trades ? 'conic-gradient(#3ccc86 0% ' + winShare + '%, #e85a53 ' + winShare + '% ' + (winShare + lossShare) + '%, #6e819d ' + (winShare + lossShare) + '% 100%)' : '#2b3b50' }}><div><strong>{trades ? numeral(winShare, 1) + '%' : '—'}</strong><small>{trades ? analytics!.winners + 'W / ' + analytics!.losers + 'L' : 'No trades yet'}</small></div></div>
        <div className="db-donut-legend"><span><i className="win"/>Win {analytics?.winners ?? 0}</span><span><i className="loss"/>Loss {analytics?.losers ?? 0}</span>{Boolean(analytics?.breakeven) && <span><i className="flat"/>Flat {analytics!.breakeven}</span>}</div></div>
      </article>
      <article className="db-panel"><div className="db-panel-head"><h3><Layers3 size={17}/> P&amp;L by direction</h3><span>Long vs short</span></div>
        <div className="db-side-breakdown">{direction.map(x => <div className="db-direction" key={x.title}><div><span>{x.title} · {x.count}</span><strong className={x.pnl >= 0 ? 'db-gain' : 'db-loss'}>{results ? currency(x.pnl) : '—'}</strong></div><div className="db-side-track"><span className={x.pnl >= 0 ? 'positive' : 'negative'} style={{ width: results ? Math.abs(x.pnl) / maxSide * 100 + '%' : '0%' }}/></div></div>)}</div>
      </article>
      <article className="db-panel"><div className="db-panel-head"><h3><CalendarDays size={17}/> P&amp;L by weekday</h3><span>Entry day · UTC</span></div>
        {results ? <div className="db-weekdays" role="img" aria-label="Profit and loss by entry weekday">{byDay.map(x => <div className="db-weekday" key={x.key} title={x.label + ': ' + currency(x.pnl) + ' (' + x.trades + ' trades)'}>
          <div className="db-weekday-upper">{x.pnl > 0 && <span style={{ height: Math.max(2, Math.abs(x.pnl) / maxDay * 96) + '%' }}/>}</div>
          <div className="db-weekday-mid"/><div className="db-weekday-lower">{x.pnl < 0 && <span style={{ height: Math.max(2, Math.abs(x.pnl) / maxDay * 96) + '%' }}/>}</div><small>{x.label}</small>
        </div>)}</div> : <div className="db-empty-chart db-small-empty"><CircleDollarSign size={26}/><span>Weekday performance appears here</span></div>}
      </article>
    </div>
    {results?.fees.bybit && <div className="db-cost-shortcut"><ArrowDownRight size={15}/> Broker cost model active. Detailed cost breakdown is shown in the Strategy Analysis section.</div>}
    {results && <div className="db-dash-footer"><span><ArrowUpRight size={14}/> Best win: {currency(analytics?.largestWin)} </span><span><ArrowDownRight size={14}/> Worst loss: {currency(analytics?.largestLoss)}</span><span>Commissions: {currency(results.fees.closedTradeCommissions + results.fees.openTradeEntryCommissions)}</span></div>}
  </section>;
}

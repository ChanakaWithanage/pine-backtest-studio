import type { Results, Trade } from '../types';

const DAY = 86_400_000;
const YEAR_DAYS = 365.2425;
const TRADING_DAYS = 252;

export interface PeriodReturn {
  key: string;
  label: string;
  start: number;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface DrawdownSnapshot {
  time: number;
  equity: number;
  peak: number;
  amount: number;
  percent: number;
}

export interface OutcomeStreak {
  kind: 'win' | 'loss';
  length: number;
  pnl: number;
  start: number;
  end: number;
}

export interface SidePerformance {
  count: number;
  net: number;
  wins: number;
  winRate: number | null;
}

export interface PerformanceInsights {
  totalTrades: number;
  winners: number;
  losers: number;
  breakeven: number;
  expectancy: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  payoffRatio: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  averageHoldingHours: number | null;
  longestWinningStreak: number;
  longestLosingStreak: number;
  currentStreak: OutcomeStreak | null;
  streaks: OutcomeStreak[];
  sharpe: number | null;
  sortino: number | null;
  annualizedReturn: number | null;
  calmar: number | null;
  dailyObservations: number;
  maxRealizedDrawdown: number;
  maxRealizedDrawdownPct: number;
  currentRealizedDrawdownPct: number;
  drawdown: DrawdownSnapshot[];
  monthly: PeriodReturn[];
  weekly: PeriodReturn[];
  byDay: PeriodReturn[];
  longs: SidePerformance;
  shorts: SidePerformance;
  reconciled: boolean;
  tradeTotal: number;
  notices: string[];
}

const dayStart = (time: number) => Math.floor(time / DAY) * DAY;
const toIsoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
const monthStart = (time: number) => {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const mondayStart = (time: number) => {
  const mondayOffset = (new Date(time).getUTCDay() + 6) % 7;
  return dayStart(time) - mondayOffset * DAY;
};
function isoWeekKey(monday: number) {
  const thursday = new Date(monday + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const firstMonday = mondayStart(jan4);
  return year + '-W' + String(1 + Math.round((monday - firstMonday) / (7 * DAY))).padStart(2, '0');
}
const dateLabel = (time: number, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(time));

function periods(trades: Trade[], first: number, last: number, mode: 'month' | 'week'): PeriodReturn[] {
  const start = mode === 'month' ? monthStart(first) : mondayStart(first);
  const end = mode === 'month' ? monthStart(last) : mondayStart(last);
  const index = new Map<number, PeriodReturn>();
  for (let d = start; d <= end;) {
    const label = mode === 'month'
      ? dateLabel(d, { month: 'short', year: 'numeric' })
      : dateLabel(d, { day: 'numeric', month: 'short', year: '2-digit' }) +
        ' – ' + dateLabel(d + 6 * DAY, { day: 'numeric', month: 'short' });
    index.set(d, {
      key: mode === 'month' ? toIsoDay(d).slice(0, 7) : isoWeekKey(d),
      label, start: d, pnl: 0, trades: 0, wins: 0, losses: 0
    });
    const previous = new Date(d);
    d = mode === 'week'
      ? d + 7 * DAY
      : Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
  }
  for (const trade of trades) {
    const key = mode === 'month' ? monthStart(trade.exitTime) : mondayStart(trade.exitTime);
    const period = index.get(key);
    if (!period) continue;
    period.pnl += trade.profit;
    period.trades++;
    if (trade.profit > 0) period.wins++;
    if (trade.profit < 0) period.losses++;
  }
  return [...index.values()];
}

function dailyReturns(trades: Trade[], start: number, end: number, capital: number): number[] {
  const dailyPnl = new Map<number, number>();
  for (const trade of trades) {
    const d = dayStart(trade.exitTime);
    dailyPnl.set(d, (dailyPnl.get(d) || 0) + trade.profit);
  }
  const result: number[] = [];
  let equity = capital;
  for (let d = dayStart(start); d <= dayStart(end); d += DAY) {
    const weekday = new Date(d).getUTCDay();
    // 252 annualization: include flat trading weekdays but not closed weekends.
    if (weekday === 0 || weekday === 6) continue;
    const pnl = dailyPnl.get(d) ?? 0;
    if (equity <= 0 || !Number.isFinite(equity + pnl)) return [];
    result.push(pnl / equity);
    equity += pnl;
  }
  return result;
}
function mean(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function stdev(xs: number[]) {
  const avg = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (xs.length - 1));
}
function riskRatios(returns: number[], tradeCount: number) {
  if (returns.length < 30 || tradeCount < 5) return { sharpe: null, sortino: null };
  const average = mean(returns);
  const volatility = stdev(returns);
  const downside = Math.sqrt(mean(returns.map(r => Math.min(r, 0) ** 2)));
  return {
    sharpe: volatility > 1e-12 ? (average / volatility) * Math.sqrt(TRADING_DAYS) : null,
    sortino: downside > 1e-12 ? (average / downside) * Math.sqrt(TRADING_DAYS) : null
  };
}
function sideStats(trades: Trade[], side: Trade['direction']): SidePerformance {
  const relevant = trades.filter(t => t.direction === side);
  const wins = relevant.filter(t => t.profit > 0).length;
  return {
    count: relevant.length,
    wins,
    net: relevant.reduce((sum, t) => sum + t.profit, 0),
    winRate: relevant.length ? wins / relevant.length * 100 : null
  };
}
function streakStats(trades: Trade[]) {
  const streaks: OutcomeStreak[] = [];
  let current: OutcomeStreak | null = null;
  for (const trade of trades) {
    if (trade.profit === 0) {
      if (current) streaks.push(current);
      current = null;
      continue; // Breakeven terminates streaks.
    }
    const kind = trade.profit > 0 ? 'win' : 'loss';
    if (current?.kind === kind) {
      current.length++;
      current.pnl += trade.profit;
      current.end = trade.exitTime;
    } else {
      if (current) streaks.push(current);
      current = {
        kind, length: 1, pnl: trade.profit,
        start: trade.exitTime, end: trade.exitTime
      };
    }
  }
  if (current) streaks.push(current);
  return {
    streaks,
    currentStreak: current,
    longestWinningStreak: Math.max(0, ...streaks.filter(s => s.kind === 'win').map(s => s.length)),
    longestLosingStreak: Math.max(0, ...streaks.filter(s => s.kind === 'loss').map(s => s.length))
  };
}

function drawdownSeries(trades: Trade[], initialCapital: number, from: number, through: number) {
  let equity = initialCapital, peak = initialCapital;
  let maxDrawdown = 0, maxDrawdownPct = 0;
  const series: DrawdownSnapshot[] = [{ time: from, equity, peak, amount: 0, percent: 0 }];
  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    const amount = Math.max(0, peak - equity);
    const percent = peak > 0 ? amount / peak * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, amount);
    maxDrawdownPct = Math.max(maxDrawdownPct, percent);
    series.push({ time: trade.exitTime, equity, peak, amount, percent });
  }
  // A horizontal tail prevents charts from implying the backtest ends at last exit.
  if (through > series[series.length - 1].time) {
    series.push({ ...series[series.length - 1], time: through });
  }
  return { series, maxDrawdown, maxDrawdownPct,
    currentRealizedDrawdownPct: series[series.length - 1].percent };
}

export function analyzeBacktest(results: Results): PerformanceInsights {
  const start = results.periodStart;
  const end = results.periodEnd;
  const trades = results.trades.slice().sort((a, b) =>
    a.exitTime - b.exitTime || a.entryTime - b.entryTime || a.id.localeCompare(b.id)
  );
  const total = trades.length;
  const winners = trades.filter(t => t.profit > 0);
  const losers = trades.filter(t => t.profit < 0);
  const tradeTotal = trades.reduce((sum, t) => sum + t.profit, 0);
  const winning = winners.reduce((sum, t) => sum + t.profit, 0);
  const losing = -losers.reduce((sum, t) => sum + t.profit, 0);
  const drawdown = drawdownSeries(trades, results.initialCapital, start, end);
  const returns = dailyReturns(trades, start, end, results.initialCapital);
  const risk = riskRatios(returns, total);
  const days = (end - start) / DAY;
  const endCapital = results.initialCapital + tradeTotal;
  const annualizedReturn = days >= 30 && results.initialCapital > 0 && endCapital > 0
    ? (Math.pow(endCapital / results.initialCapital, YEAR_DAYS / days) - 1) * 100
    : null;
  const calmar = annualizedReturn !== null && drawdown.maxDrawdownPct > 0
    ? annualizedReturn / drawdown.maxDrawdownPct : null;
  const current = streakStats(trades);
  const avgHold = total
    ? trades.reduce((s, t) => s + Math.max(0, t.exitTime - t.entryTime), 0) / total / 3_600_000
    : null;
  const notices = [
    'Sharpe and Sortino use UTC weekday daily returns from realized closed-trade equity, 252-day annualization, and a 0% risk-free/target rate. Flat weekdays are included.',
    'All charts here use closed trades only. They exclude open-position P&L and intrabar drawdown, so they can differ from TradingView or PineTS strategy-equity metrics.',
    'Weekly/monthly P&L groups trades by UTC exit date. A breakeven trade ends a win/loss streak.'
  ];
  if (returns.length < 30 || total < 5) {
    notices.unshift('Risk-adjusted ratios need at least 30 positive-equity weekdays and 5 closed trades; unavailable values display N/A.');
  }
  const reconciled = Math.abs(tradeTotal - results.netProfit) < Math.max(0.01, Math.abs(results.netProfit) * 1e-6);
  if (!reconciled) {
    notices.unshift(
      'Caution: sum of closed-trade profits (' + tradeTotal.toFixed(2) +
      ') differs from PineTS net profit (' + results.netProfit.toFixed(2) +
      '). Check commissions and engine reporting before trusting these statistics.'
    );
  }
  return {
    totalTrades: total, winners: winners.length, losers: losers.length,
    breakeven: total - winners.length - losers.length,
    expectancy: total ? tradeTotal / total : null,
    averageWin: winners.length ? winning / winners.length : null,
    averageLoss: losers.length ? -losing / losers.length : null,
    payoffRatio: losers.length && winners.length && losing > 0
      ? (winning / winners.length) / (losing / losers.length) : null,
    largestWin: winners.length ? Math.max(...winners.map(t => t.profit)) : null,
    largestLoss: losers.length ? Math.min(...losers.map(t => t.profit)) : null,
    averageHoldingHours: avgHold,
    ...current,
    ...risk,
    annualizedReturn, calmar, dailyObservations: returns.length,
    maxRealizedDrawdown: drawdown.maxDrawdown,
    maxRealizedDrawdownPct: drawdown.maxDrawdownPct,
    currentRealizedDrawdownPct: drawdown.currentRealizedDrawdownPct,
    drawdown: drawdown.series,
    weekly: periods(trades, start, end, 'week'),
    monthly: periods(trades, start, end, 'month'),
    byDay: Array.from({ length: 7 }, (_, day) => {
      // Monday first, Sunday last.
      const d = (day + 1) % 7;
      const weekdayTrades = trades.filter(t => new Date(t.entryTime).getUTCDay() === d);
      return {
        key: String(d), label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d],
        start: day, pnl: weekdayTrades.reduce((sum, t) => sum + t.profit, 0),
        trades: weekdayTrades.length,
        wins: weekdayTrades.filter(t => t.profit > 0).length,
        losses: weekdayTrades.filter(t => t.profit < 0).length
      };
    }),
    longs: sideStats(trades, 'Long'), shorts: sideStats(trades, 'Short'),
    reconciled, tradeTotal, notices
  };
}

export function exportPeriodAnalysis(periods: PeriodReturn[]): string {
  const lines = ['period,realized_net_profit,trades,wins,losses'];
  for (const p of periods) {
    lines.push([p.key, p.pnl.toFixed(2), p.trades, p.wins, p.losses].join(','));
  }
  return lines.join('\n') + '\n';
}

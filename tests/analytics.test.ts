import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeBacktest, exportPeriodAnalysis } from '../src/lib/analytics.ts';
import type { Results, Trade } from '../src/types.ts';

const timestamp = (date: string) => Date.parse(date + 'T15:00:00Z');
const january = Date.parse('2025-01-01T00:00:00Z');
const april = Date.parse('2025-04-30T00:00:00Z');

function trade(n: number, profit: number, exitDate: string, direction: Trade['direction'] = 'Long'): Trade {
  const exitTime = timestamp(exitDate);
  return {
    id: String(n), direction, entryTime: exitTime - 2 * 3_600_000,
    exitTime, entryPrice: 2000, exitPrice: 2010, size: 1,
    profit, commission: 0
  };
}
function fixture(trades: Trade[], initialCapital = 100): Results {
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  return {
    periodStart: january, periodEnd: april, initialCapital, trades,
    equity: [{ time: january, value: initialCapital }],
    netProfit, grossProfit: 0, grossLoss: 0, winRate: 0, profitFactor: null,
    maxDrawdown: 0, maxDrawdownPercent: 0, openTrades: 0, pendingOrders: 0,
    warnings: []
  };
}
const trades = [
  trade(1, 10, '2025-01-02'), trade(2, 5, '2025-01-03'),
  trade(3, -4, '2025-01-06'), trade(4, 0, '2025-01-07'),
  trade(5, 20, '2025-02-06', 'Short'), trade(6, -8, '2025-02-10'),
  trade(7, -10, '2025-02-12', 'Short'), trade(8, 20, '2025-03-03')
];

test('calculates payoff, expectancy, win/loss/breakeven counts and direction', () => {
  const a = analyzeBacktest(fixture(trades));
  assert.equal(a.totalTrades, 8);
  assert.deepEqual([a.winners, a.losers, a.breakeven], [4, 3, 1]);
  assert.equal(a.expectancy, 33 / 8);
  assert.equal(a.averageWin, 55 / 4);
  assert.equal(a.averageLoss, -22 / 3);
  assert.ok(Math.abs(a.payoffRatio! - (55/4)/(22/3)) < 1e-12);
  assert.equal(a.longs.count, 6);
  assert.equal(a.shorts.count, 2);
  assert.equal(a.longs.net + a.shorts.net, 33);
  assert.equal(a.largestWin, 20);
  assert.equal(a.largestLoss, -10);
  assert.equal(a.averageHoldingHours, 2);
});

test('calculates max realized peak-to-trough drawdown independent of PineTS field', () => {
  const a = analyzeBacktest(fixture(trades));
  assert.equal(a.maxRealizedDrawdown, 18);
  assert.ok(Math.abs(a.maxRealizedDrawdownPct - (18 / 131 * 100)) < 1e-9);
  assert.equal(a.currentRealizedDrawdownPct, 0);
  assert.equal(a.drawdown[0].percent, 0);
  assert.equal(a.drawdown.at(-1)!.equity, 133);
});

test('winning and losing streaks reset after breakeven trades', () => {
  const a = analyzeBacktest(fixture(trades));
  assert.equal(a.longestWinningStreak, 2);
  assert.equal(a.longestLosingStreak, 2);
  assert.deepEqual(a.streaks.map(s => [s.kind, s.length]),
    [['win', 2], ['loss', 1], ['win', 1], ['loss', 2], ['win', 1]]);
  assert.equal(a.currentStreak?.kind, 'win');
  assert.equal(a.currentStreak?.length, 1);
});

test('monthly P&L retains flat periods, matches total, and has CSV export', () => {
  const a = analyzeBacktest(fixture(trades));
  assert.deepEqual(a.monthly.map(p => p.pnl), [11, 2, 20, 0]);
  assert.equal(a.monthly.length, 4);
  assert.equal(a.monthly.reduce((sum, p) => sum + p.pnl, 0), 33);
  assert.equal(a.weekly.reduce((sum, p) => sum + p.pnl, 0), 33);
  assert.match(exportPeriodAnalysis(a.monthly), /2025-02,2\.00,3,1,2/);
  assert.match(exportPeriodAnalysis(a.monthly), /2025-04,0\.00,0,0,0/);
});

test('ISO week grouping handles weeks crossing calendar-year boundaries', () => {
  const r = fixture([trade(1, 10, '2024-12-30'), trade(2, -4, '2025-01-02')]);
  r.periodStart = Date.parse('2024-12-30T00:00:00Z');
  r.periodEnd = Date.parse('2025-01-10T00:00:00Z');
  const a = analyzeBacktest(r);
  assert.equal(a.weekly.find(p => p.key === '2025-W01')?.pnl, 6);
});

test('risk ratios are annualized on daily realized equity and not invented for tiny samples', () => {
  const a = analyzeBacktest(fixture(trades));
  assert.equal(a.dailyObservations > 30, true);
  assert.ok(a.sharpe !== null && Number.isFinite(a.sharpe));
  assert.ok(a.sortino !== null && Number.isFinite(a.sortino));
  assert.ok(a.annualizedReturn !== null && a.annualizedReturn > 0);
  assert.ok(a.calmar !== null && a.calmar > 0);
  const low = analyzeBacktest(fixture([trade(1, 5, '2025-01-02')]));
  assert.equal(low.sharpe, null);
  assert.equal(low.sortino, null);
});

test('no closed trades yield N/A expectancy and no divide by zero', () => {
  const a = analyzeBacktest(fixture([]));
  assert.equal(a.expectancy, null);
  assert.equal(a.averageWin, null);
  assert.equal(a.averageLoss, null);
  assert.equal(a.payoffRatio, null);
  assert.equal(a.longestWinningStreak, 0);
  assert.equal(a.sharpe, null);
  assert.equal(a.sortino, null);
  assert.equal(a.currentRealizedDrawdownPct, 0);
  assert.ok(!a.monthly.some(p => p.pnl !== 0));
});

test('detects non-reconciling PineTS account profit', () => {
  const r = fixture(trades);
  r.netProfit = 99;
  const a = analyzeBacktest(r);
  assert.equal(a.reconciled, false);
  assert.match(a.notices[0], /differs from PineTS net profit/);
});

test('repeated runs do not mutate original trade array ordering', () => {
  const reversed = [...trades].reverse();
  const results = fixture(reversed);
  analyzeBacktest(results);
  assert.deepEqual(results.trades, reversed);
});

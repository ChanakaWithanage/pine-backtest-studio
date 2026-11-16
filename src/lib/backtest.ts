import { PineTS } from 'pinets';
import type { Candle, Results, Trade, EquityPoint } from '../types';

interface PineTrade {
  id?: string;
  entry_id?: string;
  entry_price: number;
  exit_price?: number;
  entry_time: number;
  exit_time?: number;
  size: number;
  profit?: number;
  commission?: number;
}
interface PineState {
  initial_capital: number;
  netprofit: number;
  grossprofit: number;
  grossloss: number;
  max_drawdown: number;
  max_drawdown_percent?: number;
  closedtrades: PineTrade[];
  opentrades: PineTrade[];
}

export async function runBacktest(script: string, candles: Candle[]): Promise<Results> {
  if (!/\/\/\s*@version\s*=\s*[56]\b/.test(script)) {
    throw new Error('Add //@version=5 or //@version=6 to the top of the Pine Script.');
  }
  if (!/\bstrategy\s*\(/.test(script)) {
    throw new Error('The script must declare strategy(...). Indicator-only scripts do not place orders.');
  }
  if (candles.length < 40) throw new Error('At least 40 candles are required for the example and indicator warm-up.');

  const pine = new PineTS(candles.map(c => ({
    openTime: c.time, open: c.open, high: c.high,
    low: c.low, close: c.close, volume: c.volume
  })));
  pine.setExecutionTimeout(60_000);
  pine.setMaxLoops(10_000_000);
  const context = await pine.run(script);
  const state = context.strategy as unknown as PineState | undefined;
  if (!state || !Array.isArray(state.closedtrades)) {
    throw new Error('PineTS did not return a strategy state. Check strategy() and supported Pine features.');
  }

  const trades: Trade[] = state.closedtrades.map((t, index) => ({
    id: t.entry_id || t.id || String(index + 1),
    direction: t.size >= 0 ? 'Long' : 'Short',
    entryTime: t.entry_time,
    exitTime: t.exit_time ?? t.entry_time,
    entryPrice: t.entry_price,
    exitPrice: t.exit_price ?? t.entry_price,
    size: Math.abs(t.size),
    profit: t.profit ?? 0,
    commission: t.commission ?? 0
  }));
  trades.sort((a, b) => a.exitTime - b.exitTime);
  let realizedEquity = state.initial_capital;
  const equity: EquityPoint[] = [{ time: candles[0].time, value: realizedEquity }];
  for (const trade of trades) {
    realizedEquity += trade.profit;
    equity.push({ time: trade.exitTime, value: realizedEquity });
  }
  const wins = trades.filter(t => t.profit > 0).length;
  const loss = Math.abs(state.grossloss);
  const maxDrawdown = Math.abs(state.max_drawdown ?? 0);
  return {
    trades,
    equity,
    netProfit: state.netprofit,
    initialCapital: state.initial_capital,
    maxDrawdown,
    maxDrawdownPercent: state.max_drawdown_percent ?? 0,
    grossProfit: state.grossprofit,
    grossLoss: state.grossloss,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    profitFactor: loss > 0 ? state.grossprofit / loss : null,
    openTrades: state.opentrades?.length ?? 0,
    warnings: [
      'PineTS is an independent Pine runtime. Compare overlapping trades with TradingView before relying on results.',
      'Strategy fills use OHLCV bars; without finer data, intrabar stop/target ordering may differ.',
      'The equity chart shows realized closed-trade P&L, not intrabar mark-to-market equity.'
    ]
  };
}

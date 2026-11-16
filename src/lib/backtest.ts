import { PineTS } from 'pinets';
import { DEFAULT_CONTRACT, buildCsvPineProvider } from './csv-provider.ts';
import { zeroTradeHints } from './diagnostics.ts';
import { DEFAULT_FEES, planExecutionCosts, estimatedUtcRollovers, type FeeSettings } from './commissions.ts';
import type { Candle, Results, Trade, EquityPoint, ContractSettings } from '../types';

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
  pending_orders?: unknown[];
  config?: { commission_type?: string; commission_value?: number };
}

export async function runBacktest(script: string, candles: Candle[], contract: ContractSettings = DEFAULT_CONTRACT, feeSettings: FeeSettings = DEFAULT_FEES): Promise<Results> {
  if (!/\/\/\s*@version\s*=\s*[56]\b/.test(script)) {
    throw new Error('Add //@version=5 or //@version=6 to the top of the Pine Script.');
  }
  if (!/\bstrategy\s*\(/.test(script)) {
    throw new Error('The script must declare strategy(...). Indicator-only scripts do not place orders.');
  }
  if (candles.length < 40) throw new Error('At least 40 candles are required for the example and indicator warm-up.');

  // A bare PineTS candle array has no syminfo metadata; the uploaded Gold
  // Breakout strategy depends on mincontract and pointvalue to create orders.
  // Pass the real timeframe so time_close and broker sessions are correct.
  const feePlan = planExecutionCosts(script, feeSettings, contract.pointvalue, contract.mintick);
  const feed = buildCsvPineProvider(candles, contract);
  const pine = new PineTS(feed.provider, feed.tickerId, feed.timeframe);
  pine.setMaxLoops(10_000_000);
  const context = await pine.run(feePlan.script);
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
  // Spread slippage is already included by PineTS in the trade's ENTRY and
  // EXIT prices. Never deduct it again here. We show its approximate dollar
  // value as an explanatory cost breakdown.
  let overnightTotal = 0;
  if (feePlan.bybit) {
    const { appliedSpreadUsd, ouncesPerLot, overnightUsdPerLot } = feePlan.bybit;
    for (const trade of trades) {
      const ounces = trade.size * contract.pointvalue;
      trade.spreadCostEstimate = ounces * appliedSpreadUsd;
      const swaps = estimatedUtcRollovers(trade.entryTime, trade.exitTime);
      const swapCost = swaps * (ounces / ouncesPerLot) * overnightUsdPerLot;
      trade.swapCostEstimate = swapCost;
      trade.profit -= swapCost;
      overnightTotal += swapCost;
    }
  }
  let realizedEquity = state.initial_capital;
  const equity: EquityPoint[] = [{ time: candles[0].time, value: realizedEquity }];
  for (const trade of trades) {
    realizedEquity += trade.profit;
    equity.push({ time: trade.exitTime, value: realizedEquity });
  }
  const wins = trades.filter(t => t.profit > 0).length;
  // A nonzero manually configured swap is a post-trade estimate because
  // PineTS has no variable swap-per-rollover feature. Recalculate stats
  // after applying it; order sizes were simulated before swap deductions.
  const adjustedGrossProfit = overnightTotal === 0 ? state.grossprofit :
    trades.reduce((total, trade) => total + Math.max(0, trade.profit), 0);
  const adjustedGrossLoss = overnightTotal === 0 ? state.grossloss :
    trades.reduce((total, trade) => total + Math.abs(Math.min(0, trade.profit)), 0) +
    (state.opentrades || []).reduce((total, trade) => total + (trade.commission || 0), 0);
  const loss = Math.abs(adjustedGrossLoss);
  const maxDrawdown = Math.abs(state.max_drawdown ?? 0);
  const openTrades = state.opentrades?.length ?? 0;
  const pendingOrders = state.pending_orders?.length ?? 0;
  const warnings = [
    'PineTS is an independent Pine runtime. Compare overlapping trades with TradingView before relying on results.',
    'Strategy fills use OHLCV bars; without finer data, intrabar stop/target ordering may differ.',
    'The equity chart shows realized closed-trade P&L, not intrabar mark-to-market equity.',
    'Contract settings represent the imported CSV instrument, not TVC:GOLD or a verified broker specification.'
  ];
  if (!trades.length) warnings.unshift(...zeroTradeHints(script, candles, contract, openTrades, pendingOrders));
  warnings.push('Commission policy: ' + feePlan.description);
  if (feePlan.bybit) {
    warnings.push(
      'Bybit CFD costs are fixed assumptions, not historical Bybit quotes. The USD/oz spread is approximated using per-fill PineTS slippage ticks; fills, triggers and orders may differ from actual bid/ask execution.'
    );
    warnings.push(
      'Bybit $/lot commission is collected at entry in reality. PineTS splits the same round-trip amount equally across opening and closing fills, so open-position accounting and drawdown timing differ.'
    );
    if (feePlan.bybit.overnightUsdPerLot !== 0) {
      warnings.push('Swap is an approximate UTC-midnight post-trade deduction. Real Bybit server rollover, long/short rates and Wednesday triple swap may differ. PineTS order sizing and maximum drawdown do not include this swap cost during execution.');
    }
  }
  const closedTradeCommissions = trades.reduce((total, trade) => total + trade.commission, 0);
  const openTradeEntryCommissions = (state.opentrades || []).reduce(
    (total, trade) => total + (trade.commission || 0), 0
  );
  const closedSpreadCostEstimate = feePlan.bybit
    ? trades.reduce((total, trade) => total + (trade.spreadCostEstimate || 0), 0) : 0;
  const openSpreadCostEstimate = feePlan.bybit
    ? (state.opentrades || []).reduce((total, trade) =>
        total + Math.abs(trade.size) * contract.pointvalue * feePlan.bybit!.appliedSpreadUsd / 2, 0)
    : 0;
  return {
    fees: {
      source: feePlan.source,
      overridden: feePlan.overridden,
      configuredRatePercent: feePlan.ratePercent,
      actualType: state.config?.commission_type ?? (feePlan.source === 'app' ? 'percent' : 'unknown'),
      actualValue: state.config?.commission_value ?? (feePlan.source === 'app' ? feeSettings.percent : 0),
      closedTradeCommissions,
      openTradeEntryCommissions,
      description: feePlan.description,
      pineDeclaration: feePlan.declaration,
      ...(feePlan.bybit ? { bybit: {
        ...feePlan.bybit, closedSpreadCostEstimate,
        openSpreadCostEstimate, swapCostEstimate: overnightTotal,
        totalCostEstimate: closedSpreadCostEstimate + overnightTotal +
          closedTradeCommissions + openTradeEntryCommissions
      } } : {})
    },
    trades,
    periodStart: candles[0].time,
    periodEnd: candles[candles.length - 1].time,
    equity,
    netProfit: state.netprofit - overnightTotal,
    initialCapital: state.initial_capital,
    maxDrawdown,
    maxDrawdownPercent: state.max_drawdown_percent ?? 0,
    grossProfit: adjustedGrossProfit,
    grossLoss: adjustedGrossLoss,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    profitFactor: loss > 0 ? adjustedGrossProfit / loss : null,
    openTrades,
    pendingOrders,
    warnings
  };
}

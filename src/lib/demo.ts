import type { Candle } from '../types';

export const EXAMPLE_SCRIPT = [
  '//@version=6',
  'strategy("EMA Crossover • Example", overlay=true, initial_capital=10000, default_qty_type=strategy.fixed, default_qty_value=1, commission_type=strategy.commission.percent, commission_value=0.02)',
  'fast = ta.ema(close, 12)',
  'slow = ta.ema(close, 30)',
  'plot(fast, "Fast EMA", color=color.aqua)',
  'plot(slow, "Slow EMA", color=color.orange)',
  'if ta.crossover(fast, slow)',
  '    strategy.entry("Long", strategy.long)',
  'if ta.crossunder(fast, slow)',
  '    strategy.entry("Short", strategy.short)'
].join('\n');

export function createDemoCandles(): Candle[] {
  // An entirely synthetic dataset for UI testing; NEVER present as real XAUUSD history.
  let seed = 17;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const candles: Candle[] = [];
  const start = Date.UTC(2026, 9, 5);
  let price = 3850;
  for (let i = 0; i < 24 * 4 * 28; i += 1) {
    const time = start + i * 15 * 60_000;
    const weekday = new Date(time).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const open = price;
    const change = Math.sin(i / 19) * 3.1 + Math.sin(i / 103) * 1.6 + (random() - 0.5) * 10;
    const close = Math.max(100, open + change);
    const high = Math.max(open, close) + random() * 4;
    const low = Math.min(open, close) - random() * 4;
    candles.push({ time, open, high, low, close, volume: Math.round(30 + random() * 125) });
    price = close;
  }
  return candles;
}

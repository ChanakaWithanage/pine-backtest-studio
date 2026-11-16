import type { Candle, ContractSettings } from '../types';

/**
 * A limited, independent sanity check for the uploaded Gold Breakout 15M script.
 * These are NOT signals or fill predictions; they diagnose plausible missing setups.
 */
export function zeroTradeHints(script: string, candles: Candle[], settings: ContractSettings, openCount: number, pendingCount: number): string[] {
  const hints = [
    'Zero closed trades does not prove the strategy is unprofitable. Review session logic, order sizes, and unfilled orders.'
  ];
  if (openCount) hints.push(openCount + ' position(s) are still open; net profit counts closed trades only.');
  if (pendingCount) hints.push(pendingCount + ' entry/exit order(s) remain pending at the end of the dataset.');
  if (!/Gold Breakout 15M|rangeFromInput|rangeToInput/.test(script)) {
    hints.push('Use a minimal strategy.entry/strategy.close test to confirm PineTS supports this script’s order logic.');
    return hints;
  }
  const numeric = (name: string, fallback: number): number => {
    const found = script.match(new RegExp(name + '\\s*=\\s*input\\.int\\(\\s*(\\d+)'));
    return found ? Number(found[1]) : fallback;
  };
  const fromHour = numeric('rangeFromInput', 0), toHour = numeric('rangeToInput', 7);
  const closeHour = numeric('closeHourInput', 20);
  if (!(fromHour < toHour && toHour < closeHour)) {
    hints.push('The configured hours disable trading: Range Start must be before Range End, which must be before Close Hour.');
    return hints;
  }

  // Only analyze the default FIXED GMT+3 mode; other modes need DST-aware runtime inputs.
  if (!/tzInput\s*=\s*input\.string\("GMT\+3"/.test(script) ||
      !/tzModeInput\s*=\s*input\.string\(TZ_MODE_FIXED/.test(script)) {
    hints.push('Check your broker time mode and timezone: session calculations may use a different clock from the CSV.');
    return hints;
  }
  const intervals = candles.length > 1 ? candles[1].time - candles[0].time : 0;
  const expectedRangeBars = Math.ceil((toHour - fromHour) * 3_600_000 / intervals);
  const sessions = new Map<number, { count: number; high: number; low: number; bars: Candle[] }>();
  for (const c of candles) {
    const local = new Date(c.time + 3 * 3_600_000);
    const key = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    const hour = local.getUTCHours();
    let s = sessions.get(key);
    if (!s) { s = { count: 0, high: -Infinity, low: Infinity, bars: [] }; sessions.set(key, s); }
    if (hour >= fromHour && hour < toHour) {
      s.count++;
      s.high = Math.max(s.high, c.high); s.low = Math.min(s.low, c.low);
    } else if (hour >= toHour && hour < closeHour) s.bars.push(c);
  }
  const complete = [...sessions.values()].filter(s => s.count >= expectedRangeBars && s.high > s.low);
  const breakouts = complete.filter(s => s.bars.some(c => c.high > s.high || c.low < s.low)).length;
  hints.push('Approximate default GMT+3 session check: ' + complete.length + ' days with full overnight ranges; ' + breakouts + ' days with a later range breakout. This is not a PineTS trade count.');
  if (!complete.length) hints.push('No full overnight ranges were found. Verify 15-minute data coverage and the CSV timestamp timezone.');
  else if (!breakouts) hints.push('No post-range breakouts found in the selected data; try a wider historical period or real gold candles.');
  else hints.push('Breakout opportunities exist in the candles, but the engine did not close trades. Inspect strategy quantity step, point value, order cancellation and PineTS compatibility.');
  if (settings.mincontract >= 1) hints.push('Minimum contract size is set to ' + settings.mincontract + '; risk-sized quantities below that will be rounded down to zero.');
  return hints;
}

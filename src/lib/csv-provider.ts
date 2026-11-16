import { inferIntervalMinutes } from './csv.ts';
import type { Candle, ContractSettings } from '../types';

/**
 * A local in-memory price feed with explicit, *user-configured* symbol metadata.
 *
 * PineTS doesn't infer syminfo fields from bare OHLCV arrays. Without pointvalue
 * and mincontract, risk-sized Pine strategies can calculate NaN/zero quantity.
 *
 * "IMPORTED:OHLCV" is generic placeholder metadata. Never claim the input is TVC:GOLD.
 */
export const DEFAULT_CONTRACT: ContractSettings = {
  pointvalue: 1,
  mincontract: 0.01,
  mintick: 0.01
};

export function assertContract(settings: ContractSettings): void {
  for (const key of ['pointvalue', 'mincontract', 'mintick'] as const) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0) {
      throw new Error(key + ' must be a positive number. Configure instrument settings before running.');
    }
  }
}

export function buildCsvPineProvider(candles: Candle[], settings: ContractSettings) {
  assertContract(settings);
  const minutes = inferIntervalMinutes(candles);
  if (!minutes) throw new Error('Cannot determine timeframe from imported data.');
  const requested = String(minutes);
  const marketData = candles.map(c => ({
    openTime: c.time,
    closeTime: c.time + minutes * 60_000,
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    quoteAssetVolume: 0, numberOfTrades: 0, takerBuyBaseAssetVolume: 0,
    takerBuyQuoteAssetVolume: 0, ignore: 0
  }));
  const symbolInfo = {
    current_contract: '', description: 'User-imported unverified OHLCV',
    isin: '', main_tickerid: 'IMPORTED:OHLCV', prefix: 'IMPORTED',
    root: 'OHLCV', ticker: 'OHLCV', tickerid: 'IMPORTED:OHLCV', type: 'forex',
    basecurrency: '', country: '', currency: 'USD', timezone: 'Etc/UTC',
    employees: 0, industry: '', sector: '', shareholders: 0,
    shares_outstanding_float: 0, shares_outstanding_total: 0,
    expiration_date: 0, session: '24x7', volumetype: 'tick',
    mincontract: settings.mincontract, minmove: 1, mintick: settings.mintick,
    pointvalue: settings.pointvalue, pricescale: 1 / settings.mintick,
    recommendations_buy: 0, recommendations_buy_strong: 0,
    recommendations_date: 0, recommendations_hold: 0, recommendations_sell: 0,
    recommendations_sell_strong: 0, recommendations_total: 0,
    target_price_average: 0, target_price_date: 0, target_price_estimates: 0,
    target_price_high: 0, target_price_low: 0, target_price_median: 0
  };
  return {
    tickerId: 'IMPORTED:OHLCV',
    timeframe: requested,
    marketData,
    symbolInfo,
    provider: {
      async getMarketData(_symbol: string, timeframe: string) {
        // Don't silently serve 15m candles to request.security("D") scripts.
        if (timeframe !== requested) {
          throw new Error('Multi-timeframe data (' + timeframe + ') not available for this CSV source. Import the requested interval.');
        }
        return marketData;
      },
      async getSymbolInfo() { return symbolInfo; },
      configure(_config: unknown) {}
    }
  };
}

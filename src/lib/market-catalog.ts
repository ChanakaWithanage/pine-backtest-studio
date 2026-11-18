/**
 * Research shortcuts, NOT hosted or licensed market-data files.
 * Provider sites decide what instruments and resolutions can be exported.
 */
export interface MarketShortcut {
  symbol: string;
  name: string;
  category: string;
  description: string;
  suggestedTimeframe: string;
  provider: string;
  providerUrl: string;
  note: string;
}
export const MARKET_SHORTCUTS: MarketShortcut[] = [
  {
    symbol: 'XAUUSD', name: 'Gold / USD', category: 'Metals',
    description: 'Your original overnight-range breakout market.',
    suggestedTimeframe: '15m',
    provider: 'EV Trading Labs historical data catalogue',
    providerUrl: 'https://evtradelabs.com/data',
    note: 'Filter XAUUSD / M15, select years 2016–2026 and export permitted yearly files. Recent-year data may require a free account. Import a ZIP or JSON.gz. Not TVC:GOLD.'
  },
  {
    symbol: 'XAGUSD', name: 'Silver / USD', category: 'Metals',
    description: 'Another metal to test breakout volatility.',
    suggestedTimeframe: '15m',
    provider: 'Dukascopy historical data export',
    providerUrl: 'https://www.dukascopy.com/swiss/english/marketwatch/historical/',
    note: 'Select XAGUSD where available. Verify symbol, timezone, and contract size.'
  },
  {
    symbol: 'GBPUSD', name: 'Pound / USD', category: 'Forex',
    description: 'Explore Asian-range breaks during the London session.',
    suggestedTimeframe: '15m',
    provider: 'Dukascopy historical data export',
    providerUrl: 'https://www.dukascopy.com/swiss/english/marketwatch/historical/',
    note: 'Change broker hours and point value in your script and settings.'
  },
  {
    symbol: 'EURUSD', name: 'Euro / USD', category: 'Forex',
    description: 'Liquid forex pair for comparing range-break behavior.',
    suggestedTimeframe: '15m',
    provider: 'Dukascopy historical data export',
    providerUrl: 'https://www.dukascopy.com/swiss/english/marketwatch/historical/',
    note: 'Use matching currency, time and spread assumptions.'
  },
  {
    symbol: 'NAS100', name: 'Nasdaq 100', category: 'Indices',
    description: 'Test a New York session range rather than the gold schedule.',
    suggestedTimeframe: '15m',
    provider: 'Bring your broker/exported OHLCV',
    providerUrl: 'https://www.dukascopy.com/swiss/english/marketwatch/historical/',
    note: 'Instrument availability is provider-dependent; use a permitted broker export.'
  }
];
export function sortMarketShortcuts(favorites: string[]): MarketShortcut[] {
  return [...MARKET_SHORTCUTS].sort((a, b) =>
    Number(favorites.includes(b.symbol)) - Number(favorites.includes(a.symbol)));
}

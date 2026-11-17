# Pine Backtest Studio V2 — public beta

**V1 is preserved on `v1-stable`. V2's deployment branch is `main`; development history also remains on `v2-public`.**

## User journey
1. **Choose data:** pick a favorite market shortcut, obtain an OHLCV CSV from an authorized source, drag it onto the page or use the import button. Built-in synthetic example data is also available for UI exploration.
2. **Choose strategy:** import a Pine v5/v6 strategy or edit the supplied Gold Breakout example. Other markets require instrument-specific session, point-value and order-sizing settings.
3. **Run and review:** choose the date range and costs; run in the browser, inspect trades and drawdown, and export trades to CSV.

## Data Library
- A curated set of market shortcuts (XAUUSD, XAGUSD, GBPUSD, EURUSD and NAS100), each with provider access instructions.
- Favorite shortcuts are kept in this browser's localStorage.
- User-imported candles can be saved privately to IndexedDB for future sessions, reloaded or removed.
- Current candles can be exported to an ordinary CSV for backup and reimport.
- A synthetic demo dataset is always available; it is **not real market data**.
- No external data provider feed is scraped, proxied, predownloaded or hosted by this public release.

### Publishing safely
V2 `npm run build` **does not download Dukascopy market data**. It refuses to package market files under `public/history/` unless `V2_PUBLIC_DATA_LICENSE_CONFIRMED=yes` is explicitly supplied and the operator has independently verified the necessary rights.

Public historical data is not included because display/download availability does not imply public redistribution and commercial-use permission. TradingView chart embed is reference-only, not a source of backtesting candles.

## Cloudflare Pages deployment
Use your existing **Cloudflare Pages Git deployment** (if linked to this repository) with:
- Repository: `ChanakaWithanage/pine-backtest-studio`
- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Node.js: `22`

The previous V1 is still available on the `v1-stable` branch. Publishing V2 on `main` replaces the existing site's V1 build if Cloudflare Pages deploys `main`. For a separate V1 website, configure another Pages project pointing to `v1-stable`. If you later obtain licensed public datasets, implement a vetted hosted dataset catalog separately.

## Important limitations
- PineTS is not TradingView's broker emulator. Verify representative executions against TradingView.
- Browser storage can be cleared or evicted; use Download CSV for backups.
- All CSV sources remain unverified; do not confuse Dukascopy XAUUSD, TVC:GOLD and broker-specific gold CFDs.
- Cost and contract assumptions are per instrument. Historical performance does not predict future results.

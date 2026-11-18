# Pine Backtest Studio V2 — public beta

**V1 is preserved on `v1-stable`. V2's deployment branch is `main`; development history also remains on `v2-public`.**

## User journey
1. **Choose data:** pick a favorite market shortcut, obtain an OHLCV CSV from an authorized source, drag it onto the page or use the import button. Built-in synthetic example data is also available for UI exploration.
2. **Choose strategy:** import a Pine v5/v6 strategy or edit the supplied Gold Breakout example. Other markets require instrument-specific session, point-value and order-sizing settings.
3. **Run and review:** choose the date range and costs; run in the browser, inspect trades and drawdown, and export trades to CSV.


## Backtest 10 years of Gold (15m)
The 10Y date preset selects a range in the candles already loaded. It **does not download missing history**.

1. In **Data library → Gold history**, open the [EV Trading Labs data catalogue](https://evtradelabs.com/data) and filter **XAUUSD / M15**. Download your permitted yearly files for 2016–2025, plus the 2026 file if you need the latest partial year. Some files, including the current year, may require a free account. Confirm the licence and attribute the source where required.
2. Use **Import Gold files / ZIP** (or the drag-and-drop area). Select the .json.gz, .json, CSV files or a ZIP archive. The browser validates each candle and merges overlapping dates only if the OHLCV values agree. Keep all years from the **same source and bid/ask type**.
3. Confirm the displayed **first and last dates**, total bars and 15-minute interval. The ten-year span should be around November 2016–November 2026, depending on the actual last available candle. Select **10Y** or **All loaded**, verify contract value/commission settings, and run.
4. Use **Save current dataset** to retain the imported candles in browser storage for future visits. Also download a CSV backup since browser storage can be evicted.

An optional private loader is available for deployments with an authorized `/history/manifest.json` and yearly history files. It is disabled when no manifest exists. The public Cloudflare build does not bundle or automatically download Dukascopy candles; Dukascopy's website usage terms restrict redistribution and unapproved automated collection.

## Data Library
- A curated set of market shortcuts (XAUUSD, XAGUSD, GBPUSD, EURUSD and NAS100), each with provider access instructions.
- Favorite shortcuts are kept in this browser's localStorage.
- User-imported candles can be saved privately to IndexedDB for future sessions, reloaded or removed.
- Current candles can be exported to an ordinary CSV for backup and reimport.
- A synthetic demo dataset is always available; it is **not real market data**.
- No external data provider feed is scraped, proxied, predownloaded or hosted by this public release.
- User-selected ZIP, JSON.gz, JSON, and CSV histories can be merged without uploading files to a backend.

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

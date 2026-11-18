# Pine Backtest Studio V2 — public beta

**V1 remains archived on `v1-stable`. V2 is deployed from `main`.**

## Built-in Gold history (no manual import)

The V2 site **automatically loads real XAUUSD 15-minute historical candles** from its static distribution when opened.

- **Data source:** [Yllvar/fx-historical-data on Hugging Face](https://huggingface.co/datasets/Yllvar/fx-historical-data), advertised under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Verified snapshot:** **200,000 candles** from **2017-12-07 through 2026-05-28 UTC** (approximately 8.5 years). These are the actual verified source timestamps. **It is not an uninterrupted November 2016–November 2026 dataset.**
- **Attribution:** Original market data is published by Yllvar. The app's build converts the downloaded Parquet file to yearly UTC CSV files and selects the source's latest available 10-year range without inventing missing prices. The dataset publisher describes the underlying feed as Dukascopy-derived. This is not TradingView TVC:GOLD, Bybit TradFi or Binance PAXGUSDT.
- **Automatic workflow:** `scripts/prepare-licensed-gold.mjs` downloads the publisher's pinned source file during `npm run build`, validates its SHA-256, timestamps, OHLCV and candle counts, and packages `dist/open-gold/manifest.json` plus ten yearly CSV segments. The website fetches the manifest and imports them on startup. GitHub CI verifies these generated files.
- **When source data changes:** Update the pinned SHA-256 after reviewing the new dataset. Never replace real source candles with synthetic data to increase the reported coverage.

Selecting **10Y** uses the greatest available portion of the loaded real candles. If the requested date would begin before the source's first candle, the UI clamps the start date and explains the limit. The **All loaded** button always selects the entire true source period.

Market-data redistribution and derivative rights can involve the original upstream provider as well as the published dataset's CC BY license. Review source terms when changing datasets.

## How to run a backtest

1. Open the website. The app loads the bundled historical Gold data automatically and reports the **actual available date range**. No CSV import, registration or download is needed.
2. Paste or load a Pine v5/v6 strategy. The default Gold Breakout example can be tested immediately. Verify the strategy's time zone, sizing and fees.
3. Select the date range, instrument contract assumptions and fees, then run. Inspect the detailed metrics and export the trade log.

For **other symbols or a different Gold feed**, use the Data Library to drag and drop CSV/JSON.gz/ZIP files from a source you are permitted to process, or restore a dataset saved in your own browser. The app does not mix provider feeds silently.

## Data Library

- Curated market shortcuts for XAUUSD, XAGUSD, GBPUSD, EURUSD and NAS100.
- Favorite market shortcuts stored locally.
- User-imported datasets saved privately in IndexedDB and restored on the same browser.
- CSV exports for local backup.
- A synthetic demo is available via **Reset**, clearly labeled. Synthetic demo results are not actual historical returns.

## Publishing and data policies

The optional legacy private Dukascopy history loader remains guarded under `/history/`; it is disabled if the private manifest is absent and the public build does not download Dukascopy directly. The new independently published Yllvar dataset is packaged separately under `/open-gold/`, with publisher, license and modification attribution.

The backtest itself is computed locally in the browser. The supplied market prices are published static assets, so visitors can retrieve them. Any site relying on third-party data must confirm the necessary upstream distribution permissions.

## Cloudflare Pages deployment

- Repository: `ChanakaWithanage/pine-backtest-studio`
- Production branch: `main`
- Build command: `npm run build`
- Output: `dist`
- Node.js: 22

The legacy V1 code remains in `v1-stable`. Run `npm run test` and `npm run build` before release. A successful build verifies the historical data download; GitHub CI also checks the manifest and generated file sizes.

## Important limitations

- PineTS is an independent runtime; strategy execution and fills can differ from TradingView.
- The bundled XAUUSD source has **only 8.5 years** of candles ending in May 2026. Do not advertise ten years ending in November 2026 until those bars actually exist.
- Candle times are UTC. No missing bars are synthesized.
- Actual instrument contract, margin, fees and bid/ask characteristics must be configured correctly.
- Historical backtest results are not guarantees of live-trading performance.

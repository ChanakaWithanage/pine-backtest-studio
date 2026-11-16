# Pine Backtest Studio

A browser-based Pine Script strategy backtesting workspace for extended historical datasets. Designed initially for XAUUSD/gold, with custom CSV market data, a Pine v5/v6 editor, execution charts, and downloadable trade logs.

**Stack:** React 19, TypeScript, Vite, PineTS, TradingView Lightweight Charts. Static frontend; no backend or API key required.

> **Important:** This is experimental research software, not TradingView's own strategy tester and not a trading system. PineTS is a third-party Pine runtime. Validate backtest signals, fills, and performance against a reference before relying on them.

## Features

- Upload historical CSV (Dukascopy's XAUUSD format or your own OHLCV data).
- Run Pine v5/v6 **strategy** source with PineTS's broker emulator in a browser Web Worker.
- Select an inclusive UTC date range; aggregate finer source candles to 3m, 5m, 15m, 30m, 1h or 4h.
- View a candlestick chart with entry and exit markers, win rate, net profit, profit factor, drawdown, realized equity, and a trade log.
- Export every closed trade to CSV.
- Open, edit, and save a local .pine file.
- Synthetic built-in demo prices (clearly labeled and **not** real gold history).
- Cloudflare Pages-compatible static build.

## Run locally

Requires Node.js 22+.

~~~bash
git clone https://github.com/ChanakaWithanage/pine-backtest-studio.git
cd pine-backtest-studio
npm install
npm run dev
~~~

Open the URL Vite prints (usually http://localhost:5173). The app starts with *synthetic* example candles and a simple EMA crossover strategy; click **Run Backtest** to verify the interaction.

**Tests and build**

~~~bash
npm run test
npm run build
~~~

The compiled static site is in dist/. Cloudflare Pages: **Build command** npm run build, **output directory** dist, **Node version** 22.

## Historical gold data

Use [dukascopy-node](https://www.dukascopy-node.app/quick-start) to download extended XAUUSD history. Data is downloaded on your own machine, not from the deployed webpage.

~~~bash
npm run download:gold -- 2023-11-16 2026-11-16 m15
~~~

This runs npx dukascopy-node with caching, retries, pacing, and volume, and saves CSV in the **data/** directory. Date upper bound is exclusive (2026-11-16 means through the end of 2026-11-15). Choose the generated CSV using **Import CSV**.

For 5-minute bars, use m5. For 3-minute analysis, download m1 candles first and aggregate them to 3m in the app. **You cannot derive genuine 3-minute candles from 15-minute candles.**

You can also import a self-supplied CSV:

~~~csv
timestamp,open,high,low,close,volume
1704067200000,2062.5,2065,2060,2063.4,125
1704068100000,2063.4,2065.9,2062.3,2065.1,98
~~~

- timestamp can be Unix milliseconds, Unix seconds, or ISO8601/date-time strings; timezone-free strings are interpreted in UTC.
- Required columns: timestamp (or time/date), open, high, low, close. volume is optional.
- Data is sorted by timestamp; duplicate timestamps and invalid OHLC values are rejected.
- Gaps are not filled with invented prices. Aggregating intervals drops incomplete groups.
- Browser import safety limits: 75 MB / 400,000 rows. There is no data provider integration on the website yet.
- Historical data is *not* committed to Git. Check your data provider's usage rights before redistributing.

## Run your own Pine strategy

1. Choose **Import CSV**, or use the synthetic demo to test the interface.
2. Select a valid date range and timeframe. The source interval must divide the selected output interval.
3. Paste Pine Script into the **Pine editor** or load a .pine file. It must declare strategy(), not indicator().
4. Click **Run Backtest**. Closed trades and simulated performance appear below the chart.
5. **Export all CSV** downloads the complete closed-trade history.

The checked-in example is [samples/ema-crossover.pine](samples/ema-crossover.pine). It is intentionally simple; it is *not* your proprietary Gold Breakout 15M strategy. Paste that strategy's source when available.

## Interpretation and limitations

- **Not identical feeds:** Dukascopy XAUUSD, TVC:GOLD, exchange gold futures and PAXGUSDT represent different markets/feeds. Timestamps and prices may differ.
- **Engine differences:** Native Pine execution in PineTS is evolving; not every function/setting/library works, even when a script compiles. Compare on a shared history window.
- **Intrabar ambiguity:** Historical OHLC bars alone cannot always determine whether a stop or target fired first. The engine cannot reproduce TradingView's Bar Magnifier from a 15m CSV alone.
- **Costs and trade size:** Edit the strategy() declaration to configure initial_capital, default_qty_type, commission_type, commission_value and slippage. The UI does not override these settings.
- **Tick size and symbol metadata:** Generic imported OHLCV may not carry your broker's exact syminfo.mintick, contract multiplier, lot sizing, margin or sessions. Results are not broker-specific.
- **Date range warm-up:** The chosen candles are passed to PineTS, and indicators may need warm-up bars. If you compare period results, include enough earlier history and confirm matching first usable signals.
- **Equity curve:** The displayed curve is *realized closed-trade P&L*, not intra-bar mark-to-market. Drawdown is sourced separately from PineTS.
- **Unrealized results:** Open trades are counted but not exported as closed trades; net profit is realized net profit.
- **Data completeness:** The user must check feed gaps, bad ticks, UTC alignment and market closures. A CSV is not audited by this app.
- **Performance:** The UI draws only the latest 1,500 candles, but the entire selected dataset is passed into the backtest worker.
- **Security and privacy:** Local scripts execute in a browser worker; this tool does not upload your code or candles. Do not import secrets in Pine source. Browser extensions and the browser itself remain outside this project's control.
- **Historical returns:** Backtests are simulations; they do not establish future profitability.

## Project structure

~~~text
src/
  App.tsx                React UI, chart, reports, CSV importer
  engine.worker.ts       Off-main-thread execution
  lib/backtest.ts        PineTS bridge and metrics
  lib/csv.ts             CSV parser, interval aggregation, trade export
  lib/demo.ts            Explicitly synthetic data and sample strategy
  styles.css             Responsive dark interface
samples/
  ema-crossover.pine     Example strategy
scripts/
  download-gold.mjs      Optional Dukascopy downloader
tests/
  csv.test.ts            CSV and timeframe regression tests
~~~

## License

The app is licensed under **GNU AGPL-3.0-only** because it links to [PineTS](https://github.com/LuxAlgo/PineTS), whose AGPL terms apply unless you obtain a separate commercial license. Read LICENSE. TradingView® / Pine Script® marks belong to TradingView, Inc.; this is an independent project.

Contributions and reproducible test cases are welcome.

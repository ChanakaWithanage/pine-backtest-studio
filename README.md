# Pine Backtest Studio

## Exact TVC:GOLD requirement

The strategy must be tested against **TradingView's calculated TVC:GOLD feed**, not generic XAUUSD, a broker CFD, Dukascopy XAUUSD, or COMEX futures. The project is not yet capable of ten years of authentic 15-minute TVC:GOLD backtesting, because it lacks an authorized historical TVC:GOLD data feed.

TradingView confirms that its TVC symbols are calculated by TradingView and may differ from otherwise similar instruments. Its free widget can display TVC:GOLD but does not expose candles to our independent strategy engine; TradingView's terms prohibit unauthorized data extraction and non-display processing. Use TVC:GOLD in TradingView's own backtesting tools, or arrange a separate permission/license allowing external backtests using this exact source. **Do not assume a chart CSV export grants rights for third-party automated processing.**

The legacy optional XAUUSD downloader remains available only for separate research on *different feeds*, **not** as the requested TVC:GOLD substitute. Any CSV import is labeled unverified until a lawful exact-symbol source can be established.

---

A browser-based Pine Script strategy backtesting workspace. The **requested target is TradingView TVC:GOLD**, 15-minute candles across ten years. The app currently **does not have this exact historical feed**; its live TradingView widget is display-only and imported OHLCV data is explicitly unverified. It must not be presented as an authentic TVC:GOLD backtest.

**Stack:** React 19, TypeScript, Vite, PineTS, TradingView Lightweight Charts. Static frontend; no backend or API key required.

> **Important:** This is experimental research software, not TradingView's own strategy tester and not a trading system. PineTS is a third-party Pine runtime. Validate backtest signals, fills, and performance against a reference before relying on them.

## Features

- Upload historical OHLCV CSV that you have the right to process (source identity is not verified by the app).
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

Open the URL Vite prints (usually http://localhost:5173). The app opens your full **Gold Breakout 15M Strategy v1.1.0** as the default source. On Cloudflare Pages it automatically loads the generated ten-year XAUUSD candles. Local development without the hosted-data build still starts with a clearly labeled synthetic demo.

**Tests and build**

~~~bash
npm run test
npm run build
~~~

The compiled static site is in dist/. Cloudflare Pages: **Build command** npm run build, **output directory** dist, **Node version** 22.

## Historical gold data: optional manual workflow

**Cloudflare users need no terminal or local clone.** The hosted build handles the ten-year data import automatically. The following CLI is only an optional method for developers who run the project locally, using [dukascopy-node](https://www.dukascopy-node.app/quick-start).

~~~bash
npm run download:gold

# Optional exact UTC range (upper bound exclusive):
npm run download:gold -- 2016-11-17 2026-11-18 m15
~~~

With no arguments, this runs the CLI for the latest five calendar years, at 15-minute resolution, up to tomorrow 00:00 UTC (the end bound is exclusive). It requests XAUUSD **bid** OHLCV, enables caching/retries/rate pacing, and saves a CSV in the ignored local **data/** directory. The download can take considerable time and depends on the provider being reachable. Select the resulting CSV in the **Import CSV files** control; no historical data is bundled or downloaded merely by changing the date picker.

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
- Browser import limits: 75 MB per CSV, 90 MB combined in a single selection, 400,000 merged bars. Ten years of 15-minute gold history normally fits, but a ten-year 1-minute dataset might not.
- Import several same-interval CSV files at once; the app sorts and deduplicates exact overlapping candles. It refuses conflicting overlapping bars, which may indicate a mixed price feed.
- **Add more data** merges further files into an existing imported dataset without discarding prior years.
- **Actual available history is shown prominently** in UTC, along with the number of bars and time span. Date-range presets (1Y / 3Y / 5Y / All loaded) are anchored to the most recent loaded bar.
- A date range exceeding actual loaded coverage will be **blocked** with an explanatory message. Selecting January 2026 on the built-in October 2026 demo can no longer silently backtest only October.
- An optional VITE_GOLD_HISTORY_URL build-time environment variable points to a *licensed/permitted*, user-hosted CSV. When configured, the app presents a **Load hosted history** button. The remote endpoint must permit browser CORS or be same-origin. This is not a live TradingView data API and no default URL is shipped.
- Historical data is *not* committed to Git. Check your data provider's usage rights before redistributing.



### Making ten-year history available on a Cloudflare Pages website

The GitHub repository contains **no committed gold candles**. However, when Cloudflare Pages builds the site, its prebuild hook downloads approximately five calendar years of real Dukascopy XAUUSD BID candles and includes them in the published site assets. If the build fails, no new dataset is deployed.

For **personal testing**, run npm run download:gold, then import the resulting data/ CSV into your Cloudflare-hosted app. This works without a separate backend or Cloudflare plan upgrade because the CSV stays in your browser.

To offer a **preloaded** dataset to every visitor, first obtain a historical data feed and permission for the intended redistribution/use. Host its CSV at a publicly accessible URL (such as an appropriately configured Cloudflare R2 bucket, within provider licensing) and set Cloudflare Pages' build-time VITE_GOLD_HISTORY_URL variable to the URL. The UI will reveal a Load hosted history button. If the URL is cross-origin, configure CORS. Rebuild the site after changing the variable. The CSV should include a header, UTC timestamps, and OHLCV; valid bid/ask/mid series should not be merged indiscriminately.

Dukascopy permits historical data export for research, but its general site terms restrict some republishing and commercial uses. The library's open-source license does **not** grant redistribution rights to the underlying market data. Do not upload Dukascopy's bulk dataset to a public site without confirming rights with the provider.

### Running a ten-year backtest

A ten-year XAUUSD m15 CSV commonly includes around 230,000–260,000 session candles. The data import supports this size, but full PineTS execution speed and memory usage depend on the complexity of the script and browser hardware. Start by verifying a one-year overlapping period against TradingView, and increase to ten years after checking correct data coverage, session timezone, and strategy order size. There is no 19-trade cap in the software.






## Bybit TradFi Gold CFD cost simulation

In **Backtest setup → Bybit TradFi Gold CFD**, enable the model and choose an account. This models **Bybit CFD**, not TradFi perpetual futures, using the available imported OHLCV feed (not live Bybit CFD quotes).

| Parameter | Zero-Fee account | Tight-Spread account |
| --- | --- | --- |
| Additional commission | $0; incorporated in spread | $6 per standard metal lot for a complete trade |
| Starting full spread assumption | $0.50 per gold ounce | $0.20 per gold ounce |
| Spread certainty | **Hypothetical, editable; not an actual quoted Bybit spread** | **Hypothetical, editable; not an actual quoted Bybit spread** |
| Standard gold lot | 100 oz assumed, editable | 100 oz assumed, editable |
| Swap | Optional custom USD per lot per UTC rollover; starts at 0 | Optional custom USD per lot per UTC rollover; starts at 0 |

Sources: [Bybit CFD fees](https://www.bybit.com/en/help-center/article/Bybit-CFD-Fees-Explained) and [Bybit account modes](https://www.bybit.com/en/help-center/article/Introduction-to-CFD).

### Calculation and accounting

- **Never double-charge:** When Bybit mode is on, the app replaces commission_type, commission_value and slippage in a runtime-only copy of the Pine strategy. Original source stays unchanged and Binance and Pine costs are not stacked. There is no need to edit the strategy manually.
- **Commission:** In Tight-Spread the $6 per 100 oz corresponds to $0.06 per oz *round trip*. Bybit collects the commission on position opening. PineTS can apply identical commissions to every fill, so the same **round-trip total** is modeled as $3 per 100 oz upon opening and another $3 per 100 oz upon closing. The closed-trade total is correct under the assumed lot size, but fee timing while a trade is open differs.
- **Spread:** The user enters a *full* spread in USD per gold ounce. The runner applies half against the entry and half against the exit through adverse PineTS slippage ticks, **rounded up** to a price-tick increment. Example: a $0.20/oz full spread, with a $0.01 tick, means 10 adverse ticks per execution. It is embedded in the fill prices and never separately subtracted from net profit. The cost breakdown includes an **estimated embedded spread** computed as quantity × pointvalue × modeled full spread.
- **Swap:** Optional USD per lot per crossed UTC midnight. When nonzero, this is deducted from each closed trade after the engine run and updates net profit, profit factor, streaks, equity curve and period P&L. Because swap is post-processed, order sizing and the PineTS strategy maximum-drawdown value do not include it. Actual Bybit swap depends on long/short side, Bybit server rollover time, contract rates and triple-swap schedules, so 0 means **unknown/not modeled**, not proof of no funding cost.
- **Quantity:** Modeled ounces = absolute strategy trade quantity × instrument pointvalue. Contract pointvalue, minimum quantity and tick size must match the user's intended contract; the app does not apply broker-specific CFD minimum lot increments.
- **Result breakdown:** Commission is native PineTS order-fill commission; estimated spread is already in the fills; optional swap is separately deducted. Reported trade P&L, win rate, profit factor, overall net profit, realized equity, weekly/monthly analytics, Sharpe and Sortino reflect the selected model. Trades can change between fee modes because the strategy sizes orders using account equity.

### Accuracy limits

The displayed $0.50/$0.20 example spreads are **not historical Bybit observations or guaranteed live spreads**. A constant adverse-slippage approximation does not reproduce real bid/ask history, liquidity, stop/limit triggers, MT5 order execution, broker lot constraints, spreads around session boundaries or broker-specific mark-to-market. Use live Bybit quotes to set realistic assumptions.

## Binance-style futures commission settings

Binance regular-account USDⓈ-M futures **taker** commission is **0.05% of executed notional per fill**, charged when opening **and** again when closing. The regular-account **maker** commission is typically 0.02%; exact costs depend on contract, account VIP tier, BNB discounts, liquidity provision, region and promotions. [Binance futures fee calculations](https://www.binance.com/en/support/faq/detail/360033544231) · [Binance fee schedule](https://www.binance.com/en/fee/futureFee)

The Backtest setup panel now includes **Binance futures commissions** with:

- **Default rate 0.05% per execution**, configurable from 0 to 5%. At a $1,000 notional, this corresponds to $0.50 entry + approximately $0.50 exit if the closing notional is unchanged.
- **Respect existing Pine commission automatically**. When the script already declares a commission in its strategy() header, the app leaves that script untouched and adds **no further fee**. Explicit 0% is also respected. The supplied Gold Breakout 15M v1.1.0 already declares cash_per_order at 0.4 per fill, so that remains the effective fee in the default mode.
- **Override Pine commission** (opt-in checkbox). To simulate Binance's percentage fee instead, check this setting. The app replaces the existing strategy() commission_type and commission_value fields **in the runtime copy only** with percent and the configured rate. It never stacks the two charges and does not alter the source displayed in the Pine editor.
- **Strategies without a commission** automatically get the configured 0.05% fee by adding the Pine strategy() percent commission fields before execution.
- **Results show total commissions** collected for closed trades plus any fees on currently open positions, the effective fee type, and whether the Pine or app setting was used. Closed-trade P&L, net profit, profit factor, and analytics are calculated by PineTS after its broker emulator deducts the effective commissions.

The strategy runs with the chosen fees from the outset rather than subtracting a second cost from the report afterward; it can therefore account for fee-driven changes to strategy equity and sizing. A round trip's notional may differ between entry and exit. Only commissions are modeled here; **funding, spread, liquidation, exchange differences, slippage and maker/taker classification are not inferred automatically**.

This fee schedule is a *Binance-style trading-cost assumption* applied to the imported gold feed, **not** a claim that Dukascopy XAUUSD or TVC:GOLD is a Binance futures contract.

## Advanced performance analytics

After a backtest finishes, the **Backtest deep dive** section appears under the realized-equity chart. It has three interactive tabs:

- **Risk & drawdown:** Sharpe, Sortino, Calmar, annualized realized-equity growth, realized maximum drawdown (money and percentage), current drawdown, expectancy, and payoff ratio. A drawdown history plot distinguishes realized peak-to-trough losses from PineTS's own drawdown figure.
- **Monthly / weekly:** Switch between UTC calendar-month and ISO-week profit/loss, including zero-trade periods, best/worst period, and profitable-period count. Monthly mode includes a multi-year heatmap. Download the full period ledger using **Export CSV**.
- **Trades & streaks:** Longest winning/losing streak, current streak, recent win/loss sequences, trade outcome distribution, average and extreme winning/losing trades, average holding time, long-versus-short performance, and entry-weekday P&L (UTC).

### Calculation conventions

These analytics use **realized net P&L from PineTS closed trades**. They are not a reconstruction of open-position equity; no intrabar mark-to-market prices are available in the trade list.

- **Expectancy:** sum of closed-trade P&L / number of closed trades; breakeven trades count.
- **Streaks:** profit above 0 = win, below 0 = loss, equal to 0 = breakeven and resets the current streak. Close timestamps determine order.
- **Period summaries:** trade P&L belongs to the UTC calendar month or ISO week containing its exit. Months/weeks with no exits appear with $0 and 0 trades.
- **Closed-trade equity:** initial capital plus the P&L of closed trades. Open positions are excluded.
- **Realized maximum drawdown:** largest fall in this equity curve below its prior peak, measured in currency and percentage of peak. It is deliberately not interchangeable with PineTS/TradingView's strategy drawdown, which can capture intratrade losses or use different fill assumptions.
- **Daily return sampling:** the daily change in realized equity divided by the preceding day's positive equity, including flat UTC weekdays (zero return). Saturday and Sunday are excluded for the gold research workflow. Ratios are withheld if equity becomes nonpositive, fewer than 30 weekdays are available, or fewer than 5 trades have closed.
- **Sharpe:** arithmetic mean daily return / sample standard deviation of daily returns, multiplied by square root of 252. Risk-free rate assumed **0%**.
- **Sortino:** mean daily return / root mean square of the negative portion of daily returns, multiplied by square root of 252. Minimum target return assumed **0%**.
- **Annualized realized-equity growth:** (final closed-trade equity / initial equity) raised to (365.2425 / elapsed calendar days), minus 1. Undefined for periods shorter than 30 days or nonpositive capital/equity.
- **Calmar:** annualized realized growth / realized maximum drawdown percentage. Undefined if drawdown is zero.
- **N/A:** used for insufficient observations, undefined ratios, and missing averages. The UI does not fabricate a zero.
- **P&L reconciliation:** if the trade profits do not sum to the PineTS reported net profit, the UI shows an explicit caution about fee or engine reporting differences.

**TradingView comparison:** These calculations are reproducible but do **not necessarily match TradingView's native Sharpe or Sortino**, which can use different return sampling, risk-free reference rates, account equity, and execution rules. Normalize assumptions before comparing platforms.

**Performance:** Insights aggregate the completed trades, not every bar of the 10-year input file. The page shows an explanatory placeholder until a backtest completes.

## Cloudflare data build: no cloning or terminal required

When this project deploys through Git integration to Cloudflare Pages, npm's prebuild hook automatically requests five calendar years of Dukascopy **XAUUSD BID 15-minute candles**. The current date is used for the rolling range (for example, Nov 2021–Nov 2026). The downloader creates yearly CSV chunks and a manifest in the temporary Cloudflare build directory. Vite publishes them with the site, **without adding price data to the public GitHub repository**.

The browser automatically reads /history/manifest.json, validates the reported counts/timestamps for each yearly file, combines them, and selects the full available range. If auto-loading fails, click **Load 10 years XAUUSD** to retry. Never confuse this source with TradingView TVC:GOLD; the latter is display-only.

**Default Pine strategy:** The actual *Gold Breakout 15M Strategy v1.1.0* from the project's published source file (samples/gold-breakout-15m.pine). The former EMA strategy is retained only as a unit-test fixture. PineTS does not guarantee compatibility with every Pine Script feature, so a ten-year backtest still needs verification.

### Privacy and provider terms

This is intended for the owner's personal research. Cloudflare Pages assets are publicly accessible **unless you protect the site**. Before enabling a personal-use data feed on an Internet-hosted site, configure [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/) to restrict access to your identity. The GitHub repository being public or private does not by itself restrict the deployed website.

Dukascopy's [website terms](https://www.dukascopy.com/swiss/english/legal-pages/terms-of-use/) allow personal non-commercial downloads but restrict distribution and publication without permission. The site operator must confirm permitted hosting/processing and protect the deployment accordingly. No data is permanently included in git.

### Cloudflare build-time limitation

Cloudflare Pages' build limit is **20 minutes**. Ten years requires substantial requests and may fail because of timeout, a provider 403/WAF response, or rate limiting. If fetching fails, this build fails instead of pretending that synthetic data is a real ten-year backtest; a previously deployed app remains available. The script logs each yearly download, verifies timestamps and candle counts, and rejects incomplete results (under 90,000 15m candles).

In a normal local/GitHub CI build without CF_PAGES=1, this expensive download is skipped. To test the downloader explicitly, set GOLD_HISTORY_SMOKE=1 and GOLD_HISTORY_BUILD=1 in a CI job. Static assets are limited to 25 MiB each; the dataset is split by calendar year.

For continuing daily data, Cloudflare Pages rebuilds from GitHub when you push code; it does not automatically rebuild every market day. Consider an explicitly scheduled build trigger or an authorized real-time provider for ongoing updates.

## Run your own Pine strategy

1. On the Cloudflare site, the real ten-year XAUUSD history is requested automatically. If necessary click **Load 10 years XAUUSD**. CSV import is optional.
2. Select a valid date range and timeframe. The source interval must divide the selected output interval.
3. Paste Pine Script into the **Pine editor** or load a .pine file. It must declare strategy(), not indicator().
4. Click **Run Backtest**. Closed trades and simulated performance appear below the chart.
5. **Export all CSV** downloads the complete closed-trade history.

The checked-in example is [samples/ema-crossover.pine](samples/ema-crossover.pine). It is intentionally simple; it is *not* your proprietary Gold Breakout 15M strategy. Paste that strategy's source when available.

## Interpretation and limitations

- **Not identical feeds:** The requested benchmark is TVC:GOLD, but this personal-testing fallback uses Dukascopy XAUUSD BID. Exchange gold futures and PAXGUSDT also differ. Timestamps, levels, and strategy performance may not match.
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


## TVC:GOLD reference chart and 0-trade diagnostics

The **TVC:GOLD** tab embeds TradingView's official display-only chart. It is a visual reference, not the price source used in PineTS strategy backtests. TradingView's widget does not expose historical OHLCV for download or third-party strategy evaluation; it also cannot run user-uploaded Pine scripts inside the embed. TradingView's terms restrict non-display reuse of its chart data.

The **Backtest data** tab displays the user's imported OHLCV/CSV (or clearly labeled synthetic demonstration candles). PineTS executes on that dataset only. Backtest chart, trade markers, and CSV trade export all refer to the same imported source. The two charts do **not** synchronize or share price series.

### Why did Gold Breakout return 0 trades?

The original app passed only anonymous OHLCV bars. PineTS could not infer syminfo.pointvalue, syminfo.mincontract, or the exact timeframe. The uploaded Gold Breakout 15M strategy uses all three to calculate risk-based quantity and overnight session windows. This could silently produce invalid/no orders.

The runner now supplies explicit closeTime for each candle and passes the selected interval to PineTS, with an in-memory provider that supplies configurable gold contract metadata.

The **Gold contract settings** panel lets you set:

- **Point value:** monetary value of a one-point price move per strategy contract (example research default: 1).
- **Minimum qty/step:** minimum allowed contract quantity (example research default: 0.01).
- **Price tick size:** minimum tradable price increment (example research default: 0.01).

Defaults are **not verified specifications** for TVC:GOLD, your broker's XAUUSD instrument, COMEX gold futures, or Binance PAXGUSDT. Determine correct values for your instrument before interpreting P&L or risking money.

If a script returns zero closed trades, the app now displays pending/open order counts and diagnostic hints, including a *simplified* overnight-session sanity check for the default Gold Breakout script. These hints do not replace actual broker-emulator execution or confirm TradingView parity. Scripts with many advanced Pine features, drawings, or third-party imports may remain incompatible with PineTS.

The project does not ship proprietary TradingView data or the user's full 1,181-line strategy code. Import your own Pine file when testing.

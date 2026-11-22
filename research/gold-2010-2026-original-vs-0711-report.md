# Gold Breakout: 2010–2026 Original 00–07/20 vs Recommended 07–11/21

## What was tested

The **same user-supplied Gold Breakout 15M v1.1.0 strategy's order calculations and trading rules**, with only range start/end/position-close hour changed between the two configurations. The Pine visual dashboards and visual Chrome bridge were omitted for PineTS performance (they have no effect on strategy orders).

- Data: Actual **Dukascopy XAUUSD BID, 15-minute** candles. 2010–2025 calendar years complete; 2026 through **November 20, 2026**.
- Clock: Original script's **fixed GMT+3**, not broker GMT+2/3 DST-switching.
- Strategy: 1% stop-loss, one trade/day, long/short OCA entries, no take-profit, close at specified hour.
- Contract: $1 P&L per $1 price move, fixed **1-unit** size, 0.01 minimum tick, 5% margin requirement in Pine.
- Cost: **no separate commission**, 15 ticks (15 × $0.01 = **$0.15**) adverse slippage at entry, and $0.15 at exit = **$0.30 total round-trip spread** at fixed unit.
- Each calendar year reinitialized with its own starting capital. Combined profits are the **sum of separate annual tests**, NOT a compounded all-year equity curve. Max DD is each year's reported PineTS drawdown in dollars.
- Main run starts each year with the uploaded script's **$300 initial capital**.
- Sensitivity test changes ONLY initial capital to **$10,000** for both, preserving fixed quantity=1, trading logic, fees and 5% margin so high gold prices do not shut off trading.

## Original-script $300 capital simulation

| Year | Original net | Original max DD | 07–11 net | 07–11 max DD | Original trades | 07–11 trades |
|---|---:|---:|---:|---:|---:|---:|
| 2010 | −$206.98 | $276.66 | −$201.95 | $358.36 | 259 | 256 |
| 2011 | +$316.39 | $202.60 | +$211.08 | $182.36 | 254 | 257 |
| 2012 | −$98.25 | $212.94 | +$34.89 | $203.13 | 255 | 259 |
| 2013 | +$349.10 | $93.12 | +$349.32 | $161.27 | 252 | 255 |
| 2014 | +$193.53 | $87.34 | −$17.40 | $208.24 | 251 | 252 |
| 2015 | +$35.75 | $158.83 | +$184.71 | $105.54 | 252 | 256 |
| 2016 | +$13.64 | $142.88 | −$81.29 | $157.74 | 252 | 255 |
| 2017 | +$83.11 | $68.50 | +$45.54 | $75.63 | 255 | 255 |
| 2018 | +$73.36 | $77.81 | +$100.67 | $84.82 | 253 | 256 |
| 2019 | −$197.94 | $249.37 | +$47.76 | $143.68 | 252 | 254 |
| 2020 | +$276.90 | $159.68 | +$153.02 | $251.75 | 251 | 254 |
| 2021 | +$220.63 | $148.61 | +$9.73 | $166.71 | 254 | 254 |
| 2022 | +$75.11 | $185.65 | +$359.31 | $121.50 | 255 | 256 |
| 2023 | +$31.51 | $173.30 | +$52.12 | $340.82 | 254 | 256 |
| 2024 | +$399.63 | $131.01 | +$135.11 | $190.21 | 257 | 258 |
| 2025 | +$470.72 | $551.94 | −$150.29 | $227.37 | 252 | 68 |
| 2026 YTD | −$127.68 | $170.68 | −$123.99 | $155.77 | 13 | 16 |

**Combined annual P&L:** original +$1908.53 versus 07–11 +$1108.34. Profitable years: 13 vs 12. 2025–2026 trade counts were distorted by 5% margin and $300 capital, including 2026 only 13 original trades and 16 recommended trades.

## Margin-neutral $10,000 capital simulation (fixed 1-unit size)

| Year | Original net | Original max DD | 07–11 net | 07–11 max DD | Original trades | 07–11 trades |
|---|---:|---:|---:|---:|---:|---:|
| 2010 | −$206.98 | $276.66 | −$201.95 | $358.36 | 259 | 256 |
| 2011 | +$316.39 | $202.60 | +$211.08 | $182.36 | 254 | 257 |
| 2012 | −$98.25 | $212.94 | +$34.89 | $203.13 | 255 | 259 |
| 2013 | +$349.10 | $93.12 | +$349.32 | $161.27 | 252 | 255 |
| 2014 | +$193.53 | $87.34 | −$17.40 | $208.24 | 251 | 252 |
| 2015 | +$35.75 | $158.83 | +$184.71 | $105.54 | 252 | 256 |
| 2016 | +$13.64 | $142.88 | −$81.29 | $157.74 | 252 | 255 |
| 2017 | +$83.11 | $68.50 | +$45.54 | $75.63 | 255 | 255 |
| 2018 | +$73.36 | $77.81 | +$100.67 | $84.82 | 253 | 256 |
| 2019 | −$197.94 | $249.37 | +$47.76 | $143.68 | 252 | 254 |
| 2020 | +$276.90 | $159.68 | +$153.02 | $251.75 | 251 | 254 |
| 2021 | +$220.63 | $148.61 | +$9.73 | $166.71 | 254 | 254 |
| 2022 | +$75.11 | $185.65 | +$359.31 | $121.50 | 255 | 256 |
| 2023 | +$31.51 | $173.30 | +$52.12 | $340.82 | 254 | 256 |
| 2024 | +$399.63 | $131.01 | +$135.11 | $190.21 | 257 | 258 |
| 2025 | +$470.72 | $551.94 | +$213.14 | $277.21 | 252 | 255 |
| 2026 YTD | +$2336.29 | $238.55 | +$808.08 | $671.97 | 214 | 224 |

**Combined annual P&L:** original +$4372.50 vs 07–11 +$2403.84. Both had 14 profitable years.

**Worst annual max drawdown:** original $551.94 (2025); 07–11 $671.97 (2026).

**Aggregate gross profit/loss profit factors:** original 1.216, 07–11 1.117, summed across separate years.

**Trades:** original 4,272; 07–11 4,312.

## Interpretation

The **original 00:00–07:00 / 20:00 strategy outperforms 07:00–11:00 / 21:00 on the extended 2010–2026 sample**, under both the literal $300 scenario and the normalized $10,000 account scenario.

The 07–11 setting was selected originally after research on **2018, 2019, 2022 and 2023**. In the more equitable $10k comparison, its total across those four years was **+$559.86** vs **−$17.96** for the original. Outside those four years (13 years), the original totals **+$4,390.46** versus **+$1,843.98** for 07–11. This is a good example of why optimizing on a small set of selected years is unreliable.

The original remains ahead even excluding 2026: **+$2,036.21** original vs **+$1,595.76** recommended, with 2010–2025 data.

**The original $300 account comparison is not a fair assessment of 2025–26 breakout signals**, because Pine's 5% margin requirement can prevent additional trades after price rises or capital falls. The $10k comparison isolates the one-unit signal logic, though it does NOT imply trading with a $300 live MT5 account is executable at that leverage.

Neither result is an audited broker MT5 backtest: TVC:GOLD can differ from Dukascopy BID, live spread may not remain $0.30, actual broker leverage/contract volume can differ, and bar-based simulated fills may diverge.

## Reproduction and source

- [Original Gold Pine](https://github.com/ChanakaWithanage/pine-backtest-studio/blob/main/research/gold-mt5-original-2026.pine)
- [$300 original-capital results (CSV)](https://github.com/ChanakaWithanage/pine-backtest-studio/blob/main/research/gold-2010-2026-original-vs-0711-300.csv)
- [$10k margin-neutral results (CSV)](https://github.com/ChanakaWithanage/pine-backtest-studio/blob/main/research/gold-2010-2026-original-vs-0711-10000.csv)
- [Original-capital GitHub Actions run](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/45041723423)
- [Margin-neutral GitHub Actions run](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/45042175679)

Research scripts: `scripts/fetch-gold-research-years.mjs`, `scripts/compare-gold-2010-now.mjs`, `scripts/compare-gold-2010-now-marginneutral.mjs`. Both workflows archive individual per-trade outcomes by year to enable independent additional drawdown/equity analysis.

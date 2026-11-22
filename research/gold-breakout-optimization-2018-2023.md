# Gold Breakout 15M — Multi-year session optimization (2018, 2019, 2022, 2023)

## Assumptions

The [user-supplied Gold strategy](https://github.com/ChanakaWithanage/pine-backtest-studio/blob/main/research/gold-mt5-original-2026.pine) was tested on **Dukascopy XAUUSD BID 15m candles**. PineTS validation uses the unchanged trading, stop, order-sizing and time-exit logic; visual dashboard and Chrome pixel-bridge rendering were excluded to reduce backtest overhead. **Fixed GMT+3 broker clock**, initial capital **$300**, **fixed quantity 1**, **1% stop loss**, one OCA breakout per day, no take profit, and 5% strategy margin.

MT5 cost hypothesis: **zero commission**, plus **$0.15 adverse entry fill + $0.15 adverse exit fill = $0.30 total price spread** per completed one-unit trade (15 ticks each fill at $0.01 per tick). This is **not** a 0.4% commission.

The fast first pass tested **1,620 start/end/close configurations × four years = 6,480 year-config combinations**. Durations included 1–8, 10 and 12 hours; closes were later than the end hour. It identified 29 settings positive in all four years, which were subject to bar-path approximation and multiple-testing effects. A follow-up checked **28 distinct configurations × four years = 112 year-config simulations** in the original Pine order engine. The table below uses only these PineTS-confirmed results.

Each calendar year is a separate $300 starting-capital backtest. Four-year totals are arithmetic sums of independent years, **not** returns on a compounded four-year account.

## PineTS-confirmed results — hours in GMT+3

| Configuration | Range | Close | 2018 | 2019 | 2022 | 2023 | Four-year net | Worst annual drawdown |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Original baseline | 00:00–07:00 (7h) | 20:00 | +$73.36 | −$197.94 | +$75.11 | +$31.51 | **−$17.96** | $249.37 |
| Higher profit, four positive years | 07:00–11:00 (4h) | 21:00 | +$100.67 | +$47.76 | +$359.31 | +$52.12 | **+$559.86** | $340.82 |
| Nearby earlier close | 07:00–11:00 (4h) | 20:00 | +$120.86 | +$30.79 | +$383.17 | +$17.41 | **+$552.23** | $298.61 |
| Balanced four-hour | 13:00–17:00 (4h) | 22:00 | +$18.39 | +$93.03 | +$95.56 | +$133.05 | **+$340.03** | $127.63 |
| Low drawdown, ten-hour | 08:00–18:00 (10h) | 23:00 | +$12.43 | +$50.94 | +$114.32 | +$106.96 | **+$284.65** | $65.83 |
| Low drawdown, twelve-hour | 06:00–18:00 (12h) | 23:00 | +$6.31 | +$51.28 | +$116.77 | +$104.42 | **+$278.78** | $61.94 |
| One-hour | 17:00–18:00 (1h) | 23:00 | +$28.98 | +$80.29 | +$83.96 | +$13.58 | **+$206.81** | $117.12 |
| Two-hour | 16:00–18:00 (2h) | 22:00 | +$19.11 | +$65.24 | +$13.72 | +$104.15 | **+$202.22** | $113.81 |
| Highest hindsight total, one loss year | 10:00–11:00 (1h) | 19:00 | +$117.17 | −$86.82 | +$382.92 | +$237.41 | **+$650.68** | $133.63 |

## Choosing between the finalists

**Higher-return option:** 07:00–11:00 range, **21:00 close**. Positive in all four years and materially better than original default. Its **20:00 close** neighbor also remained positive in all four years, supporting that the result is not solely due to one isolated exit-hour value. Its maximum annual drawdown is relatively high.

**Balanced option:** 13:00–17:00 range, **22:00 close**. Lower combined profits but materially smaller drawdown. Positive in all four years, including the difficult 2019 period for the original configuration.

**Lower-drawdown option:** 08:00–18:00 range, **23:00 close**. Fewer trades (around 150–170 per year), lower peak-to-trough drawdown and a positive result in all four selected years. The 2018 positive result was small, so realistic spread variability matters.

**Avoid selecting by aggregate profit alone:** 10:00–11:00 / 19:00 has a higher arithmetic four-year net than the primary candidate but **lost money in 2019**.

The 07:00–11:00 / 21:00 setting was selected using 2018, 2019 and 2022, with 2023 checked afterward. Subsequent duration-champion exploration also inspected 2023 and therefore cannot treat that year as an untouched holdout for those alternatives.

## Replication and complete results

- [112 exact original-PineTS year tests](https://github.com/ChanakaWithanage/pine-backtest-studio/blob/main/research/gold-2018-2023-pinets-all-validated.csv)
- [Preliminary screening finalists](https://github.com/ChanakaWithanage/pine-backtest-studio/blob/main/research/gold-2018-2019-2022-2023-preliminary-top.csv)
- [Four-year complete first-pass sweep: GitHub Actions](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/45038112456)
- [First five PineTS finalist tests](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/45038244304)
- [Neighboring range/close-hour PineTS tests](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/45038609880)
- [PineTS window-duration champions](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/45038830899)

Research source scripts live in `scripts/fetch-gold-research-years.mjs`, `scripts/research-gold-2018-2023.mjs`, `scripts/validate-gold-multiyear-finalists.mjs`, `scripts/validate-gold-multiyear-neighborhood.mjs`, and `scripts/validate-gold-duration-champions.mjs`.

**Scope:** Dukascopy BID, not the actual TVC:GOLD chart or MT5 order fills. The spread is held constant at $0.30. The first-pass rankings explored many configurations, so more untouched years (e.g. 2020, 2021, 2024, 2025) and the broker's actual server-clock/DST mode should be tested before selecting a live configuration.

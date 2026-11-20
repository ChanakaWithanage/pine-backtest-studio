# S&P 500 Opening Range Breakout: one-year session/direction evaluation

**Instrument:** Dukascopy USA500.IDX/USD *BID* index CFD, **not** SPX cash index or CME ES/MES futures.  
**History:** 2025-11-21 through 2026-11-20, about 22,766 real 15m candles (last day partially available).  
**Engine:** PineTS, using the supplied S&P 500 Opening Range Breakout 15M v1.2.0. These are backtests, not actual fills.

## Fixed assumptions

- New York session clock and DST handling; 15-minute candles.
- One breakout trade per New York trading day. Position exits at 15:45 ET or its stop.
- Stop: 0.4% from entry. Risk: 1% of simulated equity. Initial capital: $10,000.
- CFD contract multiplier: $1 per index point per contract, minimum quantity 1, minimum price increment 0.01. This is not an ES/MES futures backtest.
- Default script fee: **$2.50 per contract per side** (entry and exit); one tick slippage per fill. Dukascopy BID history does not independently model a full live bid/ask spread or financing.
- **EMA, ATR range and ATR breakout-buffer filters disabled.**
- Only session start/end and side direction changed in the first 48 simulations.

## Split-period development and validation

Development **June 1 – August 31, 2026**; holdout **September 1 – November 20, 2026**. Results are independently initialized $10k simulations. Do not sum their net P&L to infer the full-year result.

| New York range | Side | Development net | Holdout net | Development PF | Holdout PF |
|---|---|---:|---:|---:|---:|
| 09:30–10:30 | Short only | $654.06 | $674.95 | 1.737 | 1.593 |
| 09:30–10:00 | Short only | $531.09 | $897.45 | 1.365 | 1.521 |
| 10:00–11:00 | Short only | $331.47 | $48.87 | 1.362 | 1.041 |
| 09:30–10:00 | Both, original | -$458.55 | $628.93 | 0.837 | 1.262 |

**Full sweep:** [48 results CSV](sp500-session-sweep-2025-2026.csv). The table above is a selection, not all results.

## Earlier unseen period: 2025-11-21 through 2026-05-31

All seven finalist configurations lost money. For the strongest recent candidates:

| New York range | Side | Earlier net | Earlier PF |
|---|---|---:|---:|
| 09:30–10:30 | Short only | -$1,581.49 | 0.516 |
| 09:30–10:00 | Short only | -$1,628.12 | 0.584 |
| 10:00–11:00 | Short only | -$1,411.77 | 0.493 |

## Full year, with original fee

| New York range | Side | Net | PF | Trades | Max drawdown |
|---|---|---:|---:|---:|---:|
| 09:30–10:30 | Short only | -$665.04 | 0.862 | 142 | $1,723.70 |
| 09:30–10:00 | Short only | -$815.94 | 0.869 | 167 | $1,906.60 |
| 08:30–09:30 | Short only | -$1,118.22 | 0.870 | 206 | $2,897.33 |
| 03:00–04:00 | Short only | -$1,179.45 | 0.880 | 218 | $2,708.75 |
| 10:00–11:00 | Short only | -$1,231.90 | 0.716 | 136 | $1,510.36 |
| 09:30–10:00 | Both, original | -$1,432.26 | 0.841 | 254 | $2,575.56 |
| 09:00–09:30 | Both | -$2,875.21 | 0.734 | 257 | $4,832.58 |

These are full-year reruns; independent starting-equity and compounding mean results are not the arithmetic sum of split-period results.

## Full-year commission sensitivity

Same price candles, strategy, stop and 1-tick slippage; only Pine `strategy.commission.cash_per_contract` value changes:

| New York range | Side | Fee per CFD per side | Full-year net | PF |
|---|---|---:|---:|---:|
| 09:30–10:30 | Short only | $2.50 | -$665.04 | 0.862 |
| 09:30–10:30 | Short only | $1.00 | +$776.51 | 1.165 |
| 09:30–10:30 | Short only | $0.00 | +$1,702.56 | 1.399 |
| 09:30–10:00 | Short only | $2.50 | -$815.94 | 0.869 |
| 09:30–10:00 | Short only | $1.00 | +$1,002.13 | 1.157 |
| 09:30–10:00 | Short only | $0.00 | +$2,109.73 | 1.357 |

**Interpretation:** The two S&P short-only sessions are sensitive to trade size/cost assumptions. At the script's $2.50 fee neither is profitable over the full year. At a hypothetical $1 fee both turn positive, but **this does not establish executable profitability**: CFD spread and any financing/venue costs must also be checked. Zero fee is diagnostic, not a realistic trading assumption. Results may differ on ES/MES futures data.

## Next validation

Keep ATR/EMA off; verify the actual chosen broker's commission, spread and contract multiplier, then validate **09:30–10:00 short-only** and **09:30–10:30 short-only** unchanged across earlier calendar years. Do not select the best parameters using the final test years.

## Reproducibility

- [48-session split-period research](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/44742433734)
- [Early-period and full-year finalist verification](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/44743447582)
- [Full-year commission sensitivity](https://github.com/ChanakaWithanage/pine-backtest-studio/actions/runs/44744207376)

Research commands: `scripts/research-sp500-sessions.mjs`, `scripts/verify-sp500-finalists.mjs`, and `scripts/research-sp500-fees.mjs` after running `SP500_HISTORY_BUILD=1 node scripts/prepare-sp500-history.mjs`.

# BTC Race Bot — btc-race-24h-20261118-1444

A long-only BTC (cbBTC/USDC) trading bot for the make.fun 24-hour race.
It starts with $1,000 USDC, trades one-minute bars of cbBTC from its Orca
Whirlpool on Solana, and is ranked by net PnL after fees, slippage and pool
price impact.

## Strategy: buy the deep dip, ride it with a trailing stop

The dev window (17–18 Nov) falls 2.80% top to bottom, so buying and
holding loses money and fails the dev gate. This bot is adapted to that
window: it only buys after a sharp sell-off, then lets a trailing stop
ride the recovery.

- **Reference:** the mean of the last 120 one-minute closes (a 2-hour mean).
- **Entry (dip leg):** when the latest close is at least 1.00% below that
  mean, buy with the whole cash. No new entries in the last 60 bars of the
  1,440-bar window, so a buy always has room to work before the end.
- **Exit:** a trailing stop. The bot tracks the highest close since the
  entry; when the close falls 0.80% below that peak it sells everything.
  A hard stop sells if the position's value ever drops 1.00% under its
  cost.
- **Costs:** a full round trip pays about 26 bps (4 bps fee + 2 bps
  slippage + ~20 bps of price impact at this pool's depth), so a trade
  needs a move bigger than that; the dip + trailing-stop pair only fires
  on moves of 1% or more.

## Dev-window result (kit dataset, local backtest)

- Net PnL **+$12.21 (+1.22%)** — passes the dev gate (PnL > $0).
- 1 round trip, 100% win rate, max drawdown 0.97%.
- The trade: buy at bar 122 (~$63,751, after the window's early drop),
  trailing stop sells at bar 602 (~$64,581) after the recovery peaked
  near $65,190. No other entries: the bot stays flat through the late
  drift down instead of chasing it.

The bot is deterministic: it reads only the bars it is sent and its own
account, never the clock, the environment or any randomness, so its two
grading runs are byte-identical.

## Files

- `main.ts` — the bot (Node 22, speaks agent-fun/bars-replay/v1 via
  `vendor/makefun-bars.ts`).
- `vendor/makefun-bars.ts` — the kit's wire shim, copied unchanged.
- `LICENSE` — MIT.
- `.makefun/owner.json` — the payout wallet.

## Running it

The kit grades it on the dev window with:

```
node cli/makefun.mjs grade-local --kit <kit-dir> --bot <this-repo> --driver process
```

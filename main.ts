// BTC trading bot for make.fun btc-race-24h-20261118-1444.
//
// Strategy: buy a deep dip against a slow mean, then let a trailing stop
// ride the recovery. Long only, one position at most, full equity per trade.
//
//   - Reference: the mean of the last 120 one-minute closes (a 2-hour mean).
//   - Entry (the dip leg): when the latest close sits at least 1.00% below
//     that mean, buy with the whole cash. A dip that deep means the market
//     has sold off hard against its own recent level; the bot buys the
//     sell-off, not the top. No new entries in the last 60 bars of the
//     1,440-bar window, so a buy always has room to work before the end.
//   - Exit: a trailing stop. Once in, the bot tracks the highest close
//     since the entry; when the close falls 0.80% below that peak it sells
//     everything. A strong recovery therefore runs until it turns, and a
//     flat drift out costs little. A hard stop sells if the position's
//     value ever drops 1.00% under its cost.
//   - Costs: a full round trip pays about 26 bps (4 bps fee + 2 bps
//     slippage + ~20 bps of price impact at this pool's depth), so a trade
//     needs a move bigger than that; the dip + trailing-stop pair only
//     fires on moves of 1% or more.
//
// The bot is deterministic: it reads only the bars it is sent and its own
// account, never the clock, the environment or any randomness, so its two
// grading runs produce byte-identical action logs.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** The mean the dip is measured against: the last 120 closes. */
const SLOW_BARS = 120;
/** Buy when the close is this far below the slow mean, in basis points. */
const DIP_BPS = 100;
/** Sell when the close falls this far below the peak since entry, in bps. */
const TRAIL_BPS = 80;
/** Hard stop: sell when the position is worth this far under its cost. */
const STOP_BPS = 100;
/** No new entries in the last this many bars of the window. */
const NO_BUY_LAST = 60;
/** The window is 1,440 one-minute bars. */
const WINDOW_BARS = 1440;
/** A fill more than 1% past the close it was decided on is refused. */
const MAX_SLIPPAGE_BPS = 100;

/** The last closes, at most SLOW_BARS of them, oldest first. */
const closes: number[] = [];
/** The highest close since the current entry (0 while flat). */
let peak = 0;

/** The mean of the closes seen so far, once SLOW_BARS of them exist. */
function slowMean(): number | null {
  if (closes.length < SLOW_BARS) return null;
  let sum = 0;
  for (const c of closes) sum += c;
  return sum / closes.length;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    // Feed this batch's CBBTC close into the rolling window (only when
    // the batch actually carries one, so a gap bar adds nothing).
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      const close = Number(bar.c);
      closes.push(close);
      if (closes.length > SLOW_BARS) closes.shift();
    }
    // Warm-up batches cannot trade; keep building history from them.
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const closeNum = Number(close);

    if (held === undefined || held.qty === 0n) {
      // Flat: the dip leg. Only with a full slow mean, only while there
      // is room left in the window, only below the mean by DIP_BPS.
      const mean = slowMean();
      if (mean === null) return [];
      if (state.seq >= state.warmupBars + WINDOW_BARS - NO_BUY_LAST) return [];
      if (closeNum > mean * (1 - DIP_BPS / 10000)) return [];
      if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      peak = closeNum;
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }

    // Holding: trail the peak, and keep the hard stop.
    if (closeNum > peak) peak = closeNum;
    const value = state.value(SYMBOL, held.qty);
    const trailing = closeNum <= peak * (1 - TRAIL_BPS / 10000);
    const stopped = value * 10000n <= held.cost * BigInt(10000 - STOP_BPS);
    if (trailing || stopped) {
      return [
        {
          side: 'sell',
          symbol: SYMBOL,
          qty: held.qty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  },
});

// Alpexa — UNIFIED DAILY REPORT ENGINE (sports + crypto + FX)
// ============================================================================
// Pure, dependency-free functions that (1) reconcile each domain's ledger/holdings and
// (2) roll up the daily management metrics into one report object. Mirrors the real
// server invariants so the same math can be re-implemented in SQL for the live DB:
//   • sports  balance moves via `ledger` (betstake/betpay)      — house = Σstake − Σpayout
//   • crypto  holdings move via crypto_trades (buy/sell + fee)   — qty exact to 8 dp
//   • fx      balance via `ledger` + fx `settlements.pnl`        — incl. swap + liquidations
// Reconcile = "opening + Σ(all moves)" must equal the live snapshot; any drift is reported.
// ============================================================================
'use strict';
const R2 = (x) => Math.round((+x || 0) * 100) / 100;
const R8 = (x) => Math.round((+x || 0) * 1e8) / 1e8;
const decP = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
const sum = (arr, k) => arr.reduce((s, x) => s + (+x[k] || 0), 0);

// ── SPORTS ──────────────────────────────────────────────────────────────────
// bets: [{ cust, stake, am, result:'won'|'lost'|'void', payout }]
function sportsSummary(bets) {
  const totalStake = R2(sum(bets, 'stake'));
  const totalPayout = R2(bets.reduce((s, b) => s + (+b.payout || 0), 0));
  return { count: bets.length, totalStake, totalPayout, houseProfit: R2(totalStake - totalPayout) };
}

// ── CRYPTO ──────────────────────────────────────────────────────────────────
// trades: [{ cust, acct, symbol, side:'buy'|'sell', usd, qty, price, fee }]
//   buy : holdings[symbol] += qty ; holdings.USDT -= usd            (qty = (usd−fee)/price)
//   sell: holdings[symbol] -= qty ; holdings.USDT += (usd − fee)
function cryptoDeltas(trades) {
  const m = {};
  for (const t of trades) {
    const a = (m[t.acct] = m[t.acct] || {});
    if (t.side === 'buy') { a[t.symbol] = R8((a[t.symbol] || 0) + t.qty); a.USDT = R8((a.USDT || 0) - t.usd); }
    else { a[t.symbol] = R8((a[t.symbol] || 0) - t.qty); a.USDT = R8((a.USDT || 0) + (t.usd - t.fee)); }
  }
  return m;
}
// prev/now: { acct: { asset: qty } }   → expected = prev + Σdeltas, compared to now (8 dp)
function cryptoReconcile(prev, trades, now) {
  const d = cryptoDeltas(trades);
  const accts = new Set([...Object.keys(prev), ...Object.keys(now), ...Object.keys(d)]);
  const mism = [];
  for (const acct of accts) {
    const assets = new Set([...Object.keys(prev[acct] || {}), ...Object.keys(now[acct] || {}), ...Object.keys(d[acct] || {})]);
    for (const asset of assets) {
      const expected = R8((prev[acct]?.[asset] || 0) + (d[acct]?.[asset] || 0));
      const actual = R8(now[acct]?.[asset] || 0);
      if (Math.abs(expected - actual) > 1e-8) mism.push({ acct, asset, expected, actual, diff: R8(actual - expected) });
    }
  }
  return mism;
}
function cryptoSummary(trades) {
  return { count: trades.length, tradeVolume: R2(sum(trades, 'usd')), feeRevenue: R2(sum(trades, 'fee')) };
}

// ── FX ──────────────────────────────────────────────────────────────────────
// trades: [{ cust, acct, symbol, lots, side, openPx, closePx, pnl, swap, spread, liquidated }]
function fxSummary(trades) {
  return {
    count: trades.length,
    lotVolume: R2(trades.reduce((s, t) => s + (+t.lots || 0), 0)),
    spreadRevenue: R2(trades.reduce((s, t) => s + (+t.spread || 0), 0)),
    swapTotal: R2(trades.reduce((s, t) => s + (+t.swap || 0), 0)),
    liquidations: trades.filter((t) => t.liquidated).length,
  };
}
// accts: [{ acct, opening, ledgerSum, fxPnlSum, balance }]  (fxPnlSum incl. swap, banked via settlements)
function fxReconcile(accts) {
  return accts
    .map((a) => ({ acct: a.acct, expected: R2(a.opening + a.ledgerSum + a.fxPnlSum), actual: R2(a.balance) }))
    .filter((r) => Math.abs(r.actual - r.expected) > 0.01)
    .map((r) => ({ ...r, diff: R2(r.actual - r.expected) }));
}

// ── SECURITY ────────────────────────────────────────────────────────────────
// mismatches: array of all per-domain reconcile findings; records: flat list for HV scan.
function securitySummary(mismatchGroups, records, hvThreshold = 100000) {
  const mismatchCount = mismatchGroups.reduce((s, g) => s + g.rows.length, 0);
  const highValue = records
    .filter((r) => Math.abs(+r.amount || 0) >= hvThreshold)
    .map((r) => ({ domain: r.domain, cust: r.cust, amount: R2(r.amount) }));
  return {
    mismatchTotal: mismatchCount,
    pass: mismatchCount === 0,
    mismatches: mismatchGroups.filter((g) => g.rows.length).map((g) => ({ domain: g.domain, rows: g.rows })),
    highValueAlerts: highValue,
  };
}

// ── UNIFIED ─────────────────────────────────────────────────────────────────
function buildDailyReport(date, input) {
  const sports = sportsSummary(input.sports.bets);
  const crypto = cryptoSummary(input.crypto.trades);
  const fx = fxSummary(input.fx.trades);
  const cryptoMism = cryptoReconcile(input.crypto.prevHoldings, input.crypto.trades, input.crypto.holdingsNow);
  const fxMism = fxReconcile(input.fx.accts);
  const sportsMism = (input.sports.accts || []).filter((a) => Math.abs(R2(a.balance) - R2(a.opening + a.ledgerSum)) > 0.01)
    .map((a) => ({ acct: a.acct, expected: R2(a.opening + a.ledgerSum), actual: R2(a.balance) }));
  // High-value scan uses REAL cash moved, not leverage-inflated FX notional (a 1-lot FX
  // trade is $100k notional but only ~$1k of the customer's cash) → sports stake, crypto
  // USD traded, FX realized P&L magnitude. FX exposure is tracked separately (lotVolume).
  const records = [
    ...input.sports.bets.map((b) => ({ domain: 'sports', cust: b.cust, amount: b.stake })),
    ...input.crypto.trades.map((t) => ({ domain: 'crypto', cust: t.cust, amount: t.usd })),
    ...input.fx.trades.map((t) => ({ domain: 'fx', cust: t.cust, amount: Math.abs(+t.pnl || 0) })),
  ];
  const security = securitySummary(
    [{ domain: 'sports', rows: sportsMism }, { domain: 'crypto', rows: cryptoMism }, { domain: 'fx', rows: fxMism }],
    records, input.hvThreshold,
  );
  return { generated_at: date, ok: security.pass, sports, crypto, fx, security };
}

module.exports = { sportsSummary, cryptoDeltas, cryptoReconcile, cryptoSummary, fxSummary, fxReconcile, securitySummary, buildDailyReport, decP, R2, R8 };

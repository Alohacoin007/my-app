// Alpexa — UNIFIED DAILY REPORT harness. Injects virtual data (10 sports bets, 10 crypto
// trades, 10 FX trades), runs the report engine, and verifies it reconciles all three
// domains to the cent / 8th-decimal, rolls up the management metrics, flags high-value
// traders, and emits reports/alpexa-daily-<date>.json cleanly. Also proves the recon
// actually CATCHES a tampered holding / balance (RED→GREEN).
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../reports/report-engine.js');
let pass = true; const ok = (n, c, x) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  ' + x : ''}`); };
const DATE = '2026-07-09';   // fixed sim date → deterministic output file

// ── build 10 sports bets (5 won, 5 lost) ──
const bets = [];
for (let i = 0; i < 10; i++) {
  const stake = 20 + i * 5, am = i % 2 ? 120 : -140, won = i < 5;
  bets.push({ cust: 'C' + i, stake, am, result: won ? 'won' : 'lost', payout: won ? E.R2(stake * E.decP(am)) : 0 });
}

// ── build 10 crypto trades (buys + sells) on 2 accounts; craft holdingsNow = prev + Σdeltas ──
const prevHoldings = { 'CR-A': { USDT: 100000, BTC: 2 }, 'CR-B': { USDT: 50000, ETH: 10 } };
const ctrades = [];
for (let i = 0; i < 10; i++) {
  const acct = i % 2 ? 'CR-B' : 'CR-A', sym = i % 2 ? 'ETH' : 'BTC';
  const price = sym === 'BTC' ? 60000 : 3000, usd = 1000 + i * 100, fee = E.R2(usd * 0.003);
  const buy = i % 3 !== 0;
  const qty = buy ? E.R8((usd - fee) / price) : E.R8(usd / price);
  ctrades.push({ cust: acct, acct, symbol: sym, side: buy ? 'buy' : 'sell', usd, qty, price, fee });
}
const holdingsNow = JSON.parse(JSON.stringify(prevHoldings));
const d = E.cryptoDeltas(ctrades);
for (const acct of Object.keys(d)) for (const asset of Object.keys(d[acct])) {
  holdingsNow[acct] = holdingsNow[acct] || {};
  holdingsNow[acct][asset] = E.R8((holdingsNow[acct][asset] || 0) + d[acct][asset]);
}

// ── build 10 FX trades (incl. 2 liquidations + swap) on 2 accounts; balances = opening+ledger+pnl ──
const ftrades = [];
for (let i = 0; i < 10; i++) {
  const acct = i % 2 ? 'FX-B' : 'FX-A', lots = 0.5 + i * 0.1;
  const pnl = E.R2((i % 3 === 0 ? -1 : 1) * (50 + i * 15)), swap = E.R2(-0.8 * lots), spread = E.R2(lots * 7);
  ftrades.push({ cust: acct, acct, symbol: 'EURUSD', lots, side: i % 2 ? 'sell' : 'buy',
    openPx: 1.08, closePx: 1.081, pnl, swap, spread, liquidated: i >= 8 });
}
// fx accounts: opening + Σledger(deposits) + Σ(pnl+swap via settlements) = balance
const fxPnlByAcct = {}; ftrades.forEach(t => { fxPnlByAcct[t.acct] = E.R2((fxPnlByAcct[t.acct] || 0) + t.pnl + t.swap); });
const fxAccts = [
  { acct: 'FX-A', opening: 100, ledgerSum: 5000, fxPnlSum: fxPnlByAcct['FX-A'], balance: E.R2(100 + 5000 + fxPnlByAcct['FX-A']) },
  { acct: 'FX-B', opening: 100, ledgerSum: 3000, fxPnlSum: fxPnlByAcct['FX-B'], balance: E.R2(100 + 3000 + fxPnlByAcct['FX-B']) },
];

const input = {
  hvThreshold: 100000,
  sports: { bets, accts: [] },
  crypto: { prevHoldings, trades: ctrades, holdingsNow },
  fx: { trades: ftrades, accts: fxAccts },
};

console.log('\n=== inject 10 sports + 10 crypto + 10 FX, build the report ===');
const report = E.buildDailyReport(DATE, input);
ok('sports: 10 bets summarized (house = stake − payout)', report.sports.count === 10 && report.sports.houseProfit === E.R2(report.sports.totalStake - report.sports.totalPayout));
ok('crypto: 10 trades, fee revenue rolled up', report.crypto.count === 10 && report.crypto.feeRevenue > 0);
ok('fx: 10 trades, 2 liquidations, spread revenue', report.fx.count === 10 && report.fx.liquidations === 2 && report.fx.spreadRevenue > 0);

console.log('\n=== reconciliation: every domain balances (Mismatch must be 0) ===');
ok('crypto holdings reconcile to 8 dp (0 mismatches)', E.cryptoReconcile(prevHoldings, ctrades, holdingsNow).length === 0);
ok('fx balances reconcile to the cent (0 mismatches)', E.fxReconcile(fxAccts).length === 0);
ok('security PASS (mismatchTotal 0)', report.security.pass === true && report.security.mismatchTotal === 0);
ok('report.ok === true', report.ok === true);

console.log('\n=== high-value trader alert (crypto whale would trip; here none ≥ $100k) ===');
ok('no false HV alert on normal volume', report.security.highValueAlerts.length === 0);
{
  const whale = E.buildDailyReport(DATE, { ...input, crypto: { ...input.crypto, trades: [...ctrades, { cust: 'CR-Z', acct: 'CR-Z', symbol: 'BTC', side: 'buy', usd: 250000, qty: 4.16, price: 60000, fee: 750 }] } });
  ok('$250k crypto trade IS flagged as high-value', whale.security.highValueAlerts.some(a => a.amount === 250000));
}

console.log('\n=== RED→GREEN: a tampered holding / balance is caught ===');
{
  const bad = JSON.parse(JSON.stringify(holdingsNow)); bad['CR-A'].BTC = E.R8(bad['CR-A'].BTC + 0.5);   // 0.5 BTC appeared
  ok('crypto: phantom +0.5 BTC → mismatch flagged', E.cryptoReconcile(prevHoldings, ctrades, bad).length === 1);
  const badFx = fxAccts.map((a, i) => i === 0 ? { ...a, balance: E.R2(a.balance + 1000) } : a);   // +$1000 out of nowhere
  ok('fx: +$1000 out-of-ledger → mismatch flagged', E.fxReconcile(badFx).length === 1);
}

// ── emit the report file (what ops reads each morning) ──
const outDir = path.join(__dirname, '..', 'reports');
const outFile = path.join(outDir, `alpexa-daily-${DATE}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
ok('report written: reports/alpexa-daily-' + DATE + '.json', fs.existsSync(outFile));

console.log('\n  ── report preview ──');
console.log('  sports  house profit : $' + report.sports.houseProfit);
console.log('  crypto  volume/fees  : $' + report.crypto.tradeVolume + ' / $' + report.crypto.feeRevenue);
console.log('  fx      lots/spread/liq: ' + report.fx.lotVolume + ' / $' + report.fx.spreadRevenue + ' / ' + report.fx.liquidations);
console.log('  security             : ' + (report.security.pass ? 'PASS (0 mismatch)' : 'FAIL'));

console.log(pass ? '\n🟢 alpexa-daily-report: PASS' : '\n🔴 alpexa-daily-report: FAIL');
process.exit(pass ? 0 : 1);

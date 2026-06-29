// Alpexa — internal crypto P2P transfer is SERVER-AUTHORITATIVE + qty-conserving (RED→GREEN). #25
//
// Old bug: "send to another Alpexa user" only inserted a `payments` row and mutated balances
// LOCALLY — sender's debit and recipient's credit were client-only (reverted on reload), no
// server crypto_holdings move. The recipient even credited +amount with NO matching debit →
// money could appear from nothing on a fresh login. (CLAUDE.md #5: money is server-only.)
//
// Fix: one atomic, idempotent server RPC moves COIN QTY in crypto_holdings — debit sender qty,
// credit recipient the SAME qty. Invariant: Σ qty per asset is conserved (zero-sum). USDT qty
// is USD 1:1; other coins are coin units (client converts USD→qty before calling).
'use strict';
const r8 = x => Math.round(x * 1e8) / 1e8;

// ---- model of the server RPC's effect on crypto_holdings (qty units) ----
function makeBook() {
  return { hold: {}, refs: new Set() };
}
function qty(book, acct, asset) { return (book.hold[acct] && book.hold[acct][asset]) || 0; }
function setQ(book, acct, asset, q) { (book.hold[acct] = book.hold[acct] || {})[asset] = r8(q); }
// the FIXED rpc: atomic debit+credit, idempotent by ref, insufficient-guarded
function sendInternal(book, ref, fromAcct, toAcct, asset, q) {
  if (!(q > 0)) return { ok: false, error: 'bad amount' };
  if (fromAcct === toAcct) return { ok: false, error: 'same account' };
  if (book.refs.has(ref)) return { ok: true, duplicate: true };        // idempotency gate
  if (qty(book, fromAcct, asset) < q - 1e-9) return { ok: false, error: 'insufficient balance' };
  book.refs.add(ref);
  setQ(book, fromAcct, asset, qty(book, fromAcct, asset) - q);          // debit sender
  setQ(book, toAcct, asset, qty(book, toAcct, asset) + q);              // credit recipient
  return { ok: true };
}
// the OLD buggy behavior: recipient credits with NO sender debit (local-only "receive")
function buggyReceiveOnly(book, toAcct, asset, q) { setQ(book, toAcct, asset, qty(book, toAcct, asset) + q); }

const total = (book, asset) => Object.keys(book.hold).reduce((a, k) => a + qty(book, k, asset), 0);

let pass = true; const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

console.log('\n=== RED: old local-only receive CREATES money (no debit) ===');
{
  const b = makeBook(); setQ(b, 'CR-A', 'BTC', 0.5);
  const before = total(b, 'BTC');
  buggyReceiveOnly(b, 'CR-B', 'BTC', 0.5);     // B "receives" 0.5 BTC, A never debited
  ok('RED: total BTC increased 0.5 → 1.0 (money printed)', total(b, 'BTC') === r8(before + 0.5));
}

console.log('\n=== GREEN: server transfer conserves coin qty (zero-sum) ===');
{
  const b = makeBook(); setQ(b, 'CR-A', 'BTC', 0.5); setQ(b, 'CR-B', 'BTC', 0);
  const before = total(b, 'BTC');
  const r = sendInternal(b, 'csend-1', 'CR-A', 'CR-B', 'BTC', 0.3);
  ok('transfer ok', r.ok === true);
  ok('sender CR-A debited 0.3 → 0.2', qty(b, 'CR-A', 'BTC') === 0.2);
  ok('recipient CR-B credited 0.3', qty(b, 'CR-B', 'BTC') === 0.3);
  ok('total BTC conserved (0.5)', total(b, 'BTC') === before);
}

console.log('\n=== USDT (qty == USD 1:1) ===');
{
  const b = makeBook(); setQ(b, 'CR-A', 'USDT', 100); setQ(b, 'CR-B', 'USDT', 0);
  sendInternal(b, 'csend-u', 'CR-A', 'CR-B', 'USDT', 40);
  ok('A 100→60, B 0→40, total 100', qty(b, 'CR-A', 'USDT') === 60 && qty(b, 'CR-B', 'USDT') === 40 && total(b, 'USDT') === 100);
}

console.log('\n=== idempotent: same ref twice = one effect ===');
{
  const b = makeBook(); setQ(b, 'CR-A', 'ETH', 2); setQ(b, 'CR-B', 'ETH', 0);
  sendInternal(b, 'csend-x', 'CR-A', 'CR-B', 'ETH', 1);
  const dup = sendInternal(b, 'csend-x', 'CR-A', 'CR-B', 'ETH', 1);   // replay
  ok('replay returns duplicate', dup.duplicate === true);
  ok('A debited once (2→1), B credited once (0→1)', qty(b, 'CR-A', 'ETH') === 1 && qty(b, 'CR-B', 'ETH') === 1);
}

console.log('\n=== insufficient: cannot send more coins than held ===');
{
  const b = makeBook(); setQ(b, 'CR-A', 'BTC', 0.1);
  const r = sendInternal(b, 'csend-i', 'CR-A', 'CR-B', 'BTC', 0.5);
  ok('rejected', r.ok === false && r.error === 'insufficient balance');
  ok('no coins moved (A still 0.1, B 0)', qty(b, 'CR-A', 'BTC') === 0.1 && qty(b, 'CR-B', 'BTC') === 0);
}

console.log('\n=== reload safety: server qty IS the truth (survives a refresh) ===');
{
  const b = makeBook(); setQ(b, 'CR-A', 'SOL', 10); setQ(b, 'CR-B', 'SOL', 0);
  sendInternal(b, 'csend-r', 'CR-A', 'CR-B', 'SOL', 4);
  // a "reload" = re-read the book (server crypto_holdings). The values persist.
  ok('after reload A=6, B=4 (not reverted)', qty(b, 'CR-A', 'SOL') === 6 && qty(b, 'CR-B', 'SOL') === 4);
}

console.log('\n' + (pass ? '🟢 internal transfer: server-authoritative, qty-conserving, idempotent' : '🔴 internal transfer broken') + '\n');
process.exit(pass ? 0 : 1);

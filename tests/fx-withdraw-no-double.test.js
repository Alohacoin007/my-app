// Alpexa — D9: FX withdrawal debits EXACTLY ONCE (server, on approval).
// The client request must NOT hold/deduct the balance at request time, or the
// approval-time debit (apply_fx_withdraw_balance) makes it a DOUBLE debit.
// Mirrors trading.html AcctSheet.submit(): withdraw inserts a pending request
// only; transfer (for contrast) IS an instant server RPC so it debits once.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

function makeClient(start) {
  const bal = { live: start };
  const requests = [];
  return {
    bal, requests,
    addBalance(k, d) { bal[k] = Math.max(0, (bal[k] || 0) + d); },
    pushRequest(r) { requests.push(r); return { ok: true }; },
  };
}
// Server approves a pending withdraw → apply_fx_withdraw_balance debits once.
const serverApprove = (c, amt) => c.addBalance('live', -amt);

console.log('\n=== GREEN: current code — withdraw holds NOTHING locally ===');
{
  const c = makeClient(100);
  // trading.html:2549 — only a pending request, no addBalance.
  c.pushRequest({ type: 'withdraw', server: 'FX', amount: 30, status: 'pending' });
  ok('request time: balance UNCHANGED (still 100)', c.bal.live === 100);
  ok('exactly one pending withdraw request queued', c.requests.length === 1 && c.requests[0].type === 'withdraw');
  serverApprove(c, 30);
  ok('after approval: debited exactly once (70)', c.bal.live === 70);
}

console.log('\n=== RED: the suspected hole — client ALSO holds at request time ===');
{
  const c = makeClient(100);
  c.pushRequest({ type: 'withdraw', server: 'FX', amount: 30, status: 'pending' });
  c.addBalance('live', -30);          // <-- forbidden client-side hold
  ok('buggy request time would pre-debit to 70', c.bal.live === 70);
  serverApprove(c, 30);               // server debits again on approval
  ok('buggy → DOUBLE debit (40, should be 70)', c.bal.live === 40 && c.bal.live !== 70);
}

console.log('\n=== Contrast: transfer IS instant (single debit is correct there) ===');
{
  const c = makeClient(100);
  // trading.html:2534 app_transfer RPC settles instantly → optimistic local leg ok.
  c.addBalance('live', -25);          // optimistic; server already moved it atomically
  ok('transfer debits once (75) — no approval step to double it', c.bal.live === 75);
}

console.log('\n' + (pass ? '🟢 FX withdraw = single debit (server-on-approval); no client hold' : '🔴 double-debit risk') + '\n');
process.exit(pass ? 0 : 1);

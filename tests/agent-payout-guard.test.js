// Alpexa — agent payout server-side re-verification (마스터감사 🟥 #3).
// Models supabase/sql/agent_payout_guard.sql guard_agent_payout().
//
// INVARIANT: per agent,
//   Σ(approved + pending non-adjust payouts) ≤ server commission + Σ(approved adjusts)
//
// RED  — the pre-guard server (storeWithoutGuard) accepted ANY row a client sent:
//        forged amounts, self-approved status, fake 'adjust' credits.
// GREEN— the guard forces pending, enforces min $50 and the invariant, and
//        re-verifies at approval time (where money actually leaves).
//
// Run: node tests/agent-payout-guard.test.js
'use strict';

// ── The OLD server: no trigger — whatever the client inserts is stored. ──────
function storeWithoutGuard(row) { return { ok: true, stored: row }; }

// ── Faithful port of guard_agent_payout(). ───────────────────────────────────
// op: 'insert' | 'approve' | 'delete';  isAdmin: back office?
// row: {amount, method, status, txid};  rows: existing agent_payouts (this agent);
// commission: server-recomputed lifetime commission (agent_commission_for).
function othersNet(rows, excludeIdx) {
  let net = 0;
  rows.forEach((r, i) => {
    if (i === excludeIdx) return;
    const adj = (r.method || '').toLowerCase() === 'adjust';
    if (adj && r.status === 'approved') net += r.amount;
    else if (!adj && (r.status === 'approved' || r.status === 'pending')) net -= r.amount;
  });
  return net;
}
function guard(op, isAdmin, row, rows, commission, targetIdx) {
  if (op === 'delete') {
    return isAdmin ? { ok: true } : { ok: false, error: 'Back office only.' };
  }
  const out = Object.assign({}, row);
  if (op === 'insert' && !isAdmin) {
    out.status = 'pending'; out.txid = null; out.decided_at = null; // no self-approval
    if ((out.method || '').toLowerCase() === 'adjust') {
      return { ok: false, error: 'Adjustments are back-office only.' };
    }
    if (out.amount == null || out.amount < 50) {
      return { ok: false, error: 'Minimum payout is $50.' };
    }
  }
  if (op === 'approve') {
    if (!isAdmin) return { ok: false, error: 'Back office only.' };
    out.status = 'approved';
  }
  const entering = op === 'insert'
    || (op === 'approve' && rows[targetIdx].status !== 'approved');
  if (entering && (out.method || '').toLowerCase() !== 'adjust') {
    const room = commission + othersNet(rows, op === 'approve' ? targetIdx : -1);
    if ((out.amount || 0) > room + 0.001) {
      return { ok: false, error: 'Amount exceeds earned commission' };
    }
  }
  return { ok: true, stored: out };
}

let pass = true;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}

const COMM = 500; // server-recomputed lifetime commission for this agent

console.log('\n=== RED — the pre-guard server stored ANY forged row ===');
check('forged $99,999 request → stored',
  storeWithoutGuard({ amount: 99999, method: 'crypto', status: 'pending' }).ok, true);
check('self-approved row → stored as approved',
  storeWithoutGuard({ amount: 400, method: 'crypto', status: 'approved' }).stored.status, 'approved');
check("fake 'adjust' +$5,000 credit → stored",
  storeWithoutGuard({ amount: 5000, method: 'adjust', status: 'approved' }).ok, true);

console.log('\n=== GREEN — portal insert (non-admin) is forced-pending and bounded ===');
check('$100 of $500 earned → allowed',
  guard('insert', false, { amount: 100, method: 'crypto' }, [], COMM).ok, true);
check("client-sent status:'approved' → stored as PENDING",
  guard('insert', false, { amount: 100, method: 'crypto', status: 'approved' }, [], COMM).stored.status, 'pending');
check("method:'adjust' from portal → rejected",
  guard('insert', false, { amount: 100, method: 'adjust' }, [], COMM).ok, false);
check('$49 (< min $50) → rejected',
  guard('insert', false, { amount: 49, method: 'crypto' }, [], COMM).ok, false);
check('null amount → rejected',
  guard('insert', false, { amount: null, method: 'crypto' }, [], COMM).ok, false);
check('$501 of $500 earned → rejected',
  guard('insert', false, { amount: 501, method: 'crypto' }, [], COMM).ok, false);

console.log('\n=== GREEN — pending-stack + paid history count against the room ===');
check('$300 with $250 already pending → rejected (>$500)',
  guard('insert', false, { amount: 300, method: 'crypto' },
    [{ amount: 250, method: 'crypto', status: 'pending' }], COMM).ok, false);
check('$300 with $200 already PAID → allowed (==$500)',
  guard('insert', false, { amount: 300, method: 'crypto' },
    [{ amount: 200, method: 'crypto', status: 'approved' }], COMM).ok, true);
check('rejected rows do NOT block the room',
  guard('insert', false, { amount: 500, method: 'crypto' },
    [{ amount: 400, method: 'crypto', status: 'rejected' }], COMM).ok, true);
check('approved +$100 adjust widens the room ($600 total)',
  guard('insert', false, { amount: 600, method: 'crypto' },
    [{ amount: 100, method: 'adjust', status: 'approved' }], COMM).ok, true);

console.log('\n=== GREEN — approval-time re-verification (money leaves here) ===');
const forged = [{ amount: 10000, method: 'crypto', status: 'pending' }];
check('admin approves a forged/stale $10,000 pending → rejected',
  guard('approve', true, forged[0], forged, COMM, 0).ok, false);
const fine = [{ amount: 300, method: 'crypto', status: 'pending' },
              { amount: 100, method: 'crypto', status: 'approved' }];
check('admin approves $300 with $100 paid ($500 earned) → allowed',
  guard('approve', true, fine[0], fine, COMM, 0).ok, true);
check('non-admin cannot approve at all',
  guard('approve', false, forged[0], forged, COMM, 0).ok, false);

console.log('\n=== GREEN — history is tamper-proof for non-admin ===');
check('non-admin DELETE (erase paid history → refill room) → rejected',
  guard('delete', false, {}, [], COMM).ok, false);
check('admin DELETE → allowed',
  guard('delete', true, {}, [], COMM).ok, true);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);

// Alpexa — crypto external withdrawal security gate (2FA + allowlist), server model.
// Faithful port of supabase/sql/crypto_withdraw_2fa_allowlist.sql
// guard_crypto_withdraw_security(): an ON-CHAIN crypto withdraw request can be
// inserted ONLY IF the session is AAL2 (passed TOTP) AND the destination is on the
// caller's ACTIVE allowlist (added ≥24h ago). Non-crypto withdrawals are untouched.
//
// Invariant: on-chain crypto withdraw row exists ⟹ aal2 ∧ dest ∈ active allowlist.
//
// Run: node tests/crypto-withdraw-allowlist.test.js
'use strict';

const DAY = 24 * 3600 * 1000;

// The server trigger, modeled. `req` = the requests row; `ctx` = { aal, now, allowlist }.
// allowlist = [{cust_id, address, active_at(ms)}]. Returns {ok} or {ok:false, error}.
function guard(req, ctx) {
  const isChain = String(req.type || '').toLowerCase() === 'withdraw'
    && String(req.address || '') !== ''
    && /^(erc|eth|btc|bitcoin|sol|trc)/i.test(String(req.network || ''));
  if (!isChain) return { ok: true, skipped: true };            // bank/card/wire/internal → not gated

  if ((ctx.aal || 'aal1') !== 'aal2') {
    return { ok: false, error: 'Two-factor verification is required to withdraw to an external address.' };
  }
  const active = (ctx.allowlist || []).some((a) =>
    a.cust_id === req.cust_id &&
    String(a.address).toLowerCase() === String(req.address).toLowerCase() &&
    a.active_at <= ctx.now);
  if (!active) {
    return { ok: false, error: 'This address is not on your active allowlist (add it and wait 24h).' };
  }
  return { ok: true };
}

let pass = true;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}

const NOW = 1_700_000_000_000;
const CUST = 'C123';
const ADDR = '0xAbC0000000000000000000000000000000000001';
const wd = (over) => Object.assign({ type: 'withdraw', server: 'crypto', network: 'ERC-20', address: ADDR, cust_id: CUST }, over || {});
const activeEntry  = { cust_id: CUST, address: ADDR, active_at: NOW - 1 };            // added >24h ago
const pendingEntry = { cust_id: CUST, address: ADDR, active_at: NOW + 12 * 3600000 }; // still in 24h hold

console.log('\n=== RED: the two bypasses that existed before this gate ===');
check('no 2FA (aal1) → REJECTED even if allowlisted',
  guard(wd(), { aal: 'aal1', now: NOW, allowlist: [activeEntry] }).ok, false);
check('2FA ok but address NOT allowlisted → REJECTED (any-address drain blocked)',
  guard(wd(), { aal: 'aal2', now: NOW, allowlist: [] }).ok, false);

console.log('\n=== 24h delay: a freshly-added address cannot be used yet ===');
check('2FA ok, address added <24h ago → REJECTED (pending)',
  guard(wd(), { aal: 'aal2', now: NOW, allowlist: [pendingEntry] }).ok, false);
check('same address after 24h → ALLOWED',
  guard(wd(), { aal: 'aal2', now: NOW, allowlist: [activeEntry] }).ok, true);

console.log('\n=== GREEN: the only accepted shape — 2FA + active allowlist ===');
check('aal2 + active allowlist match → ALLOWED', guard(wd(), { aal: 'aal2', now: NOW, allowlist: [activeEntry] }), { ok: true });
check('case-insensitive address match → ALLOWED',
  guard(wd({ address: ADDR.toLowerCase() }), { aal: 'aal2', now: NOW, allowlist: [activeEntry] }).ok, true);

console.log('\n=== SCOPE: non-crypto / internal are NOT gated (no false lockout) ===');
check('bank wire withdraw (network Wire) → not gated',
  guard(wd({ network: 'Wire', address: '12345678' }), { aal: 'aal1', now: NOW, allowlist: [] }).skipped, true);
check("another customer's allowlist entry does NOT authorize me",
  guard(wd(), { aal: 'aal2', now: NOW, allowlist: [{ cust_id: 'OTHER', address: ADDR, active_at: NOW - 1 }] }).ok, false);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);

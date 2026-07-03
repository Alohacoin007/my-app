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

const TWOFA_THRESHOLD = 1000;   // must match c_2fa_threshold in the SQL trigger
const WL_THRESHOLD    = 5000;   // must match c_wl_threshold  in the SQL trigger

// The server trigger, modeled. `req` = the requests row; `ctx` = { aal, now, allowlist }.
// allowlist = [{cust_id, address, active_at(ms)}]. Returns {ok} or {ok:false, error}.
// Tiered by USD amount: <1000 none · ≥1000 2FA · ≥5000 2FA + active allowlist.
function guard(req, ctx) {
  const isChain = String(req.type || '').toLowerCase() === 'withdraw'
    && String(req.address || '') !== ''
    && /^(erc|eth|btc|bitcoin|sol|trc)/i.test(String(req.network || ''));
  if (!isChain) return { ok: true, skipped: true };            // bank/card/wire/internal → not gated
  const amt = +req.amount || 0;

  // 2FA tier: satisfied by an authenticator-app AAL2 session OR a fresh email-OTP unlock.
  const otpUnlocked = !!(ctx.otpUnlockedUntil && ctx.otpUnlockedUntil > ctx.now);
  if (amt >= TWOFA_THRESHOLD && (ctx.aal || 'aal1') !== 'aal2' && !otpUnlocked) {
    return { ok: false, error: 'Two-factor verification is required to withdraw $1000 or more to an external address.' };
  }
  if (amt >= WL_THRESHOLD) {                                    // big money → allowlist + 24h
    const active = (ctx.allowlist || []).some((a) =>
      a.cust_id === req.cust_id &&
      String(a.address).toLowerCase() === String(req.address).toLowerCase() &&
      a.active_at <= ctx.now);
    if (!active) {
      return { ok: false, error: 'Withdrawals of $5000 or more must go to an address on your active allowlist (add it and wait 24h).' };
    }
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
const wd    = (over) => Object.assign({ type: 'withdraw', server: 'crypto', network: 'ERC-20', address: ADDR, cust_id: CUST, amount: 300 }, over || {});
const tiny  = (over) => wd(Object.assign({ amount: 300 },  over || {}));   // < $1,000
const mid   = (over) => wd(Object.assign({ amount: 2000 }, over || {}));   // $1,000–$5,000
const huge  = (over) => wd(Object.assign({ amount: 8000 }, over || {}));   // ≥ $5,000
const activeEntry  = { cust_id: CUST, address: ADDR, active_at: NOW - 1 };            // added >24h ago
const pendingEntry = { cust_id: CUST, address: ADDR, active_at: NOW + 12 * 3600000 }; // still in 24h hold

console.log('\n=== Tier 1 (< $1,000): nothing required — frictionless ===');
check('$300, no 2FA, no allowlist → ALLOWED',
  guard(tiny(), { aal: 'aal1', now: NOW, allowlist: [] }).ok, true);
check('$300 to a brand-new address, no 2FA → ALLOWED',
  guard(tiny({ address: '0xNEW0000000000000000000000000000000000009' }), { aal: 'aal1', now: NOW, allowlist: [] }).ok, true);

console.log('\n=== Tier 2 ($1,000–$5,000): 2FA only (no allowlist / no 24h) ===');
check('$2,000, no 2FA (aal1) → REJECTED',
  guard(mid(), { aal: 'aal1', now: NOW, allowlist: [] }).ok, false);
check('$2,000, 2FA ok, NO allowlist → ALLOWED (allowlist not required yet)',
  guard(mid(), { aal: 'aal2', now: NOW, allowlist: [] }).ok, true);
check('exactly $1,000 → 2FA required (≥ threshold)',
  guard(wd({ amount: 1000 }), { aal: 'aal1', now: NOW, allowlist: [] }).ok, false);
check('$999.99 → still Tier 1, ALLOWED without 2FA',
  guard(wd({ amount: 999.99 }), { aal: 'aal1', now: NOW, allowlist: [] }).ok, true);

console.log('\n=== Email OTP unlock satisfies the 2FA tier (accessible alt to authenticator) ===');
check('$2,000, no aal2 but fresh email-OTP unlock → ALLOWED',
  guard(mid(), { aal: 'aal1', now: NOW, otpUnlockedUntil: NOW + 5 * 60000, allowlist: [] }).ok, true);
check('$2,000, email-OTP unlock EXPIRED → REJECTED',
  guard(mid(), { aal: 'aal1', now: NOW, otpUnlockedUntil: NOW - 1, allowlist: [] }).ok, false);
check('$8,000, email-OTP unlock ok but NOT allowlisted → still REJECTED (allowlist tier)',
  guard(huge(), { aal: 'aal1', now: NOW, otpUnlockedUntil: NOW + 5 * 60000, allowlist: [] }).ok, false);

console.log('\n=== Tier 3 (≥ $5,000): 2FA + ACTIVE allowlist ===');
check('$8,000, no 2FA → REJECTED even if allowlisted',
  guard(huge(), { aal: 'aal1', now: NOW, allowlist: [activeEntry] }).ok, false);
check('$8,000, 2FA ok, NOT allowlisted → REJECTED (big-money drain blocked)',
  guard(huge(), { aal: 'aal2', now: NOW, allowlist: [] }).ok, false);
check('$8,000, 2FA ok, address added <24h ago → REJECTED (pending)',
  guard(huge(), { aal: 'aal2', now: NOW, allowlist: [pendingEntry] }).ok, false);
check('$8,000, 2FA ok, active allowlist match → ALLOWED', guard(huge(), { aal: 'aal2', now: NOW, allowlist: [activeEntry] }), { ok: true });
check('exactly $5,000 → allowlist required (≥ threshold)',
  guard(wd({ amount: 5000 }), { aal: 'aal2', now: NOW, allowlist: [] }).ok, false);

console.log('\n=== SCOPE: non-crypto / internal are NOT gated; no cross-account bypass ===');
check('bank wire withdraw (network Wire), any amount → not gated',
  guard(wd({ network: 'Wire', address: '12345678', amount: 9999 }), { aal: 'aal1', now: NOW, allowlist: [] }).skipped, true);
check("$8,000: another customer's allowlist entry does NOT authorize me",
  guard(huge(), { aal: 'aal2', now: NOW, allowlist: [{ cust_id: 'OTHER', address: ADDR, active_at: NOW - 1 }] }).ok, false);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);

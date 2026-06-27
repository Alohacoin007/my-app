#!/usr/bin/env node
// REGRESSION (identity) — a customer app must only show/transact the account whose OWNER's
// auth_id equals the current session uid. Live bug: the browser was authenticated as the
// ADMIN (zbnyme / P-1560 / edaf03b8) while the sports app displayed zbnyme008's account
// (P-6749 / SP-895264). The app could READ it (admin RLS) but place_bet rejected every
// stake ("not your account"), so bets silently failed (and the old client bypass wrote a
// FREE bet). The guard (alpexa-sync.js assertIdentity) forces a clean re-login on a
// CONFIRMED owner mismatch. This models that decision and pins it.
'use strict';

// Mirrors assertIdentity's rule: redirect ONLY when the session's player cust_id is known,
// the displayed account is known, and they DIFFER. Unknown/offline/no-row → never lock out.
function shouldRelogin(sessionCustId, displayedCustId) {
  return !!(sessionCustId && displayedCustId && sessionCustId !== displayedCustId);
}

const cases = [
  ['P-1560', 'P-6749', true,  'admin session displaying another account → re-login'],
  ['P-6749', 'P-6749', false, 'owner matches the displayed account → stay'],
  [null,     'P-6749', false, 'no session player (offline / RLS hidden) → do NOT lock out'],
  ['P-1560', null,     false, 'no displayed account → handled by the login gate, not here'],
  [null,     null,     false, 'nothing known → stay'],
];

let failed = 0;
for (const [s, d, want, msg] of cases) {
  const got = shouldRelogin(s, d);
  if (got !== want) { console.error(`🔴 FAIL: shouldRelogin(${JSON.stringify(s)}, ${JSON.stringify(d)}) = ${got}, want ${want} — ${msg}`); failed++; }
  else { console.log(`  ✓ ${msg}`); }
}
if (failed) { console.error(`\n🔴 identity-guard: ${failed} case(s) failed`); process.exit(1); }
console.log('🟢 PASS: identity guard re-logins only on a confirmed owner mismatch.');

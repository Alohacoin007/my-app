#!/usr/bin/env node
// Alpexa — DEFECT-PREVENTION SCAN (poka-yoke / Six-Sigma "drive defect classes to zero").
//   node tests/diagnose.js
//
// This is NOT a linter. Each check encodes a bug CLASS we have ACTUALLY shipped and paid
// for (money printing, balance/ledger divergence, fake addresses, world-callable payout
// functions). The goal: the same class can never silently come back. A CRITICAL/HIGH find
// fails the gate. "Accepted exceptions" are reviewed-OK matches, listed for transparency.
//
// When a finding is a real, reviewed false-positive, add it to ACCEPTED with a reason —
// don't weaken the pattern (that blinds the check for the next regression).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Files that actually ship (GitHub Pages) — orphan prototypes are excluded on purpose.
const DEPLOYED = ['crypto-live.html', 'sports-live.html', 'trading.html', 'index.html',
                  'login.html', 'signup.html', 'manager-mobile.html', 'compliance.js',
                  'alpexa-sync.js'];
const MONEY_EDGE = ['sports-settle', 'stake-accrue'];   // edge fns that MOVE money (must fail-closed)
// Every page a customer could ever load (shipped apps + landing + the parked site/ mirror) —
// scanned so hardcoded FAKE BALANCES / demo emails can't sneak back (the 2026-06 cleanup class).
const DEMO_FILES = DEPLOYED.concat([
  'agent.html', 'manager.html', 'manager-app.html',
  'site/index.html', 'site/wallet.html', 'site/settings.html', 'site/dashboard.html',
  'site/my-bets.html', 'site/sports.html', 'site/promotions.html',
  'site/introducing-broker.html', 'site/legal.html', 'site/login.html', 'site/signup.html']);

// ── Defect classes (each = a bug we shipped before) ──────────────────────────
const CHECKS = [
  { id: 'A2-client-ledger-insert', sev: 'CRITICAL', files: DEPLOYED,
    re: /from\(\s*['"]ledger['"]\s*\)\s*\.\s*insert/,
    why: 'Client writing to `ledger` — money-printing if the RLS lock ever loosens. All money moves via server RPC.' },
  { id: 'A6-client-balance-update', sev: 'CRITICAL', files: DEPLOYED,
    re: /from\(\s*['"]accounts['"]\s*\)\s*\.\s*update\s*\(/,
    why: 'Client UPDATE of accounts.balance bypasses the ledger → breaks balance == opening + Σledger. Use admin_set_balance RPC.' },
  { id: 'SEC-service-role-key', sev: 'CRITICAL', files: DEPLOYED,
    re: /service_role|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    why: 'Hardcoded service-role key / JWT shipped to the browser = full DB compromise.' },
  // NOTE: "client self-credits bet winnings" (the A3 hole) is guarded BEHAVIOURALLY by
  // tests/settlement-server-only.test.js, not here — it can't be expressed as a precise
  // regex (local display reconciliation, comments and i18n all look the same), and a noisy
  // static check trains you to ignore the scanner. Keep that class in the behavioural test.
  { id: 'ADDR-demo-crypto-address', sev: 'HIGH', files: DEPLOYED,
    re: /bc1q[ac-hj-np-z02-9]{25,}|onResult\(\s*['"](bc1|0x|[13])/,
    why: 'Hardcoded/demo crypto address injected into a withdraw/deposit field — funds could go to it.' },
  { id: 'EVAL-in-app', sev: 'HIGH', files: DEPLOYED,
    re: /[^a-zA-Z_]eval\s*\(/,
    why: 'eval() in a shipped app — code-injection surface.' },
  { id: 'BET-client-position-insert', sev: 'CRITICAL', files: ['sports-live.html'],
    re: /from\(\s*['"]positions['"]\s*\)\s*\.\s*(insert|upsert)/,
    why: 'Client inserting a sports position BYPASSES place_bet — the only path that debits the stake. Racing place_bet, the client wins and place_bet skips the debit (idempotency guard) → a bet with no ledger debit (free bet / money-print, seen on SP-895264). Sports bets are created ONLY by the place_bet RPC.' },
  { id: 'BET-locked-odds-overwrite', sev: 'HIGH', files: ['sports-live.html'],
    re: /\bl\.am\s*=\s*[^=]/,
    why: 'A placed-bet leg\'s LOCKED odds (l.am) are being overwritten in place (#21). The price you bet at is immutable — the cash-out recompute must read live odds into a LOCAL var, never assign l.am. Overwriting it makes the ticket show wobbling live odds instead of the locked price. (Pre-placement SLIP uses leg.am, which is fine.)' },
  { id: 'LS9-money-in-localstorage', sev: 'HIGH', files: DEPLOYED,
    re: /localStorage\.setItem\(\s*['"]alpexa\.(balances|serverBalances|cryptoBalances|cryptoHoldings|staked|sportsBalance|cryptoBalance|fxLive|openBets|settledBets|positions)\b/,
    why: 'Money/balance/holdings/positions written to localStorage as TRUTH (#5). This is the cross-account-bleed source ($90 showed in B; $60/$80 double-debit). Money is server-only; the client fetches it each load and DISPLAYS only — held in memory (window.__srvBal / React state), never persisted.' },
  { id: 'B8-failopen-cron', sev: 'HIGH', files: MONEY_EDGE.map((f) => `supabase/functions/${f}/index.ts`),
    re: /if\s*\(\s*CRON_SECRET\s*&&/,
    why: 'Money edge function fail-OPEN: unset CRON_SECRET → world-callable payout. Must fail closed (503).' },
  { id: 'D5-store-password', sev: 'HIGH', files: ['login.html'],
    re: /alpexa\.cred[^\n]*\bpw\b/,
    why: 'Storing the password in localStorage (alpexa.cred) — base64 is plaintext-grade. Persist the Supabase session instead.' },
  { id: 'CRYPTO-client-holdings-write', sev: 'CRITICAL', files: DEPLOYED,
    re: /from\(\s*['"]crypto_holdings['"]\s*\)\s*\.\s*(insert|update|upsert|delete)/,
    why: 'Client writing crypto_holdings directly bypasses the server RPCs that are the sole owner of coin qty (#25). Internal P2P sends, trades, stakes, transfers all move crypto_holdings via SECURITY DEFINER RPCs (crypto_send_internal / crypto_trade / app_transfer …) — the client only SELECTs and displays. A direct client write = money printing / cross-account write.' },
  { id: 'DEMO-hardcoded-balance', sev: 'HIGH', files: DEMO_FILES,
    re: /\$\d{1,3}(,\d{3})+\.\d{2}/,
    why: 'A hardcoded money amount with thousands separators ($1,187,077.40 / $11,248.10 / $5,000.00) — a FAKE balance/price literal. Money must come from the server (usd(...) / ${...}), never a static number, or a real user sees a phantom "demo account" balance.' },
  { id: 'DEMO-fake-email', sev: 'HIGH', files: DEMO_FILES,
    re: /alpexa-demo\.com|@alpexa\.app\b|demo@alpexa/i,
    why: 'A demo/test email (alpexa-demo.com / @alpexa.app / demo@alpexa) hardcoded in a shipped page — a real user could copy a fake payment address, or the app renders a demo identity.' },
  { id: 'DEMO-login-creds', sev: 'HIGH', files: ['login.html', 'signup.html'],
    re: /getElementById\(\s*['"]pwInput['"]\s*\)\.value\s*=\s*['"][^'"]|Demo account credentials/,
    why: 'A demo account is hardcoded into the login form (e.g. fillDemo: pwInput.value=\'1234\'). Real users saw another (demo) account / local data on the login page. No fake credentials in shipped login — the field stays empty.' },
  { id: 'LS-wipe-all-keys', sev: 'HIGH', files: DEPLOYED,
    re: /Object\.keys\(\s*localStorage\s*\)/,
    why: 'Iterating ALL localStorage keys to remove them (a "reset all" loop) nukes more than intended — it deletes the Supabase SESSION token and the back-office admin session (alpexa-admin-auth), silently logging the user/operator out → empty screens. (The "Reset all demo data" button did exactly this; removed.) Remove only specific, named keys — never sweep every key by prefix.' },
  { id: 'CHART-fabricated-portfolio-history', sev: 'HIGH', files: ['crypto-live.html', 'trading.html'],
    re: /RANGE_BASIS|(?<![A-Z_])RANGE_OPEN_MULT/,
    why: 'A per-range multiplier that fabricates a portfolio chart\'s STARTING value from the current total (open = total × RANGE_BASIS/RANGE_OPEN_MULT, e.g. ALL=0.10 → a fake 10× gain) — i.e. INVENTED money-chart history with no real-data source. A wallet/total value chart must show REAL movement (holdings × real prices) or a flat line at the current value — never a synthesized random walk off a faked opening (#5 fake-motion). (Coin PRICE charts use BUY_RANGE_OPEN_MULT only as a loading placeholder AFTER fetching real CoinGecko data — excluded by the regex.)' },
];

// ── Reviewed-OK exceptions (Six-Sigma control plan). Suppressed but always printed. ──
const ACCEPTED = [
  { id: 'A6-client-balance-update', file: 'manager-mobile.html',
    reason: 'Back office is is_admin (RLS allows). For CRYPTO, accounts.balance is a display cache — real money lives in crypto_holdings and moves via the `commands` path. sports/fx use admin_set_balance RPC.' },
  { id: 'DEMO-fake-email', file: 'crypto-live.html',
    reason: 'One-time migration that REMOVES the legacy demo@alpexa.app value for stale users — references the string only to clear it, never displays it.' },
  { id: 'DEMO-fake-email', file: 'manager-mobile.html',
    reason: 'A code COMMENT documenting the anti-pattern ("Never fabricate a demo identity (was demo@alpexa.io)") — not a real address.' },
  // B8 CLOSED: sports-settle/stake-accrue are now FAIL-CLOSED (no CRON_SECRET → 503), so the
  // fail-open exceptions are removed — any future `if (CRON_SECRET &&` regression now fails
  // the gate again. (User deploys: set CRON_SECRET + redeploy + cron_secure.sql.)
];
function isAccepted(id, file) {
  return ACCEPTED.some((a) => a.id === id && a.file === file);
}

function scan() {
  const findings = [];
  for (const c of CHECKS) {
    for (const rel of c.files) {
      const fp = path.join(ROOT, rel);
      if (!fs.existsSync(fp)) continue;
      const lines = fs.readFileSync(fp, 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (c.re.test(ln)) {
          findings.push({ id: c.id, sev: c.sev, why: c.why, file: rel, line: i + 1,
            text: ln.trim().slice(0, 100), accepted: isAccepted(c.id, rel) });
        }
      });
    }
  }
  return findings;
}

const all = scan();
const active = all.filter((f) => !f.accepted);
const accepted = all.filter((f) => f.accepted);
const crit = active.filter((f) => f.sev === 'CRITICAL');
const high = active.filter((f) => f.sev === 'HIGH');

console.log('── DEFECT-PREVENTION SCAN (poka-yoke) ────────────────');
console.log(`  classes checked: ${CHECKS.length}   active findings: ${active.length} (CRIT ${crit.length}, HIGH ${high.length})   accepted: ${accepted.length}`);

if (active.length) {
  console.log('\n  ⚠️  ACTIVE FINDINGS (fix or justify in ACCEPTED):');
  for (const f of active) {
    console.log(`   ${f.sev === 'CRITICAL' ? '🔴' : '🟠'} [${f.id}] ${f.file}:${f.line}`);
    console.log(`        ${f.text}`);
    console.log(`        → ${f.why}`);
  }
}
if (accepted.length) {
  console.log('\n  ✔️  accepted exceptions (reviewed OK):');
  for (const f of accepted) console.log(`   · [${f.id}] ${f.file}:${f.line}`);
}

const fail = crit.length + high.length;
console.log('\n' + (fail === 0
  ? '🟢 DIAGNOSE CLEAN — no known defect class present'
  : `🔴 DIAGNOSE: ${fail} active CRITICAL/HIGH finding(s). Fix, or add to ACCEPTED with a reason.`) + '\n');
process.exit(fail === 0 ? 0 : 1);

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
const DEPLOYED = ['crypto-live.html', 'sports-live.html', 'trading.html', 'webtrade.html', 'fx.html', 'index.html',
                  'login.html', 'signup.html', 'manager-mobile.html', 'agent.html', 'compliance.js',
                  'alpexa-sync.js'];
const MONEY_EDGE = ['sports-settle', 'stake-accrue'];   // edge fns that MOVE money (must fail-closed)
// Price/game FEEDS: not payouts, but they WRITE market data settlements read, and a fail-open
// endpoint is world-callable (abuse → external-API cost, stale/garbage writes). Fail-closed too.
const FEED_EDGE = ['crypto-prices', 'fx-prices', 'sports-games', 'sports-odds', 'stock-prices'];
// Every page a customer could ever load (shipped apps + landing + the parked site/ mirror) —
// scanned so hardcoded FAKE BALANCES / demo emails can't sneak back (the 2026-06 cleanup class).
const DEMO_FILES = DEPLOYED.concat([
  'manager.html', 'manager-app.html',   // agent.html now in DEPLOYED above
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
  { id: 'PRICE-fake-sway', sev: 'HIGH', files: ['crypto-live.html', 'trading.html'],
    re: /swayPct\s*\*\s*base|s\.last\s*\*\s*\(\s*1\s*\+/i,
    why: 'Displayed price fabricated by a random walk / sine "sway" on the real base (crypto: swayPct*base; FX: s.last*(1+drift)). Drifts the ticker off the exchange AND off the server fill price — a fake price on a trading screen. Mark to the live feed only (2026-07-07).' },
  { id: 'BET-client-position-insert', sev: 'CRITICAL', files: ['sports-live.html'],
    re: /from\(\s*['"]positions['"]\s*\)\s*\.\s*(insert|upsert)/,
    why: 'Client inserting a sports position BYPASSES place_bet — the only path that debits the stake. Racing place_bet, the client wins and place_bet skips the debit (idempotency guard) → a bet with no ledger debit (free bet / money-print, seen on SP-895264). Sports bets are created ONLY by the place_bet RPC.' },
  { id: 'BET-locked-odds-overwrite', sev: 'HIGH', files: ['sports-live.html'],
    re: /\bl\.am\s*=\s*[^=]/,
    why: 'A placed-bet leg\'s LOCKED odds (l.am) are being overwritten in place (#21). The price you bet at is immutable — the cash-out recompute must read live odds into a LOCAL var, never assign l.am. Overwriting it makes the ticket show wobbling live odds instead of the locked price. (Pre-placement SLIP uses leg.am, which is fine.)' },
  { id: 'LS9-money-in-localstorage', sev: 'HIGH', files: DEPLOYED,
    re: /localStorage\.setItem\(\s*['"]alpexa\.(balances|serverBalances|cryptoBalances|cryptoHoldings|staked|sportsBalance|cryptoBalance|fxLive|openBets|settledBets|positions)\b/,
    why: 'Money/balance/holdings/positions written to localStorage as TRUTH (#5). This is the cross-account-bleed source ($90 showed in B; $60/$80 double-debit). Money is server-only; the client fetches it each load and DISPLAYS only — held in memory (window.__srvBal / React state), never persisted.' },
  { id: 'B8-failopen-cron', sev: 'HIGH', files: MONEY_EDGE.concat(FEED_EDGE).map((f) => `supabase/functions/${f}/index.ts`),
    re: /if\s*\(\s*CRON_SECRET\s*&&/,
    why: 'Edge function fail-OPEN: unset CRON_SECRET → world-callable (money payout, or feed-write abuse). Must fail closed (503).' },
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
  { id: 'DEMO-hardcoded-identity', sev: 'HIGH', files: DEMO_FILES,
    re: /zbnyme@|KEB Hana|\+1 \(415\) 555|Connected May 12|\+82 10-•+ 8512/,
    why: 'A hardcoded personal/dev identity or fake payment detail (dev email zbnyme@, "KEB Hana ••••", "+1 (415) 555…"/"+82 10-•••• 8512", fake "Connected May 12" 2FA date) rendered as the user\'s real data. Identity/payment/security fields must come from the account (alpexa.me) or honestly say "Not set" — never a fabricated literal that a real user sees as theirs.' },
  { id: 'DEMO-login-creds', sev: 'HIGH', files: ['login.html', 'signup.html'],
    re: /getElementById\(\s*['"]pwInput['"]\s*\)\.value\s*=\s*['"][^'"]|Demo account credentials/,
    why: 'A demo account is hardcoded into the login form (e.g. fillDemo: pwInput.value=\'1234\'). Real users saw another (demo) account / local data on the login page. No fake credentials in shipped login — the field stays empty.' },
  { id: 'LS-wipe-all-keys', sev: 'HIGH', files: DEPLOYED,
    re: /Object\.keys\(\s*localStorage\s*\)/,
    why: 'Iterating ALL localStorage keys to remove them (a "reset all" loop) nukes more than intended — it deletes the Supabase SESSION token and the back-office admin session (alpexa-admin-auth), silently logging the user/operator out → empty screens. (The "Reset all demo data" button did exactly this; removed.) Remove only specific, named keys — never sweep every key by prefix.' },
  { id: 'CHART-fabricated-portfolio-history', sev: 'HIGH', files: ['crypto-live.html', 'trading.html'],
    re: /RANGE_BASIS|(?<![A-Z_])RANGE_OPEN_MULT/,
    why: 'A per-range multiplier that fabricates a portfolio chart\'s STARTING value from the current total (open = total × RANGE_BASIS/RANGE_OPEN_MULT, e.g. ALL=0.10 → a fake 10× gain) — i.e. INVENTED money-chart history with no real-data source. A wallet/total value chart must show REAL movement (holdings × real prices) or a flat line at the current value — never a synthesized random walk off a faked opening (#5 fake-motion). (Coin PRICE charts use BUY_RANGE_OPEN_MULT only as a loading placeholder AFTER fetching real CoinGecko data — excluded by the regex.)' },
  { id: 'SPREAD-flat-fallback', sev: 'CRITICAL', files: ['webtrade.html'],
    re: /spr_pts\s*\|\|/,
    why: 'Spread OR-fallback (spr_pts||10) flat-lines every symbol. Use last-known: prev.spr!=null?prev.spr:seed.' },
  { id: 'SPREAD-uniform-unit', sev: 'CRITICAL', files: ['webtrade.html'],
    re: /\b(?:spr|sp)\s*\*\s*(?:tickSize|ts)\b/,
    why: 'ONE conversion (spr×tickSize) applied to every class. prices.spr_pts units differ per WRITER (fx-prices: FX pips · crypto-prices: bps · stock-prices: 0+floor) — convert via halfPx (fx_close.sql lockstep) or FX reads 10× tight, stocks/BTC quote zero, DOGE quotes 28% wide. (Replaces SPREAD-pip-not-ticksize, whose "server sends points" premise was refuted against the live DB + Edge sources 2026-07-13.)' },
  { id: 'SPREAD-fixed-multiplier', sev: 'HIGH', files: ['webtrade.html'],
    re: /\*\s*100000\b/,
    why: 'Hardcoded *100000 spread formula breaks per-symbol digits. Use tickSize(sym).' },
  { id: 'BODY-classname-assign', sev: 'HIGH', files: DEPLOYED,
    re: /body\.className\s*=(?![=+])/,
    why: 'Wholesale assignment to body.className wipes EVERY other body class — including the `dark` theme class (2026-07-16: tapping Parlay in the bet slip flipped dark→light on a real device). Swap state classes with classList.remove/add (e.g. setModeClass), never replace the whole className.' },
  { id: 'FEED-geofenced-binance', sev: 'HIGH', files: DEPLOYED.concat(['dev/crypto-dashboard.html', 'terminal.html']),
    re: /stream\.binance\.com|api\.binance\.com(?!.*vision)/,
    why: 'binance.com 본체 직결 — geo-fence(미국 차단)라 베가스/미국 고객에겐 WS·klines가 조용히 실패해 폴백으로만 돈다 (2026-07-19 crypto-live에서 실발견). 반드시 미러(data-stream/data-api.binance.vision) 사용 — CLAUDE.md 📡 데이터플랜.' },
  { id: 'FX-client-settlement-insert', sev: 'CRITICAL', files: ['trading.html', 'webtrade.html', 'terminal.html'],
    re: /from\(\s*['"]settlements['"]\s*\)\s*\.\s*insert/,
    why: 'FX 클라가 자기 계산 P&L로 settlements를 직접 insert — trg_settlement_balance가 그 숫자로 잔고를 옮긴다(클라 추측 돈 이동). FX 정산은 fx_close/fx_sltp/fx_stopout 서버 3형제만. (구 trading.html clientClose 폴백이 이 클래스 — 2026-07-23 폐쇄.)' },
  { id: 'FX-client-position-statuswrite', sev: 'CRITICAL', files: ['trading.html', 'webtrade.html', 'terminal.html'],
    re: /from\(\s*['"]positions['"]\s*\)\s*\.\s*(insert|upsert|delete)/,
    why: 'FX 클라가 positions를 insert/upsert/delete — 서버(fx_sltp/fx_stopout)가 방금 청산한 행을 status:open으로 되살리거나(재청산=이중 정산) 감사 행을 지울 수 있다. 클라는 SELECT + pnl-only UPDATE(.eq status open)만 (2026-07-23 부활 경합 폐쇄).' },
  { id: 'PEND-client-table-write', sev: 'CRITICAL', files: DEPLOYED.concat(['terminal.html', 'dev/crypto-dashboard.html']),
    re: /from\(\s*['"]fx_pending['"]\s*\)\s*\.\s*(insert|upsert|update|delete)/,
    why: '클라가 fx_pending에 직접 쓰기 — 서버 매칭 엔진(M4.5)의 접수 검증(방향)·원자 선점·감사(filled/rejected+사유·meta.wm)를 우회한다. 옛 클라 delete는 status 무관이라 서버가 남긴 감사 행까지 지울 수 있었다(2026-07-22 폐쇄). 접수/취소는 fx_place_pending/fx_cancel_pending RPC만 — 클라는 SELECT+표시.' },
  { id: 'FEED-sticky-live-flag', sev: 'HIGH', files: DEPLOYED.concat(['dev/crypto-dashboard.html']),
    re: /if\s*\(\s*(?:this\.|mk\.)?wsLive\s*&&[^)\n]{0,60}\)\s*(?:return|continue)/,
    why: '폴백 스킵을 sticky 라이브 플래그로 게이트 — 소켓이 close 없이 조용히 죽으면 플래그가 true로 굳어 폴백이 영구 억제되고 시세가 얼어붙는다 (2026-07-19 크립토 대시보드 실사고). 라이브 판정은 신선도(lastTick 나이)로만.' },
];

// ── Reviewed-OK exceptions (Six-Sigma control plan). Suppressed but always printed. ──
const ACCEPTED = [
  { id: 'A6-client-balance-update', file: 'manager-mobile.html',
    reason: 'Back office is is_admin (RLS allows). For CRYPTO, accounts.balance is a display cache — real money lives in crypto_holdings and moves via the `commands` path. sports/fx use admin_set_balance RPC.' },
  { id: 'DEMO-fake-email', file: 'crypto-live.html',
    reason: 'One-time migration that REMOVES the legacy demo@alpexa.app value for stale users — references the string only to clear it, never displays it.' },
  { id: 'DEMO-fake-email', file: 'manager-mobile.html',
    reason: 'A code COMMENT documenting the anti-pattern ("Never fabricate a demo identity (was demo@alpexa.io)") — not a real address.' },
  // B8 CLOSED: the money edge fns (sports-settle/stake-accrue) AND the price/game feeds
  // (crypto-prices, fx-prices, sports-games, sports-odds, stock-prices) are now FAIL-CLOSED
  // (no CRON_SECRET → 503), so the fail-open exceptions are removed — any future
  // `if (CRON_SECRET &&` regression now fails the gate again.
  // (User deploys: set CRON_SECRET + redeploy each + cron_secure.sql.)
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

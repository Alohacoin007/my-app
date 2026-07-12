#!/usr/bin/env node
// REGRESSION (webtrade) — PRODUCTION MODE. The WebTrader was promoted from an offline demo to a real
// B-Book terminal: WT_DEMO=false, orders route to the server RPCs fx_open/fx_close (the SAME path the
// live FX app uses), balances/positions come from the logged-in account, and the client demo-ledger
// fill (addDemo) is CLOSED — a logged-out user is asked to log in, never given a fake fill. The crypto
// P&L visibility scale is removed (real P&L == server), and leverage is clamped to the server cap.
'use strict';
const fs = require('fs');
const path = require('path');
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) production switch is ON (WT_DEMO=false)
if (!/const\s+WT_DEMO\s*=\s*false\b/.test(wt)) bad('WT_DEMO must be false (production B-Book mode)');

// 2) every server gate stays WT_DEMO-aware (the gating structure must remain intact)
const GATE = 'window.AlpexaSync&&AlpexaSync.db&&AlpexaSync.me';
let idx = -1, total = 0, unguarded = 0;
while ((idx = wt.indexOf(GATE, idx + 1)) !== -1) { total++; if (!/WT_DEMO/.test(wt.slice(Math.max(0, idx - 24), idx))) unguarded++; }
if (total < 5) bad(`expected ≥5 server gates (loadAcct, loadPos, start, fx_open, fx_close), found ${total}`);
if (unguarded > 0) bad(`${unguarded} UN-guarded server gate(s) — every fx_open/fx_close/load must stay WT_DEMO-aware`);

// 3) the CLIENT DEMO FILL IS CLOSED — no addDemo on the order paths; logged-out prompts login
if (/not_logged_in'\)\{\s*positionsStore\.addDemo/.test(wt)) bad('production must NOT fill on the client demo ledger — addDemo fallback must be removed');
const loginPrompts = (wt.match(/reason==='not_logged_in'\)\{ playSnd\(sndError\); alert\('로그인이 필요합니다/g) || []).length;
if (loginPrompts < 2) bad(`both order paths (one-click + New Order) must prompt login when logged out, found ${loginPrompts}`);

// 4) demo seed only in demo mode (production shows the real account, not a mock)
if (!/if\(WT_DEMO\)\{ this\.acct=DEMO_ACCT; this\.pos=DEMO_POS\.slice\(\); this\.notify\(\); \}/.test(wt)) bad('the demo seed must be gated by WT_DEMO (production loads the real account)');

// 5) real orders go through fx_open / fx_close (server-authoritative), never a local balance write
if (!/AlpexaSync\.db\.rpc\('fx_open',/.test(wt)) bad('orders must route through the fx_open RPC');
if (!/AlpexaSync\.db\.rpc\('fx_close',\{ p_local_id:localId \}\)/.test(wt)) bad('closes must route through the fx_close RPC');

// 6) the DEMO-ONLY crypto P&L visibility scale is GONE (real P&L must equal server realized)
if (/CRYPTO_PNL_SCALE/.test(wt)) bad('CRYPTO_PNL_SCALE must be removed in production (P&L == server, no fake ± weight)');
if (/pnlContract/.test(wt)) bad('pnlContract (scale wrapper) must be removed — positionPnL uses the true contractSize');

// 7) leverage clamped to the house cap (lockstep with fx_open_margin.sql: FX 100, STOCK/CRYPTO 5)
if (!/const LEV_CAP = \(symbol\)=> SYM_CAT\[symbol\]==='Forex' \? 100 : 5;/.test(wt)) bad('LEV_CAP (per-class leverage cap) missing');
if (!/Math\.min\(\+leverage\|\|100, LEV_CAP\(symbol\)\)/.test(wt)) bad('requiredMargin must clamp leverage to LEV_CAP (server lockstep)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} production-wiring problem(s).`); process.exit(1); }
console.log('🟢 PASS: WebTrader is LIVE — WT_DEMO=false, orders route to fx_open/fx_close, client demo fill closed (logged-out → login), P&L scale removed, leverage clamped to the server cap.');

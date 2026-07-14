#!/usr/bin/env node
// FEATURE (2026-07-14 user request) — WebTrader entry on the FX site + a DISTINCT terminal login.
// Rules:
//  · ONE auth path stays law (CLAUDE.md #5): the terminal login is login.html with a `skin=wt`
//    SKIN — same proven sign-in / profile / cache-wipe / sessionStorage code, different clothes.
//    login.html keeps exactly ONE createClient and it stays on sessionStorage (3-file lockstep).
//  · fx.html header gets a WebTrader launcher that opens the terminal login as a POPUP and
//    falls back to plain navigation when the popup is blocked.
//  · webtrade's own LoginGate round-trips through the SAME skinned URL, so terminal users
//    never see the app login and vice versa (no confusion).
'use strict';
const fs = require('fs');
const path = require('path');
const fx = fs.readFileSync(path.join(__dirname, '..', 'fx.html'), 'utf8');
const lg = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── fx.html: NO separate WebTrader launcher (2026-07-14 — device routing made it redundant;
//    the plain Log in sends PC users to the terminal automatically) ──
if (/wt-pill|wtlogin/.test(fx)) bad('the retired WebTrader launcher must stay gone (device routing owns the landing)');
if (!/href="login\.html\?switch=1" target="_blank" rel="noopener"/.test(fx)) bad('Log in must open in a NEW page (target=_blank, like Sign up)');

// ── login.html: ONE createClient on sessionStorage (the 3-file storage lockstep survives) ──
const clients = (lg.match(/createClient\(/g) || []).length;
if (clients !== 1) bad('login.html must keep exactly ONE createClient (found ' + clients + ') — no duplicated auth path');
if (!/auth:\{storage:_ss,persistSession:true/.test(lg)) bad('login.html must stay on sessionStorage (login-loop lockstep)');

// ── login.html: the wt skin — applied ONLY under ?skin=wt, FX server fixed, picker hidden ──
if (!/get\('skin'\)!=='wt'\) return;/.test(lg)) bad('the terminal skin must key off ?skin=wt (early return keeps the app login untouched)');
if (!/classList\.add\('wt-skin'\)/.test(lg)) bad('the skin must be a body class (zero effect on the normal app login)');
if (!/ALPEXA WebTrade — Terminal Access/.test(lg)) bad('the skinned page must retitle to Terminal Access');
if (!/selectServer\(0\)/.test(lg) || !/srvSeg/.test(lg)) bad('the skin must fix the FX server and hide the server picker');
if (!/body\.wt-skin #wrap\{/.test(lg)) bad('the dark terminal card style must exist under body.wt-skin');

// ── webtrade: the gate round-trips through the SAME skinned login ──
if (!/login\.html\?skin=wt/.test(wt)) bad('webtrade LoginGate must send users to the skinned terminal login');

if (fail) { console.error(`\n🔴 FAIL — ${fail} webtrader-login problem(s).`); process.exit(1); }
console.log('🟢 PASS: WebTrader launcher on the FX site (popup + fallback) → the ONE login.html in terminal skin (sessionStorage lockstep intact); webtrade gate uses the same skinned URL.');

#!/usr/bin/env node
// REGRESSION (webtrade) — production login entry + chime. The live terminal (WT_DEMO=false) needs a
// real account, so it shows a login gate that REUSES the single proven auth path (login.html — it
// does sign-in + profile lookup + the #5 cross-account cache wipe) and round-trips back so the
// per-tab sessionStorage session lands in THIS tab. A login chime plays on return. The terminal must
// NOT duplicate the auth/sign-in flow (that path stays the one source of truth).
'use strict';
const fs = require('fs');
const path = require('path');
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
const lg = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) login gate exists, shows when logged out, and routes to the shared login (round-trip dest)
if (!/function LoginGate\(\{ onClose \}\)\{/.test(wt)) bad('LoginGate component missing');
if (!/location\.href='login\.html\?dest=webtrade\.html'/.test(wt)) bad('Log in must round-trip through login.html?dest=webtrade.html (reuse the proven auth)');
if (!/const loggedIn = !!\(window\.AlpexaSync && AlpexaSync\.me\);/.test(wt)) bad('App must compute logged-in state');
if (!/const \[showLogin,setShowLogin\]=React\.useState\(!loggedIn && !WT_DEMO\)/.test(wt)) bad('login gate must show when logged out in production');
if (!/\{showLogin && <LoginGate onClose=\{\(\)=>setShowLogin\(false\)\}/.test(wt)) bad('terminal must render the LoginGate');

// 2) the terminal must NOT duplicate the auth flow (single source of truth = login.html)
if (/signInWithPassword/.test(wt)) bad('webtrade must NOT call signInWithPassword — reuse login.html, do not duplicate auth/#5 wipe');

// 3) login chime — sound defined + played once on the first interaction after login, flag-cleared
if (!/const sndLogin\s*=\s*mkSnd\(/.test(wt)) bad('sndLogin sound missing');
if (!/sessionStorage\.getItem\('alpexa\.loginChime'\)/.test(wt)) bad('terminal must read the login-chime flag');
if (!/sessionStorage\.removeItem\('alpexa\.loginChime'\)[\s\S]*?playSnd\(sndLogin\)/.test(wt)) bad('login chime must clear the flag and play sndLogin on the first interaction');

// 4) login.html sets the chime flag on EVERY successful login (password + biometric paths)
if ((lg.match(/sessionStorage\.setItem\('alpexa\.loginChime','1'\)/g) || []).length < 2) bad('login.html must set the login-chime flag on both the password and biometric sign-in paths');
// 5) login.html dest override is whitelisted (no open redirect) and returns to the terminal
if ((lg.match(/==='webtrade\.html'/g) || []).length < 2) bad('login.html must whitelist dest=webtrade.html on both redirect paths (no open redirect)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} login-gate problem(s).`); process.exit(1); }
console.log('🟢 PASS: WebTrade login gate reuses login.html (round-trip dest, no auth duplication); login chime plays on return; dest whitelisted.');

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
if (!/location\.href='login\.html\?dest=webtrade\.html&skin=wt'/.test(wt)) bad('Log in must round-trip through the terminal-skinned login.html?dest=webtrade.html&skin=wt (same ONE proven auth path)');
// login state must be decided by the REAL auth session, NOT AlpexaSync.me (a function → always truthy)
if (/const loggedIn = !!\(window\.AlpexaSync && AlpexaSync\.me\)/.test(wt)) bad('must NOT gauge login by AlpexaSync.me (always-truthy guest function) — the gate never showed');
if (!/AlpexaSync\.db\.auth\.getSession\(\)\.then\(r=>\{ if\(live && !\(r&&r\.data&&r\.data\.session\)\) setShowLogin\(true\)/.test(wt)) bad('login gate must show only when there is NO Supabase session');
if (!/\{showLogin && <LoginGate onClose=\{\(\)=>setShowLogin\(false\)\}/.test(wt)) bad('terminal must render the LoginGate');

// 2) the terminal must NOT duplicate the auth flow (single source of truth = login.html)
if (/signInWithPassword/.test(wt)) bad('webtrade must NOT call signInWithPassword — reuse login.html, do not duplicate auth/#5 wipe');

// 3) login chime — sound defined + played once on the first interaction after login, flag-cleared
if (!/const sndLogin\s*=\s*mkSnd\('\/assets\/sounds\/startup\.wav'/.test(wt)) bad('login sound must be startup.wav (띠리링)');
if (!/const sndOpen\s*=\s*mkSnd\('\/assets\/sounds\/ok\.wav'/.test(wt)) bad('order-open sound must be ok.wav (철컥)');
if (!/const sndClose\s*=\s*mkSnd\('\/assets\/sounds\/close\.wav'/.test(wt)) bad('close sound must be close.wav (딩)');
if (!/sessionStorage\.getItem\('alpexa\.loginChime'\)/.test(wt)) bad('terminal must read the login-chime flag');
if (!/sessionStorage\.removeItem\('alpexa\.loginChime'\)[\s\S]*?playSnd\(sndLogin\)/.test(wt)) bad('login chime must clear the flag and play sndLogin on the first interaction');

// 3b) MOBILE autoplay unlock — first touch/pointer/click/key resumes audio + primes ALL clips (incl. login)
if (!/\[sndOpen, sndClose, sndError, sndStopout, sndLogin\]\.forEach\(s=>s\.unlock\(\)\)/.test(wt)) bad('unlockAudio must prime every clip including sndLogin');
if (!/\['touchstart','pointerdown','click','keydown'\]\.forEach\(ev=>/.test(wt)) bad('audio unlock must bind touchstart (iOS/Android) + pointer/click/key');
// order/close sounds are wired to the RPC success callbacks (fx_open / fx_close)
if (!/positionsStore\.loadPos\(\); playSnd\(sndOpen\);/.test(wt)) bad('sndOpen must fire on fx_open success (position landed)');
if (!/positionsStore\.loadPos\(\); positionsStore\.loadAcct\(\); playSnd\(sndClose\);/.test(wt)) bad('sndClose must fire on fx_close success');

// 4) login.html sets the chime flag on EVERY successful login (password + biometric paths)
if ((lg.match(/sessionStorage\.setItem\('alpexa\.loginChime','1'\)/g) || []).length < 2) bad('login.html must set the login-chime flag on both the password and biometric sign-in paths');
// 5) login.html dest override is whitelisted (no open redirect) and returns to the terminal
if ((lg.match(/==='webtrade\.html'/g) || []).length < 2) bad('login.html must whitelist dest=webtrade.html on both redirect paths (no open redirect)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} login-gate problem(s).`); process.exit(1); }
console.log('🟢 PASS: WebTrade login gate reuses login.html (round-trip dest, no auth duplication); login chime plays on return; dest whitelisted.');

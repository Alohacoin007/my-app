#!/usr/bin/env node
// FEATURE (webtrade toolbox, 2026-07-14 user request) — Mailbox account-opening mail + live Alerts.
//  MAILBOX: an MT5-style "account opened" mail sits on top of the list, composed ONLY from the
//  logged-in account's REAL data (custId / fx account / email via AlpexaSync.me — never a
//  fabricated identity, diagnose DEMO-* class). Passwords are hashed server-side and can NEVER
//  be displayed — the mail says so honestly instead of faking one.
//  ALERTS: user price alerts (symbol · ≥/≤ · price) — UI data in localStorage (allowed: not
//  money), engine rides the ONE priceStore subscription, a hit disarms the alert, logs to the
//  Journal and rings a sound. The tab replaces the themed empty panel.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static: routing + close-✕ palette ──
if (!/tab==='Alerts' \? <AlertsTab \/>/.test(src)) bad('Alerts tab must route to AlertsTab (not the empty panel)');
if (!/\.xclose\{[^}]*color:#8a94a6[^}]*\}/.test(src)) bad('close ✕ must be the silver glyph (#8a94a6)');
if (!/\.xclose:hover\{[^}]*color:#ffffff\}/.test(src)) bad('close ✕ must brighten to white on hover');

// ── mailbox: real-data welcome mail, no password ever ──
const wm = grab(/function buildWelcomeMail\(me\)\{[\s\S]*?\n\}/, 'buildWelcomeMail');
if (wm) {
  for (const f of ['me.custId', 'me.email', 'me.accts.fx']) if (wm.indexOf(f) === -1) bad('welcome mail must carry the REAL ' + f);
  if (!/never stored in plain text/.test(wm)) bad('the mail must say the password is never stored/shown (no fake passwords)');
  if (/Password:\s*'[^']*[A-Za-z0-9]{4}/.test(wm)) bad('NO literal password value may appear');
}
if (!/buildWelcomeMail\(AlpexaSync\.me\)/.test(src)) bad('MailboxTab must compose the mail from the live AlpexaSync.me');

// ── alerts: store + engine contracts ──
const st = grab(/const alertsStore=\{[\s\S]*?\n\};/, 'alertsStore');
if (st) {
  if (!/localStorage\.setItem\('alpexa\.alerts'/.test(st)) bad('alerts must persist under alpexa.alerts (UI data — not money)');
  if (!/priceStore\.subscribe\(throttle\(/.test(st)) bad('the alert engine must ride the priceStore subscription (throttled)');
  if (!/journalStore\.log\('Alert/.test(st)) bad('a hit must log to the Journal');
  if (!/playSnd\(sndClose\)/.test(st)) bad('a hit must ring (sndClose)');
  if (!/a\.armed=false; a\.hitAt=Date\.now\(\)/.test(st)) bad('a hit must DISARM the alert (fire once) and stamp the time');
}

// ── behavioural: the hit predicate + the mail builder ──
if (!fail) {
  const hit_src = grab(/const alertHit=[^\n]*/, 'alertHit');
  const alertHit = new Function(hit_src + '\nreturn alertHit;')();
  if (!alertHit({ cond: '>=', px: 1.14 }, 1.14)) bad('≥ must fire at the boundary');
  if (alertHit({ cond: '>=', px: 1.14 }, 1.1399)) bad('≥ must NOT fire below the level');
  if (!alertHit({ cond: '<=', px: 1.13 }, 1.1299)) bad('≤ must fire below the level');
  if (alertHit({ cond: '<=', px: 1.13 }, 1.1301)) bad('≤ must NOT fire above the level');
  const build = new Function(grab(/function buildWelcomeMail\(me\)\{[\s\S]*?\n\}/, 'builder') + '\nreturn buildWelcomeMail;')();
  const m = build({ custId: 'CR-7', name: 'Kim', email: 'k@x.com', accts: { fx: 'FX-9' } });
  if (!m || !/FX-9/.test(m.detail) || !/CR-7/.test(m.detail) || !/k@x\.com/.test(m.detail)) bad('builder must embed the real account fields');
  if (/undefined/.test(m.detail)) bad('builder must never print undefined');
  if (build(null) !== null) bad('no login → no mail (never fabricate an identity)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} mailbox/alerts problem(s).`); process.exit(1); }
console.log('🟢 PASS: mailbox opens with the real-account welcome mail (no fake password); Alerts tab live — persisted, one-shot hits, Journal + sound; ✕ is silver/white.');

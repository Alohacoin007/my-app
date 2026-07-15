#!/usr/bin/env node
// Alpexa — REGRESSION GUARD (#30): the login page must NEVER auto-forward into an app.
//   node tests/login-no-autoforward.test.js
//
// Bug class we shipped: login.html had a "stay-signed-in" block that, at page load,
// read the PERSISTENT localStorage tag `alpexa.me` and `location.replace()`'d straight
// into the last app — skipping the login form. But the real auth SESSION lives in
// sessionStorage (per-tab, cleared when the browser closes). So a browser that was
// closed and reopened (session gone, tag still there) auto-forwarded into the app with
// NO session → phantom logged-out state (■■■ balance, "No upcoming games"), and the
// app's expired-redirect bounced back into login which auto-forwarded again → stuck.
//
// Contract: the login page is ALWAYS the login form. A redirect into an app page may
// happen ONLY from inside the login submit handler (after real auth), never from a
// load-time script that trusts a stored identity tag.
//
// This is a SOURCE assertion (can't run the page's Supabase/DOM here): it isolates the
// scripts that run at load — everything before <body> — and fails if any of them both
// reads a stored identity (alpexa.me / alpexa.lastServer) AND redirects to an app page.
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');

// Scripts that execute at page load run in <head>, before <body>. The login submit
// handler (the ONE place a post-auth redirect is allowed) lives in a function defined
// in a body script and is only invoked on form submit — so slicing at <body> cleanly
// separates "load-time" code from "after I clicked login" code.
const headPart = SRC.split(/<body[\s>]/i)[0];

const APP = /(sports-live|crypto-live|trading)\.html/;
const READS_TAG = /alpexa\.(me|lastServer)/;
const REDIRECTS = /location\s*\.\s*(replace|href|assign)/;

let failed = false;
function assert(cond, msg) {
  if (!cond) { console.log('  🔴 ' + msg); failed = true; }
  else { console.log('  ✅ ' + msg); }
}

// 1) No load-time script line redirects to an app page off a stored tag.
const headLines = headPart.split('\n');
const offenders = headLines.filter((ln) => REDIRECTS.test(ln) && APP.test(ln));
assert(offenders.length === 0,
  'login.html load-time scripts do not location.replace/href into an app page' +
  (offenders.length ? '\n        offending: ' + offenders.map((l) => l.trim().slice(0, 80)).join('\n        ') : ''));

// 2) The specific removed signature must not return: a load-time block that both reads
//    the identity tag and redirects (the old stay-signed-in auto-pass).
const headTagRedirect = headLines.some((ln) => READS_TAG.test(ln) && REDIRECTS.test(ln));
assert(!headTagRedirect,
  'login.html has no load-time "read alpexa.me → redirect" auto-forward (the #30 stay-signed-in jump)');

// 3) Sanity: the LEGIT post-auth redirect (inside the body submit handler) still exists,
//    so we didn't break the ability to enter the app after a real login. (2026-07-14: the
//    landing page now comes from fxDest — device routing — instead of an inline const.)
assert(/window\.location\.href=fxDest\(selServer\)/.test(SRC) &&
       /function fxDest\(server\)\{[\s\S]*(sports-live|crypto-live|trading)\.html/.test(SRC),
  'login.html still redirects to the app AFTER a successful login (submit handler intact)');

console.log('\n' + (failed
  ? '🔴 login-no-autoforward: FAIL — the login page can auto-forward into the app (#30 regression)'
  : '🟢 login-no-autoforward: login page is always the form; app entry only after real login') + '\n');
process.exit(failed ? 1 : 0);

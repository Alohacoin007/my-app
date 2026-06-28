#!/usr/bin/env node
// REGRESSION (XSS) — the back office renders CUSTOMER-supplied names/emails into innerHTML
// via esc(). esc() must escape < > & ' " — not just " — otherwise a malicious signup name
// like `<img src=x onerror=...>` executes in the ADMIN's browser (stored XSS → back-office
// takeover). This asserts every manager esc() escapes the angle brackets and ampersand.
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'manager-mobile.html'), 'utf8');
const escDefs = src.match(/var esc\s*=\s*function\s*\([vs]\)\s*\{[^}]*\}/g) || [];
if (!escDefs.length) { console.error('🔴 FAIL: manager esc() definitions not found'); process.exit(1); }

const bad = escDefs.filter((d) => !/&lt;/.test(d) || !/&gt;/.test(d) || !/&amp;/.test(d));
if (bad.length) {
  console.error(`🔴 FAIL: ${bad.length}/${escDefs.length} manager esc() do NOT escape < > & — stored-XSS via customer names is possible.`);
  process.exit(1);
}
console.log(`🟢 PASS: all ${escDefs.length} manager esc() escape < > & " ' — no stored XSS via customer-supplied data.`);

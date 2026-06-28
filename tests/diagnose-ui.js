#!/usr/bin/env node
// Alpexa — UI / FEATURE-COMPLETENESS SCAN (poka-yoke for "looks active but isn't").
//   node tests/diagnose-ui.js
//
// Companion to diagnose.js (which guards MONEY bug-classes). This guards the "feature not
// wired" class the user keeps finding by clicking: demo/seed data shown as if real, and
// stub/placeholder features that look live. Each finding is a SPOT TO REVIEW — either fix
// it (read real data / finish the feature) or, if it's a verified-safe fallback, add it to
// ACCEPTED with a reason (same control plan as diagnose.js).
//
// Precision over recall: only patterns that have actually bitten us. A noisy check gets
// ignored, which is worse than no check.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const DEPLOYED = ['crypto-live.html', 'sports-live.html', 'trading.html', 'manager-mobile.html'];

const CHECKS = [
  // Hardcoded non-zero money in a data literal = demo/seed balance that can show before (or
  // instead of) the real server holding. This is the SEND_ASSETS $21,903 BTC class (#18).
  { id: 'UI-demo-balance', sev: 'REVIEW', files: DEPLOYED,
    re: /\b(balance|balanceUsd|holdingUsd|mine)\s*:\s*[1-9][0-9]*\.?[0-9]*/,
    why: 'Hardcoded non-zero balance in a literal — shows as a real holding the account may not have. Read it from the server (balances/crypto_holdings) instead.' },
  // Honest "unfinished feature" markers shipped in a customer app. Phrases are matched
  // case-insensitively; TODO/FIXME case-SENSITIVELY so the Spanish word "todo" doesn't trip.
  { id: 'UI-stub-marker', sev: 'REVIEW', files: DEPLOYED,
    reCI: /coming soon|not implemented|\bdemo[- ]only\b|\bplaceholder data\b/i,
    reCS: /\bTODO\b|\bFIXME\b/,
    why: 'A stub / "demo only" marker in a shipped app — the feature around it may look active but be unfinished or fake.' },
  // "Temporary / replace-me / sample" markers — data that LOOKS real but is flagged as
  // placeholder/unverified (the "sample Alpexa bank coordinates (replace later)" / N2 class).
  // The data may actually be real (just a stale comment) OR a true placeholder — either way,
  // REVIEW: confirm it's real and fix the comment, or replace the placeholder.
  { id: 'UI-replace-me', sev: 'REVIEW', files: DEPLOYED,
    reCI: /replace later|replace me\b|replace this|fill ?in later|update later|change later|sample [a-z]+ (coordinates|details|address|data|info)|hardcoded (sample|demo|placeholder|test)/i,
    why: 'A "replace later / sample / placeholder" marker on shipped data — confirm the value is REAL (fix the stale comment) or replace the placeholder before launch.' },
];

// Lines that are i18n translation tables or our own fix-describing comments → never findings.
function skipLine(ln) {
  if (/^\s*[a-z]{2}\s*:\s*\{\s*"/.test(ln)) return true;             // en:{"...":"..."} translation row
  if (/no hardcoded|never .*demo|not the demo|removed .*demo|not a fake|show 0|#5|instead of a shared|coming soon" instead/i.test(ln)) return true;
  if (/^\s*\/\//.test(ln) && /hardcoded demo value/i.test(ln)) return true; // our fix comment
  return false;
}

// Reviewed-OK (verified-safe / intentional honest "coming soon"). Printed but not failed.
// `match` = a stable substring of the line (so it survives line-number shifts).
const ACCEPTED = [
  { id: 'UI-stub-marker', file: 'crypto-live.html', match: 'On-chain',
    reason: 'C1: honest "On-chain {coin} — coming soon" panel — the correct 100% behavior (no fake external address) until per-user deposit addresses (C2) exist.' },
  { id: 'UI-stub-marker', file: 'crypto-live.html', match: 'micro-deposits are simulated',
    reason: 'B1: bank micro-deposit verification is honestly labelled "Demo only" — deferred to the Plaid backend (🟥), not pretending to work.' },
];
function isAccepted(id, file, line, text) {
  return ACCEPTED.some((a) => a.id === id && a.file === file &&
    (a.line == null || a.line === line) && (a.match == null || (text || '').includes(a.match)));
}

const findings = [];
for (const c of CHECKS) {
  for (const rel of c.files) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    fs.readFileSync(fp, 'utf8').split('\n').forEach((ln, i) => {
      if (skipLine(ln)) return;
      const reMatch = c.re ? c.re.test(ln) : (c.reCI.test(ln) || (c.reCS && c.reCS.test(ln)));
      if (reMatch) {
        findings.push({ id: c.id, sev: c.sev, why: c.why, file: rel, line: i + 1,
          text: ln.trim().slice(0, 90), accepted: isAccepted(c.id, rel, i + 1, ln) });
      }
    });
  }
}

const active = findings.filter((f) => !f.accepted);
const byId = {};
active.forEach((f) => { (byId[f.id] = byId[f.id] || []).push(f); });

console.log('── UI / FEATURE-COMPLETENESS SCAN ────────────────────');
console.log(`  checks: ${CHECKS.length}   review findings: ${active.length}   accepted: ${findings.length - active.length}`);
for (const id of Object.keys(byId)) {
  console.log(`\n  ⚠️  [${id}] ${byId[id].length} spot(s) — ${CHECKS.find((c) => c.id === id).why}`);
  byId[id].forEach((f) => console.log(`      ${f.file}:${f.line}  ${f.text}`));
}
// REVIEW-level: report, do NOT fail the gate (these are triage prompts, not hard errors).
console.log('\n' + (active.length ? `🔎 ${active.length} spot(s) to review (fix or add to ACCEPTED).` : '🟢 UI scan clean.') + '\n');
process.exit(0);

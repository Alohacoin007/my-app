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
];

// Lines that are i18n translation tables or our own fix-describing comments → never findings.
function skipLine(ln) {
  if (/^\s*[a-z]{2}\s*:\s*\{\s*"/.test(ln)) return true;             // en:{"...":"..."} translation row
  if (/no hardcoded|never .*demo|not the demo|removed .*demo|not a fake|show 0|#5/i.test(ln)) return true;
  if (/^\s*\/\//.test(ln) && /hardcoded demo value/i.test(ln)) return true; // our fix comment
  return false;
}

// Reviewed-OK (verified safe seed / intentional). Printed but not failed.
const ACCEPTED = [
  // (add entries here as: { id, file, line?, reason } once each finding is triaged)
];
function isAccepted(id, file, line) {
  return ACCEPTED.some((a) => a.id === id && a.file === file && (a.line == null || a.line === line));
}

const findings = [];
for (const c of CHECKS) {
  for (const rel of c.files) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    fs.readFileSync(fp, 'utf8').split('\n').forEach((ln, i) => {
      if (skipLine(ln)) return;
      const reMatch = c.re ? c.re.test(ln) : (c.reCI.test(ln) || c.reCS.test(ln));
      if (reMatch) {
        findings.push({ id: c.id, sev: c.sev, why: c.why, file: rel, line: i + 1,
          text: ln.trim().slice(0, 90), accepted: isAccepted(c.id, rel, i + 1) });
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

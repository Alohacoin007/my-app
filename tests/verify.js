#!/usr/bin/env node
// Alpexa — SELF-VERIFICATION GATE.  Run BEFORE saying "완료/done".
//   node tests/verify.js
// It (1) parses every app's inline JS/JSX (catches syntax errors a browser would hit),
// and (2) runs every tests/*.test.js (the RED→GREEN money/logic proofs).
// Exit 0 = all green; non-zero = something is broken. No claim of "done" without 0.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRATCH = '/tmp/claude-0/-home-user-my-app/65a31dc3-8029-5325-85c8-7faee483a19a/scratchpad';

// --- locate (or install) a JSX-capable parser ---
function loadParser() {
  for (const base of [SCRATCH, ROOT, '/opt/node22/lib/node_modules']) {
    try { return require(path.join(base, 'node_modules', '@babel', 'parser')); } catch (_) {}
    try { return require(require.resolve('@babel/parser', { paths: [base] })); } catch (_) {}
  }
  try { cp.execSync('npm install @babel/parser --no-save', { cwd: SCRATCH, stdio: 'ignore' }); } catch (_) {}
  try { return require(path.join(SCRATCH, 'node_modules', '@babel', 'parser')); } catch (_) {}
  return null;
}
const parser = loadParser();

// apps whose inline scripts must parse clean
const APPS = ['crypto-live.html', 'sports-live.html', 'trading.html', 'index.html',
              'login.html', 'signup.html', 'manager-mobile.html', 'statement.html'];

let fail = 0;

// ---- (1) parse inline scripts ----
console.log('── PARSE: app inline scripts ─────────────────────────');
if (!parser) {
  console.log('  ⚠️  no @babel/parser available — skipped JSX parse (install it for full coverage)');
} else {
  for (const app of APPS) {
    const file = path.join(ROOT, app);
    if (!fs.existsSync(file)) { console.log(`  -- ${app} (missing, skipped)`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, blocks = 0, bad = 0;
    while ((m = re.exec(html))) {
      const attrs = m[1] || '', code = m[2] || '';
      if (/\bsrc\s*=/.test(attrs)) continue;                 // external script, no body
      const jsx = /type\s*=\s*["']text\/babel["']/.test(attrs);
      blocks++;
      try { parser.parse(code, { sourceType: 'script', plugins: jsx ? ['jsx'] : [] }); }
      catch (e) { bad++; fail++; console.log(`  ❌ ${app} block#${blocks} @line ${e.loc && e.loc.line}: ${e.message}`); }
    }
    console.log(`  ${bad ? '❌' : '✅'} ${app}  (${blocks} blocks, ${bad} errors)`);
  }
}

// ---- (2) run unit tests ----
console.log('\n── TESTS: RED→GREEN suite ────────────────────────────');
const testDir = __dirname;
const tests = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();
for (const t of tests) {
  const r = cp.spawnSync(process.execPath, [path.join(testDir, t)], { encoding: 'utf8' });
  const okExit = r.status === 0;
  if (!okExit) fail++;
  console.log(`  ${okExit ? '✅' : '❌'} ${t}`);
  if (!okExit) { // surface failing detail
    const out = ((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => /❌|Error|FAIL/.test(l)).slice(0, 8);
    out.forEach(l => console.log('       ' + l.trim()));
  }
}

// ---- (3) defect-prevention scan (poka-yoke for shipped bug-classes) ----
console.log('\n── DIAGNOSE: defect-class scan ───────────────────────');
{
  const d = cp.spawnSync(process.execPath, [path.join(testDir, 'diagnose.js')], { encoding: 'utf8' });
  if (d.status !== 0) {
    fail++;
    ((d.stdout || '') + (d.stderr || '')).split('\n')
      .filter(l => /🔴|🟠/.test(l)).slice(0, 12).forEach(l => console.log('  ' + l.trim()));
  } else {
    console.log('  ✅ diagnose clean (no known defect class present)');
  }
}

// ---- (4) UI / feature-completeness scan (REVIEW only — does NOT fail the gate) ----
// Surfaces "looks active but isn't" candidates: demo/seed balances shown as real, stub
// markers. These are triage prompts (fix or ACCEPT), not hard errors — so they inform but
// never block. Run `node tests/diagnose-ui.js` for the full list.
console.log('\n── UI SCAN: feature-completeness (review, non-blocking) ──');
{
  const u = cp.spawnSync(process.execPath, [path.join(testDir, 'diagnose-ui.js')], { encoding: 'utf8' });
  const line = ((u.stdout || '') + (u.stderr || '')).split('\n').find(l => /review findings|UI scan clean/.test(l));
  console.log('  ' + (line ? line.trim() : 'ui scan ran') + '   (details: node tests/diagnose-ui.js)');
}

// ---- (5) live render smoke (headless Chromium — catches render crashes / chart NaN) ----
// The executable arm of 시각-감사-프롬프트.md. Skips cleanly (exit 0) where it can't run
// (no playwright-core / no Chromium / blocked CDN) so the gate is never fragile; fails only
// when a page it actually rendered threw an uncaught error or drew a broken chart.
console.log('\n── RENDER: live page smoke (headless) ────────────────');
{
  const v = cp.spawnSync(process.execPath, [path.join(testDir, 'visual-smoke.js')], { encoding: 'utf8', timeout: 180000 });
  if (v.status !== 0) {
    fail++;
    ((v.stdout || '') + (v.stderr || '')).split('\n')
      .filter(l => /🔴|uncaught|non-finite/.test(l)).slice(0, 10).forEach(l => console.log('  ' + l.trim()));
  } else {
    const line = ((v.stdout || '') + (v.stderr || '')).split('\n').find(l => /visual-smoke:|SKIP visual-smoke/.test(l));
    console.log('  ' + (line ? line.trim().replace(/^[🟢⏭️ ]+/, '') : 'render smoke ran'));
  }
}

console.log('\n' + (fail === 0
  ? '🟢 VERIFY PASSED — safe to say done'
  : `🔴 VERIFY FAILED — ${fail} problem(s). DO NOT claim done.`) + '\n');
process.exit(fail === 0 ? 0 : 1);

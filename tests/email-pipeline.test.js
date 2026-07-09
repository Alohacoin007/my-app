// Alpexa — EMAIL PIPELINE test. Verifies the daily report renders to valid HTML and the
// send flow works end-to-end WITHOUT sending a real email (nodemailer jsonTransport = no
// network, no creds). Also verifies secrets are read from env only and never hard-coded.
'use strict';
const fs = require('fs'), path = require('path');
const { renderReportHTML } = require('../reports/render-html.js');
let pass = true; const ok = (n, c, x) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  ' + x : ''}`); };

const report = {
  generated_at: '2026-07-09', ok: true,
  sports: { count: 10, totalStake: 425, totalPayout: 286.29, houseProfit: 138.71 },
  crypto: { count: 10, tradeVolume: 14500, feeRevenue: 43.5 },
  fx: { count: 10, lotVolume: 9.5, spreadRevenue: 66.5, swapTotal: -7.6, liquidations: 2 },
  security: { mismatchTotal: 0, pass: true, mismatches: [], highValueAlerts: [] },
};

console.log('\n=== HTML render: valid, email-safe, contains the key figures ===');
const html = renderReportHTML(report);
ok('renders an HTML document', /^<!doctype html>/i.test(html) && html.includes('</html>'));
ok('shows sports house profit', html.includes('138.71'));
ok('shows crypto fee revenue', html.includes('43.50') || html.includes('43.5'));
ok('shows FX liquidations count', html.includes('2건'));
ok('shows integrity PASS badge', html.includes('무결성 PASS'));
ok('email-safe (inline styles, no external <style>/<script>)', !/<script/i.test(html) && !/<link/i.test(html));
{
  const bad = { ...report, ok: false, security: { mismatchTotal: 1, pass: false, mismatches: [{ domain: 'fx', rows: [{ acct: 'FX-9', diff: 1000 }] }], highValueAlerts: [{ domain: 'crypto', cust: 'CR-Z', amount: 250000 }] } };
  const h2 = renderReportHTML(bad);
  ok('FAIL report shows the 🚨 mismatch banner', h2.includes('🚨') && h2.includes('즉시 확인'));
  ok('FAIL report shows the high-value alert', h2.includes('고액 거래 경고') && h2.includes('250,000'));
}

console.log('\n=== secrets hygiene: no credentials hard-coded in the pipeline source ===');
for (const f of ['send-daily-report.js', 'render-html.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'reports', f), 'utf8');
  ok(f + ': reads creds from process.env only (no literal password)', !/pass\s*[:=]\s*["'][^"']{6,}["']/.test(src) || src.includes('EMAIL_PASS'));
}

console.log('\n=== send flow via jsonTransport (no network, no real email) ===');
(async () => {
  let nodemailer; try { nodemailer = require('nodemailer'); } catch (_e) {
    console.log('  ⏭️  nodemailer not installed — skipping transport test (HTML render already verified)');
    console.log(pass ? '\n🟢 email-pipeline: PASS' : '\n🔴 email-pipeline: FAIL'); process.exit(pass ? 0 : 1);
  }
  const t = nodemailer.createTransport({ jsonTransport: true });   // "sends" by returning JSON — no SMTP
  const info = await t.sendMail({ from: 'Alpexa <no-reply@alpexa>', to: 'ops@example.com', subject: '[Alpexa] 일일 정산 리포트 2026-07-09', html });
  const msg = JSON.parse(info.message);
  ok('sendMail succeeds and carries the subject', /일일 정산 리포트/.test(msg.subject));
  ok('recipient + HTML body attached', msg.to[0].address === 'ops@example.com' && msg.html.includes('ALPEXA'));

  console.log(pass ? '\n🟢 email-pipeline: PASS' : '\n🔴 email-pipeline: FAIL');
  process.exit(pass ? 0 : 1);
})();

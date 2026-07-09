#!/usr/bin/env node
// Alpexa — daily report EMAIL sender. Run by a scheduler (GitHub Action / server crontab)
// each morning: builds the daily report, renders it to HTML, and emails it to EMAIL_TO.
//
//   node reports/send-daily-report.js            # send the email (needs .env with creds)
//   node reports/send-daily-report.js --dry-run  # render + save HTML, DO NOT send (no creds needed)
//
// Secrets come ONLY from environment variables (.env locally, or CI secrets) — never source.
'use strict';
const fs = require('fs'), path = require('path');
const { renderReportHTML } = require('./render-html.js');

// ── tiny .env loader (no dependency): KEY=VALUE lines; real env vars win ──
function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch (_e) { /* no .env file → rely on real env vars (CI secrets) */ }
}

// ── obtain the report. LIVE: calls the read-only `daily_report` RPC on Supabase (yesterday's
//    real trades/bets, assembled server-side — see supabase/sql/daily_report.sql). Falls back
//    to the newest generated reports/alpexa-daily-*.json when DB creds aren't set (dev/--dry-run). ──
async function loadReport() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/daily_report`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),   // {} → default p_date = yesterday (Las Vegas day)
      });
      if (res.ok) {
        const j = await res.json();
        if (j && j.generated_at) { console.log('📊 live report loaded from Supabase for', j.generated_at); return j; }
      }
      console.warn('⚠️ daily_report RPC returned', res.status, '— falling back to the latest sample report');
    } catch (e) {
      console.warn('⚠️ daily_report fetch failed:', e.message, '— falling back to the latest sample report');
    }
  }
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => /^alpexa-daily-.*\.json$/.test(f)).sort();
  if (files.length) return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8'));
  throw new Error('no live DB creds and no report JSON — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or run the report harness first');
}

async function main() {
  loadEnv(path.join(__dirname, '..', '.env'));
  const dryRun = process.argv.includes('--dry-run');
  const report = await loadReport();
  const html = renderReportHTML(report);
  const subject = `[Alpexa] 일일 정산 리포트 ${report.generated_at} — ${report.security.pass ? '무결성 PASS' : '🚨 오차 발생'}`;

  if (dryRun) {
    const out = path.join(__dirname, `preview-${report.generated_at}.html`);
    fs.writeFileSync(out, html);
    console.log('DRY RUN — no email sent. HTML preview saved:', out);
    console.log('subject:', subject);
    return;
  }

  const { EMAIL_HOST, EMAIL_USER, EMAIL_PASS, EMAIL_TO } = process.env;
  const missing = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_TO'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('❌ 이메일 설정 누락:', missing.join(', '));
    console.error('   → .env 파일을 만들고 값을 채우세요 (reports/EMAIL-SETUP-가이드.md 참고).');
    process.exit(1);
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST, port: 465, secure: true,       // Gmail: smtp.gmail.com:465 (SSL)
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  const info = await transporter.sendMail({ from: `Alpexa 정산 <${EMAIL_USER}>`, to: EMAIL_TO, subject, html });
  console.log('✅ 리포트 이메일 발송 완료 →', EMAIL_TO, '(messageId:', info.messageId + ')');
}

if (require.main === module) main().catch((e) => { console.error('발송 실패:', e.message); process.exit(1); });
module.exports = { loadReport };

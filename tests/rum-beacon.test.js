#!/usr/bin/env node
// PIN — RUM 비콘 계약 (P2 관측성, 2026-07-31)
//  ① 익명 수치만: 비콘 payload에 계정/이메일/잔고류 필드 금지 (page/dcl/load_ms/app_ms/mobile 만)
//  ② 테스트 오염 방지: navigator.webdriver·file: 가드 필수 (헤드리스가 실측을 더럽히면 안 됨)
//  ③ 관측이 앱을 못 죽이게: 전체가 try/catch + 실패 무시 (관측은 절대 방해하지 않는다)
//  ④ 클라는 rum 을 읽지 않는다 (INSERT 전용 — 원시행 조회는 어드민/집계뷰만)
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'alpexa-sync.js'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const m = src.match(/\/\* ⚡ RUM[\s\S]*$/);
if (!m) bad('RUM beacon block missing from alpexa-sync.js');
else {
  const b = m[0];
  if (!/navigator\.webdriver \|\| location\.protocol === 'file:'/.test(b)) bad('webdriver/file: guard required (test runs must not pollute RUM)');
  if (!/page: page, dcl:.*\n.*load_ms:.*app_ms:.*\n.*mobile:/.test(b)) bad('payload must stay {page,dcl,load_ms,app_ms,mobile} — nothing else');
  if (/email|cust|acct|balance|token/i.test(b.replace(/계정정보/g, ''))) bad('RUM payload must never carry identity/money fields');
  if (!/catch \(_e\) \{ \/\* 관측은 앱을 절대 방해하지 않는다 \*\/ \}/.test(b)) bad('send() must swallow all errors');
  if (!/rest\/v1\/rum\?apikey=/.test(b)) bad('beacon must POST to /rest/v1/rum (anon INSERT-only table)');
  if (/from\('rum'\)|rest\/v1\/rum\?select/.test(src)) bad('client must never SELECT rum (read = rum_stats aggregate view only)');
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} RUM contract problem(s).`); process.exit(1); }
console.log('🟢 PASS: RUM beacon contract (anonymous metrics only, guarded, fail-silent, insert-only).');

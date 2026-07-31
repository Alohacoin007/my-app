#!/usr/bin/env node
// PIN — 합성 고객 봇 안전 계약 (2026-07-31). 봇은 돈을 "실제로" 움직이는 유일한 자동화라
// 그 자체가 사고 벡터가 될 수 있다. 아래 계약이 깨지면 verify 🔴:
//  ① 금액 상한: 크립토 ≤ $5, FX ≤ 0.01랏 — 봇이 큰돈을 만지는 순간 자체가 결함
//  ② 시크릿 하드코딩 0: service_role/sb_secret 문자열 금지, 자격증명은 env로만
//  ③ cash_out 프로브는 "거부돼야 정상" 방향 — 뒤집히면(성공 기대) 잠금 해제를 정상으로 오인
//  ④ 멱등 프로브 존재: 같은 ref 재호출 → duplicate 검증
//  ⑤ 불변식 대조 존재: Δ잔고 == Σledger 정확 비교
//  ⑥ fail-closed: 이상 시 exit 1 (침묵 게이트가 이메일을 쏘려면 프로세스가 빨갛게 죽어야)
//  ⑦ 미설정 시 조용히 생략(exit 0) — 시크릿 등록 전 소음 금지
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'synthetic-customer.js'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ① 금액 상한
const buy = src.match(/const BUY_USD = (\d+(?:\.\d+)?)/);
const lot = src.match(/const FX_SIZE = (\d+(?:\.\d+)?)/);
if (!buy || +buy[1] > 5) bad('BUY_USD must be ≤ 5 (bot must only touch micro amounts)');
if (!lot || +lot[1] > 0.01) bad('FX_SIZE must be ≤ 0.01 lot');
if (!/MAX_ROUNDTRIP_COST = 1(\.0)?/.test(src)) bad('round-trip cost ceiling ($1) must stay pinned');

// ② 시크릿 하드코딩 금지
if (/service_role|sb_secret/i.test(src)) bad('bot must never contain service_role/sb_secret material');
if (!/process\.env\.SYNTH_EMAIL/.test(src) || !/process\.env\.SYNTH_PASSWORD/.test(src)) bad('credentials must come from env only');

// ③ cash_out 프로브 방향 = 거부가 정상
if (!/permission denied\|42501/.test(src)) bad('cash_out probe must expect permission denied (lockdown intact)');
if (!/cash_out 잠금 풀림/.test(src)) bad('cash_out probe must RED when the customer call is NOT rejected');

// ④ 멱등 프로브
if (!/duplicate === true\)/.test(src)) bad('idempotency probe: same-ref re-call must assert duplicate');

// ⑤ 불변식 대조
if (!/Math\.abs\(d - sum\) < 0\.005/.test(src)) bad('invariant: Δbalance must equal Σledger to the cent');

// ⑥⑦ fail-closed + 미설정 생략
if (!/process\.exit\(red \? 1 : 0\)/.test(src)) bad('bot must exit 1 on any red (silent-gate email)');
if (!/미설정.*생략[\s\S]*?process\.exit\(0\)/.test(src)) bad('missing secrets must skip quietly with exit 0');

if (fail) { console.error(`\n🔴 FAIL — ${fail} synthetic-bot contract problem(s).`); process.exit(1); }
console.log('🟢 PASS: synthetic customer bot safety contract (micro amounts, env creds, lockdown probe, invariant).');

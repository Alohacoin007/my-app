#!/usr/bin/env node
// PIN — PAMM 투자자 화면(웹트레이더/앱) 돈 계약 (2026-08-06 사장님 "하네스 통해 만들어").
// 투자자가 자기 잔고를 보고 참여/회수하는 경로 — 돈이 움직이므로 아래가 깨지면 verify 🔴:
//  [I1] 투자자 리포트는 서버 RPC(pamm_investor_report) 단일 소스 — 클라가 지분 계산 안 함
//  [I2] mine.value·pnl은 서버가 units×NAV로 산출 (클라 파생 금지 — 표시=서버 진실)
//  [I3] 참여/회수는 서버 RPC(pamm_join/pamm_leave) + pamm-* 멱등 ref로만
//  [I4] 성공 시 서버 진실 재적재(positionsStore.load) — 낙관적 클라 잔고 조작 없음
//  [I5] 리포트 RPC는 investor의 남의 지분(roster/ops) 노출 안 함 — 본인 mine만
'use strict';
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'pamm_core.sql'), 'utf8');
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'trading-app.jsx'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── 서버 계약 ──
// [I1] 투자자 리포트 RPC 존재 + SECURITY DEFINER + authenticated grant
if (!/create or replace function public\.pamm_investor_report\(\)/.test(sql)) bad('pamm_investor_report RPC missing');
if (!/pamm_investor_report[\s\S]{0,600}security definer/.test(sql)) bad('investor report must be SECURITY DEFINER');
if (!/grant execute on function public\.pamm_investor_report\(\) to authenticated/.test(sql)) bad('investor report must be granted to authenticated');
// [I2] value·pnl은 서버가 units×NAV로 산출
if (!/'value', round\(m\.units \* public\.pamm_nav\(fd\.fund_acct\), 2\)/.test(sql)) bad('mine.value must be server-computed units×NAV');
if (!/'pnl', round\(m\.units \* public\.pamm_nav\(fd\.fund_acct\) - m\.cost_basis, 2\)/.test(sql)) bad('mine.pnl must be server-computed');
// [I5] 남의 지분 미노출: 리포트에 roster/ops 없음, mine은 caller cust로 한정
if (/pamm_investor_report[\s\S]{0,1200}'roster'/.test(sql)) bad('investor report must NOT expose other members (roster)');
if (!/m\.cust_id = v_cust/.test(sql)) bad('mine must be scoped to the calling customer only');

// ── 클라(웹트레이더) 계약 ──
// [I1] 단일 소스 = pamm_investor_report RPC
if (!/AlpexaSync\.db\.rpc\('pamm_investor_report'\)/.test(wt)) bad('webtrade PAMM tab must read via pamm_investor_report RPC');
// [I3] 참여/회수 = 서버 RPC + pamm-* 멱등 ref
if (!/AlpexaSync\.db\.rpc\('pamm_join',\{p_ref:'pamm-/.test(wt)) bad('join must call pamm_join with pamm-* idempotent ref');
if (!/AlpexaSync\.db\.rpc\('pamm_leave',\{p_ref:'pamm-/.test(wt)) bad('redeem must call pamm_leave with pamm-* idempotent ref');
// 클라가 지분/잔고를 직접 쓰지 않음 (RPC만)
if (/from\('pamm_(funds|members|ops)'\)/.test(wt)) bad('client must never touch pamm tables directly');
// [I4] 성공 후 서버 진실 재적재
if (!/positionsStore\.load\(\); load\(\)/.test(wt)) bad('after join/redeem must reload server truth (positionsStore.load + report)');
// 탭이 실제로 배선됨
if (!/'Trade','Exposure','History','PAMM'/.test(wt)) bad('PAMM tab must be registered in TBX_TABS');
if (!/tab==='PAMM' \? <PammTab/.test(wt)) bad('PAMM tab must be wired in the BottomBar switch');

// ── 클라(모바일 앱) 계약 — 동일 서버 경로 ──
if (!/AlpexaSync\.db\.rpc\('pamm_investor_report'\)/.test(app)) bad('mobile PammFunds must read via pamm_investor_report RPC');
if (!/AlpexaSync\.db\.rpc\('pamm_join',\{p_ref:'pamm-/.test(app)) bad('mobile join must call pamm_join with pamm-* ref');
if (!/AlpexaSync\.db\.rpc\('pamm_leave',\{p_ref:'pamm-/.test(app)) bad('mobile redeem must call pamm_leave with pamm-* ref');
if (/from\('pamm_(funds|members|ops)'\)/.test(app)) bad('mobile client must never touch pamm tables directly');
if (!/<PammFunds\/>/.test(app)) bad('PammFunds must be mounted in the Account screen');

if (fail) { console.error(`\n🔴 FAIL — ${fail} PAMM investor problem(s).`); process.exit(1); }
console.log('🟢 PASS: PAMM investor screen contract (server-report source, server-valued shares, idempotent join/redeem, reload truth).');

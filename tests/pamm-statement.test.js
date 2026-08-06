#!/usr/bin/env node
// PIN — PAMM 월간 명세서 계약 (2026-08-06). 기존 스포츠 명세서 경로 무접촉 + 숫자=서버 산출.
//  [S1] 수신자 = 유닛>0 투자자만, 매니저 제외(운용자≠투자자)
//  [S2] 명세서 값 = 서버 units×NAV (Edge가 자체 계산 안 함)
//  [S3] 멱등: (cust,month) 재발송 차단
//  [S4] fail-closed 게이트 토큰 + service_role 전용 RPC (recipients/mark)
//  [S5] 스포츠 명세서(send-statements)와 분리 — PAMM Edge는 그 RPC를 안 부름
'use strict';
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'pamm_core.sql'), 'utf8');
const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pamm-statements', 'index.ts'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// [S1] 수신자 스코프
if (!/create or replace function public\.pamm_statement_recipients\(p_month text\)/.test(sql)) bad('pamm_statement_recipients RPC missing');
if (!/m\.units > 0 and m\.cust_id <> f\.manager_cust/.test(sql)) bad('recipients must be unit-holders EXCLUDING the manager');
// [S2] 값은 서버 units×NAV
if (!/'value', round\(m\.units \* public\.pamm_nav\(m\.fund_acct\),2\)/.test(sql)) bad('statement value must be server units×NAV');
if (!/'total_value', coalesce\(sum\(round\(m\.units \* public\.pamm_nav/.test(sql)) bad('total_value must be server-summed');
// [S3] 멱등
if (!/create table if not exists public\.pamm_statement_sends[\s\S]{0,200}primary key \(cust_id, month\)/.test(sql)) bad('pamm_statement_sends must be idempotent on (cust,month)');
if (!/on conflict \(cust_id, month\) do nothing/.test(sql)) bad('mark_pamm_statement_sent must be idempotent');
// [S4] 권한
if (!/grant execute on function public\.pamm_statement_recipients\(text\) to service_role/.test(sql)) bad('recipients must be service_role-only');
if (/grant execute on function public\.pamm_statement_recipients\(text\) to (public|anon|authenticated)/.test(sql)) bad('recipients must NOT be exposed to clients');

// Edge 계약
if (!/token !== CRON_SECRET && token !== ALT_SECRET/.test(edge)) bad('Edge must be fail-closed on the gate token');
if (!/rpc\("pamm_statement_recipients"/.test(edge) || !/rpc\("pamm_statement"/.test(edge)) bad('Edge must source data from the PAMM statement RPCs');
if (!/rpc\("mark_pamm_statement_sent"/.test(edge)) bad('Edge must mark sent (idempotent)');
// [S5] 스포츠 명세서 경로 미접촉
if (/get_statement|list_statement_recipients|mark_statement_sent/.test(edge)) bad('PAMM Edge must NOT call the sports statement RPCs (separate path)');
if (!/s\.funds && s\.funds\.length/.test(edge)) bad('Edge must skip investors with no holdings');

if (fail) { console.error(`\n🔴 FAIL — ${fail} PAMM statement problem(s).`); process.exit(1); }
console.log('🟢 PASS: PAMM monthly statement contract (unit-holders only, server-valued, idempotent, gated, sports path untouched).');

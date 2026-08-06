#!/usr/bin/env node
// PIN — PAMM 코어 돈 계약 (2026-08-03). 유닛/NAV 방식 — 기존 fx 돈 코어 무수정이 전제.
// 깨지면 verify 🔴:
//  [P1] 유닛 발행/소각은 join/leave/fee/create 경로만 (클라 직접 쓰기 정책 0)
//  [P2] 펀드 계좌 유출 차단 트리거 — pamm-% ref 외 음수 ledger 거절
//  [P3] join/leave 는 열린 포지션 있으면 거절 (NAV 공정성 — MT5 롤오버)
//  [P4] 전 오퍼레이션 멱등 (pamm_ops PK ref, 변이 전 검사)
//  [P5] 성과보수 = HWM 초과분에만 · 매니저 유닛 전환(현금 무이동) · 상한 50%
//  [P6] 개설=어드민 전용 · 투자 참여는 본인 FX 계좌만(auth.uid 도출)
//  [P7] 매니저 자본은 투자자 유닛이 남아있는 동안 회수 불가 (먹튀 방지)
//  데스크: 개입은 confirmModal 관문 + RPC만 (직접 테이블 쓰기 0)
'use strict';
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'pamm_core.sql'), 'utf8');
const desk = fs.readFileSync(path.join(__dirname, '..', 'pamm-desk.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// [P1] 쓰기 정책 0 — RLS enable + create policy 는 select 만
if (!/alter table public\.pamm_funds\s+enable row level security/.test(sql)) bad('pamm_funds RLS off');
const writePol = sql.match(/create policy [^\n]*for (insert|update|delete)/g);
if (writePol) bad('pamm tables must have NO client write policies: ' + writePol.join(','));

// [P2] 펀드 유출 가드
if (!/pamm_guard_ledger/.test(sql) || !/NEW\.ref not like 'pamm-%'/.test(sql) || !/raise exception/.test(sql)) bad('fund-account outbound guard (trg on ledger) missing');
if (!/before insert on public\.ledger/.test(sql)) bad('guard must be BEFORE INSERT on ledger');

// [P3] 롤오버 게이트 — join과 leave 양쪽 모두
const openGate = sql.match(/status = 'open'/g) || [];
if (openGate.length < 2) bad('open-position gate must exist in BOTH pamm_join and pamm_leave');
if (!/fund has open positions/.test(sql)) bad('open-position rejection message missing');

// [P4] 멱등
if (!/if exists \(select 1 from pamm_ops where ref = p_ref\)/.test(sql)) bad('idempotency check (pamm_ops ref) before mutation missing');
if (!/ref\s+text primary key/.test(sql)) bad('pamm_ops.ref must be PRIMARY KEY (atomic backstop)');

// [P5] 성과보수 — HWM 초과분만 + 유닛 전환 + 상한
if (!/v_nav > v_m\.hwm_nav/.test(sql)) bad('performance fee must apply only above high-water mark');
if (!/perf_fee_pct >= 0 and perf_fee_pct <= 50/.test(sql)) bad('fee must be capped at 50%');
if (!/v_fee_units/.test(sql)) bad('fee must convert to manager units (no cash movement)');

// [P6] 권한
if (!/pamm_create_fund[\s\S]{0,400}is_admin\(\)/.test(sql)) bad('fund creation must be admin-gated');
if (!/pl\.auth_id = v_uid/.test(sql)) bad('join/leave must derive the investor account from auth.uid');
if (!/manager cannot join own fund/.test(sql)) bad('manager self-join must be rejected (owns units already)');

// [P7] 매니저 자본 잠금
if (!/manager capital stays while investors hold units/.test(sql)) bad('manager must not withdraw while investors hold units');

// 데스크 계약
if (!/pamm_desk_report/.test(desk)) bad('desk must read via pamm_desk_report RPC (single source)');
if (/from\('pamm_(funds|members|ops)'\)\s*\.\s*(insert|update|delete)/.test(desk)) bad('desk must never write pamm tables directly');
if (!/confirmModal/.test(desk) || !/opRun/.test(desk)) bad('desk interventions must pass confirmModal + opRun');
if (!/ALPEXA_ADMIN_SESSION/.test(desk)) bad('desk must use the isolated admin session key');
if (!/vendor\/supabase\.min\.js/.test(desk)) bad('desk must use self-hosted supabase (no CDN)');
// [P8] Open Positions 플로팅 = 서버 실시간 마크(fx_realized_pnl), 스테일 p.pnl 컬럼 금지 (플로팅==서버 실현 불변식)
if (!/'pnl',\s*case when public\.fx_realized_pnl\(p\.symbol,p\.side,p\.open_price,p\.size\) is null/.test(sql))
  bad('desk positions floating P&L must be a live fx_realized_pnl mark, never the stale positions.pnl column');
if (/'open_price',p\.open_price,'pnl',p\.pnl\)/.test(sql))
  bad('desk positions must NOT emit the stale stored p.pnl for OPEN positions (floating would diverge from realized)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} PAMM contract problem(s).`); process.exit(1); }
console.log('🟢 PASS: PAMM core contracts (unit/NAV ledger, fund-account guard, rollover gate, HWM fee, admin gates).');

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
// [P9] MT5: 펀드 Equity = Balance + Σ플로팅. 라이브 NAV는 표시 전용 — 거래용 pamm_nav(잔고)는 join/leave가 그대로 쓴다.
if (!/else coalesce\(a\.balance,0\) \+ fl\.flt end as equity/.test(sql))
  bad('desk equity must be Balance + total floating (MT5 Equity), sourced server-side');
if (!/cross join lateral[\s\S]{0,400}fx_realized_pnl\(p\.symbol,p\.side,p\.open_price,p\.size\)[\s\S]{0,200}as flt_raw/.test(sql))
  bad('total floating must be a server sum of fx_realized_pnl over open positions');
if (!/round\(m\.units \/ nullif\(fd\.total_units,0\) \* \(coalesce\(a\.balance,0\) \+ fl\.flt\),2\)/.test(sql))
  bad('investor value must be share × fund Equity (floating pro-rata), not units×balance-NAV');

// [P10] FAIL-OPEN 금지 — "계산 불가"를 "손익 0"으로 접지 않는다 (2026-08-30 실사고).
//   fx_realized_pnl 은 시세가 120초 넘게 늙으면 null 을 준다(스테일로 청산 안 하려는 옳은 설계).
//   그 null 을 0 으로 접으면 Σ플로팅=0 → Equity=잔고 → NAV 1.0 이 되어, **84% 물린 펀드가
//   주말마다 정상으로 보였다.** 돈에서 0 은 "안전"으로 읽히므로 이 방향의 거짓말이 가장 위험하다.
//   되돌리면(= `is null then 0` 부활) 즉시 🔴.
const health = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'pamm_health.sql'), 'utf8');
for (const [nm, src] of [['pamm_core.sql', sql], ['pamm_health.sql', health]]) {
  // 집계(sum/합계) 안에서 미가격을 0 으로 접는 패턴. 개별 포지션의 'pnl' → null 은 정상이라 잡지 않는다.
  if (/fx_realized_pnl\([^)]*\)\s*is null then 0/.test(src))
    bad(`${nm}: fold of "unpriced → 0" is back — a stale feed would make a losing fund read as flat (NAV 1.0). Return null instead.`);
}
// 미가격 건수를 세고, 하나라도 있으면 null 을 내보내는 규칙이 살아있어야 한다.
for (const [nm, src, col] of [['pamm_core.sql', sql, 'unpriced'], ['pamm_health.sql', health, 'unpriced']]) {
  if (!new RegExp(`count\\(\\*\\) filter \\(\\s*where public\\.fx_realized_pnl`).test(src))
    bad(`${nm}: must COUNT unpriced open positions (${col}) so the UI can say why it shows —`);
  if (!/unpriced > 0 then null|is null\) > 0 then null/.test(src))
    bad(`${nm}: one unpriced position must make total floating NULL (unknown), never 0`);
}
// 데스크가 그 null 을 다시 0/1 로 접으면 화면에서 같은 거짓말이 재현된다.
if (/\+CUR\.nav\s*\|\|\s*1|\+CUR\.float\s*\|\|\s*0/.test(desk))
  bad('desk coerces null nav/float to 1/0 — the fail-open reappears in the UI. Render — instead.');
if (!/NO PRICE/.test(desk))
  bad('desk must show a NO PRICE badge (with the unpriced count) when floating cannot be computed');
// 거래용 pamm_nav 함수 본체는 무변경 — 유닛 산수는 잔고 기반 NAV만 (플로팅 오염 금지)
if (!/create or replace function public\.pamm_nav\(p_fund text\)[\s\S]{0,400}balance[\s\S]{0,200}total_units/.test(sql))
  bad('transactional pamm_nav must stay balance-based (floating must NOT leak into unit minting/burning)');

if (fail) { console.error(`\n🔴 FAIL — ${fail} PAMM contract problem(s).`); process.exit(1); }
console.log('🟢 PASS: PAMM core contracts (unit/NAV ledger, fund-account guard, rollover gate, HWM fee, admin gates).');

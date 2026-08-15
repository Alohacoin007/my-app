#!/usr/bin/env node
// MONEY (FX) — 장 마감 중 **청산 금지** (사장님 2026-08-15 "마켓이 클로즈 됐는데 포지션을 닫을 수
// 있게 되있지..막아야").
//
// 왜 돈 문제인가: 장이 닫히면 가격이 종가에 얼어붙는다. 그 정지가로 청산하면 다음 개장 갭을 보고
// **유리한 쪽만 확정**할 수 있다 = 하우스 대상 차익거래. 실제 규제 브로커·MT5 모두 거절한다.
//
// 발견 당시 상태: 열기(fx_open)는 2026-07-22 서버 세션 게이트로 막혀 있었는데 **닫기는 서버·클라
// 양쪽 다 뚫려 있었다.** 같은 규칙을 한쪽에만 건 전형적 비대칭.
//
// 계약
//  P1. 서버 `fx_close` 가 **진짜 관문** — 장 닫힌 심볼이면 MARKET_CLOSED 로 거절.
//  P2. 판정은 `fx_open` 과 **같은 함수** `fx_market_open(cls, at)` 재사용 (새 캘린더 금지 —
//      두 벌이 되면 반드시 어긋난다).
//  P3. 서버 리스크 엔진(fx_modify SL/TP · fx_stopout)은 **영향받지 않는다** — 이 RPC 를 호출하지
//      않고 자체적으로 정산을 기록한다. 마감 중에도 리스크 관리는 돌아야 한다.
//  P4. 클라 3종(webtrade · terminal · 모바일)은 서버 호출 **전에** 막아 헛걸음을 없앤다(UX 전용).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── P1/P2 · 서버 게이트 ──
const sql = read('supabase/sql/fx_close.sql');
if (!/fx_market_open\(v_cls,\s*now\(\)\)/.test(sql))
  bad('fx_close 에 세션 게이트가 없다 — 장 마감 중에도 청산이 통과한다 (정지가 차익거래)');
if (!/'MARKET_CLOSED'/.test(sql)) bad('fx_close 의 거절 코드가 MARKET_CLOSED 가 아니다');
if (!/if not public\.fx_market_open/.test(sql)) bad('세션 게이트는 fx_close 안에서 **거절**해야 한다 (경고만으론 안 된다)');
// 새 캘린더를 만들면 fx_open 과 어긋난다 — 같은 함수만 허용
if (/fx_is_us_holiday|extract\(dow/.test(sql))
  bad('fx_close 가 자체 캘린더를 만들었다 — fx_open 과 어긋난다. fx_market_open() 재사용할 것');
// 게이트는 가격 조회/손익 계산보다 **앞**에 있어야 한다 (거절이 부작용을 남기면 안 됨)
const iGate = sql.indexOf('fx_market_open(v_cls');
const iPrice = sql.indexOf('select mid, updated_at into v_mid');
if (iGate < 0 || iPrice < 0 || iGate > iPrice)
  bad('세션 게이트가 가격 조회보다 뒤에 있다 — 거절 전에 불필요한 작업이 돈다');

// ── P3 · 리스크 엔진은 이 RPC 를 안 쓴다 (게이트가 강제청산을 막으면 안 된다) ──
for (const f of ['supabase/sql/fx_stopout.sql', 'supabase/sql/fx_modify.sql']) {
  const src = read(f);
  if (/perform\s+public\.fx_close\s*\(|select\s+public\.fx_close\s*\(/.test(src))
    bad(`${f} 가 fx_close RPC 를 호출한다 — 세션 게이트가 스탑아웃/SLTP 집행까지 막는다. 자체 정산 기록을 유지할 것`);
}

// ── P4 · 클라 3종 UX 게이트 (서버 호출 전에) ──
const clients = [
  ['webtrade.html', /if\(!marketOpen\(p\.symbol\)\)\{[^}]*return; \}\s*\n\s*const m=mids\[p\.symbol\]/, 'webtrade closePos'],
  ['terminal.html', /!fxMarketOpen\(_p\.symbol\)[\s\S]{0,120}return false; \}\s*\n\s*const r=await AlpexaSync\.db\.rpc\('fx_close'/, 'terminal fxCloseReal'],
  ['src/trading-app.jsx', /if\(m && !symOpen\(m\)\)\{[\s\S]{0,400}return; \}\s*\n\s*const closePrice=/, '모바일 앱 청산'],
];
for (const [f, re, label] of clients) {
  if (!re.test(read(f))) bad(`${label}: 서버 호출 **직전**의 장마감 체크가 없다 (${f})`);
}
// 모바일은 사전 컴파일 산출물도 최신이어야 실제로 반영된다
if (!/symOpen\(m\)/.test(read('vendor/trading-compiled.js')))
  bad('vendor/trading-compiled.js 가 낡았다 — node tools/precompile-jsx.js 를 돌릴 것');

// ── 열기 게이트가 사라지지 않았는지 (대칭 유지) ──
if (!/fx_market_open/.test(read('supabase/sql/fx_open_session.sql')))
  bad('fx_open 의 세션 게이트가 사라졌다 — 열기/닫기는 항상 같은 규칙이어야 한다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 장 마감 중 청산은 서버 fx_close 가 MARKET_CLOSED 로 거절(열기와 동일한 fx_market_open 재사용), 리스크 엔진은 무영향, 클라 3종은 호출 전에 차단.');

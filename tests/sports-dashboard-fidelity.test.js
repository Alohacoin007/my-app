#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// 스포츠 대시보드 FIDELITY 하네스 (2026-07-14)
// 두 분석 에이전트의 스펙을 하나의 게이트로:
//   · 스포츠-앱-문법-스펙.md  §6 금지 13종 + §7 핀 후보  ("앱과 똑같이" + 하지 말 것)
//   · 레전드-디자인-스펙.md   §1 토큰                     ("레전드처럼 보이게")
//
// 동작 규칙:
//   [0] sports-dashboard.html 미생성 → 통과(대기 알림) — 핀은 장전된 상태로 잠복
//   [1] 금지(부재) 핀 — 파일이 존재하는 순간부터 무조건: 돈 사고 클래스는 단 한 줄도 못 들어옴
//   [2] 존재 핀 — 위젯별 감지: 그 위젯이 파일에 나타나면 해당 계약 전체가 즉시 의무화
//       (스켈레톤 단계에서 미구현 위젯 때문에 빨간불이 나지 않게, 그러나 구현하는 순간 완전 정합 강제)
// ══════════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'sports-dashboard.html');

if (!fs.existsSync(FILE)) {
  console.log('🟢 PASS (대기): sports-dashboard.html 미생성 — fidelity 핀 장전 완료, 파일이 태어나는 순간부터 발동.');
  process.exit(0);
}
const src = fs.readFileSync(FILE, 'utf8');
let fail = 0;
const bad = (m) => { console.error('  🔴 ' + m); fail++; };
const pin = (re, m) => { if (!re.test(src)) bad(m); };
const ban = (re, m) => { if (re.test(src)) bad('[금지] ' + m); };

/* ── [1] 금지 핀 (앱 스펙 §6) — 무조건, 예외 없음 ───────────────────────────── */
ban(/from\(\s*['"]ledger['"]\s*\)\s*\.\s*insert/, '클라 ledger INSERT — 잔고는 서버 RPC만 움직인다 (CLAUDE.md #5)');
ban(/rest\/v1\/ledger/, '클라가 ledger REST 경로 직접 호출');
ban(/from\(\s*['"]positions['"]\s*\)\s*\.\s*insert/, '클라 positions INSERT — 베팅 행은 place_bet만 만든다 (앱:2304-2312)');
ban(/localStorage\.setItem\([^)]*(bal|balance|credit|pending)/i, '로컬 잔고/크레딧 저장 — 이중차감·계정간 누수의 근원 (CLAUDE.md #5)');
ban(/['"]-140['"]|[^\d]-140\s*,\s*120[^\d]/, '가짜 배당 기본값(-140/120) 발명 — 오즈 불변식 위반 (2026-07-08)');
ban(/rpc\(\s*['"]place_bet['"][^)]*market\s*:\s*['"]?prop/i, '프롭 place_bet 제출 — 서버가 검증 불가로 거절 (sql:65-73)');
ban(/gradeLeg[\s\S]{0,400}?(credit|payout|ledger)/, '클라 정산/지급 — 정산은 sports-settle 단독 (앱:2249-2260)');
ban(/setInterval\([^)]*,\s*[0-9]{1,3}\)/, '1초 미만 폭주 폴링 — 피드 주기(30s/9s)를 초과하는 이득이 없고 DB만 두들김');

/* ── [2] 레전드 디자인 핀 (디자인 스펙 §1) — 파일 존재 시 무조건 ─────────────── */
pin(/legend-ui\.css/, 'legend-ui.css 미사용 — 디자인 토큰·Inter·선명도는 공용 자산에서만 가져온다');
pin(/class="lgd"|class='lgd'|classList\.add\(\s*['"]lgd['"]/, '.lgd 옵트인 클래스 미적용 — 토큰이 실제로 안 먹는 상태');
pin(/--lgd-/, '--lgd-* 토큰 미사용 — 색을 하드코딩하면 스펙과 어긋나기 시작한다');

/* ── [3] 존재 핀 — 위젯별 감지 후 의무화 (앱 스펙 §7) ──────────────────────── */
// Odds Board가 있으면 (감지: 컬럼 헤더 또는 잠금 셀)
if (/Odds board|Moneyline/i.test(src)) {
  pin(/Today[\s\S]{0,200}Spread[\s\S]{0,200}Total[\s\S]{0,200}Moneyline/, '보드 컬럼 라벨·순서 (Today→Spread→Total→Moneyline, 앱:810)');
  pin(/class="bet sus" title="Odds unavailable — no market"/, '노라인 잠금 셀 리터럴 (앱:1641) — data-am 미부여가 돈 관문');
  pin(/<span class="ln">&nbsp;<\/span><span class="(pr|am)">🔒<\/span>/, '잠금 셀 내부 구조 (&nbsp;+🔒)');
  pin(/data-game=[\s\S]{0,80}data-market=[\s\S]{0,80}data-sel=[\s\S]{0,80}data-am=/, '셀 data-* 4속성 계약 (앱:1647)');
  pin(/am>0\s*\?\s*'pos'\s*:\s*''|class="(pr|am) pos"/, '플러스 배당 pos 클래스 (앱:1648)');
  pin(/oddsReal\s*!==\s*false/, 'oddsReal 하위호환 게이트 (플래그 없음=real, 앱:1712)');
}
// 축구가 있으면
if (/soc1x2|1X2/.test(src)) {
  pin(/data-market="1X2"/, '축구 market 키 = 1X2 (앱:1659)');
  pin(/'Home'[\s\S]{0,120}'Draw'[\s\S]{0,120}'Away'|>Home<[\s\S]{0,200}>Draw<[\s\S]{0,200}>Away</, 'threeWay 인덱스 계약 Home/Draw/Away (앱:1663)');
}
// 라이브 베팅 UI가 있으면
if (/liveOK|suspendUntil/.test(src)) {
  pin(/__alpexaLiveBetting/, 'liveOK 조건 1: 마스터 스위치 (앱:1715)');
  pin(/suspendUntil/, 'liveOK 조건 2: 점수 변동 서스펜드 (앱:1716)');
  pin(/__alpexaOddsStale|ODDS_STALE_MS/, 'liveOK 조건 3: 배당 신선도 (앱:1717)');
}
// Bet Slip이 있으면 (감지 = 실제 구현 흔적: RPC 호출 또는 슬립 UI 라벨 — 주석 언급만으로는 미발동)
if (/rpc\(\s*['"]place_bet['"]|Est\. Payout|Place bet/i.test(src)) {
  pin(/rpc\(\s*['"]place_bet['"]/, '베팅은 place_bet RPC 단일 경로 (앱:2018)');
  pin(/p_local_id/, 'place_bet 멱등 파라미터 p_local_id (앱:2018)');
  pin(/SGP_HAIRCUT\s*=\s*0\.25|SGP_HAIRCUT=0\.25/, 'SGP 헤어컷 0.25 — 앱·SQL·정산 3곳 락스텝 (앱:1572)');
  pin(/Est\. Payout/, 'Est. Payout 라벨 (앱:1073)');
  // P1 돈 관문 (스펙 §8 차이감사 1·2번): RG 가드는 서버 소유 players에서 — 빠지면 우회 베팅 구멍
  pin(/self_exclude_until/, '자기배제 가드 — players.self_exclude_until 서버 소유 검사 (앱:1439,1978)');
  pin(/Self-exclusion is active/, '자기배제 차단 문구 (앱 리터럴)');
  pin(/loss_limit|lossLimit/, '일일 손실 한도 가드 (앱:1440-1448,1979)');
  pin(/Loss limit reached/, '손실 한도 차단 문구 (앱 리터럴)');
  pin(/\+'\|'\+|\+ *'\|' *\+/, 'leg uid = gid+"|"+sel 규약 (앱:1643)');
}
// 캐시아웃이 있으면
if (/[Cc]ash out/.test(src)) {
  pin(/rpc\(\s*['"]cash_out['"]/, '캐시아웃은 cash_out RPC 단일 경로 (앱:2184)');
  pin(/p_fraction/, '부분 캐시아웃 p_fraction (앱:2184)');
}
// My bets 티켓이 있으면
if (/My bets|ticketHTML|Cashed Out/i.test(src)) {
  pin(/Cashed Out/, '상태칩 텍스트 Cashed Out (앱:2089)');
  pin(/Awaiting result/, 'Open 위계 중간 상태 (앱:2110)');
  // Settled 계약 (앱 pullServerSettled :2406-2424 + renderStats :2145-2156 + refunded 규칙 :2088)
  pin(/from\(\s*['"]settlements['"]\s*\)/, 'Settled = 서버 settlements 재구성 — 기기별 localStorage 금지 (앱:2408)');
  pin(/local_id,ticket,symbol,stake,pnl,kind,created_at/, 'settlements select 필드 계약 (앱:2408)');
  pin(/bet_won/, 'kind bet_won 필터 (앱:2413)');
  pin(/bet_lost/, 'kind bet_lost 필터 (앱:2413)');
  pin(/refunded/, 'won인데 payout≤stake = refunded(Push) 표기 규칙 (앱:2088)');
  pin(/Win rate/, '통계 4칸: Win rate (앱 renderStats)');
  pin(/ROI/, '통계 4칸: ROI');
  pin(/Push · refunded/, 'leg push 태그 리터럴 (앱:2074)');
}
// 발란스 표시가 있으면
if (/Balance|balbar/i.test(src)) {
  pin(/'···'|>···</, '잔고 미로드 표기 ··· (앱:2602) — 0으로 거짓 표시 금지');
}
// live_games를 읽으면
if (/live_games/.test(src)) {
  pin(/\.eq\(\s*['"]id['"]\s*,\s*['"]all['"]\s*\)|id=eq\.all/, 'live_games 단일 행(id=all) 계약 (앱:3635)');
}

if (fail) { console.error(`\n🔴 FAIL — fidelity ${fail}건: 대시보드가 앱 문법 또는 레전드 스펙에서 이탈.`); process.exit(1); }
console.log('🟢 PASS: sports-dashboard fidelity — 금지 핀 전체 통과 + 구현된 위젯의 계약 정합 확인.');

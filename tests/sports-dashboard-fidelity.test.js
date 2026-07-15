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
ban(/type=["']password["']/, '대시보드에 비밀번호 입력 — 자격증명 수집은 login.html 단일 관문 (계정 관문 이원화 금지)');

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
  // ③ 묶음 (차이감사 P2 4·6·7번): 정렬 위계·검색 필터·SOC 헤더 숨김 — 앱 :1689-1704, :1748
  pin(/function matchGame\(/, '검색 = 보드 필터 matchGame (앱:1690)');
  pin(/g\.home\.nm,g\.home\.ab,g\.away\.nm,g\.away\.ab,g\.lg/, 'matchGame 매칭 필드 5종 계약 (앱:1693)');
  pin(/_liveRank/, '정렬 위계: live→upcoming→finished (앱:1700)');
  pin(/_kickTs/, '정렬 2차: 킥오프 임박순 (앱:1699)');
  pin(/sortByPin/, '정렬 함수 sortByPin — 핀 우선 포함 (앱:1701-1705)');
  pin(/No games match/, '검색 무결과 문구 (앱:1750)');
  pin(/\.ob\.soc \.obhead\{display:none\}/, 'SOC 선택 시 컬럼헤더 숨김 (앱:1748 — 1X2는 자체 라벨)');
  // ④ 핀 ★ (차이감사 P2): 앱과 같은 저장 키 = 앱↔대시보드 핀 동기화 (앱 g.id===gid, 앱:3612)
  pin(/localStorage\.getItem\(\s*['"]alpexaPins['"]/, '핀 저장 키 alpexaPins — 앱과 공유해 양쪽 동기화 (앱:1127)');
  ban(/alpexa\.sbdash\.pins/, '대시보드 자체 핀 키 — 앱과 갈라진 두 진실 (앱 키 alpexaPins 하나만)');
  pin(/function togglePin\(/, 'togglePin 규약 (앱:1128-1131)');
  pin(/class="pin-btn/, '★ 버튼 pin-btn 클래스 (앱:1679)');
  pin(/Pin to top/, '★ 툴팁 리터럴 Pin to top/Unpin (앱:1679)');
  pin(/stopPropagation\(\)[\s\S]{0,60}togglePin|togglePin[\s\S]{0,120}stopPropagation/, '★ 클릭이 행 클릭(슬립 추가)으로 새지 않게 (앱:1768)');
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
// ⑤ Live Now 히어로/Live 위젯이 있으면 (앱 :816-827)
if (/Live Now|live-hero/i.test(src)) {
  pin(/Live Now/, '히어로 타이틀 리터럴 Live Now (앱:819)');
  pin(/live-pill|lp-dot/, 'LIVE 필 + 링 애니 도트 (앱:818, CSS:262-267)');
  pin(/live-pulse/, '이퀄라이저 4바 live-pulse (앱:821-823, CSS:271-277)');
  pin(/In Play/, 'Live 보드 첫 컬럼 라벨 In Play (앱:825 col_inplay)');
  pin(/liveCount|live\s*games?<\/|games<\/span>/i, '라이브 경기 수 카운트 (앱:1757)');
}
// ⑥ Recent Activity 필터가 있으면 (앱 :868-882, :2624-2669)
if (/RECENT ACTIVITY|Recent Activity/i.test(src)) {
  pin(/data-type="all"[\s\S]{0,400}data-type="deposit"[\s\S]{0,400}data-type="withdraw"[\s\S]{0,400}data-type="bet"/, '타입 필터 4종 All/Deposits/Withdrawals/Bets (앱:871-874)');
  pin(/data-days="7"[\s\S]{0,300}data-days="30"[\s\S]{0,300}data-days="90"[\s\S]{0,300}data-days="0"/, '기간 4종 7/30/90/All time (앱:878-881)');
  pin(/txnMatchesType/, '타입 매칭 함수 규약 (앱:2625-2629)');
  pin(/'Bet placed'\s*,\s*'Cashout'\s*,\s*'Bet Won'|\['Bet placed','Cashout','Bet Won'/, 'bet 타입 매칭 키워드 맵 (앱:2627)');
  pin(/txnMatchesPeriod/, '기간 매칭 함수 규약 (앱:2630-2635)');
  pin(/No transactions in this range/, '필터 무결과 문구 (앱:2651)');
  pin(/from\(\s*['"]requests['"]\s*\)/, '재무 활동 = 서버 requests 테이블 권위 (앱:2370) — 기기별 localStorage 금지');
  pin(/voided/, 'voided 요청 제외 규약 (앱:2377)');
}
// ⑦ 배당 포맷 설정이 있으면 (앱 :1181, :1477, :1558-1564)
if (/oddsFormat|Odds format/i.test(src)) {
  pin(/localStorage\.getItem\(\s*['"]alpexaSettings['"]/, '설정 저장 키 alpexaSettings — 앱과 공유 (앱:1484)');
  pin(/oddsFormat\s*===?\s*['"]decimal['"]/, 'decimal 분기 규약 (앱:1559)');
  pin(/a\s*>\s*0\s*\?\s*\(?\s*a\s*\/\s*100\s*\+\s*1\s*\)?\s*:\s*\(?\s*100\s*\/\s*Math\.abs\(a\)\s*\+\s*1/, 'decimal 변환 공식 a>0?a/100+1:100/|a|+1 (앱:1560)');
  pin(/toFixed\(2\)/, 'decimal 표기 소수 2자리 (앱:1561)');
  pin(/American[\s\S]{0,80}-110 \/ \+120|-110 \/ \+120/, '옵션 서브라벨 리터럴 -110 / +120 (앱:1181)');
  pin(/Decimal[\s\S]{0,80}1\.91 \/ 2\.20|1\.91 \/ 2\.20/, '옵션 서브라벨 리터럴 1.91 / 2.20 (앱:1181)');
}
// 로그인/사인아웃 메뉴가 있으면 (아바타 통합 — 2026-07-15)
if (/Sign out/i.test(src)) {
  pin(/auth\.signOut\(\)/, '로그아웃 = supabase auth.signOut() (alpexa-sync:330 계약)');
  pin(/'alpexa\.me'[\s\S]{0,40}'alpexa\.userName'[\s\S]{0,40}'alpexa\.userEmail'/, '로컬 신원 태그 3종 제거 — 유령 세션 방지 (alpexa-sync:332-335, 결함 #30)');
  pin(/login\.html\?switch=1/, '사인아웃 착지 = login.html?switch=1 — 자동 재로그인 방지 (alpexa-sync:310)');
  pin(/alpexa\.dest2/, '대시보드 복귀 = 고정 토큰 allowlist(alpexa.dest2) — URL로 착지 지정 금지(오픈리다이렉트 0, login.html fxDest)');
  pin(/Log in/, '로그아웃 상태 메뉴 항목 Log in');
  pin(/getItem\(\s*['"]alpexa\.me['"]/, '로그인 판정 = 실제 신원 태그(alpexa.me) 직접 읽기');
  ban(/AlpexaSync\.me\(\)/, 'AlpexaSync.me()로 로그인 판정 — 게스트 자동생성 때문에 authed 영원히 참 (2026-07-15 결함)');
  pin(/auth\.getSession\(\)/, '세션 실존 확인 — 태그만 믿으면 유령 로그인: 세션 없는 탭에서 RLS가 전 행을 숨겨 돈 기능 전멸 (앱:725-741 게이트)');
}
// 💰 돈 이동 시트가 있으면 (입금·출금·이체 — 2026-07-15 사용자 승인 이식)
if (/withdraw_hold|app_transfer|Deposit requested/.test(src)) {
  pin(/rpc\(\s*['"]withdraw_hold['"]/, '출금 = withdraw_hold RPC 단일 경로 — 서버가 원자적으로 재검사+요청+ledger 차감 (앱:2963)');
  pin(/'wd_'\s*\+\s*Date\.now\(\)/, '출금 멱등 id wd_<ts> (앱:2961)');
  pin(/rpc\(\s*['"]app_transfer['"]/, '이체 = app_transfer RPC 단일 경로 (앱:2803)');
  pin(/'xfer-'\s*\+\s*Date\.now\(\)/, '이체 멱등 ref xfer- 규약 (앱:2802)');
  pin(/'dp_'\s*\+\s*Date\.now\(\)/, '입금 요청 id dp_<ts> (앱:2717)');
  pin(/pushRequest\(/, '입금 = AlpexaSync.pushRequest 재사용 — requests 계약을 두 벌 만들지 않는다 (sync:62-77)');
  pin(/deposit_limit/, '입금 한도 가드 — players.deposit_limit 서버 소유 (앱:1449,2715)');
  pin(/\^0x\[0-9a-fA-F\]\{40\}\$/, '출금 주소 검증 0x+40hex (앱:2951)');
  pin(/withdrawable_for/, '출금 가능액 = 서버 withdrawable_for RPC (보너스 제외 — 앱:2856)');
  ban(/\b(balance|bal)\s*[+\-]=/, '클라 잔고 델타 — 결과는 서버 재조회로만 (낙관 갱신도 대시보드에선 금지)');
}
// 서버 전환 탭(+ 메뉴)이 있으면 (2026-07-15 — 레전드 레이아웃 탭의 알펙사 번역)
if (/Alpexa FX|fxTab/.test(src)) {
  pin(/Alpexa FX/, '+ 메뉴 항목: Alpexa FX');
  pin(/Alpexa Crypto/, '+ 메뉴 항목: Alpexa Crypto (예고)');
  pin(/Coming this week/, '크립토 컴퓨터용 미출시 안내 리터럴');
  pin(/iframe[^>]*webtrade\.html|webtrade\.html[^>]*iframe|src="webtrade\.html"/, 'FX = 현재 웹트레이더 그대로 임베드 (복제 금지 — 한 진실)');
  pin(/Escape[\s\S]{0,200}(fxOv|fxFull|mini)|fxEsc/, 'ESC = 풀스크린→미니 전환 계약');
  pin(/requestFullscreen/, '서버 전환 = 네이티브 풀스크린 (ESC는 브라우저가 처리 — 포커스 무관)');
  pin(/sbTab/, 'Sports betting 탭 = 대시보드 풀스크린 토글 (서버 탭 공통 규칙, 2026-07-15)');
  pin(/refitLayout/, '뷰포트 변경(풀스크린 포함) 시 수학적 칸 채움 재사상 (사용자 확정 2026-07-15)');
  pin(/fullscreenchange[\s\S]{0,400}refitLayout|refitLayout[\s\S]{0,400}fullscreenchange/, '풀스크린 전환이 리핏을 트리거');
  ban(/crypto-desktop|crypto-webtrade/, '크립토 컴퓨터용 경로 발명 — 아직 미구현 (이번 주 제작 예정)');
}
// 발란스 표시가 있으면
if (/Balance|balbar/i.test(src)) {
  pin(/'···'|>···</, '잔고 미로드 표기 ··· (앱:2602) — 0으로 거짓 표시 금지');
}
// 레전드 발란스 카드 위젯이 있으면 (스펙 §8.10 실물 확정 — 2026-07-15 캡처)
if (/Total assets|Profit & loss/.test(src)) {
  pin(/Overview/, '섹션 라벨 Overview (§8.10)');
  pin(/Profit & loss/, '섹션 라벨 Profit & loss (§8.10)');
  pin(/'1D','1W','1M','3M','YTD','1Y','ALL'/, '레인지 탭 7종 순서 1D~ALL (§8.10)');
  pin(/Total assets/, 'Overview 행: Total assets 전서버 합 (§8.9 번역)');
  pin(/Total wager/, 'Open bets 행: Total wager (§8.10 Futures 번역)');
  pin(/Est\. payout/, 'Open bets 행: Est. payout — 서버 정산과 무관한 추정 표기 (§8.10)');
  pin(/hideAmounts/, '눈-사선 잔고 마스킹 토글 (§8.10 — 민감 수치 위젯 상주 토글)');
  pin(/'••••'/, '마스킹 = 고정 4점 •••• (자릿수 은닉, §8.10)');
  pin(/from\(\s*['"]ledger['"]\s*\)\s*\.\s*select/, '스파크라인 = ledger 읽기 전용 역산 (balance_now − Σledger) — 클라 쓰기 0');
  ban(/Enable margin/i, '마진 프로모 이식 — 스포츠 대응물 없음, 잔고 위젯 내 크레딧 판촉 금지 (§8.10 생략 권고)');
}
// live_games를 읽으면
if (/live_games/.test(src)) {
  pin(/\.eq\(\s*['"]id['"]\s*,\s*['"]all['"]\s*\)|id=eq\.all/, 'live_games 단일 행(id=all) 계약 (앱:3635)');
}

/* ── [4] 영어 전용 UI (2026-07-15 사용자 지시): 설정에 한국어 전환이 생기기 전까지
   사용자 노출 문자열에 한글 금지. 주석(HTML/JS)은 개발 문서라 허용 — 제거 후 스캔. ── */
{
  const noCmt = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/[^\n]*/gm, '$1');
  const kor = noCmt.match(/[가-힣][^\n'"<]{0,30}/g) || [];
  if (kor.length) bad('[영어전용] 사용자 노출 한글 ' + kor.length + '곳 — 예: ' + kor.slice(0, 3).join(' · '));
}

if (fail) { console.error(`\n🔴 FAIL — fidelity ${fail}건: 대시보드가 앱 문법 또는 레전드 스펙에서 이탈.`); process.exit(1); }
console.log('🟢 PASS: sports-dashboard fidelity — 금지 핀 전체 통과 + 구현된 위젯의 계약 정합 확인.');

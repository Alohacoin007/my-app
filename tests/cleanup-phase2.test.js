#!/usr/bin/env node
// Alpexa — 앱 분석 2단계: 필요 없는 부분 정리 (2026-11-15 사장님 "2단계 진행해")
// ============================================================================
// 고객에게 보이는 빈 껍데기와, 아무도 부르지 않는 죽은 코드를 걷어낸 상태를 고정한다.
// 지운 것이 다시 살아나면(복붙·되돌리기) 여기서 🔴. 정적 핀 · 네트워크 0 · 돈 0.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };

// ── ① 크립토 데스크탑: Open orders 위젯 은퇴 ───────────────────────────────────
// 왜: 이 위젯은 모바일 앱이 폰에 저장한 지정가·스탑 주문(localStorage alpexa.pendingOrders)을 읽어 보여주기만 했다.
//     1단계에서 모바일의 지정가·스탑 탭을 숨겼으므로(아무도 체결하지 않던 주문) 새 주문이 생길 길이 없다 = 영원히 빈 위젯.
//     서버 지정가 주문이 생기면 RETIRED_WIDGETS 에서 빼면 된다 (위젯 코드는 보존).
const cd = rd('dev/crypto-dashboard.html');
ok('① 대시보드: RETIRED_WIDGETS 에 orders', /const RETIRED_WIDGETS\s*=\s*new Set\(\['orders'\]\)/.test(cd));
ok('① 대시보드: Add widget 메뉴가 은퇴 위젯을 뺀다', /Object\.keys\(WIDGET_TITLES\)\.filter\(id=>!RETIRED_WIDGETS\.has\(id\)\)/.test(cd));
ok('① 대시보드: 예전에 꺼내 둔 고객 화면에서도 강제로 숨긴다 (저장된 배치 무시)',
   /RETIRED_WIDGETS\.forEach\(id=>\{ if\(layout\[id\]\) layout\[id\]\.hidden=true; \}\)/.test(cd));

// ── ② 스포츠 모바일: 경기 시뮬레이터 삭제 ──────────────────────────────────────
// 왜: 시안 시절엔 가짜 경기(g.real 없음)의 점수·시계·배당을 랜덤으로 굴렸다. 지금 GAMES 에 들어오는 경기는
//     전부 real:true (서버 live_games · ESPN 폴백 · UFC) 라서 그 루프는 한 번도 돌지 않는다 = 죽은 코드 약 170줄.
//     살아 있으면 "누가 real 을 빼먹는 순간 가짜 점수·가짜 배당이 고객 화면에서 돈다"는 지뢰이기도 하다.
const sp = rd('sports-live.html');
ok('② 스포츠: 시뮬레이터 함수·선수 풀 없음 (PLAYERS · scoreEvent · nonScoringPlay · advanceClock · reactOddsToScore · clkLabel)',
   !/const PLAYERS=\{/.test(sp) && !/function (scoreEvent|nonScoringPlay|advanceClock|reactOddsToScore|clkLabel)\(/.test(sp));
ok('② 스포츠: 가짜 경기(!g.real)를 굴리는 루프 없음', !/GAMES\.filter\(g=>g\.live && !g\.real\)/.test(sp));
ok('② 스포츠: 화면 갱신 틱은 그대로 (renderGames · 실황 · 슬립 · 캐시아웃 재계산)',
   /renderGames\(\);if\(_lcovId\)renderCoverage\(\);if\(!legsEl\.dataset\.props&&legs\.length\)drawLegs\(\);calc\(\);/.test(sp));
ok('② 스포츠: 들어오는 경기는 전부 real:true (서버 · ESPN 폴백 · UFC 3곳)', (sp.match(/real:\s*true/g) || []).length === 3);

// ── ③ 크립토 모바일: 아무도 안 쓰는 화면·함수 삭제 ────────────────────────────
// 방법: 소스를 구문 분석해 "최상위 선언인데 파일 전체에서 그 이름이 정의 한 번뿐"인 것만 골랐다 (추측 아님).
//       테스트가 이름을 직접 읽는 것(WatchRow·MiniSpark)은 남겼다.
const jsx = rd('src/crypto-live-app.jsx'), bin = rd('vendor/crypto-live-compiled.js');
const DEAD = ['SellPicker', 'AccountMenuSheet', 'BuyChart', 'SendAvatar', 'alpexaPortfolioSeries', 'getGreeting', 'darken',
  'stakeApyFor', 'useSmoothNumber', 'CATEGORIES', 'fmtMcap', 'RECENT_RECIPIENTS', 'alpexaRefDisplay', 'TaxDocsPanel'];
for (const [nm, src] of [['소스', jsx], ['컴파일본', bin]]) {
  const left = DEAD.filter((n) => new RegExp('(^|[^\\w$.])' + n + '(?![\\w$])').test(src));
  ok(`③ 크립토 ${nm}: 죽은 선언 ${DEAD.length}개 없음`, left.length === 0, '남음: ' + left.join(', '));
}
ok('③ 크립토 소스: 세금 서류 화면 분기(personal-tax)도 없음', !/id === 'personal-tax'/.test(jsx));

console.log(`\n${fail ? '🔴' : '🟢'} cleanup-phase2 — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

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
const cd = rd('crypto-dashboard.html');
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

// ── ④ PC 웹트레이드: 눌러도 아무 일 없는 메뉴·탭·버튼 삭제 ─────────────────────
// 왜: 회색 처리된(눌러지지 않는) 메뉴 13개 · 내용 없는 툴박스 탭 5개(News·Calendar·Articles·Code Base·Experts) ·
//     눌러도 색만 바뀌는 "Algo Trading" 버튼 · 체크해도 아무것도 안 켜지는 View → Status Bar.
//     기능이 생기면 그때 메뉴에 올린다 (없는 기능을 메뉴에 걸어 두지 않는다).
const wt = rd('webtrade.html');
const menuDef = (wt.match(/const MENU_DEF = \{[\s\S]*?\n\};/) || [''])[0];
ok('④ 웹트레이드: 메뉴 정의를 찾았다', !!menuDef);
ok('④ 웹트레이드: 회색(눌러지지 않는) 메뉴 항목 0', !!menuDef && !/dis:1/.test(menuDef), (menuDef.match(/\{l:'[^']+'[^}]*dis:1\}/g) || []).join(' '));
ok('④ 웹트레이드: 항목이 하나도 없는 Help 메뉴는 메뉴줄에서 뺌', /const MENUS=\['File','View','Insert','Charts','Tools','Window'\];/.test(wt) && !/\n  Help:\s*\[/.test(menuDef));
ok('④ 웹트레이드: 차트 우클릭 메뉴의 회색 Properties... 없음', !/\{l:'Properties\.\.\.', dis:1\}/.test(wt));
ok('④ 웹트레이드: 툴박스 탭 = 내용 있는 8개만',
   /const TBX_TABS=\['Trade','Exposure','History','PAMM','Mailbox','Company','Alerts','Journal'\];/.test(wt));
ok('④ 웹트레이드: 빈 탭 안내(TAB_EMPTY · EmptyTab) 없음', !/TAB_EMPTY/.test(wt) && !/EmptyTab/.test(wt));
ok('④ 웹트레이드: Algo Trading 버튼·상태·명령 없음', !/Algo Trading/.test(wt) && !/algo\.toggle/.test(wt) && !/setAlgo/.test(wt) && !/\.tbtn\.algo/.test(wt));
ok('④ 웹트레이드: Status Bar 메뉴·컴포넌트·스타일 없음', !/Status Bar/.test(wt) && !/function StatusBar\(/.test(wt) && !/\.statusbar/.test(wt) && !/statusbar:true/.test(wt));
ok('④ 웹트레이드: 살아 있는 메뉴는 그대로 (New Chart Window · New Order · Tile Windows · Toolbars · Full Screen)',
   /\{l:'New Chart Window', cmd:'chart\.new'\}/.test(menuDef) && /\{l:'New Order', cmd:'order\.new', k:'F9'\}/.test(menuDef) &&
   /\{l:'Tile Windows', cmd:'window\.tile'\}/.test(menuDef) && /\{l:'Toolbars', v:'toolbars', keep:1\}/.test(menuDef) && /\{l:'Full Screen', k:'F11', cmd:'view\.fullscreen'\}/.test(menuDef));
ok('④ 웹트레이드: 내비게이터 = 내용 있는 폴더만 (Accounts · Indicators) — 눌러도 빈 Expert Advisors·Scripts·Services·Market·VPS 없음',
   /const NAV_FOLDERS=\[\['Accounts','👤'\],\['Indicators','📈'\]\];/.test(wt));
ok('④ 웹트레이드: 인디케이터 트리에 빈 폴더 없음 (Volumes · Bill Williams · Examples · Free Indicators)',
   !/\['(Volumes|Bill Williams|Examples|Free Indicators)', \[\]\]/.test(wt) && /\['Trend', \[\['MA20'/.test(wt) && /\['Oscillators', \[\['RSI14'/.test(wt));

// ── ⑤ 옛 FX 모바일 앱(trading.html) 은퇴 — 고객 사이트에서 내림 ──────────────────
// 왜: 2026-09-21 모바일 FX 가 fx-app.html 로 교체된 뒤 trading.html 로 가는 링크는 0. 그런데도 주소를 직접 치면
//     옛 앱(주문·입출금 가능)이 그대로 열렸다 = 관리 안 하는 화면이 고객에게 열려 있음 + 77만 바이트 배포.
// 방법: 파일은 리포에 남긴다 (스프레드·계약 락스텝 테스트 20여 개가 이 파일을 기준으로 읽는다).
//       공개 묶음(tools/build-site.js)에서만 빼고, 그 주소엔 **새 앱으로 보내는 쪽지**를 넣는다 (즐겨찾기 고객이 404 를 보지 않게).
const bs = require('../tools/build-site.js');
const pubNow = new Set(bs.publicFiles());
ok('⑤ 묶음: 옛 FX 앱 원본 3개(trading.html · 컴파일본 · 소스)가 공개 묶음에 없다',
   !pubNow.has('trading.html') && !pubNow.has('vendor/trading-compiled.js') && !pubNow.has('src/trading-app.jsx'));
ok('⑤ 묶음: 리포에는 그대로 있다 (락스텝 테스트 기준 파일)', ['trading.html', 'vendor/trading-compiled.js', 'src/trading-app.jsx'].every((f) => fs.existsSync(path.join(REPO, f))));
const stubs = typeof bs.retiredStubs === 'function' ? bs.retiredStubs() : {};
const stub = stubs['trading.html'] || '';
ok('⑤ 묶음: trading.html 주소엔 이동 쪽지가 들어간다 (폰 → fx-app.html · PC → webtrade.html — login.html 과 같은 기기 규칙)',
   /location\.replace\(/.test(stub) && /fx-app\.html/.test(stub) && /webtrade\.html/.test(stub) &&
   /Android\|iPhone\|iPad\|iPod\|Mobile\|IEMobile\|Opera Mini/.test(stub));
ok('⑤ 묶음: 쪽지는 옛 앱 코드를 싣지 않는다 (스크립트 파일 0 · 2KB 미만) · 이동 대상은 묶음 안에 있다',
   !!stub && !/<script[^>]+src=/.test(stub) && stub.length < 2048 && pubNow.has('fx-app.html') && pubNow.has('webtrade.html'));
const refs = [...pubNow].filter((f) => /\.(html|js|json)$/.test(f) && !f.startsWith('vendor/') && !f.startsWith('src/'))
  .filter((f) => /(href|src)\s*=\s*["'][^"']*trading\.html|location[^\n;]{0,40}['"][^'"]*trading\.html|trading-compiled\.js/.test(rd(f)));
ok('⑤ 묶음: 공개 화면 어디에도 옛 FX 앱으로 가는 링크·이동이 없다', refs.length === 0, refs.join(', '));

console.log(`\n${fail ? '🔴' : '🟢'} cleanup-phase2 — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

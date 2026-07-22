# FX터미널(dev/fx-terminal.html) vs 웹트레이드(webtrade.html) — UI/MT5 문법 전수 대조

> 작성 2026-07-22 · 코드 무변경 분석. 모든 항목 file:line 근거.
> 판정 기호: ✅동일(문법·기능 등가) · ⚠️부분(있으나 축소/변형) · ❌터미널에 없음 · ➕터미널에만 있음
> 약칭: **WT** = webtrade.html (React+Lightweight Charts, MT5 스킨) · **FT** = dev/fx-terminal.html (vanilla JS, 레전드 위젯 엔진 + 자체 SVG 차트)

---

## 1. 레이아웃 (창 구성 · 도킹 · 저장)

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 전체 구조 | 고정 그리드 터미널: 메뉴바(webtrade.html:2871)+툴바(:3009)+좌패널(MW/Nav)+차트 스테이지+하단 툴박스+상태바 | 레전드 위젯 엔진: 자유 배치 위젯 스테이지(fx-terminal.html:525-705) + 헤더 툴바 + 하단 도크 + 상태바 | ⚠️ (문법 자체가 다름 — FT는 위젯 자유배치) |
| 차트 창 = 자유 창 | 스테이지 안 플로팅 win (WINLAYOUT 2×2 분수 webtrade.html:1216-1221, floatGeo :3387-3394, 최소 220×150 :1214) | chart1..N 최상위 위젯 (mkChart fx-terminal.html:1099-1180, CHART_MIN 200×140 :547) | ✅ |
| 창 컨트롤(최소/최대/닫기) | 최소·최대 버튼 webtrade.html:2169-2170 | –/□/× 버튼 fx-terminal.html:1101-1107, toggleMin/Max :1191-1199 | ✅ |
| 창 타일 정렬 | Window→Tile = 2×2만 (COMMANDS 'window.tile' webtrade.html:1329, 툴바 :3052) | Tile Windows/Vertically/Horizontally/Cascade 4모드 (fx-terminal.html:1201-1213, ☰메뉴 :1994-1995) | ➕ (FT가 MT5 Window 메뉴에 더 근접) |
| 차트 개수 프리셋 | 기본 4창(GRID webtrade.html:855, initCharts :3430), New Chart로 추가·초과분 계단식(:3393) | 1/2/4/6/9/10 프리셋 메뉴 (CG_PRESETS fx-terminal.html:715, openChartMenu :1892-1905) | ➕ |
| 위젯 도킹 탭 그룹 | 없음 (패널 고정) | 위젯 겹치면 하단 [탭][탭] MT5 도크 그룹 (dockTogether/maybeDock fx-terminal.html:612-642) | ➕ |
| 스냅/가이드/미세그리드 | 없음 (자유 이동만, 차트 창) | 자석 스냅 SNAP=6 + 정렬 가이드 + FINE=8 그리드 (fx-terminal.html:527, 600-604, 643-644, 666-676) | ➕ |
| 패널 리사이즈 | 좌폭 Splitter 200~450(webtrade.html:3127-3152) · 툴박스 높이 BottomResizer(:3158-3184) · Nav 높이 NavResizer(:3188-3206) | 전 위젯 8방향 리사이즈 핸들(rz fx-terminal.html:684-703) · 도크 높이 dockRz(:2274-2280) · MW 리사이즈 시 차트 실시간 재정렬(:697-700) | ✅ |
| 레이아웃 저장 키 | `alpexa.wt.config` — view/leftw/bottomh/navh/theme/lang만, **차트 배치는 의도적 비저장**(리프레시=기본 2×2, webtrade.html:1397-1400, 3424-3430, 3494) | `alpexa.fxdash.layout.v10`(:528) 전 위젯+차트 창 저장 · `alpexa.fxdash.chartcfg` 차트별 타입/TF/줌/지표/오브젝트(:744-750) · `alpexa.fxdash.chartgrid`(:715) · `alpexa.fxdash.dockH/dockHidden`(:2248) · `alpexa.fxdash.mwcols`(:1291) | ⚠️ (저장 정책 상반 — WT=휘발, FT=전부 영속. 재구축 시 하나로 정해야) |
| 창 크기 변화 대응 | chartResizer.resizeAll rAF (webtrade.html:3495, 3135) | refitLayout 비율 스케일링 __ref 기준 (fx-terminal.html:566-581) | ✅ |
| Market Watch 패널 | 좌상 고정 (view.marketwatch 토글 webtrade.html:3384) | 좌상 기본 위젯 x2,y2,w365,h710 (fx-terminal.html:534) | ✅ |
| Navigator 패널 | 좌하 고정 (webtrade.html:3083) | 좌하 기본 위젯 (fx-terminal.html:535) | ✅ |
| Toolbox 위치 | 하단 도크 + 전폭 탭 스트립(termTab webtrade.html:3452) | 하단 #dock(위젯 아님, fx-terminal.html:491-501, 536) + 세로 라벨/닫기 X(:2258-2259) | ✅ |
| 추가 위젯(Positions/Account/Order/Pending/Depth/Money/Settings) | 없음 (전부 툴박스/모달 내) | +메뉴로 소환하는 숨김 위젯 7종 — 단 **Settings 빼고 전부 "Foundation" 빈 프레임**(fx-terminal.html:537-540, 708-709, 1865-1871) | ➕(골격) |
| 레이아웃 리셋 | 없음 (리프레시=기본) | btnReset — 레이아웃+차트cfg 전체 초기화 (fx-terminal.html:559-564) | ➕ |

## 2. 차트

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 엔진 | Lightweight Charts(CDN, 없으면 무차트 무크래시 webtrade.html:1840, 1848) | 자체 SVG 렌더러 (renderChart fx-terminal.html:943-1095, cgsvg :941-942) | ⚠️ (등가 기능이나 구현 상이 — FT는 CDN 의존 0) |
| TF 목록 | TFS 9종 M1…MN (webtrade.html:2975) | TFS 9종 동일 (fx-terminal.html:718) — 단 TF는 **차트별 독립**(cfg.tf :746, setChartTF :851) vs WT는 활성 차트에 적용(chart.tf 커맨드) | ✅ |
| 차트 유형 | candle/bar/line (CHART_TYPES webtrade.html:3005) | candles/bars/line (fx-terminal.html:991-1000, setChartType :846) | ✅ |
| 틱 차트 | MW Ticks 탭 + 주문창 우측 라이브 틱차트 (webtrade.html:2303-2317, 3208-3211) | MW Ticks 탭 bid/ask 폴리라인 (fx-terminal.html:1364-1386); 툴바 Tick chart 아이콘→MW Ticks 열기(:1975-1978). **주문창 틱차트 없음** | ⚠️ |
| 실봉 로딩 | 크립토=Binance 미러 klines 5페이지 최대 5000봉(webtrade.html:1242-1253) · FX=fx-prices ?candles, HIST_N 최대 15000봉/深이력(:1230-1257) · 주식=합성(:1258) · 수락게이트 ≥160봉·오름차순(:1262-1263) | 크립토=Binance 1000봉 단일 요청(fx-terminal.html:909-912) · FX=fx-prices n=1000(:913-916) · 주식=합성(:917) · 동일 수락게이트(:919-921) — WT fetchRealCandles 락스텝 주석(:899-901) | ⚠️ (深이력 15배 차이: WT 15000 vs FT 1000, 페이지네이션 없음) |
| 라이브 봉 | priceStore 실틱 → 마지막 봉 갱신(WT 전반), 결정론적 합성 폴백(synthCandles webtrade.html:1273-1295) | tickSeries가 mwStore mid로 봉 생성/갱신 + 갭 점프 처리(fx-terminal.html:891-898), 합성 시드는 랜덤워크(:881-889 — WT처럼 결정론 아님) | ⚠️ |
| 인디케이터 | MA20/MA50/EMA20/RSI14/MACD — 레지스트리형, 차트별(INDICATORS webtrade.html:1310-1316, per-chart inds :3430) | MA20/BB(20,2)/RSI14/Volume — 차트별(IND_LABEL fx-terminal.html:806, 계산 :1004-1056). **MA50/EMA/MACD 없음, 대신 BB·볼륨 히스토그램 ➕**(:1005-1007, 1044-1048) | ⚠️ |
| 지표 범례/원클릭 제거 | 메뉴에서 토글·Remove All(webtrade.html:2915-2916, 2958) | 차트 위 칩 범례 + 칩 ✕ 원클릭 제거(fx-terminal.html:1076-1084, 1111-1114) | ➕ |
| 드로잉 오브젝트 | vline/hline/trend/fib/text (DRAW_TOOLS webtrade.html:3007-3008), hline 화살표키 핍 이동(:2116-2118), **Ctrl+Z 언두 스택**(:2113), Del 삭제(:2115), 저장 안 됨(세션 휘발) | hline/vline/trend/fib/text — 데이터좌표 저장·리사이즈/줌 고정, **cfg.obj로 영속**(fx-terminal.html:775-803, 1057-1073), 더블클릭 선택→3점 핸들 드래그 수정(:1131-1172), Del 삭제(:2362). **언두 없음** | ⚠️ (FT: 영속+핸들편집 ➕ / 언두 ❌) |
| 크로스헤어 | 툴 'cross', LWC 크로스헤어 + **측정자(드래그=봉수/핍/가격차 룰러)**(webtrade.html:1894, CSS :269) | 커스텀 SVG 크로스헤어 + 우측 가격태그(fx-terminal.html:870-879). **측정자 없음** | ⚠️ |
| 호버 OHLC 표시 | subscribeCrosshairMove → 헤더 OHLC 리드아웃(webtrade.html:1625, 1874-1879, CSS :238,256) | 크로스헤어 호버 시 원클릭바 우측에 O/H/L/C/V(fx-terminal.html:1143-1148, 1093-1094) | ✅ |
| Auto Scroll / Chart Shift | chartOpts 전역 토글, 툴바 아이콘(webtrade.html:1193, 3040-3045, 아이콘 :3002-3003) | AUTO_SCROLL/CHART_SHIFT 전역 + localStorage 영속(fx-terminal.html:723-725, 1970-1974), 렌더 반영(:957-963) | ✅ |
| 줌/팬 | LWC 내장 휠줌·드래그팬 + 툴바 Zoom In/Out(webtrade.html:3035-3036) | 휠줌(:1173-1174)·차트 팬(5px 임계, 봉 단위 scroll, 과거 스크롤 중 현재가 라인 숨김 fx-terminal.html:1137-1159, 1038) + 툴바/메뉴 줌 · **+/− 핫키 줌 ➕**(:2364-2365) | ✅ |
| 트레이드 레벨 라인 | 포지션 **진입가 라인만** (createPriceLine per open_price, webtrade.html:2127-2140). SL/TP 라인·드래그 없음(수정은 테이블 더블클릭 :2833-2834) | 진입(BUY 초록 #00C805/SELL 빨강 #F23645)+**SL 보라·TP 파랑 점선+대기주문 주황**(fx-terminal.html:1008-1028), **라인 6px 클릭-드래그로 SL/TP 설정/이동**(롱: 아래=SL·위=TP, 숏 반전; 프리뷰 라벨 :1030-1036, 1134-1136, commitSltpDrag :1696-1704 — 실포지션은 fx_modify) | ➕ (FT가 MT5 문법 완성형) |
| 차트 우클릭 메뉴 | New Order(F9)/One-Click 토글/Chart Type/Timeframes/Indicators/Remove/Grid/Delete last(Ctrl+Z)/Delete all/Properties(dis) (ChartMenu webtrade.html:2205-2257) | Indicators List(제거/추가)/Objects(선택·전체 삭제)/Grid/Volumes/Zoom/Refresh/Properties(F8 토스트) (fx-terminal.html:804-843) — 타입·TF는 의도적으로 미포함(MT5 원본 문법, 주석 :804-805). **New Order·One-Click 토글 없음** | ⚠️ |
| MW→차트 심볼 드래그드롭 | dataTransfer 'text/mwsymbol' → changeSymbol (webtrade.html:2453, 3467) | 'text/mt5-symbol' → setChartSymbol, 드롭 하이라이트(fx-terminal.html:2028-2033, 1176-1179, 755-762) | ✅ |
| 실시세 우선 페인트 | 리얼퍼스트: 합성 시드 후 실봉 도착 시 교체(webtrade.html:1223-1226) | 동일 패턴 loadRealSeries(fx-terminal.html:926-931) | ✅ |

## 3. 원클릭 바 (ocbar)

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 형태/위치 | 차트 좌상 190×64 2단 패널(SELL/vol/BUY + 빅피겨 가격, BigFig webtrade.html:1498-1580) | 차트 상단 전폭 1줄 스트립: vol±·SELL(bid)·spread·BUY(ask)·OHLCV(ocbarHTML fx-terminal.html:935-942) — 티켓 ▾ 버튼은 2026-07-19 제거(:940) | ⚠️ (기능 등가·형태 상이) |
| 수량 스피너 | 기본 0.10, min 0.1랏, ±0.01, 홀드 가속 320→25ms(webtrade.html:1507, 1551-1557) | 차트별 oclot 기본 0.10 **영속**(cfg :748), min 0.01, 홀드 연타 320ms 후 55ms·20틱 초과 ×10(bindHoldRepeat fx-terminal.html:1556-1567, 1122-1125) | ✅ (최소랏 0.1 vs 0.01 차이) |
| 체결 경로 | useTradeEngine.placeOrder → fx_open RPC, 요청가+슬리피지 전달(webtrade.html:1534-1539) | 로그인=fxPlaceReal(fx_open, 슬리피지 파라미터 null :2198)·미로그인=인메모리 데모(fx-terminal.html:1119-1121) | ⚠️ (FT는 requestedPrice/maxSlippage 미전달) |
| 클라 게이트 | marketOpen 세션게이트+여유마진 게이트+더블클릭 debounce(webtrade.html:1526-1532) | 게이트 없음(서버 거절에 의존) | ❌ |
| 체결 연출 | ECN 지연 시뮬 250-550ms·스피너·플래시·MT5 사운드(webtrade.html:1536-1549, 사운드 :776-843) | 토스트+Journal만(fx-terminal.html:2203-2204). 사운드 전무(grep 0건) | ❌ |
| 틱 방향 스킨 | 패널 전체 sticky 방향색(webtrade.html:1514-1522) | bid/ask 숫자에 dn 클래스만(fx-terminal.html:1090-1091) | ⚠️ |
| 표시 토글 | 차트 우클릭 'One-Click Trading' 창별 토글(webtrade.html:2147, 2214) | 항상 표시, 토글 없음 | ❌ |
| 스프레드 필 | 표시가 기준 sprText(webtrade.html:1575-1577) | mwSprText 동일 문법(fx-terminal.html:1092, 1249) | ✅ |

## 4. 테마

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 테마 2종 | dark(MT5)/light(Legend) — CHART_THEME·CANDLE_THEME(webtrade.html:722-732), View→Color Theme(:2887), themeBus로 라이브 캔버스 리테마(:738-740, 1859-1866) | 다크(레전드 기본)/라이트 — legend-ui.css 토큰 + body.light 오버라이드(fx-terminal.html:4, 434-443), 헤더 버튼+Settings 위젯(:2324-2335) | ✅ |
| 토큰 방식 | 인라인 CSS 클래스 `.terminal.light` 대량 오버라이드(webtrade.html:522-662) + JS 차트 테마 객체 | `--lgd-*` CSS 변수 토큰(라운드 샤프 오버라이드 :14-19, MT5 블루 :18) — 레전드 표준 | ⚠️ (FT가 재구축 목표 방식) |
| 딥링크 | `?theme=legend|light|dark|mt5` (WT_URL_THEME webtrade.html:733-737, 3453) | 없음 — localStorage `alpexa.fxdash.theme`만(fx-terminal.html:2325) | ❌ |
| 저장 키 | wtConfig(theme 포함, webtrade.html:3494) | `alpexa.fxdash.theme`(:2325) — 크립토/스포츠 대시보드와 별도 키 | ⚠️ |

## 5. i18n

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 언어 | en/ko/ja/zh — 메뉴·툴박스·주문·에러 등 광범위 사전(webtrade.html:744-773), View→Languages(:2877-2881), t() 렌더 반영(:3455-3456) | en/zh/ja/ko/**fr** 5종(fx-terminal.html:513-519) — 단 **셸 문구 ~20키만**(위젯 제목/설정), 툴박스·메뉴·주문창·MW는 영어 하드코딩. data-i18n 적용(:521-523) | ⚠️ (FT 언어수 ➕/커버리지 ❌) |
| 저장 키 | wtConfig.lang(webtrade.html:3494) | `alpexa.dash.lang` — 크립토/스포츠와 공유(fx-terminal.html:512, 523) | ⚠️ (키 상이) |

## 6. 단축키

| 키 | WT | FT | 판정 |
|---|---|---|---|
| F9 새 주문 | ✅ webtrade.html:3505 (+메뉴/툴바/ctx :2895, 3026, 2213) | ✅ fx-terminal.html:2353 (활성 차트 심볼) | ✅ |
| F11 풀스크린 | ✅ :3506 (+툴바 ⛶ :3060-3061) | ✅ :2355 (+btnFull :2321) | ✅ |
| Ctrl+M / Ctrl+N / Ctrl+T | ✅ :3501-3503 (패널 토글) | ✅ :2348-2349, Ctrl+T는 도크 토글 :2281 | ✅ |
| Ctrl+G 그리드 | ✅ :3504 | ✅ :2351 | ✅ |
| Ctrl+Z (드로잉 언두) | ✅ :2113 (undoDraw) | ❌ 없음 | ❌ |
| Delete/Backspace 오브젝트 삭제 | ✅ :2115 (선택만) | ✅ :2362-2363 (선택 없으면 **전체 삭제** — WT와 동작 상이) | ⚠️ |
| ↑/↓ hline 핍 이동 | ✅ :2116-2118 | ❌ | ❌ |
| Esc | 메뉴/모달 닫기 :2191-2193 등 | 캐스케이드 취소(레벨드래그→주문창→팝업→드로잉→툴→선택 :2356-2361) | ✅ |
| +/− 줌 | ❌ | ✅ :2364-2365 | ➕ |
| F8 속성 / Ctrl+D / Ctrl+B / Alt+B / Ctrl+U / F10 | ❌ (메뉴에도 없음) | ⚠️ 골격 — F8/Ctrl+D/Ctrl+B는 "coming in build" 토스트(:2350-2354), Alt+B/Ctrl+U/F10은 MW ctx 라벨만(:2052-2053) | ➕(골격) |

## 7. 상태바 / 헤더 / 세션

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 상태바 | 연결점(Connected/Offline)·Tool·Chart 타입/TF·Live account/Log in·Vegas 시계(StatusBar webtrade.html:2650-2664) | "For Help, press F1"·풀 날짜시계·"Default"만(fx-terminal.html:503-508, 2286-2288). **연결/계정/툴 상태 없음** | ⚠️ |
| 피드 연결 표시 | 메뉴바 우측 'Live feed (1s cache)' 점 + 상태바 점(webtrade.html:2966, 2656) | MW 타이틀바 LIVE/STALE/SIM 배지(fxFeed.badge fx-terminal.html:2108-2113) — 신선도 15s 판정(:2108) | ⚠️ (위치·문법 상이, 정직표기는 FT가 더 세분) |
| 메뉴바 | Windows식 7메뉴 File/View/Insert/Charts/Tools/Window/Help(MENU_DEF webtrade.html:2874-2899) | ☰ 단일 드롭다운: Charts/Insert—Indicators/Window/View만(drawMenu fx-terminal.html:1985-1998). File/Tools/Help/Languages 메뉴 없음 | ⚠️ |
| 툴바 | New Order·Algo·타입·줌·AutoScroll/Shift·드로잉 7종·Tile·Grid·TF·풀스크린·서버전환+(webtrade.html:3024-3071) | MT5 아이콘 25+종(TOOLS fx-terminal.html:1909-1947) — 실동작: 커서/크로스헤어/드로잉5/타입3/줌/타일/AutoScroll/Shift/틱차트/지표메뉴/F9(:1965-1979). 골격(토스트): Shapes·One-click·MetaEditor·Lock·Signals·MQL5 Cloud·Data window·Screenshot(:1980-1981) | ✅ (+골격 아이콘 ➕) |
| 서버 전환 | 툴바 ＋메뉴 → Sports/Crypto 대시보드(goSrv webtrade.html:3062-3068, top-window 처리 :3020-3022) | 헤더 아이콘 탭 goSports/goCrypto(fx-terminal.html:450-455, 2317-2318) + tabMenu(전부 dis :2307-2310) | ✅ |
| Algo Trading 토글 | ✅ 툴바 상태 토글(webtrade.html:3010, 3027) | ⚠️ 아이콘만(토스트) :1933 | ⚠️ |
| 로그인 게이트 | 세션 실존 확인 → LoginGate 모달, login.html?skin=wt 라운드트립(webtrade.html:3484-3493, 3409-3421) | 게이트 없음 — 아바타 클릭 시 login.html + dest2='fx-terminal'(fx-terminal.html:2230-2240), 미로그인=데모 연습 모드 | ⚠️ (정책 상이: WT=게이트, FT=열림+DEMO) |
| 로그아웃 | wtLogout(signOut+identity 태그 제거+fx.html 이동, webtrade.html:3402-3408, 메뉴바 ✕ :2967) | **없음** (아바타는 계좌번호 토스트만 :2233-2234) | ❌ |
| 로그인 차임/사운드 | MT5 사운드 엔진 + 로그인 차임(webtrade.html:776-843, 3475-3483) | 없음 | ❌ |
| Journal 부팅 로그 | 터미널 시작/차트엔진/피드 연결 로그(webtrade.html:3469-3472) | 'Alpexa FX Terminal started' 시드 + 이벤트 로그(fx-terminal.html:1433-1435) | ✅ |

## 8. Market Watch · Navigator · Toolbox (패널 상세)

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| MW 심볼 유니버스 | **서버 주도** symbolStore(prices+fx_specs 라이브 로드 webtrade.html:876-895) + TOP20(:863-865) + 메이저 고정순(:868) | 하드코딩 MW_WATCH 22종(fx-terminal.html:1231-1234); 라이브 전환 후 realSyms 필터만(:1316) | ⚠️ (서버 심볼마스터 미연동) |
| MW 검색 | 풀 심볼 풀 검색창(webtrade.html:2430-2433) | 없음 | ❌ |
| MW 컬럼 | Symbol/Bid/Ask/(Spread 토글)/Daily Ch%(webtrade.html:2439, 토글 :2402) | Symbol/Bid/Ask 고정 + High/Low/Spread/Time/Daily Change 우클릭 토글·영속(MW_COLDEF fx-terminal.html:1282-1296, ctx :2054-2055) | ➕ (MT5 컬럼 커스터마이즈 우세) |
| MW 하위탭 | Symbols/Details/Trading/Ticks(webtrade.html:2391) | 동일 4탭(fx-terminal.html:1390-1391) | ✅ |
| Details 탭 | Bid/BidHi/BidLo/Ask/AskHi/AskLo/Open/Close+화살표(webtrade.html:2340-2364) | 동일 구성 + 심볼 셀렉트(fx-terminal.html:1337-1352) | ✅ |
| Trading 탭 | SELL/BUY 카드 → **주문창 열기**(체결 아님, webtrade.html:2379-2382), 수량 0.01 고정 표기(:2380) | 볼륨 스피너 + **원클릭 즉시 데모 체결**(fx-terminal.html:1354-1363, 2036-2040) | ⚠️ (동작 상이 — MT5 원본은 즉시 체결이라 FT가 근접, 단 LIVE 미연결) |
| MW 더블클릭=주문 | ✅ webtrade.html:2454 | ✅ 수동 450ms 판정(재렌더로 dblclick 불가 우회, fx-terminal.html:2041-2047) | ✅ |
| MW 우클릭 메뉴 | 클래스 필터/Spread/New Chart/New Order/Hide/Show All(MW_MENU webtrade.html:2262-2275) | MT5 원본형: New Order/Chart Window/Tick Chart/DoM(Alt+B)/Specification/Hide/Symbols(Ctrl+U)/Popup Prices(F10)+Columns+Show 필터(fx-terminal.html:2050-2057) — New Order·필터·컬럼만 실동작, 나머지 토스트(:2067-2074). **Hide/Show All 실동작 없음, New Chart 없음** | ⚠️ |
| MW 장마감 처리 | marketOpen 게이트 — 틱 동결+'Closed' 마스크+주문 거절(webtrade.html:2443-2460, 1526-1529) | SIM 주말 동결만(fxWeekendClosed fx-terminal.html:1274-1279) — **'Closed' 표시·거래 잠금 없음** | ❌ |
| Navigator | 7폴더(Accounts/Indicators/EA/Scripts/Services/Market/VPS webtrade.html:3082) + 실계좌 잔고 라인(:3088-3089) + IND_TREE 클릭=지표 토글(:3077-3081) | 4폴더 정적 트리 — MT5 전체 인디케이터 카탈로그 명단(Trend 13·Osc 15·Volumes 4·BW 6·Examples 55·Free 12, fx-terminal.html:1395-1408), 접기/펼치기만(:2076-2078), Accounts=하드코딩 '3172308 — Alpexa-Demo'(:1396). **리프 클릭 무동작·실계좌 미표시** | ⚠️ (명단 충실도 ➕ / 동작·실계좌 ❌) |
| Toolbox 탭 12종 | Trade/Exposure/History/News/Mailbox/Calendar/Company/Alerts/Articles/Code Base/Experts/Journal(webtrade.html:2475) | 동일 12종(fx-terminal.html:1421) | ✅ |
| Trade 테이블 컬럼 | 11열 — Commission/Swap **없음**(webtrade.html:2812) | 13열 Commission·Swap 포함, colgroup 고정폭(fx-terminal.html:1467-1468, 1753-1754) + Pending 섹션 행(:1746-1752) | ➕ (FT가 MT5 원본 컬럼) |
| Trade 계좌 바 | Balance/Equity/Margin/FreeMargin/Level + 마진콜 ⚠/스탑아웃 ⛔ 경고 배지(webtrade.html:2847-2861) | 동일 5지표 MT5 공백 천단위(acctSpans fx-terminal.html:1712-1722) — **마진콜/스탑아웃 경고 배지 없음** | ⚠️ |
| 포지션 청산 ✕ | fx_close RPC(웹 실계좌)+데모 제거(webtrade.html:2751-2758) | data-rclose→fxCloseReal(fx_close)/데모(fx-terminal.html:2262-2264, 2210-2220) | ✅ |
| SL/TP 수정 | S/L·T/P 셀 더블클릭→ModifyPos(가격/핍 입력·방향검증·fx_modify, webtrade.html:2833-2834, 2666-2727) | 셀 클릭→Modify 다이얼로그(스텝퍼)+차트 라인 드래그(fx-terminal.html:1735-1737, 1659-1693) — 클라 방향검증 없음(서버 위임) | ✅ |
| Exposure | **심볼별** 롱/숏/그로스/노셔널/마진 표(webtrade.html:2480-2513) | **통화별** 순노출 Asset/Volume/Rate/USD/Graph + Long Positions 파이(fx-terminal.html:1762-1794) — MT5 원본 문법 | ⚠️ (FT가 MT5 정통; WT는 변형) |
| History | 기간필터 All/Today/Week/Month/**Custom 날짜범위** + 가상스크롤 페이징(webtrade.html:2795-2825, 2782) | 기간필터 4종(Custom 없음, fx-terminal.html:1805-1806), LIVE=settlements 서버 실기록 100건(:2169-2181) | ⚠️ |
| Alerts | localStorage 'alpexa.alerts', 1회 발화+Journal+벨(webtrade.html:2532-2577) | 'alpexa.fxdash.alerts' 동일 문법+토스트(fx-terminal.html:1436-1445, 1819-1834) — 사운드 없음 | ✅ |
| Journal | 300캡+가상스크롤(webtrade.html:2514-2526) | 300캡 단순 테이블(fx-terminal.html:1432-1435, 1836-1839) | ✅ |
| Mailbox | **실계좌 데이터** 웰컴메일+서버 settlements 공지(webtrade.html:2582-2624) | 정적 데모 메시지 2건 펼치기(fx-terminal.html:1474-1482, 1851-1858) | ⚠️ |
| Company | CompanyTab(webtrade.html:2629) | 하드코딩 법인정보 표(fx-terminal.html:1841-1849) | ✅ |

## 9. 주문 다이얼로그 / 돈 계약 (UI 관점)

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 주문창 | 드래그 가능 팝업(webtrade.html:3235-3251), 좌측 모드 아이콘(mkt/lim/stp 장식 :3218-3226), **시장가 전용**(Buy Limit 등 grep 0건), SL/TP 피펫 고정 스텝퍼(:3270), 볼륨 홀드 가속(:3258-3269), 우측 라이브 틱차트(:3208-3211) | 모달(드래그 불가), Market Execution + **Pending 6종(Buy/Sell Limit·Stop·Stop Limit)**(PEND_TYPES fx-terminal.html:1587, buildOrder :1611-1642), LIVE/DEMO 배지(:1622-1624), 스텝퍼 홀드(:1600). LIVE pending은 차단 토스트(:1655). 틱차트 없음 | ⚠️ (FT: pending UI ➕ / 틱차트·드래그 ❌) |
| 체결 RPC 락스텝 | fx_open(6인자+4인자 폴백)/fx_close/fx_modify, local_id 'wt-' (placeOrder webtrade.html:1439-1500, fx_modify :3300) | 동일 시그니처+폴백, local_id 'fxt-'(fxPlaceReal/CloseReal/ModifyReal fx-terminal.html:2194-2229) — 불변식 주석 "체결가·손익·잔고 절대 안 정함"(:2191-2193) | ✅ |
| 스프레드/손익 락스텝 | closePx BUY→BID/SELL→ASK(webtrade.html:1363), quoteUsd 크로스 환산(:1366-1375), contractSize FX10만/기타1(:1348), LEV_CAP FX500/기타5(:1357), requiredMargin(:1413-1415) | mwHalf(fx_close v_half 미러 fx-terminal.html:1254-1256), fxAcct.closePx/pnl/margin 동일식(:2147-2157), FX_CONTRACT_OF/FX_LEVCAP_OF(:2128-2129) | ✅ |
| 데모 엔진 | positionsStore 데모 + 서버 실포지션 혼재(WT_DEMO 분기 webtrade.html:1094-1100) | 인메모리 DEMO 완결 엔진: 시장가/대기/청산/Modify/스왑(MT5 롤오버·수3배 :1488-1507)/마진 500:1(:1537-1546)/**SL·TP 자동 스위프**(:1522-1536) | ➕ (데모 충실도; 단 실서버와 이원 경로 주의) |

## 10. 모바일/반응형

| 항목 | WT 상태 | FT 상태 | 판정 |
|---|---|---|---|
| 모바일 분기 | IS_MOBILE UA 스플리터(webtrade.html:713-718), 렌더 스로틀 300ms(:715-718), 차트 lazy 마운트(:3435-3443), 터치 홀드 지원(onTouchStart :1565-1567) | **없음** — IS_MOBILE/모바일 코드 grep 0건. viewport 메타만(fx-terminal.html:2). refitLayout는 500×300 미만 스킵(:569). pointer 이벤트라 터치 기본동작은 일부 가능 | ❌ |
| 리사이즈 스케일 | 그리드+rAF resizeAll(webtrade.html:3495) | __ref 비율 리매핑(전 위젯 스케일, fx-terminal.html:567-581) | ✅ |

---

## 고객 체감이 큰 UI 갭 — 우선순위 톱5

1. **모바일 대응 전무 (FT ❌)** — WT는 IS_MOBILE 스로틀+lazy 차트(webtrade.html:713-718, 3435-3443)로 폰에서도 뜨지만 FT는 분기 자체가 없어(fx-terminal.html grep 0건) 폰 고객이 열면 1900×856 기준 데스크톱 레이아웃 그대로. 모바일 유입이 있으면 첫 화면에서 체감.
2. **주문·세션 가드/피드백 부재 (FT)** — 장마감 'Closed' 마스크·거래 잠금 없음(WT webtrade.html:2443-2460 vs FT 없음), 원클릭 여유마진 게이트 없음(WT :1526-1531), 로그인 게이트·로그아웃 버튼 없음(WT :3402-3421 vs FT :2230-2240), MT5 체결음 전무. "주문이 왜 거절됐는지/내가 로그인 상태인지"가 서버 왕복 후 토스트로만 보임 — 돈 만지는 화면의 신뢰 체감 직결.
3. **i18n 커버리지 (FT ⚠️)** — 언어는 5종이지만 사전이 셸 ~20키(fx-terminal.html:514-519)뿐. 툴박스/주문창/메뉴/MW 전부 영어 하드코딩. WT는 ko/ja/zh 고객이 메뉴부터 에러 문구까지 모국어로 봄(webtrade.html:744-773). 한국/일본/중국 고객 체감 즉시.
4. **차트 深이력 + 서버 심볼마스터 (FT ⚠️)** — 실봉 1000봉 단일 요청(fx-terminal.html:910, 914) vs WT 최대 15000봉·5페이지(webtrade.html:1233-1253): H4/D1에서 과거 스크롤이 금방 바닥남. 심볼도 하드코딩 22종(fx-terminal.html:1231-1234) vs WT 서버 라이브 유니버스+검색(webtrade.html:876-895, 2431) — 신규 상장 심볼이 FT엔 안 뜸.
5. **상태바/헤더 정보 밀도 (FT ⚠️)** — 연결 상태·계정·툴·차트 상태가 상태바에 없음(fx-terminal.html:503-508 vs webtrade.html:2650-2664). LIVE/STALE/SIM 배지가 MW 타이틀에만 있어 차트만 보는 고객은 피드 단절을 모름. 반대로 FT만 있는 **SL/TP 라인 드래그·13열 Trade·통화별 Exposure·펜딩 티켓 UI**(fx-terminal.html:1008-1036, 1753-1754, 1762-1794, 1587)는 WT에 역이식할 가치가 있는 우위 항목.

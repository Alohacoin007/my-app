# ALPEXA FX 플랫폼 — 전 기능·MT5 문법·돈 엔진 계약 스펙

> 목적: FX를 레전드 기반으로 재구축하기 전, **현행 MT5 플랫폼의 전부**를 원본 코드에서 file:line 근거로 못박은 기초 공사 도면.
> 원본(읽기 전용): `webtrade.html`(PC MT5 터미널 3557줄) · `trading.html`(모바일 FX 앱 4285줄) · `fx.html`(랜딩) · `supabase/sql/fx_*.sql` · `supabase/functions/{fx-stream,fx-prices,price-monitor}`.
> 규율: 모든 항목 file:line 근거. 재구축이 "MT5 100%" + "플로팅==실현" 관문을 통과하려면 여기 항목 하나도 빠지면 안 됨.
> 진실의 소유자: **잔고=서버(accounts.balance)**, **체결가=서버 RPC(fx_open/fx_close)**, 클라는 표시·주문요청만.

---

## 섹션 1 — 기능 전수 인벤토리 (커버리지 체크리스트)

각 항목 = {번호. 기능명 · 진입 · 데이터소스 · 돈이동 · PC/모바일 · file:line}. 돈이동 O = 서버 잔고/포지션을 실제로 움직임.

### 1-A. PC 터미널(webtrade.html) — 상단 메뉴바 (MENUS, `webtrade.html:2853`, MENU_DEF `2856`)
메뉴 7개: File / View / Insert / Charts / Tools / Window / Help.

| # | 기능 | 진입 | 데이터/커맨드 | 돈 | file:line |
|---|---|---|---|---|---|
| 1 | File → New Chart Window | 메뉴 | `chart.new`→addChart | X | 2857 |
| 2 | File → Open Deleted / Save As Picture / Print / Exit | 메뉴 | dis:1 (죽은 placeholder) | X | 2857-2858 |
| 3 | View → Languages (English/한국어/日本語/中文) | 메뉴 keep | `lang.set` → LANG.cur | X | 2859-2863 |
| 4 | View → Toolbars 토글 | 메뉴 keep | `view.toggle:toolbars` | X | 2864 |
| 5 | View → Status Bar 토글 | 메뉴 keep | `view.toggle:statusbar` | X | 2865 |
| 6 | View → Market Watch (Ctrl+M) | 메뉴/핫키 | `view.toggle:marketwatch` | X | 2866,3467 |
| 7 | View → Navigator (Ctrl+N) | 메뉴/핫키 | `view.toggle:navigator` | X | 2867,3468 |
| 8 | View → Toolbox (Ctrl+T) | 메뉴/핫키 | `view.toggle:toolbox` | X | 2868,3469 |
| 9 | View → Color Theme Legend/Dark | 메뉴 keep | `theme.toggle` | X | 2869,3484 |
| 10 | View → Full Screen (F11) | 메뉴/핫키 | `view.fullscreen`/requestFullscreen | X | 2870,3472,3486 |
| 11 | Insert → Indicators (동적 체크·Remove All) | 메뉴 fly-out | `chart.indicator` | X | 2871,2896-2898 |
| 12 | Insert → Lines(Trend/Horizontal/Vertical) | 메뉴 fly-out | `chart.tool:trend/hline/vline` | X | 2872 |
| 13 | Insert → Fibonacci Retracement | 메뉴 fly-out | `chart.tool:fib` | X | 2874 |
| 14 | Insert → Text | 메뉴 | `chart.tool:text` | X | 2876 |
| 15 | Insert → Channels/Shapes | 메뉴 | dis:1 (미구현) | X | 2873,2875 |
| 16 | Charts → Chart Type + Indicators 서브 | 메뉴 | `chart.type`/`chart.indicator` | X | 2928-2941 |
| 17 | Tools → New Order (F9) | 메뉴/핫키 | `order.new` | (주문창) | 2877,3471 |
| 18 | Tools → History Center / Options | 메뉴 | dis:1 | X | 2877-2878 |
| 19 | Window → Tile Windows (2×2) | 메뉴 | `window.tile` | X | 2879,3494 |
| 20 | Window → Cascade | 메뉴 | dis:1 | X | 2879 |
| 21 | Help → Help Topics(F1)/About | 메뉴 | dis:1 | X | 2880 |

### 1-B. PC 아이콘 툴바 (Toolbar, `webtrade.html:3006-3054`)
| # | 기능 | 진입 | 커맨드 | 돈 | file:line |
|---|---|---|---|---|---|
| 22 | New Order 버튼 (F9) | 클릭 | `order.new` | 주문창 | 3008 |
| 23 | Algo Trading 토글 | 클릭 | `algo.toggle` (표시 상태만) | X | 3009,3005 |
| 24 | Chart Type 3종(Candles/Bars/Line) | 클릭 | `chart.type`, CHART_TYPES `2987` | X | 3012-3013 |
| 25 | Zoom In/Out | 클릭 | `chart.zoom` | X | 3016-3019 |
| 26 | Auto Scroll 토글 (틱→라이브 엣지 스냅) | 클릭 | chartOpts.autoScroll+`chart.opts` | X | 3023-3024 |
| 27 | Chart Shift 토글 (우측 15칸 여백) | 클릭 | chartOpts.shift, shiftOffset | X | 3025-3026,1196 |
| 28 | 드로잉 툴 7종 | 클릭 arm | `chart.tool`, DRAW_TOOLS `2989` | X | 3030-3031 |
| 29 | Tile Windows | 클릭 | `window.tile` | X | 3034 |
| 30 | Grid On/Off (Ctrl+G) | 클릭/핫키 | `chart.grid` | X | 3036,3470 |
| 31 | Timeframe 9종 M1~MN | 클릭 | `chart.tf`, TFS `2957` | X | 3038 |
| 32 | Full screen 토글(⛶) | 클릭 | requestFullscreen/exit | X | 3042-3043 |
| 33 | Switch server (＋) → Sports/Crypto 대시보드 | 클릭 | goSrv(window.top) | X | 3044-3050 |

드로잉 툴 7종(DRAW_TOOLS `2989-2990`): arrow(Cursor)·cross(Crosshair)·vline·hline·trend·fib·text.
차트타입 3종(CHART_TYPES `2987`): candle·bar·line. TFS 9종(`2957`): M1,M5,M15,M30,H1,H4,D1,W1,MN.

### 1-C. PC 차트 (ChartCell, `webtrade.html:1595`~)
| # | 기능 | 진입 | 소스 | file:line |
|---|---|---|---|---|
| 34 | 4분할 차트창(개별 심볼/TF/타입/지표) | File→New Chart | charts[] state, 활성창만 커맨드 수신 | 3527-3534,3478-3502 |
| 35 | 차트창 탭바(포커스·✕닫기) | 클릭 | charttabs | 3538-3540 |
| 36 | 실시간 봉(라이브 캔들 갱신, 세션닫힘 시 동결) | 자동 | marketOpen 게이트 | 1931-1932 |
| 37 | 딥 히스토리 로드(TF별 봉수·페이지백) | 자동 | fx-prices ?candles / 합성폴백 buildSeed | 1224-1290 |
| 38 | 크로스헤어 OHLC 리드아웃 | 호버 | setOhlc | 1607 |
| 39 | 크로스헤어 MEASURE 자(바/핍/가격델타) | Crosshair 툴 드래그 | drawlayer | 269-274 |
| 40 | 지표 5종(적용/해제, 활성차트만) | 메뉴/툴/Nav더블클릭 | INDICATORS `1304` | 1304-1310,3487-3491 |
| 41 | 드로잉: hline(price line)·trend(2점 라인)·fib(레벨)·vline/text(시간앵커 DOM오버레이) | 툴 arm 후 차트 | drawLines/drawSeries/overlays | 1600-1621,1992-2088 |
| 42 | 드로잉 이동/삭제(마지막·전체) | 드래그/컨텍스트 | `chart.undo`/`chart.clear` | 1714,2212-2213 |
| 43 | Fib 레벨·색(모듈스코프) | fib 드래그 | FIB levels | 1587 |
| 44 | 차트 컨텍스트 메뉴(우클릭) | 우클릭 | ChartMenu `2187` | 2185-2240 |
| 45 | 차트당 One-Click 패널 토글 | 컨텍스트 | showOC, OrderBox | 2129,2161,2196 |
| 46 | 심볼 드롭(MW 심볼 드래그) / 더블클릭 New Order | 드래그·더블클릭 | onSymbol/order.new | 3533,2436 |

지표 5종(INDICATORS `1304`): MA20·MA50(main)·EMA20(main)·RSI14(sub)·MACD(sub). 계산 순수함수 `_sma/_ema/_rsi/_macd` `1302`.

차트 컨텍스트메뉴 항목(ChartMenu items `2194-2216`): New Order(F9)·One-Click Trading(체크)·Chart Type 서브(Candles/Bars/Line)·Timeframes 서브(9종)·Indicators 서브(체크토글)·Remove Indicator(활성만)·Grid·Delete last object(Ctrl+Z)·Delete all objects·Properties(dis).

### 1-D. PC Market Watch (`webtrade.html:2373`~)
| # | 기능 | 진입 | 소스 | file:line |
|---|---|---|---|---|
| 47 | MW 탭 4종 Symbols/Details/Trading/Ticks | 탭클릭 | MW_TABS `2373` | 2448 |
| 48 | 심볼 테이블(Bid/Ask/Spread/Daily Ch%) | - | priceStore·per-row spread | 2420-2447 |
| 49 | 실시간 틱 색(sticky up/down) | 틱 | dirs, tc() | 2397-2407 |
| 50 | 라이브 시계(제목바) | 1s | clock | 2387,2411 |
| 51 | 검색(전체 풀·Top20 기본) | 입력 | TOP20, pool filter | 2385,2412-2414 |
| 52 | 클래스필터 All/Forex/Stocks/Crypto | 컨텍스트 | cat state | 2383,2245-2248 |
| 53 | Spread 컬럼 토글(기본 ON) | 컨텍스트 | showSpread | 2384,2250 |
| 54 | Hide/Show All(메모리) | 컨텍스트 | hidden Set | 2382,2255-2256 |
| 55 | MW 컨텍스트메뉴 | 우클릭 | MW_MENU `2244` | 2244-2257,2406 |
| 56 | Details 탭(심볼 상세) | 탭 | MWDetails `2322` | 2418 |
| 57 | Trading 탭(원클릭 sell/buy 리스트) | 탭 | MWTrading `2348` | 2419,2348 |
| 58 | Ticks 탭(틱차트) | 탭 | TickChart `2285` | 2416 |
| 59 | MW 심볼 마스터(서버 prices+fx_specs 로드) | 자동 | symMaster `877-889` | 856-889 |

MW 컨텍스트메뉴(MW_MENU `2244`): Forex/Stocks/Crypto/All Symbols(클래스필터)·Spread(컬럼토글)·New Chart·New Order·Hide·Show All.

### 1-E. PC Navigator (`webtrade.html:3064`~)
| # | 기능 | 진입 | 소스 | file:line |
|---|---|---|---|---|
| 60 | Navigator 폴더 7종 | 클릭확장 | NAV_FOLDERS `3064` | 3079-3100 |
| 61 | Accounts → 로그인 계좌·잔고 표시 | 확장 | positionsStore.acct | 3084-3085,3070-3071 |
| 62 | Indicators 트리(더블클릭 적용) | 더블클릭 | IND_TREE | 3086-3098 |

NAV_FOLDERS: Accounts·Indicators·Expert Advisors·Scripts·Services·Market·VPS(대부분 빈 폴더/장식).

### 1-F. PC Toolbox (하단, TBX_TABS 12종 `webtrade.html:2457`)
| # | 탭 | 데이터소스 | 돈 | file:line |
|---|---|---|---|---|
| 63 | Trade | positionsStore(오픈 포지션+계좌), closeOrder | 청산 O | 2724-2745 |
| 64 | Exposure | ExposureTab: 심볼별 순노출·마진·notional | X | 2457,2462-2493 |
| 65 | History | settlements(kind='fx_close') 페이지·기간필터 | X | 2724,2751-2764,1118-1131 |
| 66 | News/Mailbox/Calendar/Company | TAB_EMPTY 또는 Mailbox=settlements 알림 | X | 2459-2461,2578 |
| 67 | Alerts(가격알림 1회·저널·벨) | AlertsTab | X | 2509-2549 |
| 68 | Articles/Code Base/Experts | 빈 패널 | X | 2461 |
| 69 | Journal(실 시스템 로그) | journalStore | X | 2494-2508,822 |

History 기간필터: All/Today/Last Week/... (histPeriod `2724,2751`). 가상 윈도잉(긴 리스트) `2706,2764`.

### 1-G. PC 주문 (OrderModal `webtrade.html:3260`~ + OrderBox one-click)
| # | 기능 | 진입 | RPC | 돈 | file:line |
|---|---|---|---|---|---|
| 70 | New Order 모달(심볼·Bid/Ask·Spread·Volume·SL·TP·Margin) | F9/툴바/컨텍스트 | fx_open | 개설 O | 3289-3344 |
| 71 | 시장가 Sell/Buy by Market | 버튼 | placeOrder→fx_open | O | 3340-3342,3275-3286 |
| 72 | 세션닫힘/증거금부족 게이트(버튼 disable) | - | marketOpen·canAfford | X | 3274,3341 |
| 73 | 볼륨 스피너(±0.01, hold 가속) | 버튼 | startVolHold | X | 3308-3312 |
| 74 | SL/TP 입력(포커스→라이브 Bid/Ask 주입, 피펫 ±) | 입력 | - | X | 3315-3330 |
| 75 | One-Click OrderBox(차트 내장 Bid/Ask 큰버튼) | 차트 | placeOrder+slippage | O | 1508-1560,1516-1527 |
| 76 | 슬리피지 허용(SLIP_PIPS, 서버 가드로 전달) | 자동 | maxSlippage | O | 963-964,3279 |

> ⚠️ PC OrderModal은 **시장가 전용**(Sell/Buy by Market). Buy/Sell **Limit·Stop(pending)은 PC에 없음** — 모바일(trading.html)에만 있음. 재구축 시 PC에도 pending 필요할지 결정 항목.

### 1-H. PC 포지션/청산 (Toolbox Trade 탭 + positionsStore)
| # | 기능 | 진입 | RPC | 돈 | file:line |
|---|---|---|---|---|---|
| 77 | 오픈 포지션 로드(로그인 계좌 스코프) | 자동 | positions 테이블 select | X | 1102-1105 |
| 78 | 계좌 잔고 로드(fx 계좌) | 자동 | accounts.balance | X | 1099-1101 |
| 79 | 포지션 전량 청산 | Trade탭 ✕ | fx_close | 청산 O | 2737,1460-1467 |
| 80 | SL/TP 수정(모달) | Modify | fx_modify | X(레벨만) | 2650-2695,2675 |
| 81 | 실시간 포지션/계좌/settlements 구독 | 자동 | Supabase Realtime ch1/ch2/ch3 | X | 1137-1144 |
| 82 | 강제청산(STOPOUT) 효과음·리로드 | settlements INSERT detail 'STOPOUT' | - | X | 1141-1143 |
| 83 | 마진레벨 상태바(≤100% 마진콜·≤30% 스탑아웃 색) | 자동 | marginUsed/level | X | 2747,2836 |

### 1-I. PC 기타 시스템
| # | 기능 | file:line |
|---|---|---|
| 84 | 로그인 게이트(실 세션 확인 후만 표시) | 3450-3459,3375-3376,3516 |
| 85 | 로그인 챠임(loginChime 플래그) | 3441-3448 |
| 86 | 사인아웃(마케팅사이트로) | 3365-3370 |
| 87 | i18n 4개국어(en/ko/ja/zh, I18N `745`, t() `774`) | 745-774 |
| 88 | 테마(dark/legend, ?theme= 딥링크) | 724-739 |
| 89 | 효과음(open/close/error/stopout/login, WebAudio 합성폴백) | 815-816,796 |
| 90 | 레이아웃 영속(wtConfig: view/폭/높이/테마/언어) | 3460,1376 |
| 91 | 데모 모드 플래그 WT_DEMO(현재 false=프로덕션) | 1083,1099,1120 |

### 1-J. 모바일 앱(trading.html) — 하단 5탭 (BottomNav `3222`)
탭: WATCH·CHART·TRADE·HIST(History)·ACCT(Account) (`3223`).

| # | 화면/기능 | 진입 | 소스/RPC | 돈 | file:line |
|---|---|---|---|---|---|
| 92 | Watchlist(심볼 리스트·검색·Deposit배너) | WATCH | market state | X | 1207-1315 |
| 93 | ChartScreen(차트·지표·원클릭거래) | CHART | ChartScreen `2998`, placeTrade | 개설 O | 2998-3129 |
| 94 | ChartScreen One-Click 토글·확인시트 | 차트 | oneClick/pendingTrade | O | 3006-3009,3129 |
| 95 | TradeTicket(주문서: 심볼·볼륨·SL/TP·타입) | TRADE | TradeTicket `1367`, place `1432` | 개설 O | 1367-1560 |
| 96 | 주문타입 MARKET/LIMIT/STOP(Seg) | 주문서 | otype | O | 1478 |
| 97 | Positions: OPEN 탭(오픈 포지션·플로팅) | HIST | liveOrders, PosCard | X | 1802-1858 |
| 98 | Positions: PEND 탭(대기주문 수정/취소) | HIST | pendingOrders | 취소 | 1925-1961 |
| 99 | Positions: HIST 탭(청산내역) | HIST | closedHistory | X | 1860-1924 |
| 100 | Positions: FUND 탭(입출금·이체 내역) | HIST | 자금흐름 | X | 1962-1998 |
| 101 | PosCard Close(전량청산) | OPEN | closeOrder→fx_close | 청산 O | 1755-1800,3890 |
| 102 | PosCard Modify(SL/TP) | OPEN | modifyPosition | X | 1778,3887 |
| 103 | LeverageSheet(클래스별 최대 레버리지, 오픈시 잠금) | ACCT | getLeverageSettings | X | 2102-2161 |
| 104 | Account 화면(통화·언어·약관·지원) | ACCT | 각종 시트 | X | 2044-2303 |
| 105 | Deposit/Withdraw/Transfer/Report 시트 | ACCT | 서버(withdraw 게이트) | 입출금 O | 2562-2669 |
| 106 | NewsScreen(뉴스·경제캘린더) | - | NEWS/CAL | X | 2000-2043 |
| 107 | 통화 전환(표시통화) | 시트 | getCurrency | X | 2268-2303 |
| 108 | i18n 10개국어(tr map) | 자동 | `2182`~ | X | 2182-2188 |

모바일 주문타입 3종: MARKET·LIMIT·STOP(`1478`). PC와 달리 **pending(LIMIT/STOP) 지원**.

---

## 섹션 2 — MT5 돈 엔진 계약 (재구축 READ-BEFORE-WRITE의 원천)

> **불변식(최상위):** `accounts.balance == 오프닝 + Σ(settlements.pnl)` — settlements의 `trg_settlement_balance`(AFTER INSERT)가 적용. FX는 **ledger를 쓰지 않는다**(자체 트리거로 이중계산됨 — `fx_close.sql:147-148`).
> **개설 시 잔고 불변(fx_open):** 개설은 현금을 움직이지 않는다. 마진은 클라 표시로만 예약, 실현손익은 **청산에서만** 은행처리(`fx_open.sql:9-10`).

### 2-1. 체결가 권위 (서버 유일)
- **개설**: `public.fx_open(p_local_id, p_symbol, p_side, p_size, [p_leverage], [p_requested_price], [p_max_slippage])` — 배포 authoritative 버전 = **`fx_open_slippage.sql:25-30`**(4-arg 구/7-arg 신 시그니처 통합, 옛 오버로드 DROP `22-23`). 진화: `fx_open.sql`(기본4)→`fx_open_margin.sql`(마진게이트)→`fx_open_leverage.sql`(레버리지클램프)→`fx_open_slippage.sql`(+슬리피지, **최종**).
  - 서버 mid 소스: `prices` 테이블 `select mid,updated_at ... limit 1` (`fx_open_slippage.sql:53`).
  - 신선도: `now()-updated_at > 120s`면 거절 → 클라 폴백 (`fx_open_slippage.sql:55-57`).
  - 멱등: `local_id` 중복이면 재개설 안 하고 원 개설가 반환 (`fx_open_slippage.sql:74-77`).
  - INSERT: `positions(cust_id,acct_no,server='fx',kind='position',local_id,symbol,side,size,open_price,pnl=0,status='open')` (`fx_open_slippage.sql:115-116`).
- **청산**: `public.fx_close(p_local_id)` — `fx_close.sql:41`. 로우락 `for update of p`(스탑아웃 크론과 수동청산 직렬화, 이중은행 방지 `fx_close.sql:61-68`). 원자적 claim `update ... where status='open'`, `if not found → duplicate`(`fx_close.sql:141-143`). settlements INSERT로 은행처리(`fx_close.sql:149-151`).
- 클라 호출부: PC placeOrder `webtrade.html:1443-1448`(fx_open, PGRST202 시 구 시그니처 재시도 `1444-1445`)·closeOrder `1465`. 모바일 placeOrder `trading.html:3863`·closeOrder `3930`·pending fill `3775`.

### 2-2. 스프레드 (딜링 스프레드 — 전 상품, 하우스 수취)
> **락스텝 3곳이 반드시 동일 공식·동일 단위.** 하나만 고치면 플로팅≠실현 결함 재발(결함-로그 2026-07-05,07-13).

**개설 fill(FX):** BUY=ASK(mid+half), SELL=BID(mid−half). half = `greatest(0.1, spr_pts+markup_pts) * pip / 2` (`fx_open_slippage.sql:61-70`). 비FX 개설은 `v_open=v_mid`(스프레드는 청산에서 왕복 1회).

**청산 fill:** BUY 포지션→BID(mid−half), SELL 포지션→ASK(mid+half) (`fx_close.sql:112`).
- **FX half**: `greatest(0.1, spr_pts+markup_pts)*pip/2` (`fx_close.sql:89-98`).
- **비FX half(하이브리드)**: `mid * greatest(FLOOR_BPS[cls], spr_pts) / 10000 / 2`, FLOOR_BPS = CRYPTO 10·STOCK 8·INDEX 6 (`fx_close.sql:100-110`). 계산 시장 스프레드가 floor보다 크면 통과.

**pip 함수(락스텝 필수):** JPY=0.01·XAUUSD=0.01·XAGUSD=0.001·else 0.0001. 4곳 동일:
- `fx_close.sql:94-97` · `fx_open_slippage.sql:64-65` · `fx_realized_pnl` `fx_stopout.sql:41-44` · Edge `fx-prices/index.ts:32-37` + `fx-stream/index.ts:34-39`.

**클라 락스텝 지점(file:line):**
- 모바일: `ALPEXA_SPREAD_BPS={CRYPTO:10,STOCK:8,INDEX:6}` `trading.html:454` · `fxHalfSpread(m,mid)` `trading.html:458-468` · `fxClosePx(m,side)` `trading.html:474-478` · `fxPip` `trading.html:449` · `fxBidPx/fxAskPx` `486-487`.
- PC: `SPREAD_FLOOR_BPS={Crypto:10,Stocks:8}` `webtrade.html:928` · `halfPx(sym,mid,spr,mk)` `webtrade.html:929-931` · `pip` `webtrade.html`(digits/pip 기반) · `DEFAULT_SPREAD` 콜드시드 `916-919`.
- 강제: `tests/fx-floating-spread.test.js`(client half == server v_half, 신규 포지션 −half 플로팅).

> ⚠️ **spr_pts 한 컬럼 3단위**(결함-로그 `201-204`): FX=pips(fx-prices/fx-stream), 크립토=bps(crypto-prices bookTicker), 주식=0. 변환은 halfPx 한 곳에서만. 단위 뒤섞으면 2026-07-13 광폭/얇음 버그 재발.

### 2-3. 마진 / 레버리지 / contract size
- **requiredMargin = notional_usd / leverage_cap[cls]** (`fx_open_slippage.sql:101`, `fx_open_margin.sql:120-128`).
- **notional_usd(fx_notional_usd `fx_open_margin.sql:40-53`)**: lot = XAUUSD 100·XAGUSD 5000·cls FX 100000·else 1. 비FX = size·lot·price. FX quote=USD → size·lot·price. FX base=USD → size·lot. FX cross → size·lot·ccyToUsd(base)(레퍼런스 없으면 null → 거절).
- **lev cap(fx_lev_cap `fx_open_margin.sql:56-60`)**: FX 100·INDEX 20·STOCK 5·CRYPTO 5·else 1. 클라 leverage는 `least(cap, greatest(1, p_leverage))`로 **클램프**(클라는 더 보수적만 가능 `fx_open_slippage.sql:95`).
- **마진 게이트**: `balance < used_margin + new_margin - 1e-6`면 거절(`fx_open_slippage.sql:109-112`). used = Σ(오픈 포지션 notional/cap)(`102-108`).
- **클라 락스텝**: contractSize FX=100000 else 1 `webtrade.html:1338-1342`(`CONTRACT=100000`) / 모바일 getLotSize·getNotionalUSD `trading.html:444`·getMarginUSD `445`. LEV_CAP `webtrade.html:1351`(Forex 100 else 5) / DEFAULT_LEVERAGE `trading.html:610`(FX:100,INDEX:20,STOCK:5,CRYPTO:5). requiredMargin `webtrade.html:1395-1396`.
- **⚠️ DEMO 왜곡(락스텝 예외)**: 크립토 플로팅 표시 가중치(0.01랏 P&L 가시화)는 **마진엔 영향 없음**, 표시/equity만 — WT_DEMO off 전 1로 리셋 필요(`webtrade.html:1343-1347`).

### 2-4. 슬리피지 가드 (fx_open)
- 서버: fill(v_open)이 requested보다 **불리 방향으로** max 초과 시만 거절(유리한 이동은 항상 체결). BUY: v_open>req+max, SELL: v_open<req−max (`fx_open_slippage.sql:83-90`). 멱등 재시도는 재검사 안 함(`72-77`).
- 클라: requestedPrice = 트레이더가 본 ask/bid, maxSlippage = SLIP_PIPS·pip. PC `webtrade.html:1516-1521,3278-3280`, SLIP_PIPS `963-964`. 모바일 applySlippage(STOP 1.4·MARKET 0.6·LIMIT 0 어드버스없음) `trading.html:490-499`.

### 2-5. 마진콜 / 스탑아웃 (fx_stopout.sql)
- **스탑아웃 스윕** `fx_stopout(p_level default 30)` `fx_stopout.sql:85`. 크론 매분 `select fx_stopout(30)`(`168`). execute revoke(클라 호출 불가 `157-158`).
- **마진레벨 = equity/used_margin*100**. equity = balance + Σ floating(`fx_stopout.sql:124-125`). level < p_level(30)면 **최대손실 포지션부터** 강제청산, 재평가 반복(`128-150`).
- **안전**: 가격 못 매기는(stale/missing) 포지션 있으면 그 계좌 **청산 안 함**(v_unpriced>0 → skip `121`). guard 500회 backstop(`102`).
- **floating helper `fx_realized_pnl`** `fx_stopout.sql:23-79` = **fx_close v_close/P&L의 충실한 포트**(락스텝 주석 `14-16`). 스탑아웃 청산도 settlements(kind='fx_close', detail 'STOPOUT ...')로 은행처리(`145-148`).
- 클라 표시: marginLevel `trading.html:3163` / PC level·색 `webtrade.html:2747,2836`. 마진콜 배너(soft, 안막힘) — 결함-로그 #16(`webtrade.html:1513`, `trading.html:3793 halt`).

### 2-6. SL/TP 강제 (fx_modify.sql)
- `fx_modify(p_local_id, p_sl, p_tp)` — meta jsonb에 sl/tp 기록. 시장 반대편 검증(BUY SL≥mid 거절 등 `fx_modify.sql:30-33`). authenticated만(`41-42`).
- **`fx_sltp` 크론(매분 `96`)**: 라이브 mid가 SL/TP 교차 시 fx_realized_pnl로 강제청산(원자적 claim + settlements, 수동청산과 이중없음 `81-88`). stale/unpriced skip(`65-66`).

### 2-7. Pending 주문 (fx_pending.sql)
- `fx_pending` 테이블(local_id·otype LIMIT/STOP·trigger·sl·tp·status) `fx_pending.sql:12-27`. RLS 소유자(acct→players→auth.uid) `35-63`. Realtime 발행 `66-70`.
- **트리거 감시 = 클라(실시간)**, **fill = 서버 fx_open**(체결가 위조 불가). 모바일 감시 루프 700ms `trading.html:3735-3787`: LIMIT(BUY px≤trigger)·STOP(BUY px≥trigger) 교차 → fxAskPx/fxBidPx로 판정 → fx_open 호출, 거부 시 클라 개설 안 함(#5/F `3766-3781`).

### 2-8. 포지션 생명주기 · 쓰기 주인 · dedupe
- **open → modify(fx_modify) → close(fx_close)/stopout(fx_stopout)/sltp(fx_sltp)**. positions 쓰기 주인 = **fx_open(개설 유일 생성자)** + fx_close/스탑아웃/sltp(청산). 클라는 UI 표시만.
- 멱등: 개설 `local_id` 중복차단, 청산 원자적 claim. 크론↔수동 로우락 직렬화.
- **dedupe**(`positions_dedupe.sql`): (acct_no,server,local_id) **FULL unique index**(`35-36`). 클라 upsert onConflict용 — PARTIAL이면 크립토 포지션 사라짐(`25-33`). 과거 UPDATE-then-INSERT가 RLS RETURNING 숨김으로 유령행 수십개 만든 버그 수정(`4-8`).
- 클라 청산 폴백 원자적 claim: `positions.delete().eq(status='open').select()` 이긴 쪽만 은행(`trading.html:3919-3922`).

### 2-9. 자산군별 스펙 (fx_specs)
- `fx_specs(symbol, cls)` 마스터 `fx_close.sql:19-38`(FX·STOCK·CRYPTO·INDEX 클래스). 크립토 CFD 등록 `fx_specs_crypto.sql:6-10`(10종, cls='CRYPTO', cap 5x lot 1).
- lot(contract size): XAUUSD 100·XAGUSD 5000·FX 100000·else 1. pip 표 = 2-2 참조.

---

## 섹션 3 — 시세 피드 계약

- **fx-stream**(WS 펌프, sub-second FX): Polygon `wss://socket.polygon.io/forex` 50s hold, per-symbol ≥1s 쓰기(`fx-stream/index.ts:41-42`). WANT 20심볼(FX+메탈 `24-28`). spr_pts = **정수 아닌 0.1핍 정밀** `Math.round((a-b)/pip*10)/10`(`106`). CRON_SECRET fail-closed 503, ?token= 필수(`54-56`). job `fx-stream-1m`.
- **fx-prices**(3s REST 폴백 + 캔들): 스냅샷 upsert(`121-158`), spr_pts 0.1핍(`152`). **?candles=SYM&tf=&n=** 캔들모드는 **CRON 게이트 앞**에서 서빙(클라가 토큰없이 호출 — 2026-07-13 401 버그 수정 `52-104`). Polygon aggs 페이지백(≤8p, 2000-01-01 floor `74-94`).
- **price-monitor**(크론 ~1분): STALE(>90s)·DIVERGENT(vs CoinGecko >2.5%) 크립토 메이저 이메일 경보, 20분 디듑(`18-20,73-97`).
- **prices Realtime + 폴백**: 클라 수신 = Supabase Realtime push(`prices` publication) + 1초 폴링. PC priceStore: startRealtime + Binance WS 직결(`data-stream.binance.vision` bookTicker `1062`) + 1s pull(`webtrade.html:1074`). 모바일 `window.__alpexaFXFeed`(prices 1.5s pull).
- **신선도 게이트**: RPC 120s stale 거절(fx_open/fx_close/fx_realized_pnl 전부). 클라 세션게이트 = marketOpen(피드 freshness 아님, 세션 캘린더 `webtrade.html:936-960`).
- **심볼 유니버스**: WATCH/GRID = `webtrade.html:846-874`(SYMBOLS by class, SYM_CAT, WATCH). fx_specs가 서버 화이트리스트(피드 없으면 fx_open 거절 → 거래목록 제외 `trading.html:402-420`).
- **markup**: `pricing_marks.markup_pts`(운영자 마크업, FX half에 가산). 클라 loadMarks `webtrade.html:1037` / `window.__alpexaFXMarks` `trading.html:461`.

---

## 섹션 4 — 계좌/자금 문법

- **FX equity = 현금 + Σ오픈 플로팅**. 모바일 `equityUsd=balanceNum+livePnl` `trading.html:3148` / PC `equityUsd=balanceNum+livePnl` `webtrade.html`(positionsStore floating). freeUsd = equity − usedMargin `trading.html:3149`.
- **잔고 소스 = 서버 전용**. accounts.balance(fx 계좌 스코프) PC `webtrade.html:1099-1101` / 모바일 getBalances `trading.html:3145`. **localStorage에 돈 진실 저장 금지**(CLAUDE.md #5).
- **출금/이체 캡 = free margin(플로팅손실 제외)**: 서버 `withdrawable_for`가 진짜 게이트, 클라는 UX 표시(`trading.html:595-597`, `fxAvail`=min(cash, free-margin) 결함-로그 `146`). fxEquity/fxFree를 localStorage에 게시(크립토앱이 equity 표시용, live 계좌만 `trading.html:3153-3156`).
- **입금/출금/이체 진입**: Deposit/Withdraw/Transfer/Report 시트 `trading.html:2562-2669`. withdraw만 서버게이트(`2600-2604`), deposit는 fire-and-forget 기록+알림(`2607-2610`).
- **계좌 이력**: FUND 탭(deposit/withdraw/transfer 필터) `trading.html:1962-1998`. History(청산) = settlements kind='fx_close' `webtrade.html:3495-3504`, `trading.html:3903`.

---

## 섹션 5 — 세션 / 신원 가드

- **PC 로그인 라운드트립**: `login.html?skin=wt`(터미널 스킨, 단일 auth 경로) `webtrade.html:3376`. 로그인은 sign-in+프로필+#5 캐시와이프 수행, 세션은 per-tab **sessionStorage**에 착지.
- **세션 실존 게이트**: 실 Supabase 세션 확인(`getSession`) 후에만 LoginGate 표시. AlpexaSync.me(항상 truthy 게스트 placeholder)로 판단 금지(`webtrade.html:3450-3459`).
- **모바일 신원 가드**: `alpexa.me` 없으면 login.html로 replace(`trading.html:67`). 세션 만료 체크 1회 → `login.html?expired=1`(`81-85`).
- **doSignOut**: db.auth.signOut() + 마케팅사이트 이동(PC `webtrade.html:3365-3370`) / 모바일 `login.html?switch=1`(`3290-3292`).
- **유령 세션**: alpexa-sync me()가 로그인 없을 때 가짜 Guest 계좌 저장했던 버그(결함-로그 `130`) — 지금은 실 세션만.
- **로그인 알림**: 모바일 loginNotif 1회 `trading.html:3464`. PC loginChime `webtrade.html:3443`.
- ⚠️ 3곳(alpexa-sync.js·login.html·signup.html) createClient가 **같은 storage(sessionStorage)** 여야 함(CLAUDE.md #5 — 하나라도 다르면 로그인 루프).

---

## 섹션 6 — 설정 / 기타

- **테마**: PC dark/legend, `?theme=` 딥링크 `webtrade.html:724-739`. 모바일 light/dark(fx.html body.light). `theme.toggle` 커맨드 `3484`.
- **언어(i18n)**: PC 4개국(en/ko/ja/zh) I18N `webtrade.html:745`, t() `774`, `lang.set` `3485`. 모바일 10개국 tr map `trading.html:2182`.
- **핫키 전체**(PC `webtrade.html:3462-3476`): Ctrl+M(MarketWatch)·Ctrl+N(Navigator)·Ctrl+T(Toolbox)·Ctrl+G(Grid)·F9(New Order)·F11(Fullscreen). 컨텍스트: Ctrl+Z(Delete last object `2212`). 입력 필드 위에선 무시(`3465`).
- **상태바**: 마진레벨(≤100% 마진콜·≤30% 스탑아웃 색, 안전=중립) `webtrade.html:2836`. Balance/Equity/Margin/Free/Level `2830-2840`.
- **localStorage 키(돈 금지 준수 확인)**: 허용 = `alpexa.wt.leverage`(레버리지=UI설정 `webtrade.html:1370-1371`)·`alpexa.leverage`(모바일 `trading.html:611`)·레이아웃(wtConfig)·prefs/통화·`alpexa.me`(세션신원)·`alpexa.fxEquity/fxFree`(equity 표시, live만). **돈 진실은 없음**(잔고=서버). 세션 토큰=sessionStorage. 단, leverage는 클램프되어 서버가 최종 권위.

---

## 섹션 7 — 정직한 사실 (재구축이 덜 만들면 안 되는 것)

| 항목 | 상태 | file:line | 재구축 처리방향 |
|---|---|---|---|
| WT_DEMO 데모모드 플래그 | 현재 false(프로덕션) | webtrade.html:1083 | 프로덕션 유지, 데모 경로 제거 결정 |
| 크립토 플로팅 가시화 가중치 | DEMO-ONLY 표시왜곡(마진 무관) | webtrade.html:1343-1347 | WT_DEMO off 전 1로 리셋(플로팅==실현 관문) |
| PC pending(Limit/Stop) 없음 | 미구현 | webtrade.html:3340(시장가만) | PC에도 pending 추가 여부 결정 |
| Insert Channels/Shapes | 미구현 dis:1 | webtrade.html:2873,2875 | 채널/도형 드로잉 툴 신규 or 유지 |
| File/Tools/Window/Help 다수 항목 | 죽은 placeholder dis:1 | webtrade.html:2857-2880 | History Center/Options/Save Picture 실구현 결정 |
| Navigator EA/Scripts/Services/Market/VPS | 빈 폴더 장식 | webtrade.html:3064,3096 | 장식 유지 or 제거 |
| Toolbox News/Mailbox/Calendar/Company/Articles/CodeBase/Experts | 빈 패널 TAB_EMPTY | webtrade.html:2459-2461 | 뉴스/캘린더 실피드 연결 결정 |
| 차트 합성 히스토리 폴백(buildSeed) | fx-prices 캔들 실패 시 합성봉 | webtrade.html:1224-1290 | FX는 Polygon 캔들 실봉, 실패만 폴백 |
| 클라 청산 폴백(clientClose) | 서버 무가격/stale/오프라인 시 | trading.html:3908-3923 | 서버 우선, 폴백은 원자적 claim 유지 |
| Algo Trading 버튼 | 표시상태만(실행 없음) | webtrade.html:3005,3009 | EA 미지원 — 장식 or 제거 |
| 하드코드 US 휴장일(2026~2027만) | 매년 연장 필요 | webtrade.html:943, fx_open_session.sql:25-29 | 서버·클라 락스텝 연장 |
| fx_open_session.sql(세션게이트) | DRAFT — 미배포 표기 | fx_open_session.sql:1-9 | 배포 시 fx_open 상단 와이어(주말주문 서버거절) |
| 주식 세션 EDT 고정(EST 겨울 미대응) | 알려진 한계 | webtrade.html:941, fx_open_session.sql:6 | DST 규칙 추가 |
| ALPEXA_TRADE_API(외부 MT5 Web API) | 미배선 훅 | webtrade.html:1337,1463 | fx_open RPC 경로가 실경로 — 유지 |

---

## 섹션 8 — 레전드 재구축 위젯 매핑 초안 (누락 0 확인용)

| 인벤토리 그룹(#) | → 레전드 위젯 | 재사용 가능(스포츠/크립토 대시보드) | 비고 |
|---|---|---|---|
| 차트(#34-46) | **Chart 위젯**(4분할·TF·타입·지표·드로잉·크로스헤어) | 크립토 대시보드 차트 엔진 | fx-prices 캔들 데이터레이어 공유 |
| Market Watch(#47-59) | **MarketWatch 위젯**(테이블·틱색·검색·필터·컨텍스트) | 스포츠 이벤트리스트 렌더 격리 패턴 | Realtime prices 구독 |
| Navigator(#60-62) | **Accounts/Instruments 사이드 위젯** | - | 계좌·지표 트리 |
| Toolbox(#63-69) | **Positions/History/Journal 하단 위젯** | 크립토 포지션 위젯 | settlements 데이터레이어 |
| 주문(#70-76,#95-96) | **Order Ticket 위젯**(시장가+pending 통합) | - | fx_open RPC 락스텝 |
| 포지션/청산(#77-83,#97-102) | **Position/PnL 위젯** | 크립토 홀딩 위젯 | fx_close·플로팅==실현 |
| 계좌/자금(#104-105, 섹션4) | **Account/Funds 위젯** | 크립토 입출금 위젯 | withdraw 서버게이트 |
| 마진레벨/상태바(#83, 섹션6) | **Margin/Equity 헤더 위젯** | - | equity=현금+플로팅 |
| 서버전환(#33) | **App Switcher**(Sports/Crypto/FX) | 이미 공유 | goSrv |
| 레버리지(#103) | **Leverage 설정 시트** | - | 클램프=서버cap |
| i18n/테마/핫키(#87-90,#107-108, 섹션6) | **Platform Shell**(테마·언어·핫키 레이어) | 전 대시보드 공유 | ?theme= 딥링크 |

**MT5 기능 총계: 108개 인벤토리 항목**(PC #1-91, 모바일 #92-108). 11개 위젯 그룹으로 매핑 — 누락 0.

**핵심 관문(재구축 완료 조건):**
1. 108개 인벤토리 전 항목 위젯 존재(MT5 100%).
2. 플로팅 half-spread == fx_close v_half(3곳 락스텝) — `tests/fx-floating-spread.test.js` 🟢.
3. 개설/청산/스탑아웃/pending fill 전부 서버 RPC 유일 경로(클라 개설 금지).
4. 마진게이트·슬리피지·120s 신선도·멱등·dedupe 서버 강제.

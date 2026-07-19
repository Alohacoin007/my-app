# FX터미널(레전드) ↔ 앱·서버 돈 엔진 계약 — 갭 감사 (2026-07-19)

대상: `dev/fx-terminal.html` (M1 셸 + M2 실시세 + M3 실계좌 읽기 + DEMO 주문)
기준: `webtrade.html`(PC MT5) · `trading.html`(모바일) · `supabase/sql/fx_*.sql`(배포 RPC) · `supabase/functions/fx-prices`
등급: **[🔴돈 위험]** = 플로팅≠실현/오인 유발 · **[🟡표시 차이]** = 수치 드리프트/표시 불일치(돈 이동 없음)
※ 터미널은 현재 **돈 쓰기 0** (RPC 호출 없음 — `from('accounts'/'positions')` 조회와 `functions.invoke('feed')`뿐, fx-terminal.html:1996-1999, 2045-2048). 아래 🔴은 "표시가 서버 실현과 어긋나는" 결함 클래스(CLAUDE.md 🏦 무관용)와 M4 진입 시 돈 사고로 승격될 항목이다.

---

## 1) 수학/계약 락스텝 검증 — 항목별 대조

### 1-A. 청산가(closePx)·스프레드

| # | 항목 | 터미널 | 기준(앱/서버) | 판정 |
|---|------|--------|---------------|------|
| A1 | BUY→BID / SELL→ASK | `fxAcct.closePx` fx-terminal.html:2053-2054 | webtrade `closePx` webtrade.html:1363 · `fx_close.sql:112` `v_close = mid ∓ half` | ✅ 일치 |
| A2 | FX half-spread에 **markup_pts 누락** | `mwHalf = max(0.1, spr)*pip/2` fx-terminal.html:1219-1220 — markup 항 없음(자인 주석 "markup=0(dev)" fx-terminal.html:1194) | 서버 `greatest(0.1, spr+markup)*pip/2` fx_close.sql:90-98 · fx_open_slippage.sql:62-66 · webtrade `halfPx(sym,mid,spr,**mk**)` webtrade.html:929-931 + `loadMarks()`(pricing_marks, [0,50] 클램프) webtrade.html:1037-1038 · trading.html:458-462(`__alpexaFXMarks`) | **[🔴돈 위험]** 운영자가 `pricing_marks.markup_pts>0` 설정하는 순간 터미널 bid/ask·플로팅이 서버 체결/실현과 어긋남. 지금은 markup=0이라 잠복. M4 전 `loadMarks` 이식 필수 |
| A3 | 비FX bps 플로어 | `MW_FLOOR_BPS={Crypto:10,Stocks:8}` + `mid*max(floor,spr)/10000/2` fx-terminal.html:1214, 1219-1220 | fx_close.sql:106-110 (CRYPTO 10·STOCK 8·INDEX 6) · trading.html:454-467 `ALPEXA_SPREAD_BPS` · webtrade.html:928-931 | ✅ 크립토/주식 일치 · **[🟡]** INDEX 6 미구현(아래 A5) |
| A4 | pip 정의 | `mwPip`: JPY 0.01, 그 외 FX 0.0001 fx-terminal.html:1210 | webtrade `pip` webtrade.html:900 · 서버 fx_close.sql:94-97 (**+XAUUSD 0.01, XAGUSD 0.001**) · fx-prices/index.ts:32 | ✅ 통화쌍 일치 · 메탈 미구현(아래 A5) |
| A5 | **심볼 분류기 오분류 (메탈/인덱스)** | `mwCat` 폴백: `/USD$/→Crypto, 6자→Forex` fx-terminal.html:1199 → `mwCat('XAUUSD')='Crypto'`(계약 1·레버 5·pip 0.01), `mwCat('NAS100')='Forex'`(계약 100k·레버 500) | 서버 fx_specs: XAUUSD/XAGUSD=FX(lot 100/5000) fx_close.sql:24, 115 · 인덱스=INDEX(lot 1·lev 20) fx_close.sql:36-37, fx_open_margin.sql:57-61 | **[🟡표시 차이]** 다만 실제로는 MW_WATCH 밖이라 시세가 안 들어와(아래 E1) P/L 0·마진 0으로 동결 — 붕괴 대신 누락. 재구축에서 fx_specs 미러 필요 |

### 1-B. 플로팅 P/L (pnl)

| # | 항목 | 터미널 | 기준 | 판정 |
|---|------|--------|------|------|
| B1 | 공식 | `dir*(cur-open)*size*계약*(JPY?0.0067:1)` fx-terminal.html:2055-2057 | webtrade `positionPnL` webtrade.html:1364-1368 — **동일**(락스텝 성립) | ✅ webtrade와 락스텝 |
| B2 | **환산 계수 — 서버와 불일치 (webtrade 유래 결함의 충실한 복제)** | JPY 하드코딩 `0.0067`(=1/149.25) · 비JPY 비USD-quote(USDCHF/USDCAD)는 계수 1 | 서버 fx_close.sql:118-137: quote=USD→그대로 · base=USD→`pnlQuote/close` · 크로스→라이브 quote→USD 환율. trading.html `getPnlUSD`(:446)와 `ccyToUsd`(:443)는 서버와 **정확히 일치** | **[🔴돈 위험]** 현 시세(USDJPY 162.36, webtrade.html:980) 기준: JPY 페어 플로팅 **+8.8% 과대**(0.0067 vs 1/162.36=0.006159) · USDCHF **~19% 과소**(서버는 /0.8068) · USDCAD **~42% 과대**(서버는 /1.417). 플로팅≠실현 클래스 — PC(webtrade)·터미널이 함께 틀리고 모바일(trading.html)·서버가 맞는 3자 분열. 터미널 단독 수정 금지 — webtrade와 **양쪽 동시**(CLAUDE.md 락스텝 규칙) |
| B3 | 계약 크기 | `FX_CONTRACT_OF = FX 100000, else 1` fx-terminal.html:2034 | webtrade `contractSize` webtrade.html:1344-1348 · 서버 `v_lot` fx_close.sql:115, `fx_notional_usd` fx_open_margin.sql:44-45 | ✅ (메탈 예외는 A5) |
| B4 | **스왑이 Equity에서 누락 (LIVE)** | `fxAcct.stats: equity=bal+floating` — meta.swap 미합산 fx-terminal.html:2071-2073 (행 표시로는 meta.swap 노출 :2069) | 서버 실현 = pnl **+ meta.swap** fx_close.sql:140-143 · MT5 표준 Equity=Balance+Floating+Swap — **demoStats는 포함** fx-terminal.html:1485 | **[🟡표시 차이]** LIVE Equity/Free/Level이 Σswap만큼 어긋남 + 데모·라이브 경로 서로 다른 공식. (webtrade equity도 동일하게 누락 webtrade.html:1416-1418 — fx_swap 배포(2026-07-19) 이후 생긴 신규 드리프트, 앱·터미널 동시 수정 대상) |

### 1-C. 마진/레버리지

| # | 항목 | 터미널 | 기준 | 판정 |
|---|------|--------|------|------|
| C1 | 레버리지 캡 | `FX_LEVCAP_OF = FX 500, else 5` fx-terminal.html:2035, `FX_LEV_TERM=500` :1451 | 서버 `fx_lev_cap`: FX **500**·INDEX 20·STOCK 5·CRYPTO 5 fx_open_margin.sql:56-61 · webtrade `LEV_CAP` webtrade.html:1357 | ✅ FX/주식/크립토 일치 · INDEX 20 미구현 [🟡] |
| C2 | 마진 공식 | `size*계약*baseUsd/lev` fx-terminal.html:2063 · `baseUsd`: USD base=1·USD quote=mid·크로스=baseUSD 직접/역수 :2058-2062 | 서버 `fx_notional_usd/fx_lev_cap` fx_open_margin.sql:40-61 · webtrade `requiredMargin/baseUsdRate` webtrade.html:1390-1403 | ✅ 구조 일치 |
| C3 | **notional 기준가 드리프트** | 현재 mid로 평가 (fx-terminal.html:2058-2062) | 서버 used-margin은 **open_price** 기준 fx_open_margin.sql:130-136 · fx_stopout.sql:104-112 | **[🟡표시 차이]** 가격이 움직인 만큼 표시 Margin/Level이 서버 게이트·스탑아웃 판정치와 어긋남. webtrade도 동일(webtrade.html:1419) — 앱 락스텝은 유지, 서버와의 차이는 기존 계약 그대로 |
| C4 | 표시 레버리지 소스 | 캡 500 고정 | webtrade는 **사용자 선택 레버리지**(기본 100, `tradeSettings` webtrade.html:1370-1380, usedMargin :1419) | **[🟡표시 차이]** 같은 계좌를 PC 앱(레버 100 선택 시)과 터미널이 다른 Margin으로 표시. 서버 스탑아웃 기준(캡)으로는 터미널이 정답 — 재구축 시 "선택 레버리지" 개념 이식 여부 결정 필요 |
| C5 | Margin Level·스탑아웃 기준 | `equity/margin*100` fx-terminal.html:2073 | fx_stopout.sql:123-126, threshold 30%·1분 크론 fx_stopout.sql:85, 168 | ✅ 식 일치 (C3·B4 드리프트만 유의) |

### 1-D. demoMark 엔진 (demoSwap / demoStats — DEMO 전용)

| # | 항목 | 터미널 | 기준 | 판정 |
|---|------|--------|------|------|
| D1 | 스왑 레이트 표 | `SWAP_PIPS` 10개 페어 [롱,숏] fx-terminal.html:1452-1453 | fx_swap.sql:16-21 — **값 전부 동일** (기본값 -0.5/-0.3도 :1466 ↔ fx_swap.sql:14-15) | ✅ 락스텝 |
| D2 | 롤오버 규칙 | 21:00 UTC 롤·FX 월~금만·수요일 3배 `swapNights` fx-terminal.html:1454-1461 | fx_swap.sql:27-32 (크론 21:05 UTC :57-59, 주말 skip·수 3배) | ✅ 일치 |
| D3 | 야간 적립액 | `nights*lots*rate*pip*100000*qUsd` fx-terminal.html:1462-1469 | fx_swap.sql:44 `v_mult*size*rate*pip*100000*qusd` | ✅ 일치 |
| D4 | **크립토/주식 데모 스왑 창작** | `-notional*(롱 0.03%·숏 0.01%)/夜, 매일` fx-terminal.html:1470-1471 | 서버는 **FX(cls='FX')만** 적립 fx_swap.sql:33-35 | **[🟡표시 차이]** DEMO 한정이지만 서버에 없는 요율 발명 — 라이브 전 제거 또는 서버 확장으로 통일 |
| D5 | demoMarkAll P/L | JPY 0.0067 하드코딩 fx-terminal.html:1472-1476 | B2와 동일 결함 | B2에 귀속 |
| D6 | demoStats | bal 100000 고정·equity=bal+float+swap·lev FX500/기타5 fx-terminal.html:1477-1486 | MT5 관례 | ✅ (DEMO 명시) |

### 1-E. 시세 피드·실봉

| # | 항목 | 터미널 | 기준 | 판정 |
|---|------|--------|------|------|
| E1 | **오프워치 심볼 시세 폐기** | `mapRows: if(!MW_WATCH.includes(mw)) return` fx-terminal.html:1990-1994 — 22심볼 외 전부 버림 | webtrade는 "keep EVERY priced symbol … so positions on off-watch symbols still get a live price + P&L" webtrade.html:1000-1002 | **[🔴돈 위험(표시)]** XAUUSD·EURGBP·SPACEX·인덱스 등 **서버에 실존 가능한 포지션**(fx_specs 80+심볼, fx_close.sql:20-38)이 터미널에선 cur '—'·P/L 0.00으로 동결 → Equity/Free/Level 오표시. webtrade가 이 함정을 이미 밟고 고친 지점 — 재구축이 되밟는 부분 복제 |
| E2 | WS 우선 게이트 | WS 신선(<10s) 심볼에 3s 크론 양보 fx-terminal.html:1993 | webtrade.html:1003-1007 동일 | ✅ |
| E3 | 크립토 WS 스프레드 단위 | bookTicker→bps 환산 fx-terminal.html:2009 | crypto-prices bps 관례(webtrade.html:922-925 주석) | ✅ |
| E4 | FX 실봉 | `fx-prices?candles=SYM&tf=..&n=1000` fx-terminal.html:910-913 | fx-prices/index.ts:52-100 (공개 캔들 모드) | ✅ |
| E5 | 주식 봉 | 합성 유지(명시) fx-terminal.html:896-898, 914 | webtrade도 합성 폴백(CLAUDE.md 📌 잔여) | ✅ 기존 한계 동일 — 정직 표기는 없음 [🟡] |
| E6 | 신선도 배지 | LIVE<15s·STALE 동결(가짜 흔들기 없음) fx-terminal.html:2014-2027 | 서버 거래잠금 120s fx_open_slippage.sql:53-57 · fx_close.sql:79-83 | ✅ 표시 계층 정직 · 120s 거래잠금은 M4 항목(§2-6) |

---

## 2) M4(실주문)·M5(실청산/수정) 진입 전 필수 목록

서버에 이미 배포된 계약(시그니처)과 터미널 현재 상태의 갭:

1. **fx_open 시그니처** — 최종본은 7-인자 단일 함수(구 4/5-인자 overload는 **drop됨**): `fx_open(p_local_id, p_symbol, p_side, p_size, p_leverage=null, p_requested_price=null, p_max_slippage=null)` fx_open_slippage.sql:22-30. 터미널엔 호출부가 없음. webtrade 호출 패턴(구 시그니처 폴백 포함) = webtrade.html:1442-1461.
2. **멱등 local_id 생성** — 터미널 `newTicket()`은 인메모리 순번 3200001…(fx-terminal.html:1388) → 기기/유저 간 충돌·재시도 멱등성 없음. webtrade 패턴 `'wt-'+Date.now()+'-'+rand` webtrade.html:1429 채택 필수(서버 멱등 키 = (acct_no, local_id), fx_open_slippage.sql:72-77).
3. **스프레드 온필 표시 락스텝** — 서버는 FX 체결 시 `mid±half(spr+markup)`로 필(fx_open_slippage.sql:59-67). 터미널 주문창/원클릭이 보여주는 bid/ask는 markup 미포함(§1-A2) → 표시가와 체결가 불일치. `pricing_marks` 로드(webtrade.html:1037-1038) 이식 후에만 M4 허용.
4. **슬리피지 가드 전달** — `p_requested_price`(클릭 시점 BUY=ask/SELL=bid) + `p_max_slippage`(webtrade 기본 15핍, `SLIP_PIPS` webtrade.html:963-965). 미전달 시 스파이크 필 무방비(서버는 null=기능 off, fx_open_slippage.sql:83-90).
5. **세션(주말) 거래 차단** — ⚠ `fx_open_session.sql`은 헬퍼 함수 + **배선 안내 주석**뿐, 배포된 fx_open(fx_open_slippage.sql 전문)에 `fx_market_open` 호출이 **없음**(fx_open_session.sql:56-63). 즉 서버 세션 게이트는 현재 미가동 — 클라 `marketOpen()` 미러(webtrade.html:936-962, US 휴장일 :943-944)를 터미널에 이식하고, 서버 배선도 함께 요청해야 함(클라 게이트만으론 CLAUDE.md #5 위반).
6. **120초 신선도 거래잠금** — 서버가 stale>120s면 거절(fx_open_slippage.sql:55-57)하지만, 터미널은 STALE/SIM 상태에서도 주문 UI가 활성(placeMarketDemo는 가격만 있으면 체결, fx-terminal.html:1509). M4에선 SIM·STALE 상태에서 주문 버튼 잠금 필요. **특히 SIM 가격으로 실주문 요청이 나가면 안 됨.**
7. **fx_close** — `fx_close(p_local_id)` 단일 인자(fx_close.sql:41), 반환 `{ok,pnl,close,…}`·`duplicate`·`ALREADY_CLOSED` 처리(fx_close.sql:69, 148). 성공 후 `loadPos()+loadAcct()` 재조회(webtrade.html:1471-1475). **부분청산 RPC는 서버에 존재하지 않음**(fx_close는 행 전체 청산) — 터미널이 부분청산 UI를 만들면 서버 계약 위반.
8. **fx_modify** — `fx_modify(p_local_id, p_sl, p_tp)` + 방향 검증(SL/TP wrong side 거절, fx_modify.sql:11-40) · 집행은 `fx_sltp` 1분 크론(mid 교차 판정, fx_modify.sql:47-96). 터미널 Modify 다이얼로그는 DEMO 전용(fx-terminal.html:1589-1616)이고 LIVE 행은 noClose·읽기전용(:1646-1648, 2070) — M5에서 fx_modify로 배선.
9. **대기주문** — 서버는 `fx_pending` **저장 테이블만**(RLS+Realtime) 존재, 체결 엔진 없음 — "fill is still client-side via fx_open" fx_pending.sql:5-8, otype은 `'LIMIT'|'STOP'` 뿐 fx_pending.sql:21. 터미널 DEMO_PEND는 인메모리·체결 시뮬 없음(fx-terminal.html:1386-1387)이며 **Stop Limit 2종**(PEND_TYPES, fx-terminal.html:1527)은 서버 스키마에 없는 타입 → M4에서 제거하거나 스키마 확장.
10. **스탑아웃 UX** — fx_stopout 30%·1분 크론(fx_stopout.sql:85, 168)이 강제청산하면 settlements detail 'STOPOUT…' — webtrade는 Realtime으로 잡아 효과음+재조회(webtrade.html:1145-1151). 터미널도 동일 감지 필요(현재 positions 채널 재조회만, fx-terminal.html:2080).
11. **실이력(History) 서버 소스** — settlements `kind='fx_close'` 페이지드 쿼리(webtrade.html:1113-1138). 터미널 History는 LIVE에서도 DEMO_HIST를 보여줌(§3-2) — M4 전 교체 필수.
12. **로그인/사인아웃 진입** — 터미널 아바타는 장식(클릭 핸들러 없음, fx-terminal.html:484) → 로그인 경로 없음. webtrade는 `login.html?skin=wt` 라운드트립(webtrade.html:3382). `AlpexaSync.assertIdentity()`(alpexa-sync.js:288-306)도 터미널 미호출.

---

## 3) '라이브로 써도 되나' 판정 — 현 상태(조회 전용 + DEMO 주문) 공개 위험

**결론: 현 상태 그대로 실고객 공개는 부적합.** 돈 이동은 0이라 자금 사고는 구조적으로 불가능하지만, 아래 혼동·정직성 결함이 "규제 브로커가 이렇게 하나?" 관문에서 빨강.

| # | 위험 | 현재 방어 | 근거 | 판정 |
|---|------|-----------|------|------|
| R1 | **DEMO 주문을 실주문으로 착각** — 로그인(LIVE) 상태에서도 차트 원클릭 바·MW Trading 탭·F9 티켓 전부 DEMO_POS에 체결(placeMarketDemo, fx-terminal.html:1087-1092, 1509-1515, 1946) | 부분 방어: 티켓 배지 "DEMO · simulated order"(:1562), 토스트 "(DEMO)"(:1514), MW Trading 바 "DEMO · One-Click"(:1315). **그러나 차트 원클릭 바(SELL/BUY, :932-937)엔 DEMO 표기 전무** | 게다가 LIVE일 땐 Trade 탭·차트 라인이 fxAcct.rows()만 그림(:1643-1644, :1000) → **로그인 고객의 데모 체결이 목록에서 즉시 실종** — "주문이 사라졌다" 민원 직행 | 🔴 |
| R2 | **가짜 History** — History 탭이 LIVE 여부 무관 DEMO_HIST(조작된 손익 2건 시드 + 데모 청산 로그)를 표시 | 없음 (LIVE 분기 자체가 없음) | fx-terminal.html:1390-1392(시드), 1706-1723(렌더 — fxAcct 분기 없음) ↔ webtrade는 settlements 실이력(webtrade.html:1124-1130) | 🔴 |
| R3 | **SIM 시세 무표기** — 실피드를 한 번도 못 받으면 랜덤워크 시세를 표시하는데 배지 없음(state 'sim'이면 배지 숨김) + 주말·장외에도 FX/주식이 계속 흔들림(webtrade는 폐장 동결) | 실피드 연결 시 LIVE/STALE 정직 배지(:2014-2020)·STALE 동결(:2024-2027)은 우수. SIM 무표기는 의도적 제거("SIM/LIVE 배지 제거(사장님 요청)" :1929) | fx-terminal.html:2018-2019(sim→배지 숨김), 1238-1239(mwSimulate — marketOpen 게이트 없음) ↔ webtrade.html:1021-1025(폐장 심볼 동결) | 🔴(공개 시)/현 dev 🟡 |
| R4 | **실계좌 수치 자체가 어긋남** — §1 B2(JPY/CHF/CAD 환산)·B4(swap 미포함 equity)·E1(오프워치 포지션 P/L 0)·A2(markup) | 없음 (표시 로직 자체의 결함) | 위 §1 각 행 | 🔴 |
| R5 | **LIVE Exposure 오계산** — Exposure 탭이 전 클래스에 `FX_CONTRACT`(100k) 적용 + `pair.slice(0,3)/(3,6)` 통화 분해를 주식(AAPL→'AAP'/'L')에도 적용 | 없음 | fx-terminal.html:1676-1680 (FX_CONTRACT :1411) ↔ 서버 계약크기 fx_notional_usd(비FX=1) fx_open_margin.sql:44-46 | 🟡 (FX 전용 포지션이면 정상) |
| R6 | **유령세션/신원** — 세션 게이트는 `getSession()` 실존 + `acctFor('fx')` AND 조건(:2037-2041) · alpexa.me 부재 시 acctFor가 랜덤 계좌번호를 생성(alpexa-sync.js:41-51)해도 쿼리 0행→authed=false로 fail-closed · **단** stale alpexa.me(이전 사용자 태그)일 때 타 계좌번호로 조회 시도 — RLS가 최종 방어이나 터미널은 `assertIdentity()` 미호출(웹trade와 달리 교차 검증 없음, alpexa-sync.js:288-306) | 부분 방어(fail-closed + 5s 폴 재판정 :2075-2077, 하이드레이션 레이스 자가치유 :2076) | fx-terminal.html:2036-2041 | 🟡 |
| R7 | **아이들 로그아웃 404** — alpexa-sync.js가 자동 시작(alpexa-sync.js:385)한 15분 아이들 로그아웃이 상대경로 `login.html?switch=1&idle=1`로 이동(alpexa-sync.js:336) → 터미널은 `/dev/`에 있으므로 **`/dev/login.html`(존재하지 않음, glob 0건) 404**. 사인아웃 자체는 선행되므로 세션 누출은 없음(:330-335) | 세션 정리는 됨, 랜딩만 깨짐 | alpexa-sync.js:315-336, 385 | 🟡 |
| R8 | **잔고 노출 범위** — 잔고/포지션은 서버 조회 표시 전용, localStorage에 돈 저장 없음(레이아웃·알림·테마·언어만: LKEY :526, AL_KEY :1401, FX_TKEY :2163, mwcols :1251) · Realtime 채널은 무필터 구독이나 RLS 하 페이로드 수신(webtrade 동일 패턴 :2079-2080 ↔ webtrade.html:1143-1144) | ✅ CLAUDE.md #5 준수 | fx-terminal.html:2045-2048 | ✅ |
| R9 | **데모 브랜딩이 LIVE에 잔존** — Navigator 'Accounts: 3172308 — Alpexa-Demo'(:1356), Journal 'Alpexa-Demo 3172308'(:1397), Mailbox 데모 계좌 개설 안내(:1438-1446)가 로그인 후에도 그대로 | 없음 | fx-terminal.html 해당 행 | 🟡 |

### 공개 전 최소 조건(권고 순서)
1. R1: LIVE 상태에서는 모든 주문 진입점 비활성(또는 "M4 준비 중" 잠금) — 데모 주문은 비로그인 한정.
2. R2: History LIVE 분기(settlements) 또는 탭 잠금.
3. R3: SIM 배지 복원 + mwSimulate에 marketOpen 동결 이식.
4. §1 B2·B4·E1·A2: webtrade와 **양쪽 동시** 수정(단독 수정 금지 — 플로팅≠실현 락스텝 규칙) + `tests/fx-floating-spread.test.js` 확장으로 핀.

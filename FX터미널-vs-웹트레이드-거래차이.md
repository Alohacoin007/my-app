# FX 터미널(dev/fx-terminal.html) vs 웹트레이드(webtrade.html) — 돈·거래 기능 전수 대조

> 2026-07-22 코드 레벨 정밀 대조. 모든 항목 file:line 근거. 코드 수정 0 (분석 전용).
> 판정 기호: ✅동일 · ⚠️부분(내용 명시) · ❌터미널에 없음 · ➕터미널에만 있음
> 서버 계약 참조: `supabase/sql/fx_open_slippage.sql`(현행 fx_open 통합본), `fx_open_margin.sql`, `fx_close.sql`, `fx_modify.sql`, `fx_open_session.sql`(DRAFT), `fx_swap.sql`

---

## 1. 주문

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| 시장가 원클릭 (진입점) | OrderBox 원클릭 패널 — webtrade.html:1505-1550 (send→eng.placeOrder 1539) | 차트 상단 ocbar SELL/BUY — fx-terminal.html:1116-1121 (LIVE=fxPlaceReal / 미로그인=placeMarketDemo) | ✅경로 존재 |
| 원클릭 사전 게이트 | marketOpen 거절 1529 · free-margin 거절 1531 · busyRef 이중발사 차단 1532 | 게이트 전무 — 1116-1121 바로 RPC. 세션·마진·디바운스 0 | ❌ (서버 게이트에만 의존) |
| MarketWatch Trading 탭 원클릭 | 없음 (MW는 시세만, 클릭=차트 심볼 교체 webtrade.html:2260) | 있음 — 단 **로그인 상태에서도 항상 데모 체결** fx-terminal.html:2040 (`placeMarketDemo` 고정, 1353-1363 "체결은 없음(DEMO)") | ⚠️ LIVE인데 데모로 빠짐(혼동 위험) |
| New Order 다이얼로그 | OrderModal(F9 3505) webtrade.html:3227-3320 — 심볼 셀렉트 3333, Bid/Ask/스프레드 3335-3339, SL/TP 입력 3230-3231 | openOrderDialog fx-terminal.html:1589-1657 — 심볼/Bid/Ask/spr 1626-1629, Volume/SL/TP 1630-1636, LIVE·DEMO 배지 1622-1624 | ✅구조 동일 |
| 볼륨/가격 홀드 연타 | 볼륨 가속 홀드 3262-3268 · SL/TP 피펫 스텝 홀드 3276-3285 · 원클릭 lot 홀드 1553-1557 | bindHoldRepeat 공용(320ms 후 55ms, 20틱 초과 ×10) 1559-1567, 주문창 1600, ocbar 1123-1125 | ✅ (구현 방식만 다름) |
| 주문 전 마진 미리보기 | eng.marginFor/canAfford 표시+게이트 3288-3289, maxVolume 1434-1435 | 없음 — 주문창에 필요 마진/최대 랏 표시 없음 | ❌ |
| 대기주문 (limit/stop) UI | **없음** (webtrade 전체에 pending/limit/stop 주문 UI 0건 — grep 무일치) | 있음 — PEND_TYPES 6종 1587, placePendingDemo 1576-1582(인메모리 DEMO), Trade탭 Pending 섹션 1746-1752, 취소 1583-1585 | ➕ (데모 한정) |
| 대기주문 LIVE 정직 거절 | 해당 없음 | LIVE면 "Pending orders … market orders only for now" 토스트로 거절 1655 — 서버 fx_pending 미배선 상태를 정직 표기 | ➕ 정직 거절 OK |
| 슬리피지 가드 전달 | p_requested_price/p_max_slippage 전달 1457-1460 (요청가=보고 있던 호가 1534/3296, maxSlip=SLIP_PIPS×pip 965·1535·3297) → 서버 검증 fx_open_slippage.sql:83-88 | **p_requested_price:null, p_max_slippage:null 고정** 2198 → 서버 가드 완전 우회(83행 조건 불충족) | ❌ |
| 레버리지 전달 | p_leverage=eng.leverage 전달 1458 (사용자 선택 LEVERAGES 10/50/100/500 1382, tradeSettings 1386-1392, 클라 클램프 1357·1413-1415, 서버 클램프 fx_open_slippage.sql:95) | **p_leverage:null 고정** 2198 → 서버가 하우스 캡 500 적용(fx_open_slippage.sql:95, fx_lev_cap=fx_open_margin.sql:57-61). 레버리지 선택 UI 없음 | ⚠️ (항상 최대 500:1로 개설, 보수적 선택 불가) |
| 구 시그니처 폴백 | PGRST202 감지 → 구 fx_open 재시도 1462-1463 | 동일 패턴 2199-2200 | ✅ |
| 멱등 local_id | 'wt-'+ts+rand 1441 | 'fxt-'+ts+rand 2195 | ✅ |

## 2. SL/TP

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| 주문 시 SL/TP → 서버 | 체결 성공 후 **반환된 r.local_id로** fx_modify 3302-3305 (결정적), 거절 시 소리+알림+Journal 3307-3313 | 체결 후 900ms 대기 → **updated_at 최신 포지션 추정**으로 fxModifyReal 1649-1651 (fxPlaceReal이 local_id 미반환 2194-2209) | ⚠️ **레이스**: 동시/연속 주문 시 엉뚱한 포지션에 SL/TP 부착 가능 |
| Modify 다이얼로그 | S/L·T/P 셀 더블클릭 → ModifyPos 2833-2834, 저장=fx_modify 2693-2694, 미배포 감지 문구 2696 | S/L·T/P 셀 클릭 data-rmod → openModifyDemo(isReal) 1666-1693·2265, 저장=fxModifyReal 1679·2221-2229 | ✅ |
| 차트 드래그 SL/TP | **없음** — 차트엔 진입가 createPriceLine만 2127-2137 (드래그·SL/TP 라인 없음) | 있음 — 트레이드 레벨 라인(진입 실선+SL 보라+TP 파랑) 1008-1029, 라인 히트→드래그 1135-1136·1149, 커밋=fxModifyReal(실포지션) 1696-1704, Esc 취소 2356 | ➕ (LIVE 포함 실동작) |
| wrong-side 검증 | 서버 fx_modify.sql:27-33 단일 진실. 클라는 거절 사유 표시 2695-2699 | 동일 서버 의존, 거절 토스트 2227-2228 | ✅ (서버 한 곳) |
| 저장 후 재조회 | positionsStore.loadPos 2701·3311 | fxAcct.load 2226 | ✅ |
| SL/TP 실발동(서버) | fx_sltp 크론 스위프 fx_modify.sql:47-96 (양쪽 공통 수혜) | 동일 | ✅ |
| demoSltpSweep (로컬 데모 스위프) | 없음 | **터미널 전용** — fx-terminal.html:1519-1536, 매초 demoMarkAll 뒤 실행 1518·2291. 서버 무접촉·인메모리 데모만 청산(BUY=bid, SELL=ask 판정 1527-1528) | ➕ (돈 0, 실계좌 무영향 확인) |

## 3. 청산

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| fx_close 배선 | closeOrder → rpc('fx_close',{p_local_id}) 1483, 성공 시 loadPos+loadAcct+sndClose 1485 | fxCloseReal → 동일 rpc 2212, 성공 시 Journal+toast+fxAcct.load 2214-2217 | ✅ |
| 원클릭 ✕ | 포지션 행 ✕ → closePos 2836·2751-2758 (실패 알림 2756) | 행 ✕ data-rclose → fxCloseReal 1742·2263 | ✅ |
| 부분 청산 | 없음 — p_local_id 전량 청산만 1483 (fx_close.sql 시그니처에 사이즈 인자 없음) | 없음 — 동일 2212 | ✅ (둘 다 미지원, 서버 계약 일치) |
| 청산 사운드/피드백 | sndClose/sndError 1481·1485·1488 + Journal 1486 | 사운드 없음, toast+Journal만 2215-2219 | ⚠️ (8절 참조) |
| 데모 행 청산 | removeDemo(서버 무접촉) 2753 | closePosDemo(인메모리) 1548-1553 | ✅ 개념 동일 |

## 4. 계좌 표시 (Balance/Equity/Margin/Free/Level)

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| Equity 식 | balance+floating 1430·2764 | bal+floating 2165-2166 (acctSpans 1718-1722) | ✅ |
| 플로팅 P&L | positionPnL 1376-1381: dir×(closePx−open)×lots×contractSize×quoteUsd. BUY→bid/SELL→ask 1363 | fxAcct.pnl 2149-2151: 동일식, closePx 2147-2148 (BUY→bid/SELL→ask), FX_CONTRACT_OF 2128 | ✅ 락스텝 |
| quote→USD 환산 | quoteUsd 1366-1375 (USD-base=1/cur, 크로스=실환율, 없으면 0) | fxQuoteUsd 1509-1512 동일(주석에 락스텝 명기) | ✅ |
| **스프레드 half (체결·표시가)** | halfPx 929-931: FX=max(0.1, spr+**markup**)×pip/2, 비FX=bps 플로어 928 · markup은 pricing_marks 로드 1037-1038 (서버 fx_close.sql:91·98과 완전 락스텝) | mwHalf 1255-1256: FX=max(0.1, spr)×pip/2 — **markup_pts 미가산**, pricing_marks 로드 없음 (grep 무일치) | ⚠️🔴 **markup>0인 심볼은 터미널 bid/ask·플로팅 ≠ 서버 실현** (부분 복제 클래스) |
| 마진 공식 | requiredMargin 1413-1415: vol×contract×baseUsd/**사용자 레버리지**(캡 클램프) · usedMargin 1431·2765 | margin 2157: size×contract×baseUsd/**FX_LEVCAP 고정 500**(FX_LEV_TERM 1487, FX_LEVCAP_OF 2129) | ⚠️ 기준 다름 — 서버 used margin은 fx_lev_cap 기준(fx_open_margin.sql:129-131)이라 **터미널이 서버와 일치**, webtrade는 사용자 레버리지 표시라 서버 수치와 어긋날 수 있음 |
| 마진콜/스탑아웃 경고 표시 | Level<100% ⚠ Margin Call · <30% ⛔ Stop Out 뱃지 2854-2856 | 없음 — Level 숫자만 1716-1722 | ❌ |
| 스왑 | 표시·계산 전무 (grep Swap 무일치) — 플로팅에 미포함 | Swap 컬럼 표시: 실포지션 meta.swap 2163, 데모는 MT5식 시뮬(수요일 3배 등) 1488-1507. 단 stats() equity에는 미가산 2165-2166 | ➕표시는 터미널 우위 · 공통 갭: 서버 fx_close는 meta.swap을 실현손익에 포함(fx_close.sql:140-142)하는데 **양쪽 다 플로팅에 스왑 미반영** |
| 1s 재마킹 | priceStore.subscribe throttle(RENDER_MS) 1424·2749 | 1초 setInterval → demoMarkAll+Trade/Exposure 재렌더 2290-2295 | ✅ |
| 데모 잔고 | WT_DEMO=false 1094 (데모 시드 미사용) | 데모 bal=100000 하드코드 1538 (미로그인 전용) | ✅ 실계좌 영향 0 |

## 5. 히스토리 (settlements)

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| 쿼리 | _histQ: settlements, server='fx', acct_no=acctFor('fx'), kind='fx_close', 최신순 1124-1125 | loadHist: 동일 필터 2171-2172 | ✅ 필터 락스텝 |
| 페이지네이션 | 50 첫 청크 + 스크롤 +20 (loadHistory/loadMoreHistory 1126-1138, useVirtual 2782) | range(0,99) 1회 고정 2172, 추가 로드 없음 | ⚠️ 100건 초과 이력 잘림 |
| 재조회 트리거 | settlements INSERT Realtime → loadHistory 자동 1147-1151 | History 탭 첫 진입 시 1회만(histLoaded 게이트) 1799·2179 — Realtime/재갱신 없음 | ❌ 타 기기 청산·스탑아웃이 이력에 자동 반영 안 됨 |
| detail 파싱 | _mapSettle: BUY/SELL·@open->close 정규식 1118-1123 | 동일 정규식 2173-2178 | ✅ |
| 기간 필터 | All/Today/Week/Month/**Custom(날짜 범위)** 2771-2780·2797-2806 | all/today/week/month 1801-1807 — custom 없음 | ⚠️ |
| 합계 표시 | Deals+P/L tfoot 2841-2846 | Deals+Profit tfoot 1813-1814 | ✅ |

## 6. 세션/신원 가드

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| 유령세션 게이트 | getSession 실확인 후에만 게이트 해제 3488-3493 (AlpexaSync.me 불신 주석 3484-3486) | fxAcct.session: getSession 실존 + acctFor('fx') 태그 둘 다 요구 2131-2135, 하이드레이션 레이스 자가치유 2184 | ✅ |
| 로그인 진입 | LoginGate 오버레이 → login.html?skin=wt 3409-3421 | 게이트 없음(미로그인=데모 연습 모드), 아바타 클릭 → dest2='fx-terminal' 후 ../login.html 2233-2236 | ⚠️ 설계 차이(터미널은 데모 우선) |
| 로그아웃 | wtLogout: signOut + alpexa.me 등 키 제거 + fx.html 이탈 3402-3408 | **로그아웃 UI 없음** — 아바타는 로그인 상태면 계좌번호 토스트만 2234 | ❌ |
| 로그아웃 시 상태 | 세션 소멸 → 게이트 재표시(3488-3493) | fxAcct.load가 세션 소실 감지 시 authed=false·pos 비움 2136-2137 (표시 강등은 됨) | ⚠️ |
| **marketOpen 주문 게이트** | 클라 세션 캘린더 945-962, 원클릭 1526-1529·주문창 3292-3294에서 RPC 전 거절 | **주문 경로에 없음** — fxWeekendClosed는 SIM 동결 전용 1274-1279. submitOrder/fxPlaceReal/ocbar에 세션 체크 0 | ❌🔴 |
| 서버측 세션 게이트 | fx_open_session.sql은 **DRAFT·미통합**(fx_open_session.sql:1 "⚠ DRAFT", 57-60은 통합 '예시 주석') · 서버 실가드는 120s 신선도뿐(fx_open_slippage.sql:53-57)인데 webtrade.html:937 주석대로 prices.updated_at은 **주말에도 재스탬프** → 신선도 게이트가 주말을 못 막음 | 동일 서버 | → 터미널은 주말 FX 체결이 **뚫릴 수 있음** (webtrade는 클라 게이트가 막음) |
| 데모/실 분리 | WT_DEMO=false 1094, 데모 체결 경로 폐쇄 1542-1544 | 미로그인=인메모리 데모(서버 접촉 0, 불변식 주석 2191-2193), LIVE 시 데모 대기주문 미표시 1746-1748. 단 MW Trading 탭은 LIVE에도 데모 체결 2040 | ⚠️ (1절 참조) |

## 7. 실시간 (피드·포지션)

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| 피드 파이프 | priceStore: feed Edge(1s 캐시) → prices 직쿼리 폴백 968-977, Realtime 1039-1044, Binance WS(10s 양보 게이트) 1003-1007 | fxFeed: feed Edge 우선 2091-2092 → prices 폴백 2093, 3s 폴 2114, Realtime 2095-2097, Binance WS+10s 양보 2087·2098-2107, 30s WS 워치독 2119-2121 | ✅ 구조 락스텝 (폴 주기 1s vs 3s ⚠️경미) |
| spr 단위 처리 | 클래스별 단위(FX pip·크립토 bps·주식 0) → halfPx 변환 908-931·1008-1013 | 동일 규약 mwStore.apply 1270-1273 + mwHalf 1255-1256 — 단 markup 누락(4절) | ⚠️ markup만 |
| 신선도 표시 | live 플래그(폴 실패 시 시뮬) 1031 | LIVE/STALE(15s)/SIM 정직 뱃지 2108-2113 | ➕ 뱃지는 터미널 우위 |
| 신선도 거래잠금(클라) | 없음(서버 120s stale 거절 의존, fx_open_slippage.sql:55-56) | 없음(동일) | ✅ 동일(둘 다 서버 의존) |
| 포지션/계좌 Realtime | ch1 accounts·ch2 positions 1143-1144 | ch1/ch2 동일 2186-2189 + 5s 폴백 폴 2185 | ✅ |
| settlements Realtime | ch3: STOPOUT 감지→sndStopout+재조회, 모든 INSERT→히스토리 갱신 1145-1151 | **없음** | ❌ 스탑아웃 강제청산 무통보(포지션 소실은 ch2/5s폴로 반영되나 이유·소리·이력 갱신 없음) |

## 8. 사운드/알림

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| 체결/거절/청산/스탑아웃/로그인 음 | playSnd 820 — sndOpen 1446·1466, sndError 1447·1469·1488·1529·1531, sndClose 1481·1485·2753, sndStopout 1149, sndLogin 3479 | **사운드 전무** (snd/Audio grep 무일치) | ❌ |
| 토스트/Journal 대칭 | Journal 성공/거절 모두 기록 1467·1471·1486 | JOURNAL 성공/거절 모두 기록 2203-2208·2215·2225-2228 + toast | ✅ 기록 대칭 |
| 가격 알림 | AlertsTab 2791 | alertsStore(1회 발화+Journal) 1436-1445·1819-1834 | ✅ 양쪽 존재 |

## 9. 기타 돈 관문

| 항목 | webtrade | fx-terminal | 판정 |
|---|---|---|---|
| 체결가 서버 권위 | placeOrder는 호출만, 가격/포지션/잔고 미결정 1436-1438 | 불변식 명문화: "터미널은 체결가·손익·잔고를 절대 정하지 않는다" 2191-2193 | ✅ |
| 클라 ledger 접근 | 0 (grep 'ledger' = 주석 5건뿐, insert/select 없음 1095·1454·1475·1543·3211) | 0 (grep 무일치) | ✅ |
| accounts/balance 쓰기 | select만 1107 | select만 2140 | ✅ |
| localStorage 돈 저장 | 없음 — 레버리지/레이아웃 등 UI만 1384-1400 | 없음 — alerts/컬럼/독 높이/테마 등 UI만 1291-1294·1437-1439·2248·2325 | ✅ (#5 준수) |
| 멱등/이중발사 | busyRef 디바운스 1532 + local_id 멱등 1441 | local_id 멱등 2195만 — 클라 디바운스 없음(ocbar 연타=별개 local_id 다중 주문 가능 1116-1121) | ⚠️ |
| 테스트 커버 | tests/fx-floating-spread.test.js(트레이딩앱 대상), verify 게이트 | tests/fx-terminal-trade.test.js·-account·-demo-sltp·-live-feed 등 8종 존재 | ✅ 존재(락스텝 검증 범위는 별도 확인 필요) |

---

## 🔴 터미널이 라이브 승격 전 반드시 메워야 할 것 — 우선순위 톱5

1. **FX 스프레드에 markup_pts 가산 (플로팅≠실현 방지)** — mwHalf(fx-terminal.html:1255-1256)가 `max(0.1, spr)×pip/2`로 markup을 빼먹음. 서버 fx_close는 `greatest(0.1, spr+markup)×pip/2`(fx_close.sql:91·98), webtrade는 pricing_marks 로드(1037-1038)+halfPx(929-931)로 락스텝. markup>0인 순간 터미널의 bid/ask·플로팅·차트 트레이드라인 전부 서버 실현과 어긋남 — CLAUDE.md "한쪽만 고치면 플로팅이 실현과 어긋난다" 그 클래스.
2. **marketOpen 주문 게이트** — 터미널 주문 3경로(ocbar 1116-1121, submitOrder 1643-1657, MW Trading 2040) 전부 세션 체크 0. 서버 세션 게이트는 DRAFT 미배선(fx_open_session.sql:1)이고 120s 신선도 게이트는 주말 재스탬프(webtrade.html:937 실측 주석) 때문에 못 막음 → **주말 동결가 체결 구멍**. webtrade 945-962·1529·3294 미러 이식이 최소 방어(궁극은 서버 게이트 배포).
3. **슬리피지 가드·레버리지 전달** — fxPlaceReal이 p_requested_price/p_max_slippage/p_leverage 전부 null(2198) → fx_open_slippage.sql:83-88 가드 완전 우회, 급변동 틱에 요청가 보호 없음. webtrade 1457-1460·1534-1535 방식(보고 있던 호가+SLIP_PIPS) 그대로 이식.
4. **주문시 SL/TP 부착 레이스 제거** — 900ms 후 "최신 포지션 추정"으로 fx_modify(1649-1651)는 동시 주문 시 오부착 위험. fxPlaceReal이 d(서버 응답)의 local_id를 반환하게 하고 webtrade 3303-3305처럼 **반환된 local_id로 직접** fx_modify. 겸사겸사 ocbar 디바운스(webtrade busyRef 1532 미러)와 free-margin 사전 게이트(1531/3295 미러)도.
5. **스탑아웃/정산 이벤트 배선 + 히스토리 갱신** — settlements INSERT Realtime 채널(webtrade 1147-1151) 부재로 ① fx_stopout 강제청산 무통보 ② History가 첫 로드 후 영구 stale(1799 histLoaded 1회 게이트, 100건 캡 2172). 채널 추가 + loadHist 재조회 + (선택) 체결/에러 사운드(webtrade 820·1446 세트)로 MT5 피드백 대칭 복원.

### 부기 (톱5 밖, 승격 시 결정 필요)
- 마진 표시 기준 불일치: webtrade=사용자 레버리지(1431), 터미널=캡 500 고정(2157). **서버 used margin은 캡 기준**(fx_open_margin.sql:129-131)이라 서버 일치 쪽은 터미널 — 어느 쪽을 표준으로 할지 한 번에 정해 양쪽 통일할 것.
- MW Trading 탭이 LIVE에서도 데모 체결(2040) — LIVE 화면에 안 보이는 유령 연습 체결 생성. LIVE면 fxPlaceReal로 라우팅하거나 탭에 DEMO 잠금 표시.
- LIVE 툴팁 문구 "execution lands in M5"(1719)는 M4 실체결 배선(2191-2229) 이후 낡은 표기 — 정직 표기 갱신.
- 스왑 공통 갭(양쪽): 서버 실현은 meta.swap 포함(fx_close.sql:140-142)인데 두 클라 모두 플로팅에 스왑 미가산(webtrade positionPnL 1376-1381 / 터미널 stats 2165-2166) — 터미널만의 결함은 아니나 플로팅≠실현의 잔여 원천.
- 히스토리 custom 날짜 필터(webtrade 2777-2806) 및 페이지네이션(1126-1138) 미이식 — 표시 기능 갭.

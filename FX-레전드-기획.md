# FX 레전드 터미널 (dev/fx-terminal.html) — 기획서 v1
> 2026-07-17 · 근거: `FX-플랫폼-문법-스펙.md`(MT5 기능 108종·돈 엔진 계약, file:line)
> 공정 전례: crypto-dashboard.html / sports-dashboard.html (위젯 엔진·fidelity 하네스·돈 이동 시트 검증 완료)

## 0. 한 줄 목표
현행 MT5 플랫폼(webtrade PC + trading 모바일)의 **기능 108종을 100% 이식**한 레전드 기반 FX 터미널 —
크립토·스포츠 대시보드와 같은 토큰(`legend-ui.css --lgd-*`)·같은 위젯 엔진·같은 하네스 규율.

## 1. 무관용 규칙 (작업 방식)
1. **기존 코드 0터치.** webtrade.html·trading.html·fx.html·fx_*.sql·Edge 전부 읽기만. 작업은 `dev/fx-terminal.html` 단일 파일.
2. **완성 후 한 번에 실행.** 사장님 승인 전까지 dev 경로 유지. 라우팅/서버전환 경로는 활성화 때 일괄 갱신.
3. **사장님이 링크로 실시간 확인.** 매 단계 푸시 → `alpexa-sports.com/dev/fx-terminal.html`.
4. **돈 단계는 하네스 통과 후 푸시.** MT5 돈 엔진은 서버 RPC(fx_open/fx_close/fx_modify)만 — 새 돈 경로 0개.

## 2. 돈 불변식 (MT5 무관용 — 스펙 §2 원천)
1. **체결가 = 서버 유일.** 개설 `fx_open`(slippage 통합본)·청산 `fx_close`·수정 `fx_modify` RPC만. 클라 체결가 위조 불가.
2. **스프레드 3곳 락스텝.** 서버 `fx_close` v_half ↔ 터미널 클라 fxHalfSpread/fxClosePx — 한쪽만 고치면 플로팅≠실현(실사고 이력). FX=pip기반, 비FX=bps(크립토10·주식8·지수6).
3. **플로팅 = 실 mid 마크 = 서버 실현.** 시뮬 드리프트 금지. (fx-floating-spread 테스트가 강제 — 재구축도 동일 핀.)
4. **마진/레버리지 캡·contract size** 자산군별 준수(FX10만·레버100 등). 미준수 시 마진·P&L 폭발.
5. **fx_open이 포지션 유일 생성자.** 마진/stale/no-spec 거부 시 클라 개설 금지. pending fill도 fx_open 경유.
6. **이중청산 방지 3중.** 로우락+원자 claim+settlements 전용(ledger 금지). 하나라도 빠지면 이중차감.
7. **세션 가드 3중** 이식(alpexa.me 태그 + 세션 실존 + 게스트 자동생성 금지).

## 3. 위젯 구성 (스펙 §8 매핑 — 11 그룹, 누락 0)
| 위젯 | 담는 MT5 기능 | 데이터 |
|---|---|---|
| W1 Chart(4분할→위젯화) | 차트13(TF·타입·지표·드로잉·크로스헤어·실시간봉) | fx-prices ?candles / 클라 klines |
| W2 Market Watch | 시세13(심볼·bid/ask·스프레드·틱플래시) | prices Realtime + WS |
| W3 Order ticket | 주문(F9·시장/지정/스탑·볼륨·SL/TP) | fx_open (마진·stale 가드) |
| W4 Positions | 포지션(오픈/이력/수정/부분·전량청산) | positions + fx_close/fx_modify |
| W5 Account | equity(현금+Σ플로팅)·마진레벨·잔고 | 서버 전용 |
| W6 Navigator | 심볼트리·지표트리·계정 | 정적/서버 |
| W7 Toolbox | 거래·계좌이력·뉴스 탭 | settlements·activity |
| W8 Pending orders | 지정가/스탑 표시·취소 | fx_pending (PC 미구현 정직표기) |
| W9 Money moves | 입금·출금·이체 진입 | 대시보드 돈 이동 시트 재사용 |
| W10 Depth/One-click | 원클릭 거래·호가 | fx_open |
| Platform Shell | 테마·언어(i18n)·핫키·서버전환·풀스크린·상태바 | 크립토/스포츠 셸 재사용 |

**재사용 지점:** 크립토 대시보드 차트·포지션·자금 위젯 엔진 · 스포츠 렌더격리(map try/catch) · Platform Shell(테마/언어/핫키) · 돈 이동 시트.

## 4. 구현 단계 (관문 = verify 🟢 + 단계별 하네스)
- **M1 셸(기초공사)** — 위젯 엔진 이식 + 레전드 크롬 + 헤더(서버 탭) + 테마 + i18n 스캐폴드 + 11 위젯 프레임(빈 상태). **돈 코드 0.** ← 지금
- **M2** W2 Market Watch + W1 Chart (읽기 전용 — 시세/봉)
- **M3** W5 Account + W4 Positions 표시 (읽기 전용 — 플로팅=실현 계산 이식, 하네스 핀)
- **M4** W3 Order ticket + fx_open (돈 관문 — READ-BEFORE-WRITE 표 승인 후)
- **M5** 청산/수정(fx_close/fx_modify)·부분청산·pending·스탑아웃 표시
- **M6** W9 Money moves + Toolbox 이력 + Navigator/Toolbox
- **M7** 커버리지 감사(108행 diff=0) + `fx-terminal-fidelity.test.js`(스프레드 락스텝·fx_open 유일생성·이중청산 방지 핀) + 헤드리스 E2E 풀셋
- 각 M 완료마다 스크린샷 증거 + 링크. 배포는 마지막 한 번.

## 5. 정직한 사실 처리 (스펙 §7 — 덜 만들면 안 되는 것)
- PC pending 미구현·Channels/Shapes 미구현·Algo 장식·fx_open_session DRAFT 미배포·US휴장일 하드코드·합성 캔들폴백 → 각 "Soon/정직표기" 또는 이식 제외로 명시. 실체결처럼 보이게 금지.

## 6. 리스크·미결
- MT5 차트(lightweight-charts) vs 레전드 캔들 위젯 — 크립토 대시보드 캔들 위젯 재사용 가능성 우선 검토(라이브러리 의존 최소화).
- fx_open_session.sql DRAFT 미배포 — 재구축 M4 전 배포 여부 사용자 결정.

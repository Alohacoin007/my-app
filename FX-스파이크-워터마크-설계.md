# FX 스파이크 워터마크 설계 (v1 제안 — 2026-07-22)

## 문제
SL/TP·대기주문 판정은 `prices` 테이블에 **기록된 틱**(FX ~1초·크립토 ~3초 간격) 기준이다.
기록 사이에 시세가 SL을 스치고 돌아오면(0.5초 스파이크) 발동하지 않는다 — 실브로커(MT5)는
모든 체결가 스트림으로 판정하므로, 뉴스 스파이크 장세에서 우리 판정이 고객에게 유리/불리하게
어긋날 수 있다 (지금은 "판정가=기록가"로 일관되긴 함 — 부정확이 아니라 해상도 한계).

## 설계 (한 줄)
**펌프가 기록 사이의 고저(hi/lo)를 함께 적고, 스위프는 mid 대신 그 창의 hi/lo로 교차를 판정한다.**

### 1) 데이터 — `prices`에 2열 추가
```sql
alter table public.prices add column if not exists tick_hi numeric;   -- 직전 기록 이후 최고 mid
alter table public.prices add column if not exists tick_lo numeric;   -- 직전 기록 이후 최저 mid
```
- fx-stream: WS 프레임은 1초 스로틀로 **버려지던** 것들 — 그 사이 mid의 max/min을 누적해
  다음 upsert에 `tick_hi/tick_lo`로 포함 (쓰기 후 리셋). 코드 ~10줄.
- crypto-price: REST 스냅샷이라 창 내부 데이터가 없음 → `tick_hi = tick_lo = mid`
  (워터마크 무의미 — 크립토 정밀화는 Binance WS 펌프로 승격할 때 같이).
- fx-prices(3s 폴백)도 mid=hi=lo로 기록 — **폴백 창에서는 자동으로 현행과 동일**(안전 저하 없음).

### 2) 판정 — fx_sltp / fx_pending_fill
- BUY SL: `coalesce(tick_lo, mid) <= sl` · BUY TP: `coalesce(tick_hi, mid) >= tp` (SELL 반전).
- 대기주문도 동일하게 hi/lo로 트리거 판정.
- **coalesce 폴백 = 배포 순서 무관** (열 없거나 null이면 정확히 지금 동작).

### 3) 체결가 — 워터마크 히트의 정산 (돈 핵심)
- 현행: 발동 시 **현재 mid**로 정산(fx_realized_pnl). 워터마크 히트인데 mid가 이미 되돌아온 경우
  mid 정산은 고객에게 SL보다 **유리**할 수도(손실 축소) **불리**할 수도 있다.
- MT5 표준: **SL/TP는 레벨 가격으로 체결**(스탑은 레벨-또는-불리, B-Book 관행은 레벨).
- v1 제안: 히트 판정이 워터마크로 난 경우 청산가 = **레벨 가격**(sl/tp 그 값), P&L은
  `fx_realized_pnl`에 청산가 오버라이드 파라미터를 추가해 계산
  (`fx_realized_pnl(sym, side, open, size, p_close_override default null)` — null이면 현행 동일,
  기존 호출부 전부 무변경). 스프레드 half는 레벨가에 이미 반영된 것으로 간주(레벨=고객이 지정한
  체결 희망가). 대기주문 체결가도 동일 원칙(리밋=레벨-또는-유리 → v1은 레벨).

## 불변식
1. 워터마크가 없으면(null/폴백/크립토) 판정·정산 모두 **현행과 자구 동일** — 배포는 안전 저하 0.
2. 히트의 근거가 된 가격(레벨)과 정산가가 일치 — "스쳤다고 판정하고 다른 가격으로 정산" 금지.
3. 워터마크는 **기록 창 하나짜리** — upsert마다 리셋 (오래된 고저가 유령 발동 금지).
4. 멱등·원자 선점·스왑 포함은 기존 그대로 (판정 입력만 바뀜).

## 구현 순서 (승인 후, RED→GREEN)
1. SQL: prices 2열 + fx_realized_pnl 오버라이드 + fx_sltp/fx_pending_fill hi/lo 판정 (한 파일).
2. Edge: fx-stream hi/lo 누적 (~10줄). crypto-price는 mid=hi=lo 1줄.
3. 테스트: ① 미러 — 스파이크 시나리오(창 내 lo<sl<mid) RED(현행 미발동)→GREEN(발동+레벨 정산)
   ② 폴백 불변(“null이면 현행 동일”) ③ 리셋(연속 창 유령 발동 금지) ④ 3경로 스왑 핀 유지.
4. 배포: SQL(사장님) → fx-stream 재배포. 검증: 뉴스 시간대 settlements의 SL 체결가가
   레벨과 일치하는지 + 평시 동작 무변화.

## 트레이드오프 / 비고
- 크립토는 v1에서 정밀화 없음(3s 스냅샷 한계) — Binance WS 서버펌프 승격은 별도 결정.
- prices 테이블 행당 2열 추가 — Realtime 페이로드 소폭 증가(수십 바이트, 무시 가능).
- 히트가 "스침"이었는지 사후 감사 가능: settlements detail에 `~WM` 표기 제안.

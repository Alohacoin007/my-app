# MT5 차트 우클릭(컨텍스트) 메뉴 — 레퍼런스 스펙

> 대상: `dev/fx-terminal.html` FX 레전드 터미널의 **차트 창 위 우클릭 메뉴**를 실제 MT5 데스크톱과 픽셀·행동까지 동일하게.
> 규율: 행동 규범 우선(무엇이 어디 붙고, 클릭하면 뭐가 뜨나). 불확실=[ESTIMATE], 브로커편차=[브로커편차], 프록시 차단=[차단].
> 코드 수정 없음. 이 파일은 도면일 뿐.
>
> **검증 상태:** MetaQuotes 공식 help(charts_manage) 및 튜토리얼 페이지 프록시 **403 [차단]**. 아래는 MT5 데스크톱(build 4000+) 실사용 지식 기반. 단축키 일부는 버전편차 있어 [ESTIMATE] 표기.

---

## 0. 큰 그림 — MT5 차트 우클릭 메뉴의 "정체"

MT5에서 **차트 빈 영역(캔들 위)** 을 우클릭하면 뜨는 메뉴는 **"차트 관리 메뉴"** 다. 이것은 상단 `Charts` 메뉴 + `Insert` 일부 + 트레이딩 진입을 한데 모은 것으로, **차트 타입(Bar/Candle/Line)과 타임프레임(M1..MN)은 여기에 없다** — 그 둘은 **툴바 + 상단 Charts 메뉴 전용**이다. (사장님 지시 리스트에 있던 Bar/Candlestick/Line·Timeframes 서브메뉴는 실제 MT5 우클릭 메뉴엔 없음 → §7 정직한 사실 참조. 우리 터미널이 이미 툴바에 둔 것이 오히려 MT5 배치와 일치.)

우클릭 위치에 따라 메뉴가 **문맥 전환**된다:
- **빈 캔들 영역 우클릭** → 아래 (A) 표준 차트 메뉴.
- **지표 라인 위 우클릭** → 해당 지표 서브메뉴가 **맨 위에 추가**됨 (§B).
- **오브젝트(추세선 등) 위 우클릭** → 해당 오브젝트 서브메뉴가 **맨 위에 추가**됨 (§C).
- **지표 서브윈도우(RSI/MACD 창) 안 우클릭** → "Delete Indicator Window" 등 서브윈도우 전용 항목 추가.

---

## (A) 우클릭 메뉴 전체 항목 트리 — 실제 MT5 순서

빈 캔들 영역 우클릭 시, 위→아래 순서(구분선 `─────` 포함):

```
Trading                        ▶   [서브메뉴]
Depth of Market            Alt+B
One Click Trading
─────────────────────────
Indicators List             Ctrl+I
Objects                        ▶   [서브메뉴]
─────────────────────────
Expert Advisors             ▶   [서브메뉴]   [브로커편차: EA 비활성 브로커는 항목만 존재]
─────────────────────────
Templates                    ▶   [서브메뉴]
─────────────────────────
Refresh
─────────────────────────
Grid                          Ctrl+G
Volumes                       Ctrl+L   ▶   [서브메뉴: None / Tick / Real]
Auto Scroll
Chart Shift
─────────────────────────
Zoom In                        +
Zoom Out                       −
─────────────────────────
Save As Picture...
Print...                      Ctrl+P
Print Preview
─────────────────────────
Properties...                  F8
```

### A-1. 각 항목 상세 {MT5 동작 · 단축키 · 우리 현황}

| 항목 | MT5 동작 (한 줄) | 단축키 | dev/fx-terminal.html 현황 |
|---|---|---|---|
| **Trading** ▶ | 서브메뉴 열림: New Order(F9) + 원클릭 시장가 Buy/Sell(현재가 표시) + Buy/Sell Limit·Stop 등. 원클릭 켜져 있으면 즉시 체결. | F9(New Order) | **없음**(우클릭 메뉴 자체 없음). 툴바 New Order·One-click는 토스트 "coming in build" |
| **Depth of Market** | 현재 심볼의 호가창(DOM) 창을 연다. | Alt+B | **없음**. MW 우클릭엔 항목만 있고 토스트 |
| **One Click Trading** | 차트 좌상단 원클릭 매수/매도 패널 토글. 최초 켤 때 약관 동의 팝업. | — | **없음**(툴바 아이콘=토스트) |
| **Indicators List** | 현재 차트에 붙은 **모든 지표 목록** 다이얼로그. Edit/Delete/(Visualize). 지표 삭제의 핵심 경로. | Ctrl+I | **없음**. 지표 on/off는 ☰ 메뉴 체크박스뿐(§B 갭) |
| **Objects** ▶ | 서브메뉴: Objects List, Delete, Delete All, Undo Delete, Select All(§C). | Ctrl+B(List) | **부분**: ☰ 메뉴에 "Delete All Objects"만. List/Undo/Select 없음 |
| **Expert Advisors** ▶ | 서브메뉴: (EA 붙어있으면) Properties·Modify·Remove·Trading 허용 토글. 없으면 회색/제한. | — | **없음**(우리 앱은 EA 개념 없음 — 표기만) |
| **Templates** ▶ | 서브메뉴: Load Template, Save Template, Remove Template + 저장된 템플릿 목록 + Default. 차트 전체 구성(타입·지표·색·오브젝트) 저장/복원. | — | **없음** |
| **Refresh** | 서버에서 히스토리 재요청, 갭 메움, 차트 다시 그림. | — | **없음** |
| **Grid** | 배경 격자선 표시/숨김 토글(체크). | Ctrl+G | **있음**. `toggleGrid()` + Ctrl+G 바인딩(line 1442) + ☰ 체크. 단 우클릭 아님 |
| **Volumes** ▶ | 하단 볼륨 서브창 토글. 서브메뉴 None/Tick Volumes/Real Volumes. FX는 Tick만. | Ctrl+L [ESTIMATE] | **부분**: `toggleVol()` on/off는 있음(☰). None/Tick/Real 구분 없음, 단축키 없음 |
| **Auto Scroll** | 새 틱 오면 최신 봉으로 자동 스크롤(체크 토글). | — | **없음**(cfg.scroll 필드만 존재, 미구현·툴바=토스트) |
| **Chart Shift** | 최신 봉을 우측 끝에서 왼쪽으로 띄움(체크 토글). 우측 마진 확보. | — | **없음**(툴바=토스트) |
| **Zoom In** | 봉 폭 확대(더 적은 봉, 크게). | + | **있음**. `zoomCharts(1)` + `+` 키(line 1443 인근) + 툴바 |
| **Zoom Out** | 봉 폭 축소(더 많은 봉). | − | **있음**. `zoomCharts(-1)` |
| **Save As Picture...** | 차트를 PNG/GIF/BMP로 저장 또는 클립보드/MQL5 게시. | — | **부분**: 툴바 Screenshot=토스트 |
| **Print...** | 차트 인쇄. | Ctrl+P | **없음** |
| **Print Preview** | 인쇄 미리보기. | — | **없음** |
| **Properties...** | 차트 속성 다이얼로그: Colors/Common(캔들·OHLC·라인 색, 배경, 그리드, 볼륨·기간구분·거래레벨 표시, Chart shift/scale fix 등 탭). | F8 | **없음**(F8=토스트 line 1445) |

---

## (B) 지표 삭제/관리 UX — "인디케이터 지우는 기능이 없다" 해결의 정확한 명세

MT5에서 붙은 지표를 **삭제/편집**하는 경로는 **4가지**. 우리는 현재 ☰ 체크박스 off로만 지워지며, 이건 MT5식이 아님.

### B-1. Indicators List 다이얼로그 (Ctrl+I) — 주 경로
- **열기:** 차트 우클릭 → `Indicators List`, 또는 Ctrl+I.
- **내용:** 현재 차트(메인 + 모든 서브윈도우)에 붙은 지표를 **한 목록**에 표시(이름 + 파라미터, 예 `Moving Average (20, ...)`, `RSI (14)`).
- **버튼:**
  - `Edit` — 선택 지표의 **Properties 다이얼로그**를 열어 파라미터(기간·색·적용가격·레벨) 수정.
  - `Delete` — 선택 지표를 차트에서 **제거**. (서브윈도우 지표를 지우면 서브창도 함께 사라짐.)
  - `Visualize` [브로커편차/버전] — 지표를 데이터 윈도우/차트에서 강조. 없는 빌드도 있음 [ESTIMATE].
  - `Close` — 닫기.
- **주의:** 이 다이얼로그엔 **Add 버튼이 없다.** 추가는 Insert 메뉴로만.

### B-2. 지표 라인 직접 우클릭 (메인 차트)
- 지표 곡선(예: MA 선) **바로 위**에서 우클릭 → 메뉴 맨 위에 **`<지표이름>` 서브메뉴** 등장:
  - `<Indicator> Properties...` — 파라미터 편집.
  - `Delete Indicator` — 그 지표만 삭제.
  - (겹친 지표 여러 개면 각각 서브항목)
- 더블클릭으로도 지표 선택 → Delete 키로 삭제 가능 [ESTIMATE: 오브젝트와 동일 패턴].

### B-3. 지표 서브윈도우 우클릭 (RSI/MACD 등 하단 창)
- 서브창 내부 우클릭 → 표준 메뉴 + 상단에:
  - `Delete Indicator Window` — 서브창 통째로 제거(그 안 지표 전부).
  - 개별 지표는 Indicators List에서.
- 서브창 좌상단 **[x] 버튼**으로도 서브창 닫힘 [ESTIMATE: 일부 빌드].

### B-4. Insert > Indicators (추가 경로 — 참고)
상단 메뉴 `Insert → Indicators →` 서브트리:
```
Trend ▶            (Moving Average, Bollinger Bands, Ichimoku, Parabolic SAR, ...)
Oscillators ▶      (RSI, MACD, Stochastic, CCI, ATR, ...)
Volumes ▶          (OBV, Volumes, Money Flow Index, ...)
Bill Williams ▶    (Alligator, Fractals, Awesome Oscillator, ...)
Custom ▶           (사용자/마켓 지표)
```
(우리 Navigator 트리의 Indicators 폴더가 이미 이 분류를 거의 반영함 — line 939~948.)

### B-5. 우리 현황 vs MT5 (지표)
| 기능 | MT5 | 우리 |
|---|---|---|
| 지표 목록 다이얼로그 | Indicators List (Ctrl+I) | **없음** — Ctrl+I 미바인딩 |
| 지표 파라미터 편집 | Edit/Properties | **없음** — MA20/BB20,2/RSI14 하드코딩(line 611) |
| 지표 개별 삭제 | List Delete / 라인 우클릭 Delete | **부분** — ☰ 체크 off로만(`toggleInd`) |
| 서브창 삭제 | Delete Indicator Window | **부분** — RSI off 시 서브창 사라짐(효과는 유사) |
| 지표 추가 | Insert>Indicators / Navigator 더블클릭 | **부분** — ☰에 MA/BB/RSI 3종만, Navigator 트리는 표시용(더블클릭 미동작) |

---

## (C) 오브젝트 관리

### C-1. Objects 서브메뉴 (우클릭 → Objects ▶)
```
Objects List         Ctrl+B
Delete                              (선택된 오브젝트 삭제)
Delete All
Undo Delete           Ctrl+Z
Select All
```
[ESTIMATE: 항목 라벨은 빌드에 따라 "Delete"/"Delete Last"/"Delete All Selected" 표기 편차]

### C-2. Objects List 다이얼로그 (Ctrl+B)
- 차트의 **모든 오브젝트** 목록(이름·타입·설명, 생성 시각/가격).
- 버튼: `Show`(해당 오브젝트로 차트 점프) · `Edit`(Properties 다이얼로그) · `Delete`.

### C-3. 개별 오브젝트 조작
- 오브젝트 위 우클릭 → 상단에 `<오브젝트이름>` 서브메뉴: `Properties...`(Enter) · `Delete`(Delete 키).
- **더블클릭 = 선택**(앵커 포인트 표시, 드래그로 이동/변형). 선택 후 Delete 키로 삭제.
- 오브젝트 Properties: 좌표/색/스타일/두께/설명/파라미터(피보 레벨 등) 탭.

### C-4. 우리 현황 vs MT5 (오브젝트)
| 기능 | MT5 | 우리 |
|---|---|---|
| Objects List (Ctrl+B) | 목록+Show/Edit/Delete | **없음** — Ctrl+B=토스트(line 1443) |
| Delete All | Objects>Delete All | **있음** — ☰ "Delete All Objects" → `clearObjects()`(line 649) |
| 개별 오브젝트 선택 | 더블클릭 앵커 | **없음** — 오브젝트는 데이터공간 저장(line 632~)만, 클릭 선택 불가 |
| 개별 삭제 | 우클릭 Delete / Delete키 | **없음** |
| Undo Delete | Ctrl+Z | **없음** |
| 오브젝트 Properties | 색·좌표·레벨 편집 | **없음** — 배치만(hline/vline/trend/fib/text) |

드로잉 툴 자체는 우리에 이미 있음: `setDrawTool` hline/vline/trend/fib/text(line 623, 633~648), 한 개 그리면 커서 복귀(MT5식, line 648). 오브젝트 좌표를 데이터공간(시간·가격)에 저장해 줌/리사이즈에 고정 — MT5 규범과 일치.

---

## (D) 갭 리스트 — dev/fx-terminal.html 현행 대비, 우선순위순

**핵심 전제: 차트 plot(`.cgwplot`)에 `contextmenu` 핸들러가 아예 없다.** Market Watch(line 1320)엔 있으나 차트엔 없음 → 우클릭 시 브라우저 기본 메뉴가 뜬다. 이게 1순위.

### P0 — 반드시 (MT5의 정체성)
1. **차트 우클릭 메뉴 신설.** `.cgwplot`에 `contextmenu` 핸들러 → §A 트리를 그대로 띄운다. MW 우클릭(line 1312 `cgmenu` 패턴)을 재사용하면 스타일·닫기 로직 공짜.
   - *맞추는 방향:* MW `mwCtx` DOM 생성 패턴을 복제해 `chartCtx` 만들고, `placeDrawing`처럼 우클릭한 차트 id를 활성화 후 항목 실행.
2. **Indicators List (Ctrl+I).** 현재 차트 지표 목록 + Delete/Edit. "지표 못 지운다" 직접 해소.
   - *방향:* `cfg(id).ind` 객체를 목록화 → 각 행에 Delete(=`toggleInd` off)·Edit(파라미터 프롬프트). Ctrl+I 바인딩.
3. **Objects List (Ctrl+B) + 개별 삭제.** 현재 Ctrl+B는 토스트(line 1443).
   - *방향:* `cfg(id).obj` 배열을 목록화 → Show/Delete. 최소한 개별 Delete + Undo Delete(마지막 삭제 스택).

### P1 — 강하게 권장 (자주 쓰는 항목)
4. **Properties... (F8).** 차트 속성 다이얼로그(색/그리드/볼륨/시프트/스케일). 현재 F8=토스트(line 1445).
   - *방향:* 최소 Colors + Common 탭. cfg에 이미 grid/vol/type/scroll 있으니 UI만.
5. **Auto Scroll / Chart Shift 실동작.** cfg.scroll 필드는 있으나 미구현. 우클릭·툴바 둘 다 토스트.
   - *방향:* renderChart의 가시범위 계산에 shift 오프셋 반영, Auto Scroll on이면 새 봉에 스냅.
6. **Templates ▶.** Save/Load/Default. cfg(차트별 설정) 통째 JSON 직렬화라 저장은 쉬움.
7. **Refresh.** series 캐시 무효화 후 renderChart.
8. **Volumes 서브메뉴(None/Tick/Real) + Ctrl+L.** 현재 단순 on/off. FX는 Tick만이므로 Real 회색.

### P2 — 있으면 좋음 (문맥/완성도)
9. **지표 라인 직접 우클릭 → `<지표>` 서브메뉴(Properties/Delete).** hit-test 필요.
10. **오브젝트 개별 우클릭/더블클릭 선택 + Properties.** hit-test 필요, P2 중 무겁다.
11. **Trading ▶ / Depth of Market(Alt+B) / One Click Trading.** 돈 관문 — 실주문 로직 붙기 전엔 골격/토스트 유지가 정직(무리해서 껍데기 만들지 말 것).
12. **Save As Picture / Print / Print Preview.** 브라우저 캔버스 캡처·`window.print()`로 근사 가능(우선순위 낮음).

### 이미 MT5와 일치(유지) — 갭 아님
- Grid(Ctrl+G) · Zoom In/Out(+/−) · Volumes on/off · 드로잉 툴 5종 · "한 개 그리면 커서 복귀" · 오브젝트 데이터공간 좌표 저장 · 차트 타입/TF를 툴바에 둔 배치(MT5 우클릭엔 원래 없음).

---

## 7. 정직한 사실 ([ESTIMATE]/[브로커편차]/[차단] 모음)

- **[차단]** MetaQuotes 공식 help(`charts_manage`, `charts_settings`)와 튜토리얼 페이지 모두 프록시에서 **HTTP 403**. 순서·라벨은 MT5 데스크톱 실사용 지식 기반이며, 공식 페이지 대조는 못 함.
- **[사실교정]** 사장님 지시 리스트의 **Bar/Candlestick/Line Chart 및 Timeframes(M1..MN) 서브메뉴는 실제 MT5 차트 우클릭 메뉴에 없다.** 그것들은 상단 `Charts` 메뉴 + 툴바 전용. 우리 터미널이 이미 툴바/TF 스트립에 둔 것이 오히려 MT5와 일치 — 우클릭 메뉴에 억지로 넣으면 MT5와 **달라진다**.
- **[ESTIMATE]** 단축키: `Volumes = Ctrl+L`(MT4 계승, MT5 버전편차 가능), Objects 서브 라벨("Delete" vs "Delete Last" vs "Delete All Selected")은 빌드별 문구 차이.
- **[ESTIMATE]** Indicators List의 `Visualize` 버튼, 지표 서브창 [x] 버튼은 특정 빌드에만.
- **[브로커편차]** `Expert Advisors` 서브메뉴 활성/문구, 원클릭 트레이딩 약관 팝업, DOM 제공 여부는 브로커 설정에 따라 다름. EA 금지 브로커는 항목만 회색.
- **[ESTIMATE]** 지표 라인/오브젝트 더블클릭 선택 후 Delete 키 삭제는 오브젝트 표준 동작을 지표에 유추 적용한 것.

---

## 출처(Sources)
- [Chart Management — MetaTrader 5 Help](https://www.metatrader5.com/en/terminal/help/charts_advanced/charts_manage) [차단 403]
- [Chart Settings — MetaTrader 5 Help](https://www.metatrader5.com/en/terminal/help/charts_advanced/charts_settings) [차단 403]
- [Customizing Charts with Right-Click Options in MT5 — Hola Prime Academy](https://holaprime.com/ms/prime-academy/mt5-tutorial-series/customizing-charts-with-right-click-options-in-metatrader-5-part-2-a-simple-guide/) [차단 403]
- [One Click Trading — MetaTrader 5 Help](https://www.metatrader5.com/en/terminal/help/trading/one_click_trading)
- [How to Use MetaTrader 5 — NAGA Academy](https://naga.com/en/academy/metatrader-5-how-to-use)

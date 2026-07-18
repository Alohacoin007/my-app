# MT5 레퍼런스 스펙 — `dev/fx-terminal.html` 100% 충실 복제 가이드

> 목적: `dev/fx-terminal.html`(Alpexa "Legend FX 터미널")를 **실제 MetaTrader 5 데스크톱 터미널(Windows)** 와 픽셀·행동 단위로 동일하게 만들기 위한 기준 문서.
> 이 파일은 **스펙만** 담는다. 코드 수정 없음. 구현 순서는 문서 하단 **§7 GAP LIST(우선순위)** 를 따른다.
> 표기 규칙: `[ESTIMATE]` = 기억 기반 추정(실기 재확인 권장) · `[브로커편차]` = 브로커/빌드에 따라 다름 · **현행** = 현재 fx-terminal.html 상태.
> 근거: MT5 데스크톱 관례 + 웹 확인(3 툴바 = Standard / Line Studies / Timeframes, 21 타임프레임, F9=New Order · Ctrl+M=Market Watch · Ctrl+T=Toolbox · Ctrl+N=Navigator — 검색 스니펫으로 교차확인).

---

## §0. 전체 레이아웃 골격 — MT5 창 구조

MT5 데스크톱은 **고정 도킹(docking) 셸**이다. 위젯이 자유롭게 떠다니지 않고, 4개 도킹 영역이 창을 분할한다:

```
┌──────────────────────────────────────────────────────────────┐
│ 메뉴바:  File  View  Insert  Charts  Tools  Window  Help        │  ← 텍스트 메뉴 (항상 보임)
├──────────────────────────────────────────────────────────────┤
│ 툴바 3종(한 줄 또는 두 줄): Standard | Line Studies | Timeframes │  ← 아이콘 툴바
├────────────┬─────────────────────────────────────────────────┤
│ Market     │                                                  │
│ Watch      │            차트 영역 (MDI, 여러 차트 창)           │
│ (Ctrl+M)   │            — 탭 또는 타일/캐스케이드              │
│ ─────────  │                                                  │
│ Navigator  │                                                  │
│ (Ctrl+N)   │                                                  │
├────────────┴─────────────────────────────────────────────────┤
│ ▼ Toolbox (Ctrl+T) — 하단 풀폭 도크 (상단 경계 드래그로 높이조절)│
│   [포지션/주문 테이블 ...........................]              │
│   [계좌 요약 STICKY FOOTER: Balance/Equity/... + 총손익 우측정렬]│
│   Trade · Exposure · History · News · Mailbox · ... (탭=맨아래) │  ← 탭 스트립 = 패널 최하단
├──────────────────────────────────────────────────────────────┤
│ 상태바: For Help press F1 | 잔고/서버 | 시각 | Market Signals... │
└──────────────────────────────────────────────────────────────┘
```

**핵심 차이 (현행)**: fx-terminal.html은 MT5 도킹이 아니라 **자유 부동(絶對위치) 위젯 엔진**(스포츠/크립토 대시보드 재사용, `position:absolute` + 드래그/스냅/리사이즈)이다. Toolbox·Market Watch·Navigator가 모두 스테이지 위 떠다니는 위젯. MT5 충실도를 위해선 최소한 **Toolbox의 하단 풀폭 도킹 + 내부 구조**는 진짜처럼 만들어야 한다(§1). 좌측 도크(MW/Nav)는 "기본 프로필이 그 위치에 스냅되어 있다"로 근사 가능하나, 진짜 도킹(리사이즈 시 차트 영역이 밀림)은 [ESTIMATE 구현범위] 별도 결정.

---

## §1. Toolbox 도킹 스펙 (가장 중요) 🔴

> Toolbox = MT5의 하단 정보 패널. MT4에서는 "Terminal"이라 불렀다. 이 섹션이 이 문서의 **1순위 산출물**.

### 1.1 도킹·형상 (Geometry)

| 항목 | MT5 실제 | 현행 (fx-terminal.html) |
|---|---|---|
| 위치 | 화면 **하단, 풀폭**(좌우 끝까지). 상태바 바로 위 | `#w-toolbox` 자유 위젯. 기본 `x:8,y:608,w:1884,h:240` — 풀폭 근사이나 도크 아님 |
| 높이 조절 | 패널 **상단 경계(top border)를 위/아래로 드래그** → 높이만 변함. 차트 영역이 그만큼 밀림 | 위젯 8방향 리사이즈 핸들(`.rz`). 상단 경계 전용 드래그 아님 |
| 접기/펴기 | **Ctrl+T** 토글. 접으면 탭 스트립만 남고 본문 사라짐(패널 최소화) | 없음. `.wic`(⋮) 클릭 = 위젯 숨김(hide)뿐 |
| 좌우 폭 | 항상 풀폭(도킹) | 위젯이라 임의 폭 |
| 부동(float) | 우클릭 → "Float" 시 창으로 분리 가능 `[브로커편차 없음/표준]` | 항상 부동 |

**요구 동작**:
1. Toolbox는 하단에 **풀폭 고정**. 좌우 리사이즈 비활성(폭=뷰포트).
2. **상단 경계만** ns-resize 핸들 → 높이 조절. 위쪽(차트/도크 영역)이 반응해 줄어듦.
3. **Ctrl+T** = collapse/expand 토글. collapse 시 높이 = 탭 스트립 높이만.

### 1.2 내부 3단 구조 (위→아래) — ⚠️ 현행과 상하 반전

MT5 Toolbox(특히 **Trade 탭**)의 세로 순서는 위에서 아래로:

```
┌─ (1) 포지션/주문 테이블 ───────────────────────────┐  ← 위: 스크롤 영역
│  Symbol Ticket Time Type Volume Price S/L T/P ...   │
│  ... (포지션 여러 줄, 세로 스크롤) ...               │
├─ (2) 계좌 요약 = STICKY FOOTER ────────────────────┤  ← 테이블 바로 아래 고정, 항상 보임
│  Balance:… Equity:… Margin:… Free Margin:… Level:…    │      ················  총 Floating P/L (우측정렬, 굵게)│
├─ (3) 탭 스트립 = 패널 최하단 ──────────────────────┤  ← 맨 아래
│  Trade Exposure History News Mailbox Calendar ...    │
└────────────────────────────────────────────────────┘
```

- **(1) 테이블**: 위쪽 전체 차지, 포지션이 많으면 세로 스크롤.
- **(2) 계좌 요약 = 고정 푸터(sticky footer)**: 포지션 테이블 **바로 아래**에 핀 고정. 포지션이 0개든 50개든 **항상 화면에 보임**(테이블만 스크롤, 푸터는 안 밀림). **총 Floating P/L을 오른쪽 끝에 우측정렬**로 굵게 표시.
- **(3) 탭 스트립 = 패널의 VERY BOTTOM**: 탭이 **맨 아래 한 줄**. (일반 웹 탭처럼 위에 있지 않음 — 이게 MT5 시그니처.)

**현행은 정확히 반대**:
- 탭이 **위**(`.tbxtabs`, `padding:2px 6px 0`)
- 계좌 바가 본문 **맨 위**(`.tbxacct`, `renderToolbox`에서 테이블보다 먼저 innerHTML)
- 테이블이 그 **아래**
- 계좌 바가 sticky footer 아님(스크롤 시 밀림). 총 손익 항목 자체가 없음.

→ **수정 방향**: DOM/렌더 순서를 `[테이블] → [계좌 푸터(position:sticky; bottom:0)] → [탭 스트립(맨아래)]` 으로 재배치.

### 1.3 계좌 요약 필드 (푸터)

MT5 Trade 탭 하단 요약 라인(왼→오):

| 필드 | 라벨 | 계산 (참고) | 현행 |
|---|---|---|---|
| Balance | `Balance:` | 실현 잔고 | ✅ `100 000.00 USD` |
| Equity | `Equity:` | Balance + 총 Floating P/L (+swap/commission) | ✅ `99 992.79` |
| Margin | `Margin:` | 사용 증거금 | ✅ `256.64` |
| Free Margin | `Free Margin:` | Equity − Margin | ✅ `99 736.15` |
| Margin Level | `Margin Level:` | Equity / Margin × 100% | ✅ `38 962.28%` |
| **Floating P/L(총)** | (라벨 없이 수치) | Σ 포지션 Profit | ❌ **없음** — 우측정렬 총손익 추가 필요 |

- 숫자 포맷: **천단위 = 공백**(`100 000.00`), MT5 유럽식. 현행 준수 ✅.
- **총 Floating P/L은 라인 오른쪽 끝, 색상(이익=녹색/손실=적색), 굵게.** (현행엔 `DEMO · preview` 뱃지가 `margin-left:auto`로 우측을 차지 — 총손익으로 대체하거나 병기.)
- 값 부호에 따라 Equity·Free Margin·Level이 실시간 변동(피드 연결 후). M1 단계는 데모 스냅샷 유지 OK(정직 표기 `DEMO`).

### 1.4 포지션 테이블 컬럼 (Trade 탭)

MT5 실제 컬럼 순서(포지션 행):

```
Symbol │ Ticket │ Time │ Type │ Volume │ Price(진입) │ S/L │ T/P │ Price(현재) │ Commission │ Swap │ Profit
```

| # | 컬럼 | 의미 | 정렬 | 현행 |
|---|---|---|---|---|
| 1 | Symbol | 심볼(예: `eurusd.fx`) | 좌 | ✅ |
| 2 | Ticket | 포지션 티켓번호 | 우/좌`[브로커편차]` | ✅ |
| 3 | Time | 진입 시각 `YYYY.MM.DD HH:MM:SS` | 좌 | ✅ |
| 4 | Type | `buy`/`sell` (녹/적) | 좌 | ✅ |
| 5 | Volume | 랏(예: `0.01`) | 우 | ✅ |
| 6 | Price | **진입가** | 우 | ✅ |
| 7 | S / L | 손절가(없으면 빈칸) | 우 | ✅ (현행 `—`, MT5는 빈칸) |
| 8 | T / P | 익절가(없으면 빈칸) | 우 | ✅ (동상) |
| 9 | Price | **현재가**(실시간 마크) | 우 | ✅ |
| 10 | **Commission** | 수수료 | 우 | ❌ **없음** |
| 11 | **Swap** | 스왑(롤오버) | 우 | ❌ **없음** |
| 12 | Profit | 손익(현재가 기준, 녹/적) | 우 | ✅ |

- **누락: Commission, Swap** 두 컬럼. MT5 표준(§금융 MT5 구조: 스왑/커미션은 업계 표준 필드). 추가 필요.
- 헤더 라벨: MT5는 `S / L`, `T / P`(슬래시 띄어쓰기). 현행 `S / L`/`T / P` ✅.
- **행 없을 때**: MT5는 빈 테이블(헤더만) + 푸터는 여전히 표시. 현행 `.tbxempty` 문구는 다른 탭용 — Trade 탭은 항상 테이블/푸터.
- **정렬**: 컬럼 헤더 클릭 시 정렬 `[ESTIMATE 구현여부]`.
- **우클릭 컨텍스트(포지션 행)**: New Order · Close Position · Modify or Delete(S/L·T/P) · Bulk Operations · Show on chart `[브로커편차]` — M4 주문 단계.

### 1.5 Toolbox 탭 목록 (맨 아래 스트립)

현행 `TBX_TABS` 12종과 MT5 표준:

`Trade · Exposure · History · News · Mailbox · Calendar · Company · Alerts · Articles · Code Base · Experts · Journal`

| 탭 | 내용 (MT5) | 현행 |
|---|---|---|
| **Trade** | 열린 포지션 + 지정가 주문 테이블 + 계좌 푸터 | ✅ 렌더 (구조 반전 이슈 §1.2) |
| Exposure | 통화별 순노출 막대(Asset/Volume/Rate/USD/Graph) | ❌ foundation |
| History | 청산된 거래/입출금 이력 테이블 + 기간필터 | ❌ foundation |
| News | 뉴스 헤드라인 | ❌ foundation |
| Mailbox | 브로커 내부 메일 | ❌ foundation |
| Calendar | 경제 캘린더(이벤트/실측/예상/이전) | ❌ foundation |
| Company | 브로커 링크/포털 `[브로커편차]` | ❌ foundation |
| Alerts | 가격 알림 규칙 | ❌ foundation |
| Articles | MQL5 아티클 `[브로커편차]` | ❌ foundation |
| Code Base | MQL5 코드베이스 | ❌ foundation |
| Experts | EA 로그 | ❌ foundation |
| Journal | 터미널 이벤트 로그(연결/주문/에러) | ❌ foundation |

- **탭 종류/개수는 [브로커편차]** — 일부 빌드는 `Signals`, `Market`(마켓플레이스), `VPS`, `Ticks` 탭 추가/삭제. 현행 12종은 표준 셋과 일치 ✅.
- 각 탭 클릭 = 본문만 교체(탭 스트립·계좌 푸터 프레임 유지). Trade 외에는 M1 foundation OK.

---

## §2. 툴바 아이콘 인벤토리 + 현행 TOOLS 배열 diff

> MT5 툴바는 **3개 그룹**: **Standard**, **Line Studies**, **Timeframes**(=Periodicity). (드래그로 위치/줄바꿈 가능, 우클릭 "Customize"로 버튼 추가/삭제.) 현행은 이 셋을 한 줄 `.htoolbar`에 압축 + 별도 `.tfstrip`.

### 2.1 Standard 툴바 (MT5 기본 버튼, 좌→우)

| # | 버튼 | 기능 | 핫키 | 현행 TOOLS 대응 |
|---|---|---|---|---|
| 1 | New Order | 주문 대화창 | **F9** | ✅ `New Order (F9)` (그룹 위치는 다름) |
| 2 | MetaTrader VPS | VPS 렌트/연결 | — | ❌ (현행엔 `MQL5 Cloud`가 유사역할) |
| 3 | New Chart ▾ | 심볼 선택 새 차트 | — | ❌ 없음 |
| 4 | Profiles ▾ | 프로필 저장/전환 | — | ❌ 없음 |
| 5 | MetaEditor | MQL 에디터 실행 | **F4** | ✅ `MetaEditor / IDE`(핫키 라벨 없음) |
| 6 | Algo Trading | 자동매매 on/off 토글 | — | ✅ `Algo Trading` |
| 7 | Market Watch | MW 창 토글 | **Ctrl+M** | ❌ (뷰 토글 버튼군 자체가 없음) |
| 8 | Data Window | 데이터 창 토글 | **Ctrl+D** | ✅ `Data window`(핫키 라벨 없음) |
| 9 | Navigator | 내비게이터 토글 | **Ctrl+N** | ❌ |
| 10 | Toolbox | 툴박스 토글 | **Ctrl+T** | ❌ |
| 11 | Strategy Tester | 테스터 토글 | **Ctrl+R** | ❌ |
| 12 | Full Screen | 전체화면 | **F11** | (헤더 우측 `btnFull`에 별도로 있음) |

- 현행 `One-click trading`, `Lock`, `Signals`, `Screenshot`, `Tick chart`는 MT5 표준 Standard엔 기본 미포함(우클릭 커스터마이즈로 추가 가능한 항목이거나 차트 컨텍스트/뷰 메뉴 항목). → **[브로커편차]/과잉**. 유지해도 무방하나 "MT5 기본과 다름" 표기.

### 2.2 Charts 툴바 (차트 표시 — MT5에선 Standard 우측 또는 별도)

| 버튼 | 기능 | 핫키 | 현행 |
|---|---|---|---|
| Bar Chart (OHLC) | 봉=바 | **Alt+1** | ✅ `Bar chart (OHLC)` (핫키 없음) |
| Candlesticks | 봉=캔들 | **Alt+2** | ✅ `Candlesticks` |
| Line Chart | 종가선 | **Alt+3** | ✅ `Line chart` |
| Zoom In | 확대 | **`+`** | ✅ `Zoom in` |
| Zoom Out | 축소 | **`−`** | ✅ `Zoom out` |
| Auto Scroll | 최신봉 자동추적 토글 | — | ✅ `Auto scroll` |
| Chart Shift | 우측 여백(시프트) 토글 | — | ✅ `Chart shift` |
| Indicators ▾ | 지표 목록 | **Ctrl+I**(목록) | ✅ `Indicators` / `Add indicator` |
| Period ▾ | 타임프레임 드롭 | — | (별도 tfStrip) |
| Templates ▾ | 템플릿 저장/적용 | — | ❌ 없음 |

- 차트타입 3버튼 **핫키 Alt+1/2/3** 라벨 누락(현행 툴팁에 없음). `[ESTIMATE — Alt+1/2/3 매핑은 표준이나 빌드별 확인 권장]`.

### 2.3 Line Studies 툴바 (드로잉 — MT5 전체 목록)

MT5 실제(좌→우, 축약):
`Cursor · Crosshair(Ctrl+F) · Vertical Line · Horizontal Line · Trendline · Trendline by Angle · Equidistant Channel · Std Deviation Channel · Linear Regression Channel · Andrews' Pitchfork · Cycle Lines · Fibo Retracement · Fibo Time Zones · Fibo Fan · Fibo Arcs · Fibo Expansion · Fibo Channel · Gann Line · Gann Fan · Gann Grid · Elliott Impulse/Correction · Rectangle · Triangle · Ellipse · Arrows(Thumb up/down, Arrow up/down, Price/Stop/Check label, Text, Text label) · Draw continuously 토글 · Delete(마지막 오브젝트)`

현행 Line Studies 대응:
| 현행 TOOLS | MT5 매칭 | 비고 |
|---|---|---|
| `Cursor` (on,fill) | Cursor | ✅ |
| `Crosshair` | Crosshair | ✅ (핫키 **Ctrl+F** 라벨 없음) |
| `Vertical line` | Vertical Line | ✅ |
| `Horizontal line` | Horizontal Line | ✅ |
| `Trend line` | Trendline | ✅ |
| `Fibonacci` | Fibo Retracement | ✅ (Fibo 계열 1종만 — MT5는 6종) |
| `Text` | Text/Text label | ✅ |
| `Shapes` | Rectangle/Triangle/Ellipse 묶음 | ⚠️ MT5는 개별 버튼 |

→ **누락**: 채널류(Equidistant/StdDev/Regression), Pitchfork, Gann, Elliott, Fibo 5종, 화살표/라벨 심볼군, "연속 그리기" 토글. **드로잉 골격**은 M2/M3 이후여도, 아이콘 인벤토리는 이 목록을 기준.

### 2.4 Timeframes(Periodicity) 툴바 — **21종 전체**

MT5 실제 21개:
`M1 M2 M3 M4 M5 M6 M10 M12 M15 M20 M30 H1 H2 H3 H4 H6 H8 H12 D1 W1 MN`

현행 `TFS` = **9종** `M1 M5 M15 M30 H1 H4 D1 W1 MN`.
→ **누락 12종**: M2 M3 M4 M6 M10 M12 M20 H2 H3 H6 H8 H12.
- MT5 툴바는 21개를 **전부 버튼**으로 노출(또는 Period 드롭다운). 현행은 대표 9개만.
- 수정 방향: `TFS`를 21종으로 확장(툴바가 좁으면 가로 스크롤, 현행 `.htoolbar overflow-x:auto` 이미 존재).
- 활성 TF 하이라이트(`.tfbtn.on`) ✅ 유지.

### 2.5 요약 diff (Standard/Charts 기준)

- **현행에 있으나 MT5 기본 아님(과잉/브로커편차)**: One-click trading, Lock, Signals, MQL5 Cloud, Screenshot, Tick chart, Data window(위치), Add indicator(별도버튼).
- **MT5에 있으나 현행 없음(누락)**: New Chart▾, Profiles▾, Templates▾, 뷰 토글 4종(MW/Data/Nav/Toolbox), Strategy Tester, MetaTrader VPS, Line Studies 다수(§2.3), TF 12종(§2.4).
- **핫키 라벨 누락**: New Order(F9는 있음)·MetaEditor(F4)·Data(Ctrl+D)·Crosshair(Ctrl+F)·차트타입(Alt+1/2/3)·Indicators(Ctrl+I) 등 툴팁에 단축키 병기 필요.

---

## §3. Market Watch · Navigator · 차트 컨텍스트 · 핫키 · 상태바

### 3.1 Market Watch (Ctrl+M)

**탭(하단)**: MT5 Market Watch 자체에도 하위 탭이 있음 — `Symbols · Details · Trading · Ticks`.
| 탭 | 내용 | 현행 |
|---|---|---|
| Symbols | 심볼별 Bid/Ask 목록(기본) | ✅ (탭 개념 없이 이 뷰만) |
| Details | 선택 심볼 상세(스프레드/스왑/세션 등) | ❌ |
| Trading | 심볼별 원클릭 매수/매도 패널 | ❌ |
| Ticks | 실시간 틱 그래프 | ❌ |

**컬럼(Symbols 뷰)**: 기본 `Symbol · Bid · Ask · !`(정지신호). 우클릭 "Columns"로 추가: `Spread · Time · High · Low · Bank`.
- 현행 컬럼: `Symbol · Bid · Ask · Spread`. → **Time·High·Low 누락**(우클릭으로 켜는 선택 컬럼이므로 우선순위 낮음). Spread 기본노출은 브로커편차 `[브로커편차]`.
- Bid/Ask **색상**: 상승=녹/하락=적(현행 `.mwpx.up/.down` ✅). MT5도 동일.

**우클릭 컨텍스트 메뉴(MT5 실제, 위→아래)**:
`New Order (F9) · Chart Window · Tick Chart · Depth of Market (Alt+B) · Specification · Hide · Hide All · Show All · Symbols (Ctrl+U) · Sets(저장/불러오기) · High/Low(컬럼토글) · Time(컬럼토글) · Spread(컬럼토글) · Auto Arrange · Grid · Popup Prices (F10)`
- **현행 우클릭 = 클래스 필터(All/Forex/Stocks/Crypto)만** (`mwControls`). MT5엔 없는 자체 편의기능 → 유지하되, MT5 표준 항목(New Order/Chart Window/Specification/Symbols/컬럼토글)을 추가해야 충실.

### 3.2 Navigator (Ctrl+N) — 트리

MT5 Navigator = 좌측 **트리** 5(6)섹션:
```
▸ Accounts        (로그인 계좌들; 더블클릭=전환)
▸ Indicators      (내장 지표: Trend/Oscillators/Volumes/Bill Williams/Custom)
▸ Expert Advisors (EA 목록)
▸ Scripts         (스크립트)
▸ Market          (MQL5 마켓 — [브로커편차])
▸ Signals         (트레이딩 시그널 — [브로커편차])
```
- 노드 아이콘 + 펼침(▸/▾). 항목 드래그→차트 드롭으로 적용.
- **현행 = 빈 `frame()`("Foundation")**. → 트리 골격(섹션 6개 + 더미 리프) 필요.

### 3.3 차트 컨텍스트 메뉴(차트 위 우클릭, MT5 실제)

`Trading(New Order F9 / One-Click) · Depth of Market · Indicators List (Ctrl+I) · Objects List (Ctrl+B) · Templates ▸ · Refresh · Grid (Ctrl+G) · Volumes (Ctrl+L) · Auto Scroll · Chart Shift · Chart Type ▸(Bars/Candles/Line) · Zoom In(+)/Out(−) · Save As Picture · Properties (F8)`
- **현행 = 없음**(차트는 스켈레톤 SVG 위젯, 우클릭 미구현). → 컨텍스트 메뉴 골격 + F8(Properties) 연결 대상.

### 3.4 핫키 표 (MT5 전체 — 구현 대상)

> 현행 fx-terminal.html엔 **실제 keydown 핸들러가 전혀 없음.** F9는 툴팁 문구, F1은 상태바 텍스트일 뿐. 아래를 `keydown`으로 구현해야 "100% 충실".

**뷰 토글 / 창**
| 키 | 기능 | 현행 |
|---|---|---|
| **Ctrl+M** | Market Watch 토글 | ❌ |
| **Ctrl+N** | Navigator 토글 | ❌ |
| **Ctrl+T** | Toolbox 토글(접기/펴기) | ❌ |
| **Ctrl+D** | Data Window 토글 | ❌ |
| **Ctrl+R** | Strategy Tester 토글 | ❌ |
| **Ctrl+O** | Options(설정) | ❌ |
| **Ctrl+U** | Symbols 창 | ❌ |
| **F11** | 전체화면 | (버튼만) |
| **Ctrl+F6** | 다음 차트 창 `[ESTIMATE]` | ❌ |
| **Ctrl+W / Ctrl+F4** | 현재 차트 닫기 | ❌ |

**주문 / 거래**
| 키 | 기능 |
|---|---|
| **F9** | New Order 창 |
| **Alt+B** | Depth of Market `[ESTIMATE]` |

**차트 표시**
| 키 | 기능 | 현행 |
|---|---|---|
| **F8** | Chart Properties | ❌ |
| **F12** | 차트 한 봉 왼쪽 이동 · **Shift+F12** 오른쪽 `[ESTIMATE]` | ❌ |
| **+ / −** | 확대 / 축소 | ❌ |
| **Ctrl+G** | Grid 토글 | ❌ |
| **Ctrl+L** | Volumes 토글 | ❌ |
| **Ctrl+I** | Indicators List | ❌ |
| **Ctrl+B** | Objects List | ❌ |
| **Ctrl+F** | Crosshair 모드 | ❌ |
| **Ctrl+Y** | Period Separators 토글 `[ESTIMATE]` | ❌ |
| **Alt+1 / Alt+2 / Alt+3** | Bars / Candles / Line `[ESTIMATE]` | ❌ |
| **← → ↑ ↓** | 차트 스크롤/스케일 | ❌ |
| **Page Up/Down** | 빠른 스크롤 | ❌ |
| **Home / End** | 차트 시작 / 최신봉 | ❌ |
| **Delete** | 선택 오브젝트 삭제 | ❌ |
| **Backspace** | 마지막 오브젝트 삭제 | ❌ |
| **F1** | Help | (상태바 문구만) |
| **Esc** | 대화창 닫기 | ❌ |

- `[ESTIMATE]`는 표준 관례이나 빌드/OS별 재확인 권장(공식 hotkeys 페이지 접근 403으로 미확인).

### 3.5 상태바 (최하단)

MT5 상태바 구성(좌→우): `For Help, press F1` (또는 연결상태) · 선택심볼 O/H/L/C 값 · 접속 서버·핑·트래픽(kb) · 시각 · 프로필명 · 탭들(Market/Signals/VPS/Tester).
| 요소 | MT5 | 현행 |
|---|---|---|
| 좌측 힌트 | `For Help, press F1` | ✅ |
| 심볼 OHLC(V) | 마우스 위치 봉의 O/H/L/C(V) | ✅ `EURUSD O H L C V` |
| 서버/핑/트래픽 | `연결됨 · N ms · N/N kb` | ❌ 없음 |
| 시각 | 서버 시각 | ✅ (로컬 시각 — 서버시각 아님) |
| 프로필 | `Default` | ✅ |
| 우측 탭 | Market / Signals / VPS / Tester | ✅ |

- 시각은 MT5가 **서버(브로커) 시각** — 현행은 브라우저 로컬. `[구현시 라스베가스/서버 기준 주의]`.

---

## §4. 색·타이포·치수 (MT5 다크 룩 근사)

- MT5 기본 배경: 차트 검정(#000)~짙은남색, UI 패널 회색계. 현행은 Legend 다크 토큰(`--lgd-surface/bg/hair`)으로 근사 — **완전 동일할 필요는 없음**(브랜드=Alpexa). "구조·행동 충실"이 우선, 색은 Legend 유지 OK.
- 폰트: MT5 = Tahoma/Segoe UI 계열 11px. 현행 system-ui 10~12px ✅ 근사.
- 상승/하락: 녹/적 (현행 `--lgd-up`/`--lgd-down`) ✅.
- 라운드: MT5 = 직각(0~2px). 현행이 이미 `--lgd-r-*:2px`로 샤프 오버라이드 ✅ (좋음).
- 라인/헤어라인: 1px. ✅.
- **결론**: 비주얼은 현행 방향(샤프·다크·녹적) 유지. 충실도 격차는 **구조/행동(§1~3)** 에 집중.

---

## §5. 데이터/피드 경계 (스펙 준수)

- Market Watch·차트·포지션 마크는 **서버 피드(`prices` 테이블) mid** 기준. 현행 M1은 `mwSimulate()` 시뮬레이터 + `SIM/LIVE` 정직표기 ✅ (CLAUDE.md §정직표기 준수).
- 포지션 Profit·Equity·Floating은 **실시간 mid 마크**(가짜 드리프트 금지) — MT5 구조 §금융. 실피드 연결 시 `mwHalf/pip/digits`를 webtrade와 락스텝 유지(현행 주석에 명시됨 ✅).
- 스프레드: 전 상품 부과(무스프레드 없음). MW Spread 컬럼 표시 ✅.
- **돈 코드 0**(현행 셸). 주문/청산은 서버 RPC(M4+). 스펙 문서 범위 밖이나, 테이블/푸터 수치는 서버 권위값으로만 채운다.

---

## §6. 구현 마일스톤 매핑 (현행 M1 셸 기준)

- **M1(현재)**: 셸 — 위젯 부동, Toolbox 위젯, MW 시뮬, TF 라벨.
- **M2(이 스펙 1차 적용)**: §1 Toolbox 구조 반전(테이블→푸터→탭) + Commission/Swap 컬럼 + 총손익 + Ctrl+T 접기 + §3.4 핫키 골격.
- **M3**: Navigator 트리, MW 탭/컨텍스트, 차트 컨텍스트, TF 21종, Line Studies 전체 아이콘.
- **M4+**: 실주문/청산(서버 RPC), 실봉 차트, 도킹 리사이즈(차트 영역 연동).

---

## §7. GAP LIST (최우선 산출물) — 우선순위순

> 형식: **{MT5 실제 / 현행 / 한 줄 수정방향}**. 🔴=핵심충실도, 🟡=중요, 🟢=보강.

### 🔴 P1 — Toolbox 3단 구조 상하 반전 (시그니처)
- **MT5**: 위=포지션 테이블 → 중간=계좌 요약 **sticky footer** → 아래=탭 스트립(패널 최하단).
- **현행**: 위=탭 스트립 → 중간=계좌 바(스크롤됨) → 아래=테이블. (완전 반대)
- **수정**: `toolboxBodyHTML`/`renderToolbox` DOM 순서를 `[table][acct-footer(position:sticky;bottom:0)][tabs(맨아래)]`로 재배열. `.tbxtabs`를 flex column의 마지막, `.tbxacct`에 `position:sticky; bottom:0`.

### 🔴 P2 — 계좌 요약이 sticky footer 아님 + 총 Floating P/L 없음
- **MT5**: 계좌 요약이 포지션 수와 무관하게 **항상 보임**(테이블만 스크롤). 총손익 **우측정렬·색상·굵게**.
- **현행**: `.tbxacct`가 본문 상단 일반 flex(스크롤 시 사라짐). 총손익 항목 자체 없음. 우측은 `DEMO` 뱃지.
- **수정**: 계좌 라인을 테이블 컨테이너 밖 sticky 푸터로 분리, 오른쪽 끝에 `Σprofit`(pl-pos/pl-neg) 추가.

### 🔴 P3 — Toolbox 하단 풀폭 도킹 + Ctrl+T + 상단경계 리사이즈
- **MT5**: 하단 풀폭 고정, 상단 경계만 드래그로 높이, Ctrl+T 접기/펴기.
- **현행**: 자유 부동 위젯, 8방향 리사이즈, Ctrl+T 없음.
- **수정**: Toolbox를 도크 컨테이너로(폭=뷰포트 고정, top-edge ns-resize만), `keydown Ctrl+T` = collapse 토글.

### 🔴 P4 — 포지션 테이블 Commission·Swap 컬럼 누락
- **MT5**: 12컬럼(…Price 현재 · **Commission · Swap** · Profit).
- **현행**: 10컬럼(Commission/Swap 빠짐).
- **수정**: `renderToolbox` 헤더/행에 `Commission`,`Swap` 삽입(데모값 0.00), `DEMO_POS`에 필드 추가.

### 🔴 P5 — 실제 핫키 핸들러 전무
- **MT5**: F9/Ctrl+T/Ctrl+M/Ctrl+N/Ctrl+D/F8/F11/+·−/Ctrl+G/Ctrl+L/Ctrl+I/Ctrl+B/Ctrl+F/Alt+1~3 등.
- **현행**: keydown 리스너 0개(F9=툴팁, F1=상태바 텍스트뿐).
- **수정**: 전역 `keydown` 라우터 추가 → §3.4 표대로 매핑(최소 뷰토글군 Ctrl+M/N/T/D + F9 + F11 + ±).

### 🟡 P6 — Timeframes 9종 → 21종
- **MT5**: M1 M2 M3 M4 M5 M6 M10 M12 M15 M20 M30 H1 H2 H3 H4 H6 H8 H12 D1 W1 MN.
- **현행**: `TFS`=9종.
- **수정**: `TFS` 21종으로 확장(툴바 가로 스크롤 이미 지원).

### 🟡 P7 — Navigator 빈 프레임
- **MT5**: Accounts/Indicators/Expert Advisors/Scripts/Market/Signals 트리.
- **현행**: `frame()`("Foundation").
- **수정**: 6섹션 접이식 트리 골격 + 더미 리프.

### 🟡 P8 — Market Watch 우클릭이 MT5와 무관 + 하위탭·컬럼 부족
- **MT5**: 우클릭=New Order/Chart Window/Specification/Symbols/컬럼토글…, 하위탭 Symbols·Details·Trading·Ticks, 선택컬럼 Time/High/Low.
- **현행**: 우클릭=클래스 필터(All/Forex/Stocks/Crypto)만, 단일 뷰, 컬럼 4개.
- **수정**: MT5 컨텍스트 항목 추가(자체 필터는 서브메뉴로), 하위탭 골격, Time/High/Low 선택컬럼.

### 🟡 P9 — Standard 툴바 뷰토글/차트/프로필 버튼 누락 + 핫키 라벨 없음
- **MT5**: New Chart▾/Profiles▾/Templates▾/MW·Data·Nav·Toolbox 토글/Strategy Tester, 툴팁에 단축키 병기.
- **현행**: 뷰토글군 없음, One-click/Lock/Signals 등 비표준 포함, 툴팁에 핫키 대부분 없음.
- **수정**: 뷰토글 4종+테스터+New Chart/Profiles/Templates 추가, 툴팁 `이름 (핫키)` 병기, 비표준은 유지하되 그룹 분리.

### 🟢 P10 — Line Studies 드로잉 도구 대량 누락
- **MT5**: 채널3종·Pitchfork·Gann3·Elliott·Fibo6·화살표/라벨군·연속그리기 토글.
- **현행**: Cursor/Crosshair/V·H라인/Trend/Fibo1/Text/Shapes만.
- **수정**: 아이콘 인벤토리를 §2.3 목록으로 확장(동작은 M3+).

### 🟢 P11 — 차트 우클릭 컨텍스트 + F8 Properties 없음
- **MT5**: Trading/Indicators/Objects/Templates/Grid/Volumes/ChartType/Zoom/Properties(F8).
- **현행**: 차트 위젯 우클릭 미구현.
- **수정**: 차트 컨텍스트 메뉴 골격 + F8 연결.

### 🟢 P12 — 상태바 서버/핑/트래픽·서버시각 누락
- **MT5**: 연결서버·ms·kb, 서버(브로커) 시각.
- **현행**: 서버/핑/트래픽 없음, 로컬 시각.
- **수정**: 상태바에 서버·핑·트래픽 슬롯 추가, 시각을 서버 기준으로.

### 🟢 P13 — Toolbox 나머지 11탭 foundation
- **MT5**: Exposure/History/Calendar/Journal 등 각 실데이터.
- **현행**: Trade 외 전부 `foundation` 문구.
- **수정**: 우선순위 낮음 — Exposure/History/Journal 순으로 점진 구현(M3+).

---

## §8. 검증 훅 (CLAUDE.md 준수)

- 구조 변경(§1 Toolbox)은 **UI 코드** → 완료 전 `node tests/verify.js` 필수(인라인 JS 파싱 + diagnose 스캔). 돈 코드 0이므로 sports/fx 돈 테스트는 무관하나, verify 게이트는 통과 확인.
- 총손익/Equity 계산을 **추측 델타로 채우지 않는다** — 실피드 연결 시 서버값만(§5). M1/M2는 데모 스냅샷에 `DEMO`/`SIM` 정직표기 유지.
- 핫키/도킹은 **행동 버그 클래스** → 회귀 시 `tests/*.test.js` 추가 고려(예: Ctrl+T 토글 후 탭 스트립 잔존, 푸터 항상 가시).

---

### 부록 A. 현행 파일 참조 좌표 (수정 착지점)
- Toolbox 마크업: `toolboxBodyHTML()` / `renderToolbox()` (약 L515~528) — **§1 재구조화 지점**.
- 계좌 라인 CSS: `.tbxacct`(L159~163), 테이블 CSS: `.postbl`(L164~171) — sticky footer 전환.
- 탭 스트립 CSS/순서: `.tbxtabs`(L153~157) — 최하단 이동.
- 툴바 배열: `TOOLS`(L579~617) / 렌더 `mt5Toolbar()`(L621~644) — §2 diff.
- 타임프레임: `TFS`(L428) — 21종 확장.
- Market Watch 컨텍스트: `mwControls()`(L647~666) — §3.1 컨텍스트 교체.
- 상태바: `.statusbar`(L257~266) + `updateStatus()`(L676~682) — §3.5.
- 핫키: **없음** — 신규 전역 `keydown` 라우터 추가(§3.4).

*(끝. 코드 미변경 — 스펙 문서만 작성.)*

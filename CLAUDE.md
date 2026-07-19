# ALPEXA — 작업 규칙 (CLAUDE.md)

> 이 파일은 매 세션 자동 적용된다. 여기 규칙은 **무관용**이다.
> 특히 돈(잔고·ledger·정산·출금·이체·스테이킹)을 다루는 코드는 규칙 위반 시 작업 중단.

---

## 🔒 핵심 계약 — 돈 코드는 "증명"으로만 움직인다

### 0. 마음가짐
- **추론은 가설일 뿐, 증거가 아니다.** 실행해서 눈으로 보기 전엔 "고쳤다 / 됐다 / 정상"이라고 절대 말하지 않는다.
- **내 가정을 의심한다.** "이 변수는 여기서만 바뀌겠지" — 이게 과거 버그의 원인이었다. 항상 grep으로 **모든 읽기·쓰기 지점**을 먼저 센다.
- **가장 작은, 되돌릴 수 있는 변경.** 한 번에 한 가지. 고치고 → 검증하고 → 다음.

### 1. 손대기 전 (READ-BEFORE-WRITE)
돈/상태를 바꾸는 코드는 편집 **전에 반드시**:
1. 그 상태(예: `balance`)를 **바꾸는 모든 곳**을 grep으로 나열한다.
2. 각 지점이 **누가 차감/지급하는지**(서버 RPC냐 / 클라 로컬이냐) 표로 적는다.
3. **불변식(invariant)을 한 줄로 명시**한다.
4. 표·불변식을 **사용자에게 먼저 보여주고 승인받는다.** 그 전엔 편집 금지.

### 2. 고치는 절차 (RED → GREEN → SHOW)
1. **버그를 테스트로 재현한다 (RED).** 실제로 빨강을 본다. 가능하면 실제 프로덕션 데이터와 일치시켜 "추측 아님"을 증명한다.
2. 그 다음 고친다.
3. 같은 테스트가 **초록(GREEN)** 이 되는 걸 본다.
4. **빨강→초록 전환을 사용자에게 보여준다.** 말이 아니라 출력으로.

### 3. 절대 금지
- ❌ 실행/테스트 없이 "고쳤다·됐다·정상" 말하기.
- ❌ 변수 한 곳만 보고 편집하기 (나머지 사용처 안 세고).
- ❌ 돈을 **델타(변화량) 추측**으로 옮기기 — 항상 **명시적·멱등(idempotent) 기록**으로.
- ❌ 같은 일을 **두 경로**가 하게 두기 (클라 정산 + 서버 정산 동시 등). 진실은 **한 곳**.

### 4. "완료"의 정의 — 아래 전부 충족돼야 "완료"라고 말한다
- [ ] **`node tests/verify.js` 가 🟢 (자가검증 게이트).** UI·돈 코드 바꿨으면 *반드시* 돌리고 통과 확인. 안 돌렸으면 "완료" 금지.
- [ ] 불변식을 적었고, 변경이 그걸 깨지 않음을 **테스트로** 보였다. (새 로직 → `tests/*.test.js` 추가)
- [ ] 영향받는 모든 지점을 확인했다 (grep 목록). **스키마/키/제약 바꿀 땐 그걸 참조하는 트리거·RPC·on-conflict를 먼저 grep** (안 하면 가입 막힘류 사고).
- [ ] 멱등성 확인: 같은 동작 2번 = 1번 효과.
- [ ] 사용자에게 빨강→초록(또는 실제 화면)을 보여줬다.

> ⚙️ **자가검증 도구 `tests/verify.js`** — (1) 모든 앱 인라인 JS/JSX 파싱(구문에러 차단) + (2) 모든 `tests/*.test.js`(RED→GREEN 행위 증명) + (3) **`tests/diagnose.js` 결함예방 스캔**(우리가 실제로 친 버그 클래스 — 클라 ledger insert·balance 직접 update·service_role 노출·데모주소·fail-open 크론 — 을 정적으로 잡는 poka-yoke)을 **한 번에**. 사용자가 클릭하다 버그를 찾게 두지 말고, **내가 먼저 이걸로 잡는다.** 한 줄: `node tests/verify.js`
>
> 🔁 **Control 루프(식스시그마):** 새 버그를 칠 때마다 `결함-로그.md`에 클래스·근본원인 한 줄 추가 → 행위버그면 `*.test.js`, 패턴버그면 `diagnose.js`에 체크 추가(정밀하게; 오탐 체크는 무시당해 더 해롭다). 스캔이 멀쩡한 코드 잡으면 패턴 약화 말고 **검토된 예외(ACCEPTED)에 이유와 함께** 등록.

### 5. 구조적 원칙 — 버그 클래스 자체를 없앤다
- 돈 잔고는 **서버가 유일한 주인.** 클라는 **보여주기만** 한다.
- 🚫 **돈/잔고/보유/베팅을 `localStorage`에 "진실"로 저장하지 않는다.** 클라는 **매 로드마다 서버에서** 가져와 표시만 한다. 로컬 캐시는 (1)stale, (2)**계정간 누수**(한 브라우저 2계정→A 잔고가 B에 보임), (3)이중계산의 근원 — **$60/$80 이중차감·$90 누수가 전부 여기서 나왔다.** 돈 캐시를 "지키는" 코드(예: `cacheOwner`)를 추가하지 말고 **로컬에서 돈을 빼라.** (UI 설정·세션 토큰은 로컬 OK, 돈은 금지.)
  - 🔑 **세션 저장 = `sessionStorage`(탭별), `localStorage` 아님** (2026-06-29). 손님 Supabase 세션을 `sessionStorage`에 둠 → **탭마다 독립 세션 = 한 브라우저서 2계정 공존 가능.** 트레이드오프: **새 탭은 로그아웃 상태로 시작**(세션 미공유), 탭 내 새로고침은 유지, 탭/브라우저 닫으면 재로그인. (돈은 여전히 서버 전용 — 세션 *토큰* 저장 위치만 바꾼 것, #5 "돈 금지"와 무관.) 어드민(백오피스)은 단일이라 격리 `localStorage` 키 유지.
    - ⚠️ **3곳이 반드시 같은 storage여야 한다** — `alpexa-sync.js`(앱), `login.html`, `signup.html` 각각 `createClient`. 하나라도 다르면 로그인이 한 storage에 세션 쓰고 앱이 다른 데서 읽어 **로그인 루프** (실제로 login/signup이 localStorage였어서 모바일 깨졌음). `createClient` 손댈 땐 3곳 다 같이.
  - ⚠️ (옛 한계, 위로 해소) `localStorage`는 탭끼리 공유라 동시 2계정 불가였음 → 세션을 `sessionStorage`로 옮겨 해결. 돈 누수(로컬 캐시) 금지는 그대로.
- 모든 잔고 변동 = **서버 RPC + 멱등 ref.** 클라가 ledger에 델타 올리는 길은 폐쇄한다.
- *불법 상태를 표현 불가능하게.* "조심해서" 두 번 적용을 피하는 게 아니라, **두 번 적용이 불가능하게** 만든다.

> 🧠 **코딩 전 필수:** 손대기 전 **이 CLAUDE.md를 먼저 읽는다**(특히 #1 READ-BEFORE-WRITE, #5). 규칙이 방향을 정한다 — 안 읽고 코딩하면 거꾸로 간다(실제로 #5를 안 보고 돈 캐시에 `cacheOwner` 키를 *추가*하는 정반대 짓을 했다).

---

## 💰 돈 불변식 (현재 진실)
- `accounts.balance == 오프닝 + Σ(ledger)` — ledger 트리거 `trg_apply_ledger`가 적용.
- 모든 돈 이동은 **서버 RPC**로: `place_bet`, `cash_out`, `app_transfer`, `crypto_trade`, `swap_crypto`, `stake_crypto`, `unstake_crypto`. 정산은 Edge `sports-settle`.
- 멱등: 베팅 지급 `betpay-<id>`, 이체 `xfer-...`, 보정 `fix-...` 등 **ref로 중복 차단**.
- 정산 이중지급 방지: 서버·앱이 `positions` 행을 **삭제로 선점(claim)** → 먼저 지운 쪽만 지급.
- ⚠️ 알려진 약점: 클라 `syncSportsBal`이 잔고 델타를 추측해 ledger에 올림 → baseline(`__sbLastPushed`) 한 곳만 어긋나도 이중계산. **구조적 폐쇄 대상(#5).**
- **오즈 불변식 (2026-07-08):** 실라인(overlay/ESPN) 없는 경기는 **베팅 불가.** `sports-games`는 가짜 `-140/120`을 **만들지 않고 빈 배열** + `oddsReal:false`를 심는다. 클라는 `oddsReal===false`면 🔒 잠금(data-am 미부여), 서버 `place_bet`은 그 경기 leg를 거절 = **돈 관문.** 서로 다른 피드(ESPN↔The Odds API) 결합은 마지막단어(nick)가 아니라 **정규화 토큰 부분집합 + 유일매칭 + 킥오프 6h**로(축구 클럽 접미사 대응). 감시: `place-bet-odds.test.js`·`sports-render.test.js`·feed-check **🚨샘**열·마스터 감사 **C10**. → **가짜 라인이 베팅 가능하면 🔴, 잠기면 정상.**

## 🏦 금융 업계 표준 — MT5 구조 (무관용)
> **모든 거래·정산·표시·리스크 로직은 실제 규제 브로커(MT4/MT5)와 동일한 규율·구조를 따른다. 임의 발명 금지.**
> 손대기 전 자문 한 줄: **"규제받는 진짜 브로커가 이렇게 하나?"** — 아니면 그 자체가 결함(상식 밖 = 하면 안 됨).
- **모든 상품에 딜링 스프레드** — FX·크립토·주식·지수 전부 스프레드 부과, 하우스 수취(무스프레드 상품 없음). 체결=서버 mid, 청산=`mid∓half`, **플로팅=서버 실현손익과 동일**(가짜 ± 금지). 스프레드 파라미터 서버·클라 **락스텝**: `fx_close.sql` v_half ↔ `trading.html` `ALPEXA_SPREAD_BPS`/`fxHalfSpread`/`fxClosePx` (FX=pip기반 `spr_pts+markup_pts`, 비FX=bps CRYPTO 10·STOCK 8·INDEX 6). **한쪽만 고치면 플로팅이 실현과 어긋난다 — 항상 양쪽.**
- **체결가=서버 권위** (`fx_open`/`fx_close` RPC만, 클라 위조 불가) · **손익=실시간 피드 mid로 마크**(시뮬 드리프트로 P&L 금지) · **피드 없는 상품은 거래목록에서 제외**(거래불가한데 가능처럼 보이면 안 됨).
- 마진/레버리지/스왑/마진콜·스탑아웃은 자산군별 업계 표준. → 마스터 감사 **차원 9** + `tests/fx-floating-spread.test.js`(플로팅==서버 실현).

## 🧪 테스트
- `node tests/sports-balance.test.js` — 베팅 잔고 이중차감 회귀 테스트(프로덕션 ledger와 일치하는 RED + 수정 GREEN). 돈 로직 건드리면 반드시 통과 확인.
- `node tests/fx-floating-spread.test.js` — FX앱 플로팅이 서버 `fx_close` 실현손익과 동일(전 상품 스프레드, 실제 mid 마크). FX 체결/스프레드 손대면 반드시 통과.
- `node tests/crypto-dashboard-wallet.test.js` — 지갑 헤드라인 행위 게이트(헤드리스+스텁): 미로그인=Sign-in CTA · 로그인=실총액(KV Total 동일소스) · 세션 하이드레이션 레이스 자가치유 (결함-로그 2026-07-19 ×2의 영구핀, verify 자동 포함).
- `node tests/login-flow.test.js` — login.html 클라 E2E(스텁 인증): 로드 무에러·해피패스(성공화면→alpexa.me→dest2 라우팅)·실패패스(에러바+버튼복구). verify 자동 포함.
- `node tests/feed-liveness-check.js` — **시세 라이브니스 프로브**(네트워크 필요·크론/수동): 라이브 화면의 시세 셀을 20s 관찰해 "값은 있는데 안 움직임"(sticky wsLive류) 실측. 크립토 24/7 필수, FX 주말 자동 스킵. 크론 = `.github/workflows/feed-liveness.yml`(⚠️ main에 있어야 스케줄 활성 — daily-sports-check와 동일).

## 🏟️ 스포츠/피드 작업 규율 (무관용 — 2026-07-07 블랙아웃에서 나옴)
> 스포츠·피드·배당·경기목록을 손대기 전 **이 순서를 강제**한다. 안 지켜서 하루를 날렸다 (죽은 경로 수정·전종목 블랙아웃·이상배당·NFL 사라짐).
> ⛔ **범위 합리화 금지 (2026-07-08).** 스포츠 앱 파일(`index.html`·`sports-live.html`·`sports-*`)을 **규모 불문** 건드리면 — 뱃지·CSS·문구 한 줄이라도 — "완료" 전 **`node tests/verify.js` + `node tests/sports-feed-check.js` 둘 다** 돌린다. *"이건 그냥 뱃지라 피드랑 무관"* 같은 스스로의 합리화가 오늘의 실수였다: 그 합리화로 feed-check를 건너뛰어 **가짜배당 버그를 하루 늦게** 발견했다. 피드 헬스는 3분이면 돈다 — 건너뛸 이유 없음.
1. **소스부터 추적 (증상 근처 금지).** "이 화면은 데이터를 **어디서** 읽나?" → 스포츠 앱 = **`live_games` 테이블** ← `sports-games` Edge ← ESPN. 클라 ESPN fetch는 **폴백(죽은 경로)**. 증상 옆 코드를 고치지 말고 **소스**를 고친다.
2. **손대기 전/후로 현실을 본다.** 전: `node tests/sports-feed-check.js`(종목별 커버리지·배당 실/가짜/없음·TBD·broken). 후: `node tests/verify.js`(렌더 블랙아웃 차단) + feed-check 재실행. **빨강→초록을 눈으로 보기 전 "완료" 금지.**
3. **한 번에 하나, 작게, 되돌릴 수 있게.** 4곳(배당·화면·베팅·정산) 동시 변경 = 어디서 터졌는지 모름.
4. **한 개가 전체를 못 죽이게.** 리스트 렌더(`map`)는 **항목별 try/catch로 격리**(한 경기 에러 → 그 카드만 빈칸). `tests/sports-render.test.js`가 이걸 강제 — 지우면 verify 🔴.
5. **배포 하위호환.** 데이터 모양 바꾸면 **옛 클라+새 클라 둘 다** 되게(예: 축구 2-way ml + 1X2 threeWay 병행). 서비스워커 캐시 때문에 옛 클라가 한동안 돈다.
6. **배포 초록 확인 후에만 "라이브".** Pages 간헐 실패 있음 → GitHub Actions 초록 확인. 서비스워커=네트워크우선(고객 자동최신).
- ⚙️ 도구: `tests/sports-feed-check.js`(라이브 피드 헬스, 네트워크 필요·수동/크론) · `tests/sports-render.test.js`(렌더 격리, verify 게이트) · 감사 프롬프트 `스포츠-마스터-감사.md`.

## 📡 시세 피드 현황 + 데이터 플랜 (2026-07-13 확정 — 매번 재확인하지 말 것)
- **Polygon.io = 유료 Currencies 플랜** (FX·메탈. 실시간 스냅샷 + **실시간 웹소켓 포함**. 키=Edge env `POLYGON_KEY`, 클라 노출 절대 금지). 근거: `fx-prices/DEPLOY.md` + fx-stream WS auth 성공 실측.
- **Finnhub = 무료 티어** (주식. REST 60콜/분 한도 + **실시간 US 체결 웹소켓은 무료 포함**. 키=`FINNHUB_KEY`).
- **Binance = 공개 데이터 미러** (크립토. `data-api/data-stream.binance.vision`, 키 불필요·무료. binance.com 본체는 geo-fence라 미러만 사용).
- **파이프라인 (전부 라이브 검증됨):** 크립토=클라 Binance WS 직결(ms) + 크론 3초 폴백 · FX=`fx-stream` WS 펌프(~1초, job `fx-stream-1m`) + `fx-prices` 3초 폴백 · 주식=`stock-stream` WS 펌프(2~8초, job `stock-stream-1m`) + `stock-prices` 1분 폴백(+ALPXS) · 클라 수신=Supabase Realtime 푸시(`prices` publication) + 1초 폴링 폴백. 크론 진단/튜닝/롤백 = `supabase/sql/feed_speed_tune.sql`.
- **WS 펌프 Edge 공통 규칙:** 대시보드에서 JWT verify **OFF**(함수 내 `CRON_SECRET` 검사가 관문) · spr_pts 단위는 기존 작성자와 동일하게(FX 정수핍·크립토 bps·주식 0) — 단위 새로 발명 금지(결함-로그 2026-07-13).
- **아침 감시 2층 (2026-07-13):** ① Claude 루틴 `trig_01VUfQyWNpydMtCKnghmXNE5` — 매일 15:00 UTC(베가스 8시) 이 세션에서 feed-check+오늘 경기·오즈 점검 후 **능동 보고**. ② GitHub Action `daily-sports-check.yml`(main) — 매일 ~16-17 UTC **침묵 게이트**(빨강 시만 이메일, 7/7부터 전회 초록). 서로 백업 — 하나 지운다고 감시가 사라지지 않게 둘 다 유지.
- **일일 자가검진 2회 (2026-07-19, 사장님 지시 "알림은 사후 — 매일 자체 확인"):** 아침 루틴(15:00 UTC) + 저녁 루틴 `trig_01SjQexqmcFzqDcKhyZwns8c`(03:00 UTC = 베가스 8PM) 둘 다 **`node tests/daily-selfcheck.js` 한 방**으로: ① 스케줄·오즈(오늘/내일 경기·실배당/잠금·가짜라인) ② 주문·결제·미청산 = `sports-audit` C1~C9 verdict·미청산 건수·최대노출·홀드 ③ 시세 라이브니스(서버 prices 크립토 신선도 실측). 🟢=3줄 요약 보고, 🔴=즉시 원인 추적→수정→결함-로그. 전부 읽기 전용(돈/쓰기 0). 이메일 알람과 상호 백업. 추가로 `feed-liveness` Action(main) 최근 런도 확인.

## 📌 보류 백로그 (조건 충족 시 사용자에게 먼저 리마인드할 것)
- **[감시 중 2026-07-16] ⛳ 여자골프(LPGA)**: The Odds API에 현재 여자 대회 키 없음(프로브 실측 — golf 키 4개 전부 남자 메이저). sports-odds가 일 1회 종목 카탈로그를 `sports_odds.__sports_list`에 적재하고 feed-check가 **신규 골프/LPGA 키 등장 시 📣 알림** → 뜨면 사용자에게 확장 제안(작업 반나절: 키 추가+대회명 매처+ESPN golf/lpga+정산 스코어보드). 세션에서 Odds API 직접 호출은 네트워크 정책상 불가 — 카탈로그 행 경유가 유일 경로.
- **[라이브 2026-07-16] ⛳ 골프 우승자(outright) 배팅**: SQL+Edge 3종 배포 완료, 실측 검증 — 디 오픈 60명 실배당(라이브 5분 갱신+oddsTs), Corales/3M은 배당 키 없어 잠금(오즈 불변식 ✓, "3M Open" 오매칭 차단 ✓). 불변식: 골프 leg는 실 outright 가격+`oddsReal:true`일 때만 수락, **라이브 대회는 oddsTs 15분 신선도 게이트**(fail-closed), 지급은 sports-settle 단독(ESPN 확정 우승자, betpay- 멱등), 동일대회 우승픽 2개 팔레이 거절. 마스터스 2027 등 원거리 선물은 v1 미지원(ESPN 스코어보드 창 내 대회만). **잔여 관문: 첫 대회 정산(디 오픈 일요일) 확인.**
- **[보류 2026-07-14] 카본 스킨**: 시안 2종 라이브 — `fx-dashboard-preview.html`(24×24 위젯 대시보드) · `webtrade-carbon-preview.html`(터미널에 스킨 덧입힌 뷰어, 원본 무변경). 사용자가 채택 결정하면: 정식 구현은 **`?skin=carbon` 테마 레이어**(CSS 변수 + CHART_THEME carbon 항목, 기본값 MT5 유지) — 파일 복사 금지. 참고 디자인 = 브랜치 `claude/sports-betting-dashboard-dmtsy0`.
- **[완료 2026-07-13] 시세 3단계 전체**: 크립토 = webtrade Binance WS 직결(실브라우저 초당 2회 확인) · 주식 = `stock-stream`(AAPL 1분→2~8초 실측) · FX = `fx-stream`(EURUSD 3초→평균 1.5초 실측, 120초에 91회). 상세는 위 📡 섹션. 잔여(고객 생기면): Realtime 패턴 crypto-live.html 확산(trading.html은 2026-07-13 완료) · 주식 차트 실봉(현재 합성 폴백 — Finnhub 캔들 API는 무료 티어 제한, 유료 결정 필요). 차트 실봉: FX=fx-prices ?candles(공개 분기·200봉) · 크립토=Binance klines 클라 직결(2026-07-13 라이브 검증: M1 평균 2.9핍 실구조).

## 🚚 배포 / 운영
- GitHub Pages는 브랜치 `claude/wizardly-ritchie-lsRnz`에서 서빙 (CNAME alpexa-sports.com). **푸시는 이 브랜치에만.**
- 캐시: `Ctrl+Shift+R` 또는 `?v=N`. 빠른 연속 푸시는 Pages 빌드를 취소시킴.
- Crypto/FX = React + in-browser Babel(JSX). Sports/site = vanilla JS.
- SQL / Edge 배포는 **사용자가** 실행 (Claude은 못 함). Claude은 검토된 SQL을 제공.
- 시간대는 **라스베가스/PDT** 기준 (UTC 아님).
- 모델 식별자를 커밋·코드·PR에 절대 넣지 않는다.

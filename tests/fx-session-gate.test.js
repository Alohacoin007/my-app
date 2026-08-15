// Alpexa — 서버 세션 게이트 락스텝 핀 (정적+미러, 네트워크 0, 돈 0)
//
// 증명하는 계약:
//  ① 기능 보존 — fx_open_session.sql(v3 통합)의 fx_open이 세션 게이트(MARKET_CLOSED)뿐 아니라
//     기존 슬리피지(SLIPPAGE)·마진(MARGIN)·멱등(duplicate)·스프레드 체결을 전부 유지
//     (통합이 기능을 떨어뜨리는 "부분 복제" 클래스 차단)
//  ② 캘린더 락스텝 — 서버 fx_market_open(SQL)의 JS 미러 == webtrade · terminal · 모바일 **3종 전부**.
//     DST 전환주·추수감사절·크리스마스 반일을 포함해 15분 간격 전수.
//
// 왜 4자 전수인가 (2026-08-15 사장님 "FX 오픈시간이랑 주식 오픈시간 다르니 맞게 세팅해야해"):
//   구버전은 세션 경계를 **UTC 고정 시각**으로 박아뒀다 — 주식 13:30–20:00 UTC, FX 22:00 UTC.
//   그런데 실제 경계는 뉴욕 현지시각에 붙어 있다(주식 09:30–16:00 ET · FX 일·금 17:00 ET).
//   그래서 주식 창은 **여름(EDT)에만**, FX 창은 **겨울(EST)에만** 맞았다 = 1년 내내 둘 중 하나가 틀림:
//     · 겨울 13:30–14:30 UTC — 장 안 열렸는데 서버가 거래 허용 → **정지가 차익거래**(우리가 막으려던 그 구멍)
//     · 겨울 20:00–21:00 UTC — 장 열렸는데 거절 → 정상 고객 차단
//     · 여름 금 21:00–22:00 UTC — FX 주간 마감 후인데 열어둠 (실제로 2026-08-14 금요일에 발생)
//   모바일만 ET 기준이라 **모바일↔서버가 어긋나 있었다.** 구 핀이 이걸 놓친 이유는 두 가지:
//   (a) 클라를 terminal 하나만 대조 (b) 표본이 2026-07 여름 2주뿐 → DST 경계를 한 번도 안 밟음.
//   또 심볼도 EURUSD/BTCUSD/AAPL 3종뿐이라 **금·은(XAUUSD, cls=FX)** 이 클라 휴리스틱에서
//   `/USD$/ → Crypto = 24/7` 로 새는 걸 못 잡았다. → 표본을 DST 전환주 + 반일 + 금속까지 넓힌다.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx session gate — 서버↔클라3종 세션 캘린더 락스텝');

// ── ① 정적: v3 통합 fx_open의 기능 보존 ──
const sql = read('supabase/sql/fx_open_session.sql');
const fxOpenBody = (sql.match(/create or replace function public\.fx_open\([\s\S]*?end;\s*\$\$/i) || [''])[0];
ok('v3 파일에 fx_open 본문 존재', fxOpenBody.length > 0);
ok('fx_open에 세션 게이트 (MARKET_CLOSED)', /MARKET_CLOSED/.test(fxOpenBody));
ok('fx_open이 fx_specs.cls 기반 fx_market_open 호출 (심볼 목록 이중화 금지)', /fx_market_open\(\s*v_cls/.test(fxOpenBody));
ok('기능 보존: 슬리피지 가드 유지', /SLIPPAGE/.test(fxOpenBody) && /p_max_slippage/.test(fxOpenBody));
ok('기능 보존: 마진 게이트 유지', /'MARGIN'/.test(fxOpenBody) && /fx_lev_cap/.test(fxOpenBody));
ok('기능 보존: 멱등(duplicate)·스프레드 체결 유지', /'duplicate'/.test(fxOpenBody) && /v_half/.test(fxOpenBody));

// ── ①b 정적: 서버 캘린더가 **ET 앵커**인가 (UTC 고정 시각 금지) ──
const mktFn = (sql.match(/create or replace function public\.fx_market_open\([\s\S]*?end;\s*\$\$/i) || [''])[0];
ok('fx_market_open 본문 존재', mktFn.length > 0);
ok('세션 경계가 America/New_York 앵커 (DST 자동 추종)', /America\/New_York/.test(mktFn));
ok('UTC 고정 주식창(13:30–20:00)이 사라졌다', !/13\s*\*\s*60\s*\+\s*30/.test(mktFn) && !/20\s*\*\s*60/.test(mktFn));
ok('UTC 고정 FX 경계(22:00)가 사라졌다', !/22\s*\*\s*60/.test(mktFn));
ok('FX 주간 경계 = 17:00 ET', /17\s*\*\s*60/.test(mktFn));
ok('주식 정규장 = 09:30–16:00 ET', /9\s*\*\s*60\s*\+\s*30/.test(mktFn) && /16\s*\*\s*60/.test(mktFn));
ok('반일(13:00 ET 조기폐장) 처리 존재', /fx_is_us_half_day/.test(mktFn) && /13\s*\*\s*60/.test(mktFn));
ok('fx_is_us_half_day 함수가 같은 파일에 정의됨', /create or replace function public\.fx_is_us_half_day/.test(sql));
// 네임드 타임존 변환은 IMMUTABLE 이 아니다 — 잘못 표기하면 플랜 캐싱에서 굳은 값이 재사용될 수 있다
ok('volatility 가 stable (immutable 아님 — tz 변환은 immutable 불가)',
  /returns boolean language plpgsql stable/.test(mktFn), mktFn.match(/language plpgsql \w+/)?.[0]);

// ── ② 서버 미러 (fx_market_open 과 자구 동일해야 함) ──
const HOLIDAYS = new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25','2027-01-01']);
const HALF_DAYS = new Set(['2026-11-27','2026-12-24']);
const DOW = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
function etOf(t) {                                   // UTC epoch → 뉴욕 벽시계
  const p = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour12:false,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', weekday:'short' })
    .formatToParts(new Date(t)).reduce((o, x) => (o[x.type] = x.value, o), {});
  const h = p.hour === '24' ? 0 : +p.hour;
  return { ymd: p.year + '-' + p.month + '-' + p.day, dow: DOW[p.weekday], min: h * 60 + (+p.minute) };
}
function serverOpen(cls, t) {
  if (cls === 'CRYPTO') return true;
  const e = etOf(t);
  if (cls === 'FX') {
    if (e.dow === 6) return false;
    if (e.dow === 0) return e.min >= 17 * 60;
    if (e.dow === 5) return e.min < 17 * 60;
    return true;
  }
  if (e.dow === 0 || e.dow === 6) return false;
  if (HOLIDAYS.has(e.ymd)) return false;
  return e.min >= 9 * 60 + 30 && e.min < (HALF_DAYS.has(e.ymd) ? 13 * 60 : 16 * 60);
}
// 미러가 SQL 의 휴일/반일 목록과 실제로 같은지 (한쪽만 연장하는 사고 차단)
const sqlDates = (re) => new Set(((sql.match(re) || [''])[0].match(/\d{4}-\d{2}-\d{2}/g) || []));
const holSql = sqlDates(/create or replace function public\.fx_is_us_holiday[\s\S]*?\$\$;/i);
const halfSql = sqlDates(/create or replace function public\.fx_is_us_half_day[\s\S]*?\$\$;/i);
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
ok('SQL 휴일 목록 == 테스트 미러', sameSet(holSql, HOLIDAYS), [...holSql].join(','));
ok('SQL 반일 목록 == 테스트 미러', sameSet(halfSql, HALF_DAYS), [...halfSql].join(','));

// ── ③ 클라 3종의 SESSION-CALENDAR 블록 추출 ──
// 정규식으로 함수 본문을 긁으면 코드가 조금만 바뀌어도 조용히 빈 문자열이 되어 **핀이 사라진다**
// (실제로 겪은 사고 클래스). 그래서 각 파일에 마커를 박고 그 사이만 뽑는다 — 못 찾으면 즉시 🔴.
const BLOCK_RE = /\/\* ══ SESSION-CALENDAR[\s\S]*?══ \*\/([\s\S]*?)\/\* ══ \/SESSION-CALENDAR ══ \*\//;
const blockOf = (f) => { const m = read(f).match(BLOCK_RE); return m ? m[1] : null; };

const clients = [];
// 분류기 스텁 = **최악의 현실**: fx_specs 를 못 읽어(RLS/오프라인) SERVER_CLS 가 빈 상태.
// 그때 catOf/mwCat 은 하드코딩 표 + 문자열 휴리스틱만 남는다 → EURUSD·AAPL 은 표에서 살아나지만
// XAUUSD 는 `/USD$/` 에 걸려 **Crypto(24/7)** 로 답한다. 세션 게이트가 이걸 교정하는지 보는 게 핵심.
const STUB_CAT = (s) => s === 'EURUSD' ? 'Forex' : s === 'AAPL' ? 'Stocks' : 'Crypto';
{ // webtrade: marketOpen(symbol, at) — catOf 스텁. 금·은은 catOf 가 Crypto 라 해도 Forex 로 교정돼야 한다.
  const b = blockOf('webtrade.html');
  ok('webtrade SESSION-CALENDAR 블록 추출', !!b);
  if (b) { let fn = null;
    try { fn = new Function('catOf', b + '\nreturn marketOpen;')(STUB_CAT); } catch (e) { }
    ok('webtrade marketOpen 평가 가능', typeof fn === 'function');
    if (fn) clients.push(['webtrade', (sym, t) => fn(sym, t)]);
  }
}
{ // terminal: fxMarketOpen(sym, at) — mwCat 스텁(현행 휴리스틱 그대로 = XAUUSD를 Crypto 라고 답함)
  const b = blockOf('terminal.html');
  ok('terminal SESSION-CALENDAR 블록 추출', !!b);
  if (b) { let fn = null;
    try { fn = new Function('mwCat', b + '\nreturn fxMarketOpen;')(STUB_CAT); } catch (e) { }
    ok('terminal fxMarketOpen 평가 가능', typeof fn === 'function');
    if (fn) clients.push(['terminal', (sym, t) => fn(sym, t)]);
  }
}
{ // 모바일: symOpen(s, at) — 서버 클래스를 그대로 받는다
  const b = blockOf('trading.html');
  ok('모바일 SESSION-CALENDAR 블록 추출', !!b);
  if (b) { let fn = null;
    try { fn = new Function(b + '\nreturn symOpen;')(); } catch (e) { }
    ok('모바일 symOpen 평가 가능', typeof fn === 'function');
    if (fn) clients.push(['mobile', (sym, t) => fn({ sym, cls: CLS[sym] }, t)]);
  }
}

// ── ④ 전수 대조 — DST 전환주·반일·평시, 15분 간격, 4자산 표본 ──
const CLS = { EURUSD:'FX', XAUUSD:'FX', BTCUSD:'CRYPTO', AAPL:'STOCK' };
const WINDOWS = [
  ['DST 종료주 (2026-11-01 EST 전환)', Date.UTC(2026, 9, 28), Date.UTC(2026, 10, 5)],
  ['DST 시작주 (2027-03-14 EDT 전환)', Date.UTC(2027, 2, 10), Date.UTC(2027, 2, 18)],
  ['평시 여름주 (EDT)',                Date.UTC(2026, 7, 10), Date.UTC(2026, 7, 17)],
  ['추수감사절 + 다음날 반일',          Date.UTC(2026, 10, 24), Date.UTC(2026, 10, 29)],
  ['크리스마스이브 반일 + 당일 휴장',   Date.UTC(2026, 11, 22), Date.UTC(2026, 11, 27)],
];
if (clients.length === 3) {
  for (const [label, from, to] of WINDOWS) {
    let n = 0, mism = 0, firstBad = null;
    for (let t = from; t < to; t += 15 * 60e3) {
      for (const sym of Object.keys(CLS)) {
        const want = serverOpen(CLS[sym], t);
        for (const [name, fn] of clients) {
          n++;
          const got = fn(sym, t);
          if (got !== want) { mism++; if (!firstBad) firstBad = { client:name, sym, at:new Date(t).toISOString(), server:want, client_says:got }; }
        }
      }
    }
    ok(label + ' — 서버↔클라3종 일치 (' + n + '표본)', mism === 0,
      mism ? mism + '건 불일치, 첫 건: ' + JSON.stringify(firstBad) : '');
  }
  // 회귀 못박기: 구버전이 실제로 틀렸던 정확한 순간들
  const CASES = [
    ['2026-11-02T14:00:00Z', 'AAPL', false, '겨울 09:00 ET — 개장 30분 전. 구버전은 열렸다고 했다(정지가 차익거래)'],
    ['2026-11-02T20:30:00Z', 'AAPL', true,  '겨울 15:30 ET — 장 마지막 30분. 구버전은 닫혔다고 했다'],
    ['2026-08-14T21:30:00Z', 'EURUSD', false, '여름 금 17:30 ET — FX 주간 마감 후. 구버전은 열어뒀다'],
    ['2026-08-16T21:30:00Z', 'EURUSD', true,  '여름 일 17:30 ET — FX 개장 후. 구버전은 닫아뒀다'],
    ['2026-11-27T18:30:00Z', 'AAPL', false, '추수감사절 다음날 13:30 ET — 반일 폐장 후'],
    ['2026-12-24T17:30:00Z', 'AAPL', true,  '크리스마스이브 12:30 ET — 반일이라도 13:00 전엔 열림(과잉 차단 반례)'],
    ['2026-12-24T18:30:00Z', 'AAPL', false, '크리스마스이브 13:30 ET — 반일 폐장 후'],
    ['2026-08-15T20:00:00Z', 'XAUUSD', false, '토요일 금 시장 — 클라 휴리스틱이 /USD$/→Crypto(24/7)로 새면 안 된다'],
    ['2026-08-15T20:00:00Z', 'BTCUSD', true,  '토요일 크립토 — 24/7 이므로 열림'],
  ];
  for (const [iso, sym, want, why] of CASES) {
    const t = Date.parse(iso);
    if (serverOpen(CLS[sym], t) !== want) { ok('미러 자체 반례: ' + iso + ' ' + sym, false, why); continue; }
    let allOk = true, who = '';
    for (const [name, fn] of clients) if (fn(sym, t) !== want) { allOk = false; who += ' ' + name; }
    ok(iso + ' ' + sym + ' → ' + (want ? '열림' : '닫힘') + ' (' + why + ')', allOk, '어긋난 클라:' + who);
  }
} else {
  ok('클라 3종 모두 추출·평가 성공 (전수 대조 선행조건)', false, clients.length + '/3');
}

console.log((fail ? '🔴' : '🟢') + ' fx-session-gate — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

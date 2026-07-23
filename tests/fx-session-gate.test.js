// Alpexa — 서버 세션 게이트 락스텝 핀 (정적+미러, 네트워크 0, 돈 0)
//
// 증명하는 계약:
//  ① 기능 보존 — fx_open_session.sql(v3 통합)의 fx_open이 세션 게이트(MARKET_CLOSED)뿐 아니라
//     기존 슬리피지(SLIPPAGE)·마진(MARGIN)·멱등(duplicate)·스프레드 체결을 전부 유지
//     (통합이 기능을 떨어뜨리는 "부분 복제" 클래스 차단)
//  ② 캘린더 락스텝 — 서버 fx_market_open(SQL)의 JS 미러 == 터미널 fxMarketOpen, 2주 전수(시간 단위)
//     + 미국 휴일 표본에서 FX·CRYPTO·STOCK 3군 모두 동일 판정
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx session gate — 서버 세션 게이트 락스텝');

// ── ① 정적: v3 통합 fx_open의 기능 보존 ──
const sqlPath = path.join(REPO, 'supabase/sql/fx_open_session.sql');
const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';
const fxOpenBody = (sql.match(/create or replace function public\.fx_open[\s\S]*?end;\s*\$\$/i) || [''])[0];
ok('v3 파일에 fx_open 본문 존재', fxOpenBody.length > 0);
ok('fx_open에 세션 게이트 (MARKET_CLOSED)', /MARKET_CLOSED/.test(fxOpenBody));
ok('fx_open이 fx_specs.cls 기반 fx_market_open 호출 (심볼 목록 이중화 금지)', /fx_market_open\(\s*v_cls/.test(fxOpenBody));
ok('기능 보존: 슬리피지 가드 유지', /SLIPPAGE/.test(fxOpenBody) && /p_max_slippage/.test(fxOpenBody));
ok('기능 보존: 마진 게이트 유지', /'MARGIN'/.test(fxOpenBody) && /fx_lev_cap/.test(fxOpenBody));
ok('기능 보존: 멱등(duplicate)·스프레드 체결 유지', /'duplicate'/.test(fxOpenBody) && /v_half/.test(fxOpenBody));

// ── ② 미러: SQL 캘린더의 JS 구현 vs 터미널 fxMarketOpen 전수 대조 ──
// 서버 미러 (fx_open_session.sql fx_market_open과 자구 동일해야 함)
const HOLIDAYS = new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25','2027-01-01']);
function serverOpen(cls, at) {
  const d = new Date(at), dow = d.getUTCDay(), min = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (cls === 'CRYPTO') return true;
  if (cls === 'FX') {
    if (dow === 6) return false;
    if (dow === 0) return min >= 22 * 60;
    if (dow === 5) return min < 22 * 60;
    return true;
  }
  if (dow === 0 || dow === 6) return false;
  if (HOLIDAYS.has(d.toISOString().slice(0, 10))) return false;
  return min >= 13 * 60 + 30 && min < 20 * 60;
}
// 터미널 fxMarketOpen 추출 (mwCat 스텁으로 평가)
const html = fs.readFileSync(path.join(REPO, 'terminal.html'), 'utf8');
const fnSrc = (html.match(/function fxMarketOpen\(sym, at\)\{[\s\S]*?return min>=13\*60\+30 && min<20\*60; \}/) || [''])[0];
const holSrc = (html.match(/const FX_US_HOLIDAYS=new Set\(\[[\s\S]*?\]\);/) || [''])[0];
ok('터미널 fxMarketOpen·휴일 셋 소스 추출', fnSrc.length > 0 && holSrc.length > 0);
const CAT = { EURUSD: 'Forex', BTCUSD: 'Crypto', AAPL: 'Stocks' };
const CLS = { EURUSD: 'FX', BTCUSD: 'CRYPTO', AAPL: 'STOCK' };
let clientOpen = null;
try { clientOpen = new Function('mwCat', holSrc + '\n' + fnSrc + '\nreturn fxMarketOpen;')(s => CAT[s]); } catch (e) {}
ok('터미널 fxMarketOpen 평가 가능', typeof clientOpen === 'function');

if (clientOpen) {
  let n = 0, mismatch = 0, firstBad = null;
  const start = Date.UTC(2026, 6, 19, 0, 0);            // 일요일부터 2주, 30분 간격
  for (let t = start; t < start + 14 * 864e5; t += 30 * 60e3) {
    for (const sym of Object.keys(CAT)) {
      n++;
      const s = serverOpen(CLS[sym], t), c = clientOpen(sym, t);
      if (s !== c && !firstBad) firstBad = { sym, t: new Date(t).toISOString(), server: s, client: c };
      if (s !== c) mismatch++;
    }
  }
  // 휴일 표본 (독립기념일 관측일 2026-07-03 금요일 — 주식만 닫힘, FX는 열림)
  const hol = Date.UTC(2026, 6, 3, 15, 0);
  const holOk = serverOpen('STOCK', hol) === false && clientOpen('AAPL', hol) === false &&
                serverOpen('FX', hol) === true && clientOpen('EURUSD', hol) === true;
  ok('클라·서버 캘린더 2주 전수 일치 (' + n + '표본, 30분 간격, 3자산군)', mismatch === 0, JSON.stringify(firstBad));
  ok('미 휴일: 주식 닫힘·FX 열림 양쪽 동일', holOk);
}

console.log((fail ? '🔴' : '🟢') + ' fx-session-gate — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// Alpexa — FX 로빈후드형 앱 1단계 (dev/trading-rh.html) 행위 게이트 (헤드리스 + supabase 스텁, 네트워크 0)
// ============================================================================
// 계약 (2026-09-17 사장님 "시작해" · 1단계 = 읽기 전용):
//   M1. 돈 이동 0 — 소스에 rpc()/ledger 쓰기/positions 쓰기 없음 + 런타임에서 rpc 호출 0회 (스파이).
//   M2. 표시 락스텝 — bid/ask = mid ∓ half, half = max(0.1, spr_pts+markup_pts)×pip/2 (trading.html 과 동일).
//   M3. Equity = 서버 cash + Σ플로팅, 플로팅 = pnlUSD(open → fx_close 청산가) — 화면 숫자를 스텁 데이터로 재계산해 대조.
//   M4. 돈은 localStorage 에 저장되지 않는다 (rh.* 키는 테마·1-Click·가림 뿐).
//   M5. 1-Click OFF = 글자만 · ON(동의 1회) = 상자 · 상자/주문/청산 탭 = "Stage 2" 토스트 (주문 안 나감).
//   M6. 로드 무에러 · 4탭 렌더 · 포지션/히스토리 실데이터 표시.
// playwright/Chromium 없으면 SKIP(exit 0).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };

// ── (A) 소스 핀: 돈 코드 0줄 ──
const src = fs.readFileSync(path.join(REPO, 'dev/trading-rh.html'), 'utf8');
ok('M1 소스: .rpc( 호출 없음', !/\.rpc\(/.test(src));
ok('M1 소스: ledger / positions / fx_pending 에 insert·update·upsert·delete 없음', !/\.from\(['"](ledger|positions|fx_pending|accounts)['"]\)[\s\S]{0,200}\.(insert|update|upsert|delete)\(/.test(src));
ok('M1 소스: 돈 RPC 호출 없음 (rpc("fx_open"/"fx_close"/"fx_modify"/…) 형태 0건 — settlements kind 필터 "fx_close" 는 읽기)', !/rpc\(\s*['"](fx_open|fx_close|fx_modify|fx_place_pending|fx_cancel_pending|app_transfer|place_bet)['"]/.test(src) && !/functions\.invoke\(\s*['"](fx|broker|withdraw)/.test(src));
ok('M2 소스: half = max(0.1, spr+mk)*pip/2 (fx_close v_half 미러)', /Math\.max\(0\.1,\s*spr\+mk\)\*fxPip\(sym\)\/2/.test(src));
ok('M2 소스: pip 락스텝 (JPY .01 · XAU .01 · XAG .001 · else .0001)', /JPY\$\/\.test\(sym\)\?0\.01:sym==='XAUUSD'\?0\.01:sym==='XAGUSD'\?0\.001:0\.0001/.test(src));
ok('M4 소스: localStorage 에 잔고·포지션 저장 없음 (rh.theme/rh.oneClick/rh.oneClickAck/rh.mask 만)', (src.match(/LS\.set\('rh\.[a-zA-Z]+'/g) || []).every(x => /rh\.(theme|oneClick|oneClickAck|mask)'/.test(x)) && !/localStorage\.setItem\(['"]alpexa\.(balances|fxLive|positions)/.test(src));
ok('세션: trading.html 과 같은 로그인 게이트 + 세션 가드 (login.html 로 회귀)', /localStorage\.getItem\("alpexa\.me"\)/.test(src) && /rhToLogin\("\?expired=1"\)/.test(src) && /alpexa-sync\.js/.test(src));
// 로그인 복귀: 모든 login.html 이동 전에 폐쇄 허용목록 토큰 fx-rh 를 sessionStorage 에 둔다 (URL 로 목적지 선택 불가 — login.html 계약 유지)
ok('복귀 토큰: rhToLogin 이 alpexa.dest2=fx-rh 를 심고 ../login.html 로만 이동', /sessionStorage\.setItem\("alpexa\.dest2","fx-rh"\)/.test(src) && /location\.replace\("\.\.\/login\.html"\+/.test(src) && (src.match(/location\.replace\([^)]*login\.html/g) || []).length === 1);
{ const login = fs.readFileSync(path.join(REPO, 'login.html'), 'utf8');
  ok('login.html: fx-rh 토큰 → dev/trading-rh.html (고정 문자열, URL 파라미터 아님)', /dest2==='fx-rh'\)\s*return\s*'dev\/trading-rh\.html'/.test(login)); }

// ── (B) 헤드리스 행위 ──
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base).filter(x => /chromium/.test(x))) for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const f = path.join(base, d, c); if (fs.existsSync(f)) return f; } } catch (_) {}
  return null;
}
let chromium = null; try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
if (!chromium || !exe) { console.log('⏭️  SKIP trading-rh headless (no playwright/chromium)'); console.log(fail ? `\n🔴 trading-rh FAIL — ${fail}건` : '\n🟢 trading-rh — 소스 핀 초록 (헤드리스 생략)'); process.exit(fail ? 1 : 0); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
function serve(port) { return new Promise(res => { const s = http.createServer((req, rq) => { let p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rq.writeHead(404); rq.end('nf'); return; }
  rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); rq.end(fs.readFileSync(fp)); }); s.listen(port, () => res(s)); }); }

// 스텁 데이터 — 화면 숫자를 여기서 재계산해 대조한다
const FEED = { EURUSD: { mid: 1.15979, spr: 0.6 }, GBPUSD: { mid: 1.35216, spr: 0.8 }, USDJPY: { mid: 146.812, spr: 1.0 }, XAUUSD: { mid: 4348.90, spr: 30 }, AUDUSD: { mid: 0.66341, spr: 0.8 }, USDCHF: { mid: 0.79602, spr: 0.8 }, USDCAD: { mid: 1.38115, spr: 1.0 }, NZDUSD: { mid: 0.59873, spr: 1.0 }, EURGBP: { mid: 0.85768, spr: 1.0 }, EURJPY: { mid: 170.258, spr: 1.6 }, GBPJPY: { mid: 198.511, spr: 2.0 }, XAGUSD: { mid: 52.398, spr: 30 } };
const MARKS = { EURUSD: 0.2 };
const CASH = 12341.10;
const POS = [
  { local_id: 'P1', symbol: 'EURUSD', side: 'BUY', size: 0.10, open_price: 1.15712, pnl: 0, status: 'open', meta: { sl: 1.152, tp: 1.165, swap: -0.42 } },
  { local_id: 'P2', symbol: 'USDJPY', side: 'SELL', size: 0.20, open_price: 147.100, pnl: 0, status: 'open', meta: {} },
];
const stubFn = `() => {
  const FEED = ${JSON.stringify(FEED)}, MARKS = ${JSON.stringify(MARKS)}, CASH = ${CASH}, POS = ${JSON.stringify(POS)};
  window.__rpcCalls = 0;
  const q = (t) => { const o = { _t: t, select: () => o, eq: () => o, order: () => o, in: () => o, limit: () => o,
    then: (res) => res(o._data()), _data: () => {
      if (t === 'prices') return { data: Object.keys(FEED).map(s => ({ symbol: s, mid: FEED[s].mid, spr_pts: FEED[s].spr })) };
      if (t === 'pricing_marks') return { data: Object.keys(MARKS).map(s => ({ symbol: s, markup_pts: MARKS[s] })) };
      if (t === 'accounts') return { data: [{ balance: CASH }] };
      if (t === 'positions') return { data: POS };
      if (t === 'fx_pending') return { data: [{ local_id: 'O1', symbol: 'EURUSD', side: 'BUY', size: 0.1, otype: 'LIMIT', trigger: 1.155, sl: 0, tp: 0, status: 'pending', created_at: new Date().toISOString() }] };
      if (t === 'settlements') return { data: [{ local_id: 'H1', ticket: 'FX-1', symbol: 'GBPUSD', stake: 0.2, pnl: -44, detail: 'BUY 0.20 @ 1.35410 → 1.35190 SL', created_at: new Date().toISOString() }] };
      return { data: [] }; } };
    o.insert = o.update = o.upsert = o.delete = () => { window.__writeCalls = (window.__writeCalls||0) + 1; return o; };
    return o; };
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'auth-1' } } } }), signOut: async () => ({}) },
    rpc: async () => { window.__rpcCalls++; return { data: null, error: null }; },
    functions: { invoke: async () => ({ error: { message: 'stub' } }) },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    from: q }) };
  localStorage.setItem('alpexa.me', JSON.stringify({ custId: 'C-1', name: 'Test User', email: 'boss@x.com', accts: { fx: 'FX-850261', crypto: 'CR-1', sports: 'SP-1' } }));
  sessionStorage.setItem('alpexa.sessChecked', '1');
  localStorage.removeItem('rh.oneClick'); localStorage.removeItem('rh.oneClickAck'); localStorage.removeItem('rh.mask'); localStorage.removeItem('rh.theme');
}`;

// 기대값 재계산 (앱과 독립 구현 — 같은 규칙, 다른 코드)
const pip = (s) => /JPY$/.test(s) ? 0.01 : s === 'XAUUSD' ? 0.01 : s === 'XAGUSD' ? 0.001 : 0.0001;
const contract = (s) => s === 'XAUUSD' ? 100 : s === 'XAGUSD' ? 5000 : 100000;
const half = (s) => Math.max(0.1, FEED[s].spr + (MARKS[s] || 0)) * pip(s) / 2;
const bid = (s) => FEED[s].mid - half(s), ask = (s) => FEED[s].mid + half(s);
const closePx = (s, side) => side === 'BUY' ? bid(s) : ask(s);
const pnl = (p) => { const s = p.symbol; const dist = (closePx(s, p.side) - p.open_price) * (p.side === 'BUY' ? 1 : -1); let q = dist * contract(s) * p.size; const quote = s.slice(3); if (quote !== 'USD') q = q / FEED['USD' + quote].mid; return q; };
const floating = POS.reduce((a, p) => a + pnl(p), 0);
const equity = CASH + floating;
const fmt = (v) => (v < 0 ? '−' : '') + '$' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

(async () => {
  const PORT = 8873, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('trading-rh — 1단계 읽기 전용 행위 게이트');
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  await page.route('**/vendor/supabase.min.js*', (r) => r.abort());
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**/functions/v1/fx-prices*', (r) => { const u = new URL(r.request().url()); const n = +u.searchParams.get('n') || 200; const rows = []; const base = 1.157; for (let i = 0; i < Math.min(n, 60); i++) rows.push({ t: Date.now() - (60 - i) * 3600e3, o: base + i * 0.00002, h: base + 0.001, l: base - 0.001, c: base + i * 0.00003, v: 1 }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, candles: rows }) }); });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(new Function('return ' + stubFn)());
  await page.goto(`http://localhost:${PORT}/dev/trading-rh.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rh && window.__rh.ready, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  ok('M6 로드 무에러', errs.length === 0, errs.join(' | '));
  ok('M6 홈: 12개 페어 행 렌더', (await page.locator('.row').count()) === 12);
  // M2 lockstep
  const eurSell = await page.locator('.row[data-sym="EURUSD"] .btn.sell').innerText();
  const eurBuy = await page.locator('.row[data-sym="EURUSD"] .btn.buy').innerText();
  ok('M2 EURUSD SELL = mid − half (spr 0.6 + markup 0.2 → half 0.4pip)', eurSell.replace(/\s/g, '') === bid('EURUSD').toFixed(5), eurSell + ' vs ' + bid('EURUSD').toFixed(5));
  ok('M2 EURUSD BUY = mid + half', eurBuy.replace(/\s/g, '') === ask('EURUSD').toFixed(5), eurBuy);
  const jpySell = await page.locator('.row[data-sym="USDJPY"] .btn.sell').innerText();
  ok('M2 USDJPY (pip .01 · 3자리) SELL 락스텝', jpySell.replace(/\s/g, '') === bid('USDJPY').toFixed(3), jpySell);
  const xauBuy = await page.locator('.row[data-sym="XAUUSD"] .btn.buy').innerText();
  ok('M2 XAUUSD (pip .01 · 2자리 · spr 30pts=0.30) BUY 락스텝', xauBuy.replace(/\s/g, '') === ask('XAUUSD').toFixed(2), xauBuy);
  // M3 equity
  const heroTxt = (await page.locator('.hero .big').innerText()).replace(/\s/g, '');
  ok('M3 Equity = cash + Σ플로팅 (' + fmt(equity) + ')', heroTxt === fmt(equity).replace('−', '−'), heroTxt + ' vs ' + fmt(equity));
  const balTxt = (await page.locator('.stat').nth(0).innerText()).replace(/\s/g, '');
  ok('M3 Balance 카드 = 서버 cash', balTxt.indexOf(fmt(CASH)) >= 0, balTxt);
  // M5 one-click OFF → no boxes; toggle → ack sheet → ON → boxes; tapping → toast, no rpc
  ok('M5 OFF: 상자 없음 (app.oc-on 미적용)', !(await page.locator('.app.oc-on').count()));
  await page.locator('.oc').click(); await page.waitForTimeout(100);
  ok('M5 ⚡ 첫 탭 → 동의 시트', (await page.locator('.sheet .cta').count()) === 1);
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(100);
  ok('M5 동의 → ON: 상자 적용', (await page.locator('.app.oc-on').count()) === 1);
  await page.locator('.row[data-sym="EURUSD"] .btn.buy').click(); await page.waitForTimeout(150);
  const t1 = await page.locator('.toast').innerText().catch(() => '');
  ok('M5 상자 탭 → "Stage 2" 토스트 (주문 안 나감)', /Stage 2/.test(t1), t1);
  ok('M4 localStorage: rh.* 에 돈 없음 · 1-Click 만 저장', await page.evaluate(() => localStorage.getItem('rh.oneClick') === '1' && !Object.keys(localStorage).some(k => /bal|pos|equity|cash/i.test(k))));
  // Activity
  await page.locator('.tab[data-act="tab:activity"]').click(); await page.waitForTimeout(400);
  ok('M6 Activity: 포지션 2행 (서버 positions)', (await page.locator('.arow.px').count()) === 2);
  const p1 = await page.locator('.arow.px').nth(0).innerText();
  ok('M3 포지션 행 플로팅 = pnlUSD(open→청산가) (' + fmt(pnl(POS[0])).replace('$', '+$') + ')', p1.indexOf(pnl(POS[0]).toFixed(2)) >= 0, p1.replace(/\n/g, ' '));
  ok('스왑 표시 (positions.meta.swap)', /Swap\s*−\$0\.42/.test(p1), p1.replace(/\n/g, ' '));
  await page.locator('.arow .x').nth(0).click(); await page.waitForTimeout(150);
  ok('M5 ✕ 탭 → "Stage 2" 토스트 (청산 안 나감)', /Stage 2/.test(await page.locator('.toast').innerText().catch(() => '')));
  await page.locator('.seg span[data-act="act:history"]').click(); await page.waitForTimeout(200);
  ok('M6 History: settlements 행 (GBPUSD −$44.00 · SL hit)', /GBPUSD/.test(await page.locator('.act').innerText()) && /SL hit/.test(await page.locator('.act').innerText()));
  // Trade screen
  await page.locator('.tab[data-act="tab:trade"]').click(); await page.waitForTimeout(500);
  ok('M6 Trade: 차트 SVG 렌더 (스텁 봉)', (await page.locator('#chart svg').count()) === 1);
  ok('M2 Trade: B/A 줄 = bid – ask 락스텝', (await page.locator('.det .quote').innerText()).replace(/\s/g, '').indexOf(bid('EURUSD').toFixed(5) + '–' + ask('EURUSD').toFixed(5)) >= 0);
  await page.locator('.foot .btn.buy').click(); await page.waitForTimeout(150);
  ok('M5 주문 버튼 → "Stage 2" 토스트', /Stage 2/.test(await page.locator('.toast').innerText().catch(() => '')));
  // Account + theme
  await page.locator('.tab[data-act="tab:account"]').click(); await page.waitForTimeout(200);
  ok('M6 Account: 계좌번호 표시', /FX-850261/.test(await page.locator('.acc').innerText()));
  await page.locator('.srow[data-act="sheet:appearance"]').click(); await page.waitForTimeout(100);
  await page.locator('.opt2 div[data-act="theme:dark"]').click(); await page.waitForTimeout(100);
  ok('테마 스위치 → data-theme=dark', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  // M1 runtime
  const rpc = await page.evaluate(() => window.__rpcCalls || 0), writes = await page.evaluate(() => window.__writeCalls || 0);
  ok('M1 런타임: rpc 호출 0회 · 테이블 쓰기 0회 (전 화면·전 버튼 눌러본 뒤)', rpc === 0 && writes === 0, 'rpc=' + rpc + ' writes=' + writes);
  ok('M6 전 과정 무에러', errs.length === 0, errs.join(' | '));
  await browser.close(); server.close();
  console.log(fail ? `\n🔴 trading-rh FAIL — ${fail}건 (${pass} pass)` : `\n🟢 trading-rh — ${pass} pass · 돈 이동 0 · 락스텝 · Equity 재계산 일치`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('🔴 trading-rh crashed: ' + e.message); process.exit(1); });

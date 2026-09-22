#!/usr/bin/env node
// Alpexa — FX 모바일 앱 (fx-app.html) 행위 게이트 (헤드리스 + supabase 스텁, 네트워크 0)
// ============================================================================
// 계약 (2026-09-17 사장님 "시작해" · 1단계 = 읽기 전용):
//   M1. 돈은 서버 RPC 로만 — 허용 RPC 9개(RPC_ALLOW) 외 호출 0 · ledger/positions/accounts 쓰기 0 (소스 + 런타임 스파이).
//       2단계(2026-09-21 승인): fx_open(슬리피지 가드)·fx_modify·fx_close·fx_place_pending·fx_modify_pending·fx_cancel_pending·pamm_join·pamm_leave.
//   M2. 표시 락스텝 — bid/ask = mid ∓ half, half = max(0.1, spr_pts+markup_pts)×pip/2 (trading.html 과 동일).
//   M3. Equity = 서버 cash + Σ플로팅, 플로팅 = pnlUSD(open → fx_close 청산가) — 화면 숫자를 스텁 데이터로 재계산해 대조.
//   M4. 돈은 localStorage 에 저장되지 않는다 (rh.* 키는 테마·1-Click·가림 뿐).
//   M5. 1-Click OFF = 글자만(탭→트레이드 화면) · ON(동의 1회) = 상자(탭→fx_open 즉시) · 트레이드 주문 = 확인 시트 → RPC · 더블탭 = 1회.
//   M6. 로드 무에러 · 4탭 렌더 · 포지션/히스토리 실데이터 표시.
// playwright/Chromium 없으면 SKIP(exit 0).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };

// ── (A) 소스 핀: 돈 코드 0줄 ──
const src = fs.readFileSync(path.join(REPO, 'fx-app.html'), 'utf8');
// rpc 허용목록 (2단계): 읽기 리포트 1 + 승인된 돈 RPC 8. 그 외 .rpc( 는 0건 — 헬퍼가 목록 밖 이름을 throw.
// 2026-09-21 사장님 "1 2 3 진행해": 입금·출금 = requests 행 insert(AlpexaSync.pushRequest, 승인 전 잔고 불변) · 이체 = app_transfer RPC → 10개.
const ALLOW = ['pamm_investor_report', 'fx_open', 'fx_modify', 'fx_close', 'fx_place_pending', 'fx_modify_pending', 'fx_cancel_pending', 'pamm_join', 'pamm_leave', 'app_transfer'];
{ const m = src.match(/var RPC_ALLOW=\{([^}]*)\}/); const keys = m ? m[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean) : [];
  ok('M1 소스: RPC_ALLOW = 승인된 10개와 정확히 일치', keys.length === ALLOW.length && ALLOW.every(k => keys.includes(k)), keys.join(','));
  // 입출금 = 기존 앱과 같은 단일 경로(AlpexaSync.pushRequest → requests insert). 앱 소스에 직접 insert 0, 잔고를 만지는 코드 0.
  ok('M7 소스: 입금·출금 = AlpexaSync.pushRequest 만 (직접 .insert( 0) · 이체 = rpc(app_transfer) p_ref xfer- 멱등', (src.match(/AlpexaSync\.pushRequest\(/g) || []).length >= 1 && !/\.insert\(/.test(src) && /rpc\('app_transfer',\{ p_ref:ref, p_from:fxAcct\(\), p_to:to, p_amount:amt \}\)/.test(src) && /var ref='xfer-'/.test(src));
  ok('M7 소스: Account 버튼 = 앱 내 시트 (sheet:deposit · sheet:withdraw · sheet:transfer) · 옛 앱 링크 0', /data-act="sheet:deposit"/.test(src) && /data-act="sheet:withdraw"/.test(src) && /data-act="sheet:transfer"/.test(src) && !/go:trading\.html/.test(src));
  ok('M7 소스: 출금 은행 정보가 서버 address 필드에 실린다 (옛 앱은 입력만 받고 안 보냈음)', /address:\s*\(?\s*method==='wallet'/.test(src) || /address:addr/.test(src));
  const dyn = (src.match(/\.rpc\(/g) || []).length, lit = (src.match(/\.rpc\('pamm_investor_report'\)/g) || []).length;
  ok('M1 소스: supabase .rpc( 호출 지점 = 헬퍼 1 + 읽기 전용 리포트 1 (그 외 직접 호출 0)', dyn === 2 && lit === 1, 'dyn=' + dyn + ' lit=' + lit);
  const names = (src.match(/\brpc\('([a-z_]+)'/g) || []).map(x => x.match(/'([a-z_]+)'/)[1]);
  ok('M1 소스: 헬퍼 호출 이름 전부 허용목록 (' + names.length + '건)', names.length >= 8 && names.every(x => ALLOW.includes(x)), names.filter(x => !ALLOW.includes(x)).join(','));
  ok('M1 소스: 헬퍼가 목록 밖 이름을 거절 (rpc not allowed)', /if\(!RPC_ALLOW\[name\]\) throw/.test(src));
  ok('M2 소스: fx_open 에 슬리피지 가드 인자 (p_requested_price · p_max_slippage) — MT5 deviation', /p_requested_price:px\|\|null, p_max_slippage:px\?slipOf\(sym,px\):null/.test(src) && /3\*fxPip\(sym\)/.test(src));
  ok('M1 소스: 부분청산 없음 (RPC 없음 → 버튼 없음)', !/Close half|fx_close_partial/.test(src));
  // 풀 앱 (2026-09-21): 남은 비돈 기능 이관 — 차트 TF 전부 실봉 · 주식/지수 실봉 · Security/Support 실동작만
  ok('풀앱 소스: 차트 TF 8개 전부 활성 (null 0) · "coming soon" 문구 0', /var TF = \[\['1m','M1'\],\['5m','M5'\],\['30m','M30'\],\['1h','H1'\],\['4h','H4'\],\['1D','D1'\],\['1W','W1'\],\['ALL','ALL'\]\]/.test(src) && !/coming soon/i.test(src));
  ok('풀앱 소스: 봉 출처 3종 전부 실봉 (크립토 Binance · FX Polygon · 주식/지수 Twelve Data) · 합성 봉 생성 0 · ALL = D1 1000봉', /api\.twelvedata\.com\/time_series/.test(src) && /data-api\.binance\.vision\/api\/v3\/klines/.test(src) && /FX_FN_URL\+'\?candles='/.test(src) && !/Math\.random\(\)[^\n]*(candle|bar|ohlc)/i.test(src) && /tf==='ALL'\?1000:200/.test(src));
  ok('풀앱 소스: Security = auth.updateUser + signOut(global) 만 (테이블 쓰기 0) · Support = tel/mailto 만 (백엔드 0)', /auth\.updateUser\(\{ password:p1 \}\)/.test(src) && /signOut\(\{ scope:'global' \}\)/.test(src) && /mailto:support@alpexa\.com\?subject=/.test(src) && /go:tel:\+41225559900/.test(src) && !/2-Factor|Active Sessions/.test(src));
  ok('M1 소스: 잔고·손익을 클라가 계산해 저장하는 코드 0 (S\.cash 는 서버 pull 에서만 대입)', (src.match(/S\.cash\s*=/g) || []).length === 1 && /S\.cash=\+r\.data\[0\]\.balance/.test(src)); }
ok('M1 소스: ledger / positions / fx_pending 에 insert·update·upsert·delete 없음', !/\.from\(['"](ledger|positions|fx_pending|accounts)['"]\)[\s\S]{0,200}\.(insert|update|upsert|delete)\(/.test(src));
ok('M1 소스: 승인 밖 돈 경로 0 (place_bet · admin RPC · functions.invoke fx/broker/withdraw)', !/rpc\(\s*['"](place_bet|fx_open_admin|fx_admin|admin_set_balance|crypto_trade|withdraw_hold)/.test(src) && !/functions\.invoke\(\s*['"](fx|broker|withdraw)/.test(src));
ok('레이아웃: 4개 화면 상단 전부 safe-area-inset-top 여백 (홈 .top · 트레이드 .det .head · 목록 .ttl) — 노치 겹침 0', /\.top \{[^}]*env\(safe-area-inset-top/.test(src) && /\.det \.head \{[^}]*env\(safe-area-inset-top/.test(src) && /\.ttl \{[^}]*env\(safe-area-inset-top/.test(src));
ok('터치: 렌더 = DOM morph (app.innerHTML 통째 교체 0) + 터치 중 배경 렌더 보류', !/app\.innerHTML\s*=/.test(src) && /function morph\(o, n\)/.test(src) && /if\(touching&&!force\)\{ renderQueued=true; return; \}/.test(src));
ok('터치: 모든 [data-act] 요소에 cursor:pointer (iOS 문서 위임 클릭 조건) + touch-action manipulation', /\[data-act\], \[data-act\] \* \{ cursor: pointer; \}/.test(src) && /\[data-act\] \{[^}]*touch-action: manipulation/.test(src));
ok('M2 소스: half = max(0.1, spr+mk)*pip/2 (fx_close v_half 미러)', /Math\.max\(0\.1,\s*spr\+mk\)\*fxPip\(sym\)\/2/.test(src));
ok('M2 소스: 비FX half = mid*max(floorBps[cls], spr)/10000/2 (fx_close v_half else-branch 미러) · 계약/클래스 = fx_specs 런타임', /mid\*\(Math\.max\(SPREAD_BPS\[cls\]\|\|0, spr\)\/10000\)\/2/.test(src) && /from\('fx_specs'\)\.select\('symbol,cls,contract'\)/.test(src) && /SPREAD_BPS=\{CRYPTO:10,STOCK:8,INDEX:6\}/.test(src));
ok('M2 소스: pip 락스텝 (JPY .01 · XAU .01 · XAG .001 · else .0001)', /JPY\$\/\.test\(sym\)\?0\.01:sym==='XAUUSD'\?0\.01:sym==='XAGUSD'\?0\.001:0\.0001/.test(src));
ok('M4 소스: localStorage 에 잔고·포지션 저장 없음 (rh.theme/rh.oneClick/rh.oneClickAck/rh.mask/rh.homeSeg 만)', (src.match(/LS\.set\('rh\.[a-zA-Z]+'/g) || []).every(x => /rh\.(theme|oneClick|oneClickAck|mask|homeSeg)'/.test(x)) && !/localStorage\.setItem\(['"]alpexa\.(balances|fxLive|positions)/.test(src));
ok('세션: trading.html 과 같은 로그인 게이트 + 세션 가드 (login.html 로 회귀)', /localStorage\.getItem\("alpexa\.me"\)/.test(src) && /rhToLogin\("\?expired=1"\)/.test(src) && /alpexa-sync\.js/.test(src));
// 로그인 복귀: 모든 login.html 이동 전에 폐쇄 허용목록 토큰 fx-rh 를 sessionStorage 에 둔다 (URL 로 목적지 선택 불가 — login.html 계약 유지)
ok('복귀 토큰: rhToLogin 이 alpexa.dest2=fx-rh 를 심고 ../login.html 로만 이동', /sessionStorage\.setItem\("alpexa\.dest2","fx-rh"\)/.test(src) && /location\.replace\("login\.html"\+/.test(src) && (src.match(/location\.replace\([^)]*login\.html/g) || []).length === 1);
{ const login = fs.readFileSync(path.join(REPO, 'login.html'), 'utf8');
  ok('login.html: fx-rh 토큰 → fx-app.html · 모바일 FX 기본 착지 = fx-app.html (고정 문자열, URL 파라미터 아님)', /dest2==='fx-rh'\)\s*return\s*'fx-app\.html'/.test(login) && /return mobile\?'fx-app\.html':'webtrade\.html'/.test(login)); }

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
const FEED = { EURUSD: { mid: 1.15979, spr: 0.6 }, GBPUSD: { mid: 1.35216, spr: 0.8 }, USDJPY: { mid: 146.812, spr: 1.0 }, XAUUSD: { mid: 4348.90, spr: 30 }, AUDUSD: { mid: 0.66341, spr: 0.8 }, USDCHF: { mid: 0.79602, spr: 0.8 }, USDCAD: { mid: 1.38115, spr: 1.0 }, NZDUSD: { mid: 0.59873, spr: 1.0 }, EURGBP: { mid: 0.85768, spr: 1.0 }, EURJPY: { mid: 170.258, spr: 1.6 }, GBPJPY: { mid: 198.511, spr: 2.0 }, XAGUSD: { mid: 52.398, spr: 30 }, SPACEX: { mid: 155.11, spr: 0 }, BTCUSD: { mid: 116980, spr: 1.4 } };
const PAMM = { ok: true, cust: 'C-1', funds: [
  { fund_acct: 'FX-850261', name: 'Alpha', perf_fee_pct: 20, min_join: 100, status: 'active', nav: 2.2329, ret: 1.2329, unpriced: 0, is_manager: false, mine: { units: 100, basis: 100, value: 223.29, pnl: 123.29 } },
  { fund_acct: 'FX-900001', name: 'Beta', perf_fee_pct: 15, min_join: 250, status: 'active', nav: 1.01, ret: 0.01, unpriced: 0, is_manager: false, mine: null } ] };
// fx_specs (class + contract truth, read at runtime like webtrade) — SPACEX is a STOCK held on the same FX account
const SPECS = [{ symbol: 'SPACEX', cls: 'STOCK', contract: 1 }, { symbol: 'BTCUSD', cls: 'CRYPTO', contract: 1 }, { symbol: 'EURUSD', cls: 'FX', contract: 100000 }, { symbol: 'USDJPY', cls: 'FX', contract: 100000 }, { symbol: 'XAUUSD', cls: 'FX', contract: 100 }];
const CLS = Object.fromEntries(SPECS.map(x => [x.symbol, x.cls]));
const MARKS = { EURUSD: 0.2 };
const CASH = 12341.10;
const POS = [
  { local_id: 'P1', symbol: 'EURUSD', side: 'BUY', size: 0.10, open_price: 1.15712, pnl: 0, status: 'open', meta: { sl: 1.152, tp: 1.165, swap: -0.42 } },
  { local_id: 'P2', symbol: 'USDJPY', side: 'SELL', size: 0.20, open_price: 147.100, pnl: 0, status: 'open', meta: {} },
  { local_id: 'P3', symbol: 'SPACEX', side: 'BUY', size: 2.00, open_price: 150.00, pnl: 0, status: 'open', meta: {} },   // 2026-09-17 결함: FX 계약 10만으로 곱해 $1,022,000 로 보였다
];
const stubFn = `() => {
  const FEED = ${JSON.stringify(FEED)}, MARKS = ${JSON.stringify(MARKS)}, CASH = ${CASH}, POS = ${JSON.stringify(POS)}, SPECS = ${JSON.stringify(SPECS)}, PAMM = ${JSON.stringify(PAMM)};
  window.__rpcCalls = 0;
  const q = (t) => { const o = { _t: t, select: () => o, eq: () => o, order: () => o, in: () => o, limit: () => o,
    then: (res) => res(o._data()), _data: () => {
      if (t === 'prices') return { data: Object.keys(FEED).map(s => ({ symbol: s, mid: FEED[s].mid, spr_pts: FEED[s].spr })) };
      if (t === 'pricing_marks') return { data: Object.keys(MARKS).map(s => ({ symbol: s, markup_pts: MARKS[s] })) };
      if (t === 'accounts') return { data: [{ balance: CASH }] };
      if (t === 'positions') return { data: POS };
      if (t === 'fx_specs') return { data: SPECS };
      if (t === 'fx_pending') return { data: [{ local_id: 'O1', symbol: 'EURUSD', side: 'BUY', size: 0.1, otype: 'LIMIT', trigger: 1.155, sl: 0, tp: 0, status: 'pending', created_at: new Date().toISOString() }] };
      if (t === 'settlements') return { data: [{ local_id: 'H1', ticket: 'FX-1', symbol: 'GBPUSD', stake: 0.2, pnl: -44, detail: 'BUY 0.20 @ 1.35410 → 1.35190 SL', created_at: new Date().toISOString() }] };
      if (t === 'requests') { if (o._ins && o._ins.type === 'withdraw' && o._ins.amount > CASH) return { error: { message: 'Amount plus pending withdrawals ($0) exceeds your withdrawable balance (max $' + CASH + ')' } };   // guard_withdraw_request 트리거
        return { data: [{ local_id: 'D0', type: 'deposit', amount: 500, status: 'approved', network: 'bank', created_at: new Date(Date.now() - 86400e3).toISOString() }] }; }
      return { data: [] }; } };
    o.insert = o.update = o.upsert = o.delete = (row) => { window.__writeCalls = (window.__writeCalls||0) + 1; window.__writeLog = (window.__writeLog||[]).concat([{ t, row }]); o._ins = row; return o; };
    return o; };
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'auth-1' } } } }), signOut: async (o) => { try { sessionStorage.setItem('__signOut', JSON.stringify(o || {})); } catch (e) {} return {}; },
      updateUser: async (a) => { window.__pwLog = (window.__pwLog || []).concat([a]); return { data: {}, error: null }; } },
    rpc: async (name, args) => { window.__rpcLog = window.__rpcLog || []; window.__rpcLog.push({ name, args });
      if (name === 'pamm_investor_report') { window.__pammCalls = (window.__pammCalls||0) + 1; return { data: PAMM, error: null }; }
      await new Promise(r => setTimeout(r, 60));   // real network latency → double-tap window
      if (name === 'fx_open') return { data: args.p_symbol === 'GBPUSD' ? { ok: false, error: 'insufficient margin', code: 'MARGIN', required: 1234.5, free: 100 } : { ok: true, open: args.p_requested_price, local_id: args.p_local_id }, error: null };
      if (name === 'fx_close') return { data: { ok: true, close: 1.15975, pnl: 26.3 }, error: null };
      if (name === 'fx_modify' || name === 'fx_modify_pending' || name === 'fx_place_pending' || name === 'fx_cancel_pending') return { data: { ok: true }, error: null };
      if (name === 'pamm_join') return { data: { ok: true, units: 111.97, nav: 2.2329 }, error: null };
      if (name === 'pamm_leave') return { data: { ok: true, gross: 223.29, fee: 0, net: 223.29, nav: 2.2329 }, error: null };
      if (name === 'app_transfer') return { data: args.p_amount > CASH ? { ok: false, error: 'insufficient balance', balance: CASH } : { ok: true, ref: args.p_ref }, error: null };
      window.__rpcCalls++; return { data: { ok: false, error: 'unexpected rpc ' + name }, error: null }; },
    functions: { invoke: async () => ({ error: { message: 'stub' } }) },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    from: q }) };
  localStorage.setItem('alpexa.me', JSON.stringify({ custId: 'C-1', name: 'Test User', email: 'boss@x.com', accts: { fx: 'FX-850261', crypto: 'CR-1', sports: 'SP-1' } }));
  sessionStorage.setItem('alpexa.sessChecked', '1');
  localStorage.removeItem('rh.oneClick'); localStorage.removeItem('rh.oneClickAck'); localStorage.removeItem('rh.mask'); localStorage.removeItem('rh.theme');
}`;

// 기대값 재계산 (앱과 독립 구현 — 같은 규칙, 다른 코드)
const pip = (s) => /JPY$/.test(s) ? 0.01 : s === 'XAUUSD' ? 0.01 : s === 'XAGUSD' ? 0.001 : 0.0001;
const contract = (s) => { const r = SPECS.find(x => x.symbol === s); return r ? r.contract : s === 'XAGUSD' ? 5000 : 100000; };
const BPS = { CRYPTO: 10, STOCK: 8, INDEX: 6 };   // fx_close.sql non-FX floor (bps)
const half = (s) => (CLS[s] || 'FX') === 'FX' ? Math.max(0.1, FEED[s].spr + (MARKS[s] || 0)) * pip(s) / 2 : FEED[s].mid * Math.max(BPS[CLS[s]], FEED[s].spr) / 10000 / 2;
const bid = (s) => FEED[s].mid - half(s), ask = (s) => FEED[s].mid + half(s);
const closePx = (s, side) => side === 'BUY' ? bid(s) : ask(s);
const pnl = (p) => { const s = p.symbol; const dist = (closePx(s, p.side) - p.open_price) * (p.side === 'BUY' ? 1 : -1); let q = dist * contract(s) * p.size; if ((CLS[s] || 'FX') !== 'FX') return q; const quote = s.slice(3); if (quote !== 'USD') q = q / FEED['USD' + quote].mid; return q; };
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
  const candReq = [], tdReq = [];
  await page.route('**/api.twelvedata.com/**', (r) => { tdReq.push(r.request().url()); const vals = []; for (let i = 0; i < 40; i++) vals.push({ datetime: new Date(Date.now() - (40 - i) * 3600e3).toISOString().slice(0, 19).replace('T', ' '), open: '150.1', high: '156', low: '149', close: String(150 + i * 0.1), volume: '1000' }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ values: vals, status: 'ok' }) }); });
  await page.route('**/functions/v1/fx-prices*', (r) => { const u = new URL(r.request().url()); candReq.push({ tf: u.searchParams.get('tf'), n: u.searchParams.get('n') }); const n = +u.searchParams.get('n') || 200; const rows = []; const base = 1.157; for (let i = 0; i < Math.min(n, 60); i++) rows.push({ t: Date.now() - (60 - i) * 3600e3, o: base + i * 0.00002, h: base + 0.001, l: base - 0.001, c: base + i * 0.00003, v: 1 }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, candles: rows }) }); });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(new Function('return ' + stubFn)());
  await page.goto(`http://localhost:${PORT}/fx-app.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rh && window.__rh.ready, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  ok('M6 로드 무에러', errs.length === 0, errs.join(' | '));
  ok('M6 홈: FX 그룹 10행 (금·은은 Metals 칩으로)', (await page.locator('.row').count()) === 10);
  { const keep = await page.evaluate(() => { window.__probe = document.querySelector('.tab[data-act="tab:trade"]'); window.__probeRow = document.querySelector('.row[data-sym="EURUSD"] .btn.buy'); return !!window.__probe; });
    await page.waitForTimeout(2300);   // 1초 재도색 2회 이상 지나감
    const alive = await page.evaluate(() => window.__probe.isConnected && window.__probeRow.isConnected && document.contains(window.__probe));
    ok('터치: 1초 재도색 뒤에도 눌린 요소가 같은 노드로 살아 있음 (morph — 탭 증발 0)', keep && alive);
    // 터치 시뮬레이션: touchstart 중 배경 render 보류 → touchend 350ms 뒤 반영
    const deferred = await page.evaluate(async () => { const t = new Event('touchstart', { bubbles: true }); document.body.dispatchEvent(t); window.__rh.toast = null; window.__rh.cash = 999.5; render(); const before = document.querySelector('.stat .v').textContent; document.body.dispatchEvent(new Event('touchend', { bubbles: true })); await new Promise(r => setTimeout(r, 450)); const after = document.querySelector('.stat .v').textContent; window.__rh.cash = 12341.10; render(true); return { before, after }; });
    ok('터치: 손가락 닿은 동안 배경 렌더 보류 → 뗀 뒤 반영 (' + deferred.before + ' → ' + deferred.after + ')', !/999\.50/.test(deferred.before) && /999\.50/.test(deferred.after), JSON.stringify(deferred)); }
  ok('홈: 상품군 칩 = 피드 있는 그룹만 (FX · Metals · Crypto · Stocks — Indices 는 피드 없어 숨김)', (await page.locator('.hseg span').count()) === 4 && (await page.locator('.hseg span[data-act="hseg:Indices"]').count()) === 0);
  // M2 lockstep
  const eurSell = await page.locator('.row[data-sym="EURUSD"] .btn.sell').innerText();
  const eurBuy = await page.locator('.row[data-sym="EURUSD"] .btn.buy').innerText();
  ok('M2 EURUSD SELL = mid − half (spr 0.6 + markup 0.2 → half 0.4pip)', eurSell.replace(/\s/g, '') === bid('EURUSD').toFixed(5), eurSell + ' vs ' + bid('EURUSD').toFixed(5));
  ok('M2 EURUSD BUY = mid + half', eurBuy.replace(/\s/g, '') === ask('EURUSD').toFixed(5), eurBuy);
  const jpySell = await page.locator('.row[data-sym="USDJPY"] .btn.sell').innerText();
  ok('M2 USDJPY (pip .01 · 3자리) SELL 락스텝', jpySell.replace(/\s/g, '') === bid('USDJPY').toFixed(3), jpySell);
  await page.locator('.hseg span[data-act="hseg:Metals"]').click(); await page.waitForTimeout(150);
  ok('홈 Metals 칩 → 2행 (XAUUSD · XAGUSD)', (await page.locator('.row').count()) === 2);
  const xauBuy = await page.locator('.row[data-sym="XAUUSD"] .btn.buy').innerText();
  ok('M2 XAUUSD (pip .01 · 2자리 · spr 30pts=0.30) BUY 락스텝', xauBuy.replace(/\s/g, '') === ask('XAUUSD').toFixed(2), xauBuy);
  await page.locator('.hseg span[data-act="hseg:Stocks"]').click(); await page.waitForTimeout(150);
  const stRows = await page.locator('.row').count(), spx = await page.locator('.row[data-sym="SPACEX"] .btn.buy').innerText().catch(() => '');
  ok('홈 Stocks 칩 → 피드 있는 종목만 (SPACEX 1행) · 가격 2자리 · half = 8bps', stRows === 1 && spx.replace(/\s/g, '') === (155.11 * (1 + 0.0008 / 2)).toFixed(2), 'rows=' + stRows + ' ' + spx);
  await page.locator('.hseg span[data-act="hseg:Crypto"]').click(); await page.waitForTimeout(150);
  ok('홈 Crypto 칩 → BTCUSD 1행 (피드 있음) · 1자리 · half = max(10bps, 1.4bps)', (await page.locator('.row').count()) === 1 && (await page.locator('.row[data-sym="BTCUSD"] .btn.buy').innerText()).replace(/\s/g, '') === (116980 * (1 + 0.001 / 2)).toFixed(1));
  await page.locator('.hseg span[data-act="hseg:FX"]').click(); await page.waitForTimeout(150);
  // M3 equity
  const heroTxt = (await page.locator('.hero .big').innerText()).replace(/\s/g, '');
  ok('M3 Equity = cash + Σ플로팅 (' + fmt(equity) + ')', heroTxt === fmt(equity).replace('−', '−'), heroTxt + ' vs ' + fmt(equity));
  const balTxt = (await page.locator('.stat').nth(0).innerText()).replace(/\s/g, '');
  ok('M3 Balance 카드 = 서버 cash', balTxt.indexOf(fmt(CASH)) >= 0, balTxt);
  { const boxes = await page.locator('.stat').evaluateAll(els => els.map(e => e.getBoundingClientRect())); const host = await page.locator('.stats').boundingBox();
    ok('홈 3칸 카드가 가로 전체를 균등 분할 (첫 칸 왼쪽 = 컨테이너 왼쪽 · 마지막 칸 오른쪽 = 컨테이너 오른쪽 ±1px)', boxes.length === 3 && Math.abs(boxes[0].x - host.x) < 1 && Math.abs((boxes[2].x + boxes[2].width) - (host.x + host.width)) < 1, JSON.stringify([host, boxes.map(b => [Math.round(b.x), Math.round(b.width)])]));
    const offPx = await page.locator('.row[data-sym="EURUSD"] .btn.sell').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    ok('1-Click OFF 시세 글자 17px', offPx === 17, String(offPx)); }
  // M5 one-click OFF → no boxes; toggle → ack sheet → ON → boxes; tapping → toast, no rpc
  ok('M5 OFF: 상자 없음 (app.oc-on 미적용)', !(await page.locator('.app.oc-on').count()));
  await page.locator('.oc').click(); await page.waitForTimeout(100);
  ok('M5 ⚡ 첫 탭 → 동의 시트', (await page.locator('.sheet .cta').count()) === 1);
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(100);
  ok('M5 동의 → ON: 상자 적용', (await page.locator('.app.oc-on').count()) === 1);
  await page.locator('.row[data-sym="EURUSD"] .btn.buy').click(); await page.waitForTimeout(350);
  const t1 = await page.locator('.toast').innerText().catch(() => '');
  const log1 = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_open'));
  ok('M5 ON 상자 탭 → fx_open 1회: EURUSD BUY 0.10 · 표시가 = ask · 허용편차 3핍 · local_id R-…', log1.length === 1 && log1[0].args.p_symbol === 'EURUSD' && log1[0].args.p_side === 'BUY' && Math.abs(log1[0].args.p_size - 0.10) < 1e-9 && Math.abs(log1[0].args.p_requested_price - ask('EURUSD')) < 1e-9 && Math.abs(log1[0].args.p_max_slippage - 0.0003) < 1e-9 && /^R-/.test(log1[0].args.p_local_id), JSON.stringify(log1[0] && log1[0].args));
  ok('M5 ON 체결 토스트 = 서버 open 가격 (Bought 0.10 EURUSD @ ' + ask('EURUSD').toFixed(5) + ')', t1.indexOf('Bought 0.10 EURUSD @ ' + ask('EURUSD').toFixed(5)) >= 0, t1);
  ok('M5 ON 체결 후 서버 재조회 (positions 다시 pull)', (await page.evaluate(() => window.__rh.positions.length)) === 3);
  await page.locator('.oc').click(); await page.waitForTimeout(100);
  ok('M5 ⚡ 다시 탭 → OFF (상자 사라짐)', !(await page.locator('.app.oc-on').count()));
  await page.locator('.row[data-sym="GBPUSD"] .btn.sell').click(); await page.waitForTimeout(200);
  ok('M5 OFF 가격 탭 → 주문 없이 트레이드 화면으로 (GBPUSD)', (await page.evaluate(() => window.__rh.tab + ':' + window.__rh.sym)) === 'trade:GBPUSD' && (await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_open').length)) === 1);
  await page.locator('.tab[data-act="tab:home"]').click(); await page.waitForTimeout(200);
  ok('M4 localStorage: rh.* 에 돈 없음 · 1-Click 설정만 저장', await page.evaluate(() => localStorage.getItem('rh.oneClick') !== null && !Object.keys(localStorage).some(k => /bal|pos|equity|cash|order|pnl/i.test(k))));
  await page.evaluate(() => act('pick:EURUSD')); await page.waitForTimeout(120);   // back to EURUSD for the trade-screen checks
  // stepper: tap = +0.01 · press-and-hold = accelerates
  await page.locator('.hd .lots b[data-act="lots:+"]').click(); await page.waitForTimeout(80);
  ok('스테퍼 탭 1회 = +0.01 (0.10 → 0.11)', Math.abs((await page.evaluate(() => window.__rh.lots)) - 0.11) < 1e-9);
  { const bb = await page.locator('.hd .lots b[data-act="lots:+"]').boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(1400); await page.mouse.up(); await page.waitForTimeout(120); }
  const heldLots = await page.evaluate(() => window.__rh.lots);
  ok('스테퍼 길게 누르기 1.4s → 가속 (0.11 → ≥ 0.40, 실측 ' + heldLots.toFixed(2) + ')', heldLots >= 0.40, String(heldLots));
  ok('스테퍼 표시 = 상태 (길게 누른 뒤 화면 값 일치)', (await page.locator('.hd .lots span').innerText()).replace(/\s/g, '').indexOf(heldLots.toFixed(2)) === 0);
  // Activity
  await page.locator('.tab[data-act="tab:activity"]').click(); await page.waitForTimeout(400);
  ok('M6 Activity: 포지션 3행 (서버 positions — FX 2 + STOCK 1)', (await page.locator('.arow.px').count()) === 3);
  ok('포지션 수 = Activity 탭 배지 (홈 P&L 줄엔 없음)', (await page.locator('.tab[data-act="tab:activity"] .bdg').innerText()) === '3' && !/position/.test(await page.locator('.hero').innerText().catch(() => '')));
  const p3 = await page.locator('.arow.px').nth(2).innerText();
  ok('클래스: SPACEX(STOCK) 플로팅 = (mid−8bps/2 − open)×contract 1×2.00 (' + fmt(pnl(POS[2])) + ') — FX 10만 계약 아님', p3.indexOf(pnl(POS[2]).toFixed(2)) >= 0 && !/\d{3},\d{3}/.test(p3), p3.replace(/\n/g, ' '));
  ok('클래스: SPACEX 행에 Stock 태그 · 가격 2자리', /stock/i.test(p3) && /155\.\d{2}\s*now/.test(p3), p3.replace(/\n/g, ' '));
  const p1 = await page.locator('.arow.px').nth(0).innerText();
  ok('M3 포지션 행 플로팅 = pnlUSD(open→청산가) (' + fmt(pnl(POS[0])).replace('$', '+$') + ')', p1.indexOf(pnl(POS[0]).toFixed(2)) >= 0, p1.replace(/\n/g, ' '));
  ok('스왑 표시 (positions.meta.swap)', /Swap\s*−\$0\.42/.test(p1), p1.replace(/\n/g, ' '));
  await page.evaluate(() => { const x = document.querySelectorAll('.arow .x')[0]; x.click(); x.click(); });   // double-tap
  await page.waitForTimeout(350);
  const closes = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_close'));
  ok('✕ 더블탭 → fx_close 정확히 1회 (busy 잠금) · p_local_id = P1', closes.length === 1 && closes[0].args.p_local_id === 'P1', JSON.stringify(closes.map(c => c.args)));
  ok('✕ 청산 토스트 = 서버 pnl (Closed EURUSD · +$26.30)', /Closed EURUSD · \+\$26\.30/.test(await page.locator('.toast').innerText().catch(() => '')));
  await page.locator('.seg span[data-act="act:orders"]').click(); await page.waitForTimeout(200);
  await page.locator('.arow').first().click(); await page.waitForTimeout(150);
  const ordSheet = await page.locator('.sheet').innerText().catch(() => '');
  ok('Orders 행 탭 → 대기주문 시트 (SL/TP 는 여기서) · Modify price 없음', /Pending order/.test(ordSheet) && /Stop loss/.test(ordSheet) && /Take profit/.test(ordSheet) && /Set stop loss/.test(ordSheet) && !/Modify price/.test(ordSheet));
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(150);
  ok('대기주문 SL/TP 시트: 트리거 기준 기본값 (BUY 1.15500 → SL 1.14700 · TP 1.16020)', /Stop loss \/ take profit/.test(await page.locator('.sheet .sttl').innerText()) && /1\.14700/.test(await page.locator('.sheet').innerText()) && /1\.16020/.test(await page.locator('.sheet').innerText()));
  await page.locator('.sheet .lots b[data-act="msl:+"]').click(); await page.waitForTimeout(80);
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(350);
  const mp = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_modify_pending'));
  ok('Save → fx_modify_pending(O1, sl 1.14710, tp 1.16020) 1회 — 새 SQL 경로', mp.length === 1 && mp[0].args.p_local_id === 'O1' && Math.abs(mp[0].args.p_sl - 1.1471) < 1e-9 && Math.abs(mp[0].args.p_tp - 1.1602) < 1e-9, JSON.stringify(mp.map(c => c.args)));
  await page.locator('.arow').first().click(); await page.waitForTimeout(150);
  await page.locator('.sheet .acts div[data-act^="cancelord:"]').click(); await page.waitForTimeout(350);
  const cp = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_cancel_pending'));
  ok('Cancel order → fx_cancel_pending(O1) 1회', cp.length === 1 && cp[0].args.p_local_id === 'O1', JSON.stringify(cp.map(c => c.args)));
  await page.locator('.seg span[data-act="act:history"]').click(); await page.waitForTimeout(200);
  ok('M6 History: settlements 행 (GBPUSD −$44.00 · SL hit)', /GBPUSD/.test(await page.locator('.act').innerText()) && /SL hit/.test(await page.locator('.act').innerText()));
  // Trade screen
  await page.locator('.tab[data-act="tab:trade"]').click(); await page.waitForTimeout(500);
  ok('M6 Trade: 차트 SVG 렌더 (스텁 봉)', (await page.locator('#chart svg').count()) === 1);
  ok('Trade: B/A 줄 없음 (주문 버튼이 매도/매수가) · 버튼 = bid/ask 락스텝', (await page.locator('.det .quote').count()) === 0 && (await page.locator('.foot .btn.sell').innerText()).replace(/\s/g, '').indexOf(bid('EURUSD').toFixed(5)) >= 0 && (await page.locator('.foot .btn.buy').innerText()).replace(/\s/g, '').indexOf(ask('EURUSD').toFixed(5)) >= 0);
  await page.locator('.foot .btn.buy').click(); await page.waitForTimeout(150);
  const cf = await page.locator('.sheet').innerText().catch(() => '');
  ok('OFF 주문 버튼 → 확인 시트 (Confirm order · Price now · ±3 pips · Margin)', /Confirm order/.test(cf) && /Price now/.test(cf) && /3 pips/.test(cf) && /Margin/.test(cf) && (await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_open').length)) === 1, cf.replace(/\n/g, ' ').slice(0, 160));
  await page.evaluate(() => { const c = document.querySelector('.sheet .cta'); c.click(); c.click(); });   // double-tap confirm
  await page.waitForTimeout(350);
  const op2 = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_open'));
  ok('확인 더블탭 → fx_open 1회 추가 (총 2) · SL/TP 접힘이면 fx_modify 0', op2.length === 2 && op2[1].args.p_side === 'BUY' && op2[1].args.p_symbol === 'EURUSD' && (await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_modify').length)) === 0, JSON.stringify(op2[1] && op2[1].args));
  await page.locator('.fold[data-act="sltp"]').click(); await page.waitForTimeout(120);
  await page.locator('.foot .btn.sell').click(); await page.waitForTimeout(150);
  const cf2 = await page.locator('.sheet').innerText().catch(() => '');
  ok('SL/TP 펼친 채 SELL → 확인 시트에 SELL 방향 기본값 (SL 위 1.16779 · TP 아래 1.15459)', /Stop loss/.test(cf2) && /1\.16779/.test(cf2) && /1\.15459/.test(cf2), cf2.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(400);
  const md = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_modify')), op3 = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_open'));
  ok('SELL 체결 후 fx_modify(같은 local_id, sl 1.16779, tp 1.15459) 1회', md.length === 1 && op3.length === 3 && md[0].args.p_local_id === op3[2].args.p_local_id && Math.abs(md[0].args.p_sl - 1.16779) < 1e-9 && Math.abs(md[0].args.p_tp - 1.15459) < 1e-9, JSON.stringify(md.map(c => c.args)));
  // server rejection path (GBPUSD stub = insufficient margin)
  await page.locator('.det .nm[data-act="sheet:pair"]').click(); await page.waitForTimeout(150);
  await page.locator('#pq').fill('GBPUSD'); await page.waitForTimeout(120); await page.locator('.plist .prow').first().click(); await page.waitForTimeout(200);
  await page.locator('.foot .btn.buy').click(); await page.waitForTimeout(150); await page.locator('.sheet .cta').click(); await page.waitForTimeout(350);
  ok('서버 거절 → 문구 그대로 (Insufficient margin — needs $1,234.50, free $100.00) · 포지션 수 불변', /Insufficient margin — needs \$1,234\.50, free \$100\.00/.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.evaluate(() => window.__rh.positions.length)) === 3);
  ok('거절 시 시트 닫힘·busy 해제', (await page.locator('.sheet').count()) === 0 && (await page.evaluate(() => window.__rh.busy)) === null);
  // pending: SELL LIMIT → side-aware default trigger (above market) → fx_place_pending, sl/tp null
  await page.locator('.otype span[data-act="otype:LIMIT"]').click(); await page.waitForTimeout(120);
  await page.locator('.foot .btn.sell').click(); await page.waitForTimeout(150);
  const pcf = await page.locator('.sheet').innerText().catch(() => '');
  ok('Limit SELL → 확인 시트 (Confirm limit order · 트리거 = ask+8핍 = ' + (ask('GBPUSD') + 0.0008).toFixed(5) + ' · SL/TP 안내)', /Confirm limit order/.test(pcf) && pcf.indexOf((ask('GBPUSD') + 0.0008).toFixed(5)) >= 0 && /Activity/.test(pcf), pcf.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(350);
  const pp = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_place_pending'));
  ok('→ fx_place_pending(GBPUSD SELL LIMIT 0.10 @ trigger, sl null, tp null) 1회', pp.length === 1 && pp[0].args.p_symbol === 'GBPUSD' && pp[0].args.p_side === 'SELL' && pp[0].args.p_otype === 'LIMIT' && Math.abs(pp[0].args.p_trigger - (ask('GBPUSD') + 0.0008)) < 1e-9 && pp[0].args.p_sl === null && pp[0].args.p_tp === null, JSON.stringify(pp.map(c => c.args)));
  await page.locator('.otype span[data-act="otype:MARKET"]').click(); await page.waitForTimeout(100);
  await page.locator('.det .nm[data-act="sheet:pair"]').click(); await page.waitForTimeout(150);
  await page.locator('#pq').fill('EURUSD'); await page.waitForTimeout(120); await page.locator('.plist .prow').first().click(); await page.waitForTimeout(200);
  { const mineTxt = await page.locator('.det .mine').innerText().catch(() => '');
    ok('Trade: 내 포지션 한 줄 (Buy 0.10 lot · +$' + pnl(POS[0]).toFixed(2) + ') → 탭하면 포지션 시트', /Buy\s+0\.10 lot/.test(mineTxt) && mineTxt.indexOf(pnl(POS[0]).toFixed(2)) >= 0, mineTxt);
    await page.locator('.det .mine').click(); await page.waitForTimeout(150);
    ok('Trade: 포지션 한 줄 탭 → Position 시트', /Position/.test(await page.locator('.sheet .sttl').innerText().catch(() => '')));
    const ps = await page.locator('.sheet').innerText().catch(() => '');
    ok('Position 시트: Close half 없음 · Edit SL/TP · Close position', !/Close half/.test(ps) && /Edit stop loss/.test(ps) && /Close position/.test(ps));
    await page.locator('.sheet .cta').click(); await page.waitForTimeout(150);
    ok('포지션 SL/TP 시트: 기존값 시드 (SL 1.15200 · TP 1.16500)', /1\.15200/.test(await page.locator('.sheet').innerText()) && /1\.16500/.test(await page.locator('.sheet').innerText()));
    await page.locator('.sheet .cta').click(); await page.waitForTimeout(350);
    const fm = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_modify'));
    ok('Save → fx_modify(P1, 1.152, 1.165) — 열린 포지션 경로', fm.some(c => c.args.p_local_id === 'P1' && Math.abs(c.args.p_sl - 1.152) < 1e-9 && Math.abs(c.args.p_tp - 1.165) < 1e-9), JSON.stringify(fm.map(c => c.args)));
    await page.locator('.det .mine').click(); await page.waitForTimeout(150);
    await page.locator('.sheet .acts div[data-act^="close:"]').click(); await page.waitForTimeout(350);
    ok('Close position → fx_close(P1) (총 2회: ✕ 1 + 시트 1)', (await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'fx_close' && x.args.p_local_id === 'P1').length)) === 2); }
  ok('Market 주문: SL/TP 접힘 폴드 있음', (await page.locator('.fold[data-act="sltp"]').count()) === 1);
  { const bb = await page.locator('.foot .lotrow .lots span').first().boundingBox(); const sm = await page.locator('.foot .lotrow .lots small').first().evaluate(el => getComputedStyle(el).display);
    ok('Trade 볼륨 스테퍼 "0.10 lot" 한 줄 (small inline · 한 줄 높이 < 40px, 두 줄이면 50px+)', sm === 'inline' && bb && bb.height < 40, 'display=' + sm + ' h=' + (bb && bb.height));
    const pxBig = await page.locator('.det .px big').first().evaluate(el => getComputedStyle(el).fontSize === getComputedStyle(el.parentElement).fontSize);
    ok('Trade 헤더 시세: 소수점 자릿수 크기 통일 (big = 부모와 같은 font-size)', pxBig); }
  await page.locator('.otype span[data-act="otype:LIMIT"]').click(); await page.waitForTimeout(150);
  ok('Limit 주문: SL/TP 없음 (폴드·행 0) — Activity 에서 설정', (await page.locator('.fold[data-act="sltp"]').count()) === 0 && (await page.locator('.lotrow:has-text("Stop loss")').count()) === 0 && (await page.locator('.lotrow:has-text("Limit price")').count()) === 1);
  await page.locator('.otype span[data-act="otype:MARKET"]').click(); await page.waitForTimeout(100);
  // chart timeframes: 4h · 1W · ALL are live (real bars) — ALL = D1 deep history
  ok('차트 TF: 8칸 전부 활성 (.na 0)', (await page.locator('.ranges span').count()) === 8 && (await page.locator('.ranges span.na').count()) === 0);
  candReq.length = 0; await page.locator('.ranges span[data-act="tf:H4"]').click(); await page.waitForTimeout(300);
  ok('4h 탭 → fx-prices ?tf=H4&n=200 실봉 요청 · 차트 렌더', candReq.some(q => q.tf === 'H4' && q.n === '200') && (await page.locator('#chart svg').count()) === 1 && (await page.locator('.ranges span.on').innerText()) === '4h', JSON.stringify(candReq));
  candReq.length = 0; await page.locator('.ranges span[data-act="tf:ALL"]').click(); await page.waitForTimeout(300);
  ok('ALL 탭 → D1 1000봉 요청 (깊은 이력)', candReq.some(q => q.tf === 'D1' && q.n === '1000'), JSON.stringify(candReq));
  await page.locator('.ranges span[data-act="tf:H1"]').click(); await page.waitForTimeout(150);
  // stocks / indices: real bars from Twelve Data (SpaceX trades as SPCX) — never synthetic
  await page.evaluate(() => act('pick:SPACEX')); await page.waitForTimeout(500);
  ok('주식 차트: SPACEX → Twelve Data time_series (symbol=SPCX · interval=1h) 실봉 · SVG 렌더', tdReq.some(u => /symbol=SPCX/.test(u) && /interval=1h/.test(u)) && (await page.locator('#chart svg').count()) === 1, tdReq.join(' ').slice(0, 200));
  await page.evaluate(() => act('pick:EURUSD')); await page.waitForTimeout(200);
  // pair sheet: real search input filters across all groups
  await page.locator('.det .nm[data-act="sheet:pair"]').click(); await page.waitForTimeout(200);
  ok('페어 시트: 검색 input 존재 · 그룹 칩 = 피드 있는 4 + All', (await page.locator('#pq').count()) === 1 && (await page.locator('.sheet .sseg span').count()) === 5);
  ok('페어 시트: 높이 고정(.sheet.tall) — 종목 적은 그룹에서도 창 크기 불변', (await page.locator('.sheet.tall').count()) === 1 && /82dvh/.test(await page.locator('.sheet.tall').evaluate(el => [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } }).filter(r => r.selectorText === '.sheet.tall').map(r => r.style.height).join(','))));
  ok('morph: 2번째 렌더 후에도 #app 존재 (루트 id 유지)', (await page.locator('#app').count()) === 1);
  await page.locator('#pq').fill('space'); await page.waitForTimeout(150);
  ok('검색 "space" → SPACEX 1행 (그룹 무관 전체 검색) · 입력 포커스 유지', (await page.locator('.plist .prow').count()) === 1 && /SPACEX/.test(await page.locator('.plist').innerText()) && (await page.evaluate(() => document.activeElement && document.activeElement.id === 'pq')));
  await page.locator('#pq').fill('yen'); await page.waitForTimeout(150);
  ok('검색 "yen" → 이름 매칭 (USDJPY · EURJPY · GBPJPY = 3행)', (await page.locator('.plist .prow').count()) === 3);
  await page.locator('.sheet .sttl .x').click(); await page.waitForTimeout(100);
  // Account + theme
  await page.locator('.tab[data-act="tab:account"]').click(); await page.waitForTimeout(200);
  ok('M6 Account: 계좌번호 표시', /FX-850261/.test(await page.locator('.acc').innerText()));
  ok('Account: Notifications 토글 없음 (동작 없는 스위치 제거 — 심플)', !/Notifications/.test(await page.locator('.acc').innerText()));
  await page.waitForTimeout(200);
  const accTxt = await page.locator('.acc').innerText();
  ok('PAMM: Account 에 Managed funds 행 + 내 평가액 $223.29 (pamm_investor_report 읽기)', /Managed funds/.test(accTxt) && /\$223\.29/.test(accTxt), accTxt.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.srow[data-act="sheet:pamm"]').click(); await page.waitForTimeout(200);
  const pammTxt = await page.locator('.sheet').innerText().catch(() => '');
  ok('PAMM 시트: 펀드 2개 · Alpha 수익률 +123.29% · Invested $100.00 → now $223.29 · Beta Join', /Alpha/.test(pammTxt) && /\+123\.29%/.test(pammTxt) && /\$100\.00/.test(pammTxt) && /\$223\.29/.test(pammTxt) && /Beta/.test(pammTxt) && /Join/.test(pammTxt));
  await page.locator('.pf .r3 div.pri').first().click(); await page.waitForTimeout(150);
  const js = await page.locator('.sheet').innerText().catch(() => '');
  ok('PAMM Join(Beta) → 금액 시트: 기본 = 최소 $250.00 · FX balance 표시 · CTA Invest $250.00', /Join Beta/.test(js) && /\$250\.00/.test(js) && /FX balance/.test(js) && /Invest \$250\.00/.test(js), js.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.sheet .chips span').nth(1).click(); await page.waitForTimeout(80);   // $500 chip (칩 = 250 · 500 · 1000)
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(350);
  const pj = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'pamm_join'));
  ok('Invest → pamm_join(ref pamm-FX-900001-…, fund FX-900001, usd 500) 1회', pj.length === 1 && /^pamm-FX-900001-\d+$/.test(pj[0].args.p_ref) && pj[0].args.p_fund === 'FX-900001' && pj[0].args.p_usd === 500, JSON.stringify(pj.map(c => c.args)));
  await page.locator('.srow[data-act="sheet:pamm"]').click(); await page.waitForTimeout(250);
  await page.locator('.pf .r3 div.out').first().click(); await page.waitForTimeout(150);
  const rs = await page.locator('.sheet').innerText().catch(() => '');
  ok('PAMM Redeem(Alpha) → 시트 기본 = 전량 $223.29 · CTA Redeem all', /Redeem from Alpha/.test(rs) && /\$223\.29/.test(rs) && /Redeem all/.test(rs), rs.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(350);
  const pl = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'pamm_leave'));
  ok('Redeem all → pamm_leave(ref pamm-FX-850261-out-…, units null=전량) 1회', pl.length === 1 && /^pamm-FX-850261-out-\d+$/.test(pl[0].args.p_ref) && pl[0].args.p_units === null, JSON.stringify(pl.map(c => c.args)));
  // ── M7 입금·출금·이체 (2026-09-21 승인 "1 2 3 진행해") ──
  ok('M7 Account: Deposit/Withdraw/Transfer = 앱 내 시트 3 · 옛 앱 링크 0', (await page.locator('.acc .acts div[data-act^="sheet:"]').count()) === 3 && (await page.locator('[data-act="go:trading.html"]').count()) === 0);
  const writesBefore = await page.evaluate(() => (window.__writeLog || []).length);
  // Deposit
  await page.locator('.acc .acts div[data-act="sheet:deposit"]').click(); await page.waitForTimeout(200);
  const dp = await page.locator('.sheet').innerText().catch(() => '');
  ok('M7 입금 시트: 방법 칩(Bank wire · USDT · Card) · 은행 안내 + 참조 ALPX-C-1 · 금액 입력', /Deposit/.test(dp) && /Bank wire/.test(dp) && /USDT/.test(dp) && /Card/.test(dp) && /ALPX-C-1/.test(dp) && (await page.locator('#amtIn').count()) === 1, dp.replace(/\n/g, ' ').slice(0, 220));
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(120);
  ok('M7 입금: 금액 없이 제출 → 토스트 · 서버 쓰기 0', /amount/i.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.evaluate(() => (window.__writeLog || []).length)) === writesBefore);
  await page.locator('#amtIn').fill('250'); await page.waitForTimeout(80);
  ok('M7 입금: 금액 입력 → CTA 에 금액 반영 (I\'ve sent $250.00)', /\$250\.00/.test(await page.locator('.sheet .cta').innerText()));
  await page.evaluate(() => { const c = document.querySelector('.sheet .cta'); c.click(); c.click(); }); await page.waitForTimeout(400);   // double-tap
  const wl1 = await page.evaluate(() => (window.__writeLog || []).slice());
  ok('M7 입금 제출(더블탭) → requests insert 정확히 1행 {type deposit · server FX · acct FX-850261 · 250 · bank · pending} · 잔고 불변 · 시트 닫힘', wl1.length === writesBefore + 1 && wl1[wl1.length - 1].t === 'requests' && (r => r.type === 'deposit' && r.server === 'FX' && r.acct_no === 'FX-850261' && r.amount === 250 && r.network === 'bank' && r.status === 'pending' && /^R-/.test(r.local_id))(wl1[wl1.length - 1].row) && (await page.evaluate(() => window.__rh.cash)) === CASH && (await page.locator('.sheet').count()) === 0, JSON.stringify(wl1.slice(-1)));
  ok('M7 입금 토스트 = pending approval', /pending approval/i.test(await page.locator('.toast').innerText().catch(() => '')));
  // Withdraw — wallet
  await page.locator('.acc .acts div[data-act="sheet:withdraw"]').click(); await page.waitForTimeout(200);
  const wd = await page.locator('.sheet').innerText().catch(() => '');
  ok('M7 출금 시트: 방법 칩(Bank · USDT wallet) · Available 표시 · 금액 입력', /Withdraw/.test(wd) && /Bank/.test(wd) && /wallet/i.test(wd) && /Available \$12,322\.91/i.test(wd) && (await page.locator('#amtIn').count()) === 1, wd.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.sheet .chips span[data-act="wmethod:wallet"]').click(); await page.waitForTimeout(120);
  await page.locator('#amtIn').fill('100'); await page.locator('#wAddr').fill('0xnotanaddress'); await page.locator('.sheet .cta').click(); await page.waitForTimeout(150);
  ok('M7 출금: 잘못된 USDT 주소 → 토스트 · 서버 쓰기 0', /USDT/.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.evaluate(() => (window.__writeLog || []).length)) === writesBefore + 1);
  await page.locator('#wAddr').fill('0x6B1c8941698Affc56757eF9Be1723Ec43F720966'); await page.locator('.sheet .cta').click(); await page.waitForTimeout(400);
  const wl2 = await page.evaluate(() => (window.__writeLog || []).slice(-1)[0]);
  ok('M7 출금(wallet) 제출 → requests insert {type withdraw · 100 · network wallet · address 0x…} · pending 토스트', wl2 && wl2.t === 'requests' && wl2.row.type === 'withdraw' && wl2.row.amount === 100 && wl2.row.network === 'wallet' && /^0x6B1c/.test(wl2.row.address) && /pending approval/i.test(await page.locator('.toast').innerText().catch(() => '')), JSON.stringify(wl2));
  // Withdraw — bank, over the withdrawable → server guard rejects → message shown, sheet stays
  await page.locator('.acc .acts div[data-act="sheet:withdraw"]').click(); await page.waitForTimeout(200);
  await page.locator('#wHolder').fill('Test User'); await page.locator('#wBank').fill('Nevada State Bank'); await page.locator('#wSwift').fill('ZFNBUS55'); await page.locator('#wIban').fill('984869966');
  await page.locator('#amtIn').fill('99999'); await page.locator('.sheet .cta').click(); await page.waitForTimeout(400);
  const wl3 = await page.evaluate(() => (window.__writeLog || []).slice(-1)[0]);
  ok('M7 출금(bank) 은행 4항목이 address 로 서버에 실림 · 초과 금액 = 서버 guard 거절 문구 그대로 · 시트 유지', wl3 && wl3.row.type === 'withdraw' && wl3.row.network === 'bank' && /Test User/.test(wl3.row.address) && /Nevada State Bank/.test(wl3.row.address) && /ZFNBUS55/.test(wl3.row.address) && /984869966/.test(wl3.row.address) && /exceeds your withdrawable/.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.locator('.sheet').count()) === 1, JSON.stringify(wl3));
  await page.locator('.sheet .sttl .x').click(); await page.waitForTimeout(100);
  // Transfer — app_transfer RPC (immediate, idempotent by ref)
  await page.locator('.acc .acts div[data-act="sheet:transfer"]').click(); await page.waitForTimeout(200);
  const tf = await page.locator('.sheet').innerText().catch(() => '');
  ok('M7 이체 시트: From FX · To 칩(Crypto · Sports) · 금액 입력', /Transfer/.test(tf) && /Crypto/.test(tf) && /Sports/.test(tf) && (await page.locator('#amtIn').count()) === 1, tf.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('#amtIn').fill('99999'); await page.locator('.sheet .cta').click(); await page.waitForTimeout(400);
  ok('M7 이체 초과 → 서버 거절 (Insufficient balance) 문구 · 시트 유지', /Insufficient balance/.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.locator('.sheet').count()) === 1);
  await page.locator('.sheet .sttl .x').click(); await page.waitForTimeout(100);
  await page.locator('.acc .acts div[data-act="sheet:transfer"]').click(); await page.waitForTimeout(200);
  await page.locator('#amtIn').fill('300'); await page.waitForTimeout(80);
  await page.evaluate(() => { const c = document.querySelector('.sheet .cta'); c.click(); c.click(); }); await page.waitForTimeout(400);   // double-tap
  const xf = await page.evaluate(() => (window.__rpcLog || []).filter(x => x.name === 'app_transfer' && x.args.p_amount === 300));
  ok('M7 이체 $300 더블탭 → app_transfer 정확히 1회 {p_ref xfer-… · p_from FX-850261 · p_to CR-1 · 300} · 시트 닫힘', xf.length === 1 && /^xfer-\d+-[a-z0-9]{5}$/.test(xf[0].args.p_ref) && xf[0].args.p_from === 'FX-850261' && xf[0].args.p_to === 'CR-1' && (await page.locator('.sheet').count()) === 0, JSON.stringify(xf.map(c => c.args)));
  ok('M7 이체 토스트 (Transferred $300.00 → Crypto) · 잔고는 서버 재조회 값', /Transferred \$300\.00/.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.evaluate(() => window.__rh.cash)) === CASH);
  // Funding history (read-only)
  await page.locator('.srow[data-act="sheet:funding"]').click(); await page.waitForTimeout(250);
  const fh = await page.locator('.sheet').innerText().catch(() => '');
  ok('M7 입출금 내역 시트: requests 읽기 (Deposit $500.00 · approved)', /Deposit/.test(fh) && /\$500\.00/.test(fh) && /approved/i.test(fh), fh.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.sheet .sttl .x').click(); await page.waitForTimeout(100);
  ok('M7 런타임: 테이블 쓰기 = requests 만 (' + (await page.evaluate(() => (window.__writeLog || []).length)) + '건) · ledger/accounts/positions 쓰기 0', await page.evaluate(() => (window.__writeLog || []).every(w => w.t === 'requests')));
  // Security sheet — only real actions (password = auth.updateUser · sign out everywhere); no fake 2FA / device list
  await page.locator('.srow[data-act="sheet:security"]').click(); await page.waitForTimeout(150);
  const sec = await page.locator('.sheet').innerText().catch(() => '');
  ok('Security 시트: 로그인 이메일 · 비밀번호 변경 입력 2 · Sign out everywhere (가짜 2FA/세션 목록 0)', /Security/.test(sec) && /boss@x\.com/.test(sec) && (await page.locator('#pw1').count()) === 1 && (await page.locator('#pw2').count()) === 1 && /Sign out everywhere/.test(sec) && !/2-Factor|Active Sessions/.test(sec), sec.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('#pw1').fill('abcdefgh'); await page.locator('#pw2').fill('abcdefgX'); await page.locator('.sheet .cta').click(); await page.waitForTimeout(150);
  ok('비밀번호 불일치 → 토스트 · updateUser 0회 · 시트 유지', /do not match/.test(await page.locator('.toast').innerText().catch(() => '')) && (await page.evaluate(() => (window.__pwLog || []).length)) === 0 && (await page.locator('#pw1').inputValue()) === 'abcdefgh');
  await page.locator('#pw2').fill('abcdefgh'); await page.locator('.sheet .cta').click(); await page.waitForTimeout(300);
  const pw = await page.evaluate(() => window.__pwLog || []);
  ok('일치 → auth.updateUser({password}) 1회 · 시트 닫힘 · 토스트 Password updated', pw.length === 1 && pw[0].password === 'abcdefgh' && Object.keys(pw[0]).join() === 'password' && (await page.locator('.sheet').count()) === 0 && /Password updated/.test(await page.locator('.toast').innerText().catch(() => '')), JSON.stringify(pw));
  // Support sheet — phone / email cards + topic chips + message → mail app (no backend)
  await page.locator('.srow[data-act="sheet:support"]').click(); await page.waitForTimeout(150);
  const sup = await page.locator('.sheet').innerText().catch(() => '');
  ok('Support 시트: 전화 · 이메일 카드 + 주제 칩 5 + 메시지 입력', /\+41 22 555 9900/.test(sup) && /support@alpexa\.com/.test(sup) && (await page.locator('.sheet .chips span').count()) === 5 && (await page.locator('#smsg').count()) === 1, sup.replace(/\n/g, ' ').slice(0, 200));
  await page.locator('.sheet .cta').click(); await page.waitForTimeout(120);
  ok('주제 없이 Send → 토스트 (Pick a topic first)', /Pick a topic/.test(await page.locator('.toast').innerText().catch(() => '')));
  await page.locator('#smsg').fill('hello there');
  await page.locator('.sheet .chips span[data-act="stopic:trade"]').click(); await page.waitForTimeout(120);
  ok('주제 칩 선택 → 칩 on · 렌더 뒤에도 입력한 메시지 유지 (morph)', (await page.locator('.sheet .chips span.on').count()) === 1 && (await page.locator('#smsg').inputValue()) === 'hello there');
  await page.locator('.sheet .sttl .x').click(); await page.waitForTimeout(100);
  await page.locator('.srow[data-act="sheet:appearance"]').click(); await page.waitForTimeout(100);
  { const ws = await page.locator('.seg3 div').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
    ok('Appearance = 3분할 세그먼트 (Light · Dark · System) · 칸 너비 전부 동일', ws.length === 3 && ws.every(w => Math.abs(w - ws[0]) <= 1), ws.join(',')); }
  await page.locator('.seg3 div[data-act="theme:dark"]').click(); await page.waitForTimeout(100);
  ok('테마 스위치 → data-theme=dark', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.emulateMedia({ colorScheme: 'light' }); await page.locator('.seg3 div[data-act="theme:system"]').click(); await page.waitForTimeout(100);
  ok('System = 폰 설정 따라감 (light 에뮬레이션 → data-theme=light)', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
  await page.locator('.seg3 div[data-act="theme:dark"]').click(); await page.waitForTimeout(100);
  // M1 runtime
  const rpc = await page.evaluate(() => window.__rpcCalls || 0), writes = await page.evaluate(() => window.__writeCalls || 0);
  const names = await page.evaluate(() => (window.__rpcLog || []).map(x => x.name));
  ok('M1 런타임: 목록 밖 rpc 0회 · 테이블 쓰기 = requests 3건뿐(입금 1 · 출금 2, 이체는 RPC) · 호출된 이름 전부 허용목록 (' + names.length + '건)', rpc === 0 && writes === 3 && (await page.evaluate(() => (window.__writeLog || []).every(w => w.t === 'requests'))) && names.length > 8 && names.every(x => ALLOW.includes(x)), 'rpc=' + rpc + ' writes=' + writes + ' names=' + [...new Set(names)].join(','));
  ok('M1 런타임: 모든 주문 local_id 가 서로 다름 (멱등 키 재사용 0)', await page.evaluate(() => { const ids = (window.__rpcLog || []).filter(x => /^fx_(open|place_pending)$/.test(x.name)).map(x => x.args.p_local_id); return ids.length === new Set(ids).size; }));
  ok('M6 전 과정 무에러', errs.length === 0, errs.join(' | '));
  // last (navigates away): Sign out everywhere → auth.signOut({scope:'global'}) → login.html with the fx-rh return token
  await page.route('**/login.html*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>login stub</body></html>' }));
  await page.evaluate(() => act('sheet:security')); await page.waitForTimeout(150);   // appearance sheet is still open → switch sheets directly
  await page.locator('.sheet .acts div[data-act="logoutAll"]').click(); await page.waitForTimeout(700);
  const so = await page.evaluate(() => ({ url: location.href, out: sessionStorage.getItem('__signOut'), dest: sessionStorage.getItem('alpexa.dest2'), me: localStorage.getItem('alpexa.me') })).catch(() => ({}));
  ok('Sign out everywhere → signOut scope=global · dest2=fx-rh · login.html?switch=1 (alpexa.me 는 initScript 가 재시드해 여기선 검사 불가 — 소스 핀)', /login\.html\?switch=1/.test(so.url || '') && /"scope":"global"/.test(so.out || '') && so.dest === 'fx-rh' && /doLogoutAll\(\)\{[\s\S]*?\['alpexa\.me','alpexa\.userName','alpexa\.userEmail'\]\.forEach/.test(src), JSON.stringify(so));
  await browser.close(); server.close();
  console.log(fail ? `\n🔴 trading-rh FAIL — ${fail}건 (${pass} pass)` : `\n🟢 trading-rh — ${pass} pass · 돈 이동 0 · 락스텝 · Equity 재계산 일치`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('🔴 trading-rh crashed: ' + e.message); process.exit(1); });

// Alpexa — FX 터미널 실주문 가드 게이트 (차이감사 2026-07-21 톱5 영구핀 · 스텁 RPC, 실돈 0)
//
// 증명하는 계약 (webtrade 락스텝):
//  ① 슬리피지·레버리지 전달 — fx_open에 p_leverage=500(FX)·p_requested_price=ask·p_max_slippage=15pip
//  ② 세션 게이트 — fxMarketOpen 순수함수(토요일 FX 닫힘·크립토 24/7) + 닫힘이면 주문 3경로 RPC 0회
//  ③ markup 락스텝 — pricing_marks 로드 시 FX half = (spr+markup)*pip/2 (화면 bid == 서버 청산가)
//  ④ SL/TP 결정적 부착 — 주문창 SL 입력 → fx_open과 EXACTLY 같은 local_id로 fx_modify 즉시(추정 금지)
//  ⑤ 정산 실시간 — settlements INSERT(SL/TP/STOPOUT) → Journal 'Auto close' + 계좌·이력 재조회
// playwright/Chromium 없으면 SKIP(exit 0).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter(x => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const f = path.join(base, d, c); if (fs.existsSync(f)) return f;
      }
  } catch (_) {}
  return null;
}
let chromium = null;
try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-live-guards (no playwright/chromium)'); process.exit(0); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
function serve(port) {
  return new Promise(res => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const fp = path.join(REPO, p);
      if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rq.writeHead(404); rq.end('nf'); return; }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); rq.end(fs.readFileSync(fp));
    });
    s.listen(port, () => res(s));
  });
}
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };

// 로그인 스텁 + rpc 레코더 + pricing_marks 스텁 (EURUSD markup 1.5핍)
const STUB = `(() => {
  window.__rpcLog = [];
  const q = data => { const o = { select(){return o}, eq(){return o}, order(){return o}, range(){ return Promise.resolve({ data: [] }); },
    limit(){ return Promise.resolve({ data }); } }; return o; };
  window.AlpexaSync = {
    acctFor: k => k === 'fx' ? 'FX-1' : null,
    db: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: t => { if (t === 'accounts') return q([{ acct_no: 'FX-1', balance: 50000 }]);
        if (t === 'pricing_marks') { const o = { select(){ return Promise.resolve({ data: [{ symbol: 'EURUSD', markup_pts: 1.5 }] }); } }; return o; }
        if (t === 'settlements') { window.__histQ = (window.__histQ || 0) + 1; return q([]); }
        return q([]); },
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
      rpc: async (fn, args) => { window.__rpcLog.push({ fn, args });
        if (fn === 'fx_open') return { data: { ok: true, open: 1.14305, margin: 2.28 } };
        return { data: { ok: true } }; }
    } };
})()`;

(async () => {
  const PORT = 8893, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal live guards — 차이감사 톱5 게이트');
  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/dev/fx-terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(STUB);
  await page.evaluate(() => fxAcct.load());
  await page.waitForTimeout(250);

  // ── ② 세션 게이트 순수함수 (UTC 고정 시각) ──
  const gate = await page.evaluate(() => ({
    fxSat: fxMarketOpen('EURUSD', Date.UTC(2026, 6, 25, 12, 0)),      // 토요일 정오 → 닫힘
    fxMon: fxMarketOpen('EURUSD', Date.UTC(2026, 6, 20, 12, 0)),      // 월요일 정오 → 열림
    fxFriLate: fxMarketOpen('EURUSD', Date.UTC(2026, 6, 24, 22, 30)), // 금 22:30 → 닫힘
    btcSat: fxMarketOpen('BTCUSD', Date.UTC(2026, 6, 25, 12, 0)),     // 크립토 24/7
    stkSat: fxMarketOpen('AAPL', Date.UTC(2026, 6, 25, 15, 0)),       // 주식 주말 닫힘
    stkOpen: fxMarketOpen('AAPL', Date.UTC(2026, 6, 22, 15, 0)) }));  // 수 15:00 UTC 장중
  ok('session calendar: FX Sat/late-Fri closed · Mon open · crypto 24/7 · stock Sat closed/Wed open',
     gate.fxSat === false && gate.fxMon === true && gate.fxFriLate === false &&
     gate.btcSat === true && gate.stkSat === false && gate.stkOpen === true, JSON.stringify(gate));

  // ── ② 닫힌 장 → 원클릭 주문 거절 (RPC 0회 + Journal) ──
  await page.evaluate(() => { window.__gateReal = fxMarketOpen; fxMarketOpen = () => false; window.__rpcLog = []; });
  await page.click('#w-chart1 .ocbuy');
  await page.waitForTimeout(250);
  const closed = await page.evaluate(() => ({ rpc: window.__rpcLog.length,
    j: JOURNAL.entries.slice(0, 3).map(r => r.msg).join('|') }));
  ok('closed market: one-click BUY → ZERO rpc + refusal journal', closed.rpc === 0 && /market closed/i.test(closed.j), JSON.stringify(closed));
  await page.evaluate(() => { fxMarketOpen = window.__gateReal; });

  // ── ②-b 장마감 시각화: ocbar 🔒 (게이트와 표시가 함께 — 정직 UI) ──
  await page.evaluate(() => { fxMarketOpen = () => false; renderAllCharts(false); });
  await page.waitForTimeout(300);
  const mcl = await page.evaluate(() => document.querySelector('#w-chart1 .ocbar').classList.contains('mclosed'));
  await page.evaluate(() => { fxMarketOpen = () => true; renderAllCharts(false); });
  await page.waitForTimeout(300);
  const mopen = await page.evaluate(() => document.querySelector('#w-chart1 .ocbar').classList.contains('mclosed'));
  ok('closed market → ocbar 🔒(mclosed) · open → 해제', mcl === true && mopen === false, JSON.stringify({ mcl, mopen }));

  // ── ① 슬리피지·레버리지 전달 ──
  await page.evaluate(() => { fxMarketOpen = () => true;
    mwStore.apply([{ symbol: 'EURUSD', mid: 1.15000, spr_pts: 1.0 }]); window.__rpcLog = []; });
  await page.click('#w-chart1 .ocbuy');
  await page.waitForTimeout(300);
  const o1 = await page.evaluate(() => ({ call: window.__rpcLog.find(x => x.fn === 'fx_open'), ask: mwStore.rows.EURUSD.ask }));
  ok('fx_open carries p_leverage=500 (FX house cap)', !!o1.call && o1.call.args.p_leverage === 500, JSON.stringify(o1.call && o1.call.args));
  ok('fx_open carries p_requested_price=ask(click moment) + p_max_slippage=15pip',
     !!o1.call && Math.abs(o1.call.args.p_requested_price - o1.ask) < 1e-9 &&
     Math.abs(o1.call.args.p_max_slippage - 0.0015) < 1e-12,
     JSON.stringify(o1.call && { req: o1.call.args.p_requested_price, ask: o1.ask, slip: o1.call.args.p_max_slippage }));

  // ── ③ markup 락스텝: marks 로드 후 FX half = (spr+markup)*pip/2 ──
  await page.evaluate(() => mwStore.loadMarks());
  await page.waitForTimeout(200);
  const mk = await page.evaluate(() => { mwStore.apply([{ symbol: 'EURUSD', mid: 1.15000, spr_pts: 1.0 }]);
    return { marks: mwStore.marks, bid: mwStore.rows.EURUSD.bid, ask: mwStore.rows.EURUSD.ask }; });
  const expHalf = (1.0 + 1.5) * 0.0001 / 2;   // (spr+markup)*pip/2 — fx_close v_half 미러
  ok('pricing_marks loaded (EURUSD markup 1.5)', mk.marks && mk.marks.EURUSD === 1.5, JSON.stringify(mk.marks));
  ok('FX half includes markup: bid = mid − (spr+mk)*pip/2 (서버 청산가 락스텝)',
     Math.abs(mk.bid - (1.15 - expHalf)) < 1e-9 && Math.abs(mk.ask - (1.15 + expHalf)) < 1e-9,
     'bid=' + mk.bid + ' exp=' + (1.15 - expHalf));

  // ── ④ SL/TP 결정적 부착: 주문창 SL → fx_open과 같은 local_id로 fx_modify 즉시 ──
  await page.evaluate(() => { window.__rpcLog = [];
    openOrderDialog('EURUSD', 'buy');
    document.getElementById('odVol').value = '0.10';
    document.getElementById('odSL').value = '1.14000';
    submitOrder('buy'); });
  await page.waitForTimeout(500);
  const att = await page.evaluate(() => ({
    open: window.__rpcLog.find(x => x.fn === 'fx_open'),
    mod: window.__rpcLog.find(x => x.fn === 'fx_modify') }));
  ok('dialog SL → fx_modify with the SAME local_id as fx_open (900ms 추정 폐기)',
     !!att.open && !!att.mod && att.mod.args.p_local_id === att.open.args.p_local_id &&
     Math.abs(att.mod.args.p_sl - 1.14) < 1e-9,
     JSON.stringify({ open: att.open && att.open.args.p_local_id, mod: att.mod && att.mod.args }));

  // ── ⑤ 정산 실시간: SL INSERT → Journal 'Auto close' + 계좌·이력 재조회 ──
  const st = await page.evaluate(async () => {
    window.__histQ = 0; const n0 = JOURNAL.entries.length;
    fxAcct.onSettle({ server: 'fx', acct_no: 'FX-1', symbol: 'EURUSD', pnl: -2.3, detail: 'SL BUY 0.1 @ 1.15 → 1.14' });
    await new Promise(r => setTimeout(r, 300));
    return { j: JOURNAL.entries.slice(0, 3).map(r => r.msg).join('|'), grew: JOURNAL.entries.length > n0, hist: window.__histQ };
  });
  ok('settlements INSERT(SL) → Journal "Auto close (SL)" + history reload', st.grew && /Auto close \(SL\)/.test(st.j) && st.hist > 0, JSON.stringify(st));
  const other = await page.evaluate(() => { const n0 = JOURNAL.entries.length;
    fxAcct.onSettle({ server: 'fx', acct_no: 'FX-OTHER', symbol: 'EURUSD', pnl: 5, detail: 'SL BUY 0.1 @ 1 → 1' });
    return JOURNAL.entries.length === n0; });
  ok('other account settlement → ignored (내 계좌 행만)', other === true);

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-live-guards — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-live-guards crashed: ' + e.message); process.exit(1); });

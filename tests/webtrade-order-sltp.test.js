// Alpexa — webtrade 주문창 SL/TP 전달 행위 게이트 (스텁 RPC, 네트워크 0, 실돈 0)
//
// 결함-로그 2026-07-20 "주문창 SL/TP 미전달" 영구핀. 증명하는 계약:
//  ① 주문창에 SL 입력 + Buy → fx_open 체결 직후 rpc('fx_modify')가 같은 local_id로 호출된다
//     (구버전 RED: 입력칸은 있는데 fx_modify 0회 — 고객 SL이 무음 증발)
//  ② SL/TP 미입력(0) → fx_modify 호출 없음 (불필요 RPC 금지)
//  ③ fx_modify 거절 → 무음 탈락 금지: alert + Journal에 'SL/TP NOT set' 기록
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
if (!chromium || !exe) { console.log('⏭️  SKIP webtrade-order-sltp (no playwright/chromium)'); process.exit(0); }

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

// 로그인 스텁 + rpc 레코더 (mode: 'ok' = fx_modify 성공, 'reject' = fx_modify 거절)
const STUB = (mode) => `(() => {
  window.__rpcLog = [];
  const q = data => { const o = { select(){return o}, eq(){return o}, order(){return o}, range(){ return Promise.resolve({ data: [] }); },
    limit(){ return Promise.resolve({ data }); } }; return o; };
  window.AlpexaSync = {
    me: () => ({ id: 'u1' }),
    acctFor: k => k === 'fx' ? 'FX-288741' : null,
    db: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: t => t === 'accounts' ? q([{ acct_no: 'FX-288741', balance: 3717998.97 }]) : q([]),
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
      rpc: async (fn, args) => { window.__rpcLog.push({ fn, args });
        if (fn === 'fx_open')   return { data: { ok: true, open: 65400.5, margin: 1308 } };
        if (fn === 'fx_modify') return '${mode}' === 'reject'
          ? { data: { ok: false, error: 'SL on wrong side of market' } }
          : { data: { ok: true, sl: args.p_sl, tp: args.p_tp } };
        return { data: { ok: true } }; }
    } };
})()`;

// 주문창 열기 → SL/TP 입력 → Buy (실마우스). slVal/tpVal '' = 그 칸 건드리지 않음
async function placeWithSltp(page, mode, slVal, tpVal) {
  await page.evaluate(STUB(mode));
  await page.evaluate(() => {   // 전역 lexical(top-level const) — window. 접두 없이 직접 참조
    priceStore._apply([{ symbol: 'BTCUSD', mid: 65400, spr_pts: 10 }]);
    positionsStore.loadAcct();
    window.__rpcLog = [];
    terminalBus.emit('order.new', 'BTCUSD');
  });
  await page.waitForSelector('.om-adv', { timeout: 5000 });
  await page.waitForTimeout(250);
  const put = async (idx, val) => {          // .om-adv 첫 필드=SL, 둘째=TP (포커스 시 라이브가 주입돼도 fill이 덮어씀)
    if (val === '') return;
    const inp = page.locator('.om-adv .om-field input').nth(idx);
    await inp.click(); await inp.fill(String(val));
  };
  await put(0, slVal); await put(1, tpVal);
  const btn = await page.evaluateHandle(() => [...document.querySelectorAll('.om-btns .om-buy')].pop());
  const box = await btn.asElement().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  return page.evaluate(() => ({ log: window.__rpcLog,
    journal: (typeof journalStore !== 'undefined' ? journalStore.entries : []).map(r => r.msg || '').join(' | ') }));
}

(async () => {
  const PORT = 8897, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('webtrade order SL/TP — 주문창 전달 게이트');
  const page = await browser.newPage({ viewport: { width: 1900, height: 950 } });
  // CDN → tests/vendor 라우팅 (세션 프록시가 unpkg/jsdelivr를 막아도 풀부트 가능)
  const VENDOR = {
    'supabase-js': 'supabase.js', 'lightweight-charts': 'lightweight-charts.standalone.production.js',
    'react-dom': 'react-dom.production.min.js', 'react@': 'react.production.min.js', 'babel': 'babel.min.js',
  };
  await page.route(/https:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\/.*/, route => {
    const u = route.request().url();
    const hit = Object.keys(VENDOR).find(k => u.includes(k));
    if (hit) return route.fulfill({ contentType: 'application/javascript',
      body: fs.readFileSync(path.join(REPO, 'tests', 'vendor', VENDOR[hit])) });
    return route.fulfill({ status: 404, body: '' });
  });
  const alerts = [];
  page.on('dialog', d => { alerts.push(d.message()); d.accept().catch(() => {}); });
  await page.goto(`http://localhost:${PORT}/webtrade.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    typeof terminalBus !== 'undefined' && typeof priceStore !== 'undefined' && typeof positionsStore !== 'undefined',
    null, { timeout: 30000 }).catch(() => {});
  const booted = await page.evaluate(() => typeof terminalBus !== 'undefined' && typeof priceStore !== 'undefined');
  if (!booted) { console.log('⏭️  SKIP webtrade-order-sltp (webtrade did not boot — Babel/JSX)'); await browser.close(); server.close(); process.exit(0); }
  await page.waitForTimeout(1200);

  // ── ① SL 입력 + Buy → fx_open 후 fx_modify(같은 local_id, p_sl) ──
  const r1 = await placeWithSltp(page, 'ok', '64000', '');
  const open1 = r1.log.find(x => x.fn === 'fx_open');
  const mod1 = r1.log.find(x => x.fn === 'fx_modify');
  ok('BUY with SL 64000 → fx_open called', !!open1, JSON.stringify(r1.log));
  ok('… then fx_modify with SAME local_id + p_sl=64000 (구버전 RED: 미호출)',
     !!mod1 && !!open1 && mod1.args.p_local_id === open1.args.p_local_id &&
     Math.abs(+mod1.args.p_sl - 64000) < 1e-6 && mod1.args.p_tp == null,
     JSON.stringify(mod1 && mod1.args));

  // ── ② SL/TP 미입력 → fx_modify 호출 없음 ──
  const r2 = await placeWithSltp(page, 'ok', '', '');
  ok('no SL/TP entered → zero fx_modify calls',
     r2.log.some(x => x.fn === 'fx_open') && !r2.log.some(x => x.fn === 'fx_modify'),
     JSON.stringify(r2.log));

  // ── ③ fx_modify 거절 → alert + Journal (무음 탈락 금지) ──
  alerts.length = 0;
  const r3 = await placeWithSltp(page, 'reject', '64000', '66000');
  const mod3 = r3.log.find(x => x.fn === 'fx_modify');
  ok('rejected SL/TP → fx_modify attempted with p_sl+p_tp',
     !!mod3 && Math.abs(+mod3.args.p_sl - 64000) < 1e-6 && Math.abs(+mod3.args.p_tp - 66000) < 1e-6,
     JSON.stringify(mod3 && mod3.args));
  ok('rejected SL/TP → alert shown (customer is told, not silent)',
     alerts.some(a => /SL\/TP/i.test(a)), JSON.stringify(alerts));
  ok('rejected SL/TP → Journal records the drop', /SL\/TP NOT set/i.test(r3.journal), r3.journal.slice(-200));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' webtrade-order-sltp — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ webtrade-order-sltp crashed: ' + e.message); process.exit(1); });

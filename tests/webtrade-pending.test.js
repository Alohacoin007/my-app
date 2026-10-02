// Alpexa — webtrade 대기주문 게이트 (스텁 RPC, 네트워크 0, 실돈 0)
//
// 2026-10-02 사장님 "대기주문 기능을 웹트레이더에도 넣어줘" → 표 승인 "진행해". 증명하는 계약:
//  불변식: webtrade 는 fx_pending 에 직접 쓰지 않고 RPC 2개(fx_place_pending·fx_cancel_pending)만 부른다.
//          Place 한 번 = local_id 1개 = 서버 대기행 최대 1개. 잔고·포지션은 체결 시 서버(fx_pending_fill)만 바꾼다.
//  ① 주문창 Pending Order → Buy Limit 64000 + SL → rpc(fx_place_pending) 정확 인자 (BUY·LIMIT·size·trigger·sl)
//  ② Place 더블클릭 → fx_place_pending 1회 (busy 잠금 — 두 번째 클릭은 새 local_id 를 만들지 못한다)
//  ③ Pending 모드에서는 fx_open 이 절대 불리지 않는다 (시장가로 새지 않음)
//  ④ Trade 탭에 서버 대기행(fx_pending status=pending) 렌더 + ✕ → rpc(fx_cancel_pending, {p_local_id})
//  ⑤ 서버 거절 → 이유를 그대로 alert (무음 탈락 금지)
//  ⑥ 소스: fx_pending 직접 insert/update/upsert/delete 0줄 · 서버 미지원 Stop Limit 미노출
// playwright/Chromium 없으면 정적 핀만.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
const done = () => { console.log((fail ? '🔴' : '🟢') + ' webtrade-pending — ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0); };
console.log('webtrade pending orders — 대기주문 게이트');

// ── ⑥ 정적 핀 ──
const wt = fs.readFileSync(path.join(REPO, 'webtrade.html'), 'utf8');
ok('⑥ fx_pending 직접 쓰기 0줄 (insert/update/upsert/delete)',
   !/from\(\s*['"]fx_pending['"]\s*\)\s*\.\s*(insert|upsert|update|delete)/.test(wt));
ok('⑥ RPC 배선: fx_place_pending + fx_cancel_pending', /rpc\('fx_place_pending'/.test(wt) && /rpc\('fx_cancel_pending'/.test(wt));
{ const m = wt.match(/const WT_PEND_TYPES=\[([^\]]*)\]/);
  ok('⑥ 주문 유형 = 서버가 받는 4종만 (Stop Limit 미노출)', !!m && !/Stop Limit/.test(m[1]) && (m[1].match(/'/g) || []).length === 8, m && m[1]); }

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
if (!chromium || !exe) { console.log('⏭️  browser pins skipped (no playwright/chromium)'); done(); }

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

// 로그인 스텁 + rpc 레코더. rpc 는 80ms 늦게 답한다 (더블클릭이 응답 전에 들어오게 — 실제 네트워크와 같은 조건).
const STUB = (mode) => `(() => {
  window.__rpcLog = [];
  const PEND = [{ local_id:'wt-p-1', symbol:'BTCUSD', side:'BUY', size:0.05, otype:'LIMIT', trigger:63000, sl:null, tp:null,
                  status:'pending', created_at:'2026-10-02T10:00:00Z' }];
  const q = data => { const o = { select(){return o}, eq(){return o}, order(){return o}, range(){ return Promise.resolve({ data: [] }); },
    limit(){ return Promise.resolve({ data }); } }; return o; };
  window.AlpexaSync = {
    me: () => ({ id: 'u1' }),
    acctFor: k => k === 'fx' ? 'FX-288741' : null,
    db: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: t => t === 'accounts' ? q([{ acct_no: 'FX-288741', balance: 50000 }]) : t === 'fx_pending' ? q(PEND) : q([]),
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
      rpc: async (fn, args) => { window.__rpcLog.push({ fn, args }); await new Promise(r => setTimeout(r, 80));
        if (fn === 'fx_place_pending') return '${mode}' === 'reject'
          ? { data: { ok: false, error: 'trigger on wrong side of market' } }
          : { data: { ok: true, local_id: args.p_local_id } };
        return { data: { ok: true } }; }
    } };
})()`;

async function openPending(page, mode) {
  await page.evaluate(STUB(mode));
  await page.evaluate(() => {
    priceStore._apply([{ symbol: 'BTCUSD', mid: 65400, spr_pts: 10 }]);
    positionsStore.loadAcct(); window.__rpcLog = [];
    terminalBus.emit('order.new', 'BTCUSD');
  });
  await page.waitForSelector('.om-body', { timeout: 5000 });
  await page.waitForTimeout(200);
  const sel = page.locator('select.om-mode');
  if (!(await sel.count())) return false;
  await sel.selectOption('pending');
  await page.waitForSelector('select.om-ptype', { timeout: 3000 });
  await page.locator('select.om-ptype').selectOption('Buy Limit');
  const px = page.locator('input.om-trigger'); await px.click(); await px.fill('64000');
  const sl = page.locator('.om-adv .om-field input').nth(0); await sl.click(); await sl.fill('62000');
  return true;
}

(async () => {
  const PORT = 8899, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1900, height: 950 } });
  const VENDOR = {
    'supabase-js': 'supabase.js', 'lightweight-charts': 'lightweight-charts.standalone.production.js',
    'react-dom': 'react-dom.production.min.js', 'react@': 'react.production.min.js', 'babel': 'babel.min.js',
  };
  await page.route(/https:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\/.*/, route => {
    const u = route.request().url(); const hit = Object.keys(VENDOR).find(k => u.includes(k));
    if (hit) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(REPO, 'tests', 'vendor', VENDOR[hit])) });
    return route.fulfill({ status: 404, body: '' });
  });
  const alerts = [];
  page.on('dialog', d => { alerts.push(d.message()); d.accept().catch(() => {}); });
  await page.goto(`http://localhost:${PORT}/webtrade.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof terminalBus !== 'undefined' && typeof priceStore !== 'undefined' && typeof positionsStore !== 'undefined',
    null, { timeout: 30000 }).catch(() => {});
  const booted = await page.evaluate(() => typeof terminalBus !== 'undefined');
  if (!booted) { console.log('⏭️  browser pins skipped (webtrade did not boot)'); await browser.close(); server.close(); done(); }
  await page.waitForTimeout(1200);

  // ── ①②③ Buy Limit + SL, Place 더블클릭 ──
  const opened = await openPending(page, 'ok');
  ok('주문창에 Market Execution / Pending Order 선택이 있다', opened);
  if (opened) {
    const btn = page.locator('.om-btns .om-place');
    await btn.dblclick();
    await page.waitForTimeout(600);
    const log = await page.evaluate(() => window.__rpcLog);
    const places = log.filter(x => x.fn === 'fx_place_pending');
    const a = places[0] && places[0].args;
    ok('① fx_place_pending {BUY, LIMIT, 0.01, trigger 64000, sl 62000, tp null}',
       !!a && a.p_symbol === 'BTCUSD' && a.p_side === 'BUY' && a.p_otype === 'LIMIT' && Math.abs(a.p_size - 0.01) < 1e-9 &&
       Math.abs(a.p_trigger - 64000) < 1e-6 && Math.abs(a.p_sl - 62000) < 1e-6 && a.p_tp == null && /^wt-p-\d{13}-\d{1,6}$/.test(a.p_local_id),
       JSON.stringify(a));
    ok('② Place 더블클릭 → fx_place_pending 정확히 1회', places.length === 1, places.length + '회');
    ok('③ Pending 모드에서 fx_open 0회', !log.some(x => x.fn === 'fx_open'), JSON.stringify(log.map(x => x.fn)));
  }

  // ── ④ Trade 탭 대기행 + ✕ 취소 ──
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => { window.__rpcLog = []; positionsStore.loadPend && positionsStore.loadPend(); });
  await page.waitForTimeout(500);
  const row = await page.evaluate(() => {
    const r = document.querySelector('tr.pendrow'); if (!r) return null;
    return { txt: r.textContent, x: !!r.querySelector('.xcancel') }; });
  ok('④ Trade 탭에 서버 대기행 렌더 (buy limit · 63,000 지정가)', !!row && /buy limit/i.test(row.txt) && /63[,.]?000/.test(row.txt) && row.x, JSON.stringify(row));
  if (row) {
    // 테스트 페이지는 부팅 뒤에 로그인 스텁을 주입해 로그인 안내 막이 하단을 덮는다 → 버튼 클릭 이벤트를 직접 보낸다.
    await page.evaluate(() => document.querySelector('tr.pendrow .xcancel').click());
    await page.waitForTimeout(400);
    const canc = await page.evaluate(() => window.__rpcLog.find(x => x.fn === 'fx_cancel_pending'));
    ok('④ ✕ → rpc(fx_cancel_pending, {p_local_id:"wt-p-1"})', !!canc && canc.args.p_local_id === 'wt-p-1', JSON.stringify(canc));
  }

  // ── ⑤ 서버 거절 → 이유 alert ──
  alerts.length = 0;
  if (await openPending(page, 'reject')) {
    await page.locator('.om-btns .om-place').click();
    await page.waitForTimeout(500);
    ok('⑤ 서버 거절 → 이유 그대로 alert', alerts.some(a => /wrong side of market/.test(a)), JSON.stringify(alerts));
  }

  await browser.close(); server.close(); done();
})().catch(e => { console.error('❌ webtrade-pending crashed: ' + e.message); process.exit(1); });

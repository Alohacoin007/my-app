// Alpexa — FX 터미널 M4 실체결 행위 게이트 (스텁 RPC 레코더, 네트워크 0, 실돈 0)
//
// 증명하는 계약 (webtrade placeOrder/closeOrder 락스텝 · CLAUDE.md #5):
//  ① 로그인 + 원클릭 BUY → rpc('fx_open') 호출 — p_symbol/p_side/p_size 정확, local_id 'fxt-' 멱등 패턴
//  ② 성공 응답 → 클라는 포지션을 직접 만들지 않고 서버 재조회(fxAcct.load)로만 반영
//  ③ 거절 응답(margin 등) → 토스트로 사유 표시, 로컬 상태 무변화
//  ④ 미로그인 원클릭 → 서버 RPC 0회 (연습 체결만)
//  ⑤ 실포지션 ✕ → rpc('fx_close', {p_local_id}) · S/L·T/P Modify 저장 → rpc('fx_modify')
//  ⑥ 로그인 상태 대기주문(limit/stop) → 서버 매칭엔진 전까지 정직 거절(토스트), RPC 0회
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
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-trade (no playwright/chromium)'); process.exit(0); }

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

// 스텁: rpc 레코더 — fx_open 성공/거절 모드 전환 가능, accounts/positions 조회 스텁
const STUB = (rpcMode) => `(() => {
  window.__rpcLog = [];
  const q = data => { const o = { select(){return o}, eq(){return o}, order(){return o}, range(){ return Promise.resolve({ data: [] }); },
    limit(){ return Promise.resolve({ data }); } }; return o; };
  window.__loadCount = 0;
  window.AlpexaSync = {
    acctFor: k => k === 'fx' ? 'FX-1' : null,
    db: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: t => { if(t==='accounts') return q([{ acct_no:'FX-1', balance: 50000 }]);
        if(t==='positions'){ window.__loadCount++; return q([{ local_id:'FXP-1', symbol:'EURUSD', side:'buy', size:0.10, open_price:1.10, status:'open', updated_at:'2026-07-19T10:00:00Z', meta:{} }]); }
        return q([]); },
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
      rpc: async (fn, args) => { window.__rpcLog.push({ fn, args });
        if ('${rpcMode}' === 'reject') return { data: { ok:false, error:'insufficient margin' } };
        if (fn === 'fx_open')  return { data: { ok:true, open: 1.14305, margin: 2.28 } };
        if (fn === 'fx_close') return { data: { ok:true, pnl: 12.34 } };
        if (fn === 'fx_modify') return { data: { ok:true } };
        return { data: { ok:true } }; }
    } };
})()`;

(async () => {
  const PORT = 8890, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal trade — M4 real-execution gate (stub RPC)');
  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { fxMarketOpen = () => true; });   // 세션 게이트 개방 — 주말에 돌아도 주문 핀 불변(게이트 자체는 live-guards 테스트가 검증)

  // ── ④ 미로그인 원클릭 → RPC 0 ──
  await page.evaluate(() => { window.__probe = []; });
  const demoN0 = await page.evaluate(() => DEMO_POS.length);
  await page.click('#w-chart1 .ocbuy');
  await page.waitForTimeout(200);
  const un = await page.evaluate((n0) => ({ rpc: window.__rpcLog ? window.__rpcLog.length : 0, grew: DEMO_POS.length - n0 }), demoN0);
  ok('logged out: one-click BUY → zero server RPC, practice fill only', un.rpc === 0 && un.grew === 1, JSON.stringify(un));

  // ── ① 로그인 + 원클릭 BUY → fx_open (인자·멱등 ID) ──
  await page.evaluate(STUB('ok'));
  await page.evaluate(() => fxAcct.load());
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__loadCount = 0; });
  await page.click('#w-chart1 .ocbuy');
  await page.waitForTimeout(300);
  const call = await page.evaluate(() => window.__rpcLog.find(x => x.fn === 'fx_open'));
  ok('authed one-click BUY → rpc(fx_open) with exact args',
     !!call && call.args.p_symbol === 'EURUSD' && call.args.p_side === 'BUY' && Math.abs(call.args.p_size - 0.10) < 1e-9,
     JSON.stringify(call && call.args));
  ok('idempotent local_id (fxt-<ts>-<rand>)', !!call && /^fxt-\d{13}-\d{1,6}$/.test(call.args.p_local_id), call && call.args.p_local_id);
  // ── ② 성공 → 서버 재조회로만 반영(클라가 포지션 직접 생성 금지) ──
  const after = await page.evaluate(() => ({ reload: window.__loadCount > 0,
    demoGrew: DEMO_POS.some(p => p.ticket && String(p.ticket).startsWith('fxt-')) }));
  ok('fill reflected ONLY via server reload (fxAcct.load), no client-made position', after.reload === true && after.demoGrew === false, JSON.stringify(after));

  // ── ⑤ 실포지션 ✕ → fx_close · Modify → fx_modify ──
  await page.evaluate(() => { document.querySelector('#tbxBody .poclose[data-rclose]').click(); });
  await page.waitForTimeout(200);
  const closeCall = await page.evaluate(() => window.__rpcLog.find(x => x.fn === 'fx_close'));
  ok('real row ✕ → rpc(fx_close, {p_local_id:FXP-1})', !!closeCall && closeCall.args.p_local_id === 'FXP-1', JSON.stringify(closeCall && closeCall.args));
  await page.evaluate(() => { document.querySelector('#tbxBody .sltp[data-rmod]').click(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('mdSL').value = '1.05'; document.getElementById('mdTP').value = '1.25';
    document.querySelector('#modModal [data-md="save"]').click(); });
  await page.waitForTimeout(200);
  const modCall = await page.evaluate(() => window.__rpcLog.find(x => x.fn === 'fx_modify'));
  ok('Modify save → rpc(fx_modify, {sl,tp})', !!modCall && modCall.args.p_local_id === 'FXP-1' && modCall.args.p_sl === 1.05 && modCall.args.p_tp === 1.25,
     JSON.stringify(modCall && modCall.args));

  // ── ⑥ 로그인 대기주문 → 정직 거절(RPC 0) ──
  await page.evaluate(() => { window.__rpcLog = []; openOrderDialog('EURUSD'); });
  await page.waitForTimeout(150);
  const liveBadge = await page.evaluate(() => (document.querySelector('#ordModal .ordbadge') || {}).textContent || '');
  ok('order ticket shows LIVE badge when authed', /LIVE/.test(liveBadge), liveBadge);
  await page.evaluate(() => { document.querySelector('#ordModal [data-odc="mode"]').value = 'pending';
    document.querySelector('#ordModal [data-odc="mode"]').dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.querySelector('#ordModal [data-od="place"]').click(); });
  await page.waitForTimeout(200);
  const pend = await page.evaluate(() => ({ rpc: window.__rpcLog.length, toast: (document.getElementById('toast') || {}).textContent || '' }));
  ok('authed pending order → server-matched placement (fx_place_pending) — M4.5', pend.rpc === 1 && /placed \(LIVE, server-matched\)/i.test(pend.toast), JSON.stringify(pend));
  await page.keyboard.press('Escape');

  // ── ③ 거절 응답 → 사유 토스트, 로컬 무변화 ──
  await page.evaluate(STUB('reject'));
  await page.evaluate(() => fxAcct.load());
  await page.waitForTimeout(200);
  const demoN1 = await page.evaluate(() => DEMO_POS.length);
  await page.click('#w-chart1 .ocbuy');
  await page.waitForTimeout(250);
  const rej = await page.evaluate((n1) => ({ toast: (document.getElementById('toast') || {}).textContent || '',
    demoGrew: DEMO_POS.length - n1 }), demoN1);
  ok('server reject → reason toast + no local mutation', /rejected|margin/i.test(rej.toast) && rej.demoGrew === 0, JSON.stringify(rej));

  // ── ⑦ 차트 트레이드 레벨 드래그: 진입선 잡고 아래로 → fx_modify(p_sl) (2026-07-19 사장님) ──
  await page.evaluate(STUB('ok'));
  await page.evaluate(() => fxAcct.load());
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = Object.keys(layout).find(k => /^chart\d+$/.test(k) && layout[k].sym === 'EURUSD');
    window.__cid = g; setActiveChart(g); renderChart(g);
    const sc = chartScale[g];                                   // 진입가를 화면 범위 중앙으로 → 라인이 반드시 보이게
    fxAcct.pos[0].open_price = (sc.mn + sc.mx) / 2;
    renderChart(g); window.__rpcLog = []; });
  const dragGeo = await page.evaluate(() => {
    const sc = chartScale[window.__cid];
    const line = sc.tradeLines.find(t => t.kind === 'entry');
    const box = document.querySelector('#w-' + window.__cid + ' .cgwplot').getBoundingClientRect();
    return line ? { x: box.x + sc.plotW * 0.5, y: box.y + line.y, entry: line.entry } : null;
  });
  ok('entry trade-line is hit-registered on chart', !!dragGeo, JSON.stringify(dragGeo));
  if (dragGeo) {
    await page.mouse.move(dragGeo.x, dragGeo.y); await page.mouse.down();
    await page.mouse.move(dragGeo.x, dragGeo.y + 40, { steps: 6 });   // 아래로 = 롱 SL
    const preview = await page.evaluate(() => document.querySelector('#w-' + window.__cid + ' .cgsvg').innerHTML.includes('SL '));
    await page.mouse.up(); await page.waitForTimeout(250);
    const mod2 = await page.evaluate(() => window.__rpcLog.find(x => x.fn === 'fx_modify'));
    ok('drag preview shows SL label while dragging', preview === true);
    ok('drop below entry → rpc(fx_modify) with p_sl < entry, tp untouched',
       !!mod2 && mod2.args.p_local_id === 'FXP-1' && mod2.args.p_sl != null && mod2.args.p_sl < dragGeo.entry && mod2.args.p_tp == null,
       JSON.stringify(mod2 && mod2.args));
  }

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-trade — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-trade crashed: ' + e.message); process.exit(1); });

// Alpexa — webtrade 마진 표시 서버 락스텝 게이트 (스텁, 실돈 0)
//
// 차이감사 2026-07-21 "반전 발견" 영구핀: 서버의 사용중 마진(v_used·스탑아웃 공용)은
//   Σ notional / fx_lev_cap(cls)  (하우스 캡 — FX 500:1, 사용자 레버리지 무관)
// 인데 webtrade 화면은 사용자 레버리지(기본 100:1)로 표시 → 마진 5배 부풀림·프리마진 축소
// ("화면은 거절이라는데 서버는 승인" 혼란). 터미널은 이미 서버 일치.
//
// 계약:
//  ① 하단바 Margin = 서버 공식 (EURUSD 1.0랏 @1.15, lev설정 100 → 230.00, 구버전 RED: 1150.00)
//  ② 신규 주문 마진(need)은 사용자 레버리지 유지 — 서버 v_new_margin 미러 (0.01랏 → $11.50)
//  ③ 소스핀: 엔진·하단바·Exposure 3곳 모두 캡 기준 (사용자 leverage로 열린 포지션 마진 계산 금지)
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
if (!chromium || !exe) { console.log('⏭️  SKIP webtrade-margin-lockstep (no playwright/chromium)'); process.exit(0); }

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

const STUB = `(() => {
  const q = data => { const o = { select(){return o}, eq(){return o}, order(){return o}, range(){ return Promise.resolve({ data: [] }); },
    limit(){ return Promise.resolve({ data }); } }; return o; };
  window.AlpexaSync = {
    me: () => ({ id: 'u1' }),
    acctFor: k => k === 'fx' ? 'FX-1' : null,
    db: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: t => t === 'accounts' ? q([{ acct_no: 'FX-1', balance: 50000 }])
        : t === 'positions' ? q([{ local_id: 'wt-1', symbol: 'EURUSD', side: 'BUY', size: 1.0, open_price: 1.15,
                                   status: 'open', updated_at: '2026-07-22T00:00:00Z', meta: {} }])
        : q([]),
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
      rpc: async () => ({ data: { ok: true } })
    } };
})()`;

(async () => {
  // ── ③ 소스핀 (브라우저 불필요 — 먼저 판정) ──
  const src = fs.readFileSync(path.join(REPO, 'webtrade.html'), 'utf8');
  const engLine = (src.match(/const usedMargin = pos\.reduce\([^\n]*/) || [''])[0];
  const barLine = (src.match(/const marginUsed=pos\.reduce\([^\n]*/) || [''])[0];
  const expLine = (src.match(/const marg=\(s\)=>[^\n]*/) || [''])[0];
  const capBased = l => /usedMarginOf\(/.test(l) && !/,\s*leverage\s*\)/.test(l);   // 캡 기준 헬퍼 경유 + 사용자 leverage 미사용
  ok('src: 엔진 usedMargin = 캡 기준 (사용자 leverage 아님)', capBased(engLine), engLine);
  ok('src: 하단바 marginUsed = 캡 기준', capBased(barLine), barLine);
  ok('src: Exposure marg = 캡 기준', capBased(expLine), expLine);
  ok('src: usedMarginOf 헬퍼 = requiredMargin(…, LEV_CAP(symbol)) (서버 v_used 자구 미러)',
     /function usedMarginOf\(symbol, volume\)\{ return requiredMargin\(symbol, volume, LEV_CAP\(symbol\)\); \}/.test(src));

  const PORT = 8892, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('webtrade margin — 서버 락스텝 게이트');
  const page = await browser.newPage({ viewport: { width: 1900, height: 950 } });
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
  await page.goto(`http://localhost:${PORT}/webtrade.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    typeof terminalBus !== 'undefined' && typeof priceStore !== 'undefined' && typeof positionsStore !== 'undefined',
    null, { timeout: 30000 }).catch(() => {});
  const booted = await page.evaluate(() => typeof terminalBus !== 'undefined' && typeof priceStore !== 'undefined');
  if (!booted) { console.log('⏭️  SKIP webtrade-margin-lockstep behavior (no boot)'); await browser.close(); server.close();
    console.log((fail ? '🔴' : '🟢') + ' webtrade-margin-lockstep — ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0); }
  await page.waitForTimeout(1200);
  await page.evaluate(STUB);
  await page.evaluate(() => { tradeSettings.setLeverage(100);   // 사용자 레버리지 100 (기본값 시나리오)
    priceStore._apply([{ symbol: 'EURUSD', mid: 1.15000, spr_pts: 1.0 }]);
    positionsStore.loadAcct(); positionsStore.loadPos(); });
  await page.waitForTimeout(700);

  // ── ① 하단바 Margin = 서버 사용중 마진 (1.0랏 × 100000 × 1.15 / 500 = 230.00) ──
  const bar = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.acctline span')].map(s => s.textContent).join(' | ');
    const num = re => { const m = t.replace(/,/g, '').match(re); return m ? +m[1] : null; };
    return { t, eq: num(/Equity:\s*([\d.]+)/), mg: num(/Margin:\s*([\d.]+)/), fr: num(/Free Margin:\s*([\d.]+)/) };
  });
  // 1.0랏 × 100000 × baseUsd(≈1.15, SIM 미세변동 허용) / 500 ≈ 230 (구버전 RED: ≈1150 = 사용자 100:1)
  ok('bottom bar Margin ≈ 230 (서버 v_used 락스텝 — 구버전 RED: ≈1,150)',
     bar.mg != null && bar.mg > 225 && bar.mg < 235, JSON.stringify(bar).slice(0, 220));
  ok('bottom bar Free Margin = Equity − Margin (± 2센트)',
     bar.eq != null && bar.fr != null && Math.abs((bar.eq - bar.mg) - bar.fr) < 0.02, JSON.stringify(bar).slice(0, 220));

  // ── ② 신규 주문 마진은 사용자 레버리지 유지 (0.01랏 @100:1 → $11.50) ──
  await page.evaluate(() => terminalBus.emit('order.new', 'EURUSD'));
  await page.waitForTimeout(400);
  const need = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.omodal b')].map(x => x.textContent).join(' | ');
    return el;
  });
  ok('order ticket need = $11.50 (신규 마진은 사용자 100:1 — 서버 v_new_margin 미러)',
     /\$11\.50/.test(need), need.slice(0, 200));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' webtrade-margin-lockstep — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ webtrade-margin-lockstep crashed: ' + e.message); process.exit(1); });

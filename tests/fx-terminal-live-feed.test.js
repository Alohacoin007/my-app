// Alpexa — FX 터미널 M2 실시세 행위 게이트 (스텁 supabase, 네트워크 0)
//
// 증명하는 계약:
//  ① 서버 prices 행 → mwStore.apply 경유로 MW에 실가격 표시 (크립토 BTC→BTCUSD 매핑 포함)
//  ② 라이브 전환 시 LIVE 배지 + 실시세 없는 심볼은 목록서 제외 (feed-filter 규율)
//  ③ 실피드 끊김 → STALE 배지 + 가격 동결 (SIM으로 되돌아가 가짜로 흔들지 않음, #5)
//  ④ SIM 폴백 — AlpexaSync 없으면 기존 SIM 그대로 (배지 없음)
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
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-live-feed (no playwright/chromium)'); process.exit(0); }

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

// 서버 prices 스텁 — FX 2종 + 크립토 1종(서버 표기 'BTC') + 주식 1종. spr 단위는 라이터별(핍/bps/0).
const ROWS = [
  { symbol: 'EURUSD', mid: 1.23456, spr_pts: 1.0 },
  { symbol: 'USDJPY', mid: 155.111, spr_pts: 1.9 },
  { symbol: 'BTC',    mid: 65432,   spr_pts: 10 },
  { symbol: 'AAPL',   mid: 233.44,  spr_pts: 0 } ];

(async () => {
  const PORT = 8871, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal live feed — M2 behavior gate');

  // ── ④ 스텁 없이 로드 = SIM 그대로 (배지 없음, 기존 스모크와 동일 전제) ──
  let page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  ok('no feed → honest SIM badge shown', (await page.$eval('#mwLive', el => el.textContent)) === 'SIM');
  ok('SIM rows render (전 심볼 = MW_WATCH 길이 — 2026-07-23 주식 36종 확장 후 고정 22 폐지)',
     (await page.$$eval('#w-marketwatch .mwrow', r => r.length)) === (await page.evaluate(() => MW_WATCH.length)));

  // ── ① 실피드 주입 → 실가격 + 매핑 ──
  await page.evaluate((rows) => {
    const thenable = data => ({ then: res => res({ data }) });
    window.AlpexaSync = { db: {
      from: () => ({ select: () => thenable(rows) }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }) } };
    return fxFeed.poll();
  }, ROWS);
  await page.waitForTimeout(400);
  const live = await page.evaluate(() => ({
    live: mwStore.live, badge: (document.getElementById('mwLive') || {}).textContent,
    eur: mwStore.rows.EURUSD && mwStore.rows.EURUSD.mid,
    btc: mwStore.rows.BTCUSD && mwStore.rows.BTCUSD.mid,
    rowN: document.querySelectorAll('#w-marketwatch .mwrow').length }));
  ok('server rows → mwStore live (EURUSD 1.23456)', live.live === true && Math.abs(live.eur - 1.23456) < 1e-9, JSON.stringify(live));
  ok('crypto mapping BTC → BTCUSD (65432)', Math.abs(live.btc - 65432) < 1e-9);
  ok('LIVE badge shown', live.badge === 'LIVE');

  // ── ② 실시세 없는 심볼은 목록 제외 (다음 mwRender 주기 후 4행만) ──
  await page.waitForTimeout(1200);
  const rowSyms = await page.$$eval('#w-marketwatch .mwrow', r => r.map(x => x.dataset.sym));
  ok('feed-filter: only real symbols listed (' + rowSyms.join(',') + ')',
     rowSyms.length === 4 && ['EURUSD', 'USDJPY', 'BTCUSD', 'AAPL'].every(s => rowSyms.includes(s)));

  // ── ③ 실피드 끊김 → STALE 배지 + 동결 (SIM 재가동 금지) ──
  const frozen = await page.evaluate(async () => {
    fxFeed.lastRealAt = Date.now() - 20000;                       // 20s 무실틱 시뮬
    window.AlpexaSync = undefined;                                 // 폴도 죽음
    fxFeed.badge();
    const before = mwStore.rows.EURUSD.mid;
    await new Promise(r => setTimeout(r, 2300));                  // SIM 루프(1s)가 돌 시간
    return { badge: document.getElementById('mwLive').textContent,
             cls: document.getElementById('mwLive').className,
             same: mwStore.rows.EURUSD.mid === before, liveFlag: mwStore.live };
  });
  ok('feed dead → STALE badge (honest)', frozen.badge === 'STALE' && /stale/.test(frozen.cls), JSON.stringify(frozen));
  ok('prices FREEZE at last real value (no fake SIM wiggle)', frozen.same === true && frozen.liveFlag === true);

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-live-feed — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-live-feed crashed: ' + e.message); process.exit(1); });

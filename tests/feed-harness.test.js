// Alpexa — 시세 하네스(feedHz) 행위 증명 (2026-07-19 사장님 지시: "시세 이상시 자동 수정")
//
// RED→GREEN 시나리오 (전부 스텁, 네트워크 0):
//  A. 피드 정지 + 차트 캔들 소실 → 하네스가 감지해 치유 시도(heal:poll+reconnect · heal:chLoad)
//     + 복구 불능 동안 ⚠ FEED STALE 배지 (정직 표시)
//  B. 서버 폴백이 살아나면 → 스스로 시세 복구(mk.q 갱신·lastTick 신선) + 배지 자동 숨김
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
if (!chromium || !exe) { console.log('⏭️  SKIP feed-harness (no playwright/chromium)'); process.exit(0); }

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

(async () => {
  const PORT = 8869, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`http://localhost:${PORT}/dev/crypto-dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  console.log('feed-harness — freeze → detect → heal → recover');

  // ── A. RED: 피드 정지(20s 무틱) + 차트 캔들 소실 — 폴백도 죽음(AlpexaSync 없음) ──
  await page.evaluate(() => { window.AlpexaSync = undefined;
    mk.lastTick = Date.now() - 30000; if (typeof ch !== 'undefined') ch.candles = []; });
  await page.waitForTimeout(3200);   // 하네스 2.5s 주기 1회+
  const A = await page.evaluate(() => ({
    acts: feedHz.log.map(l => l.action),
    badge: !!(feedHz.badge && feedHz.badge.style.display !== 'none') }));
  ok('A: detects stale feed → heal:poll+reconnect attempted', A.acts.includes('heal:poll+reconnect'), A.acts.join(','));
  ok('A: detects dead chart → heal:chLoad attempted', A.acts.includes('heal:chLoad'), A.acts.join(','));
  ok('A: unrecovered → honest ⚠ FEED STALE badge shown', A.badge === true);

  // ── B. GREEN: 서버 폴백이 살아남 → 하네스가 스스로 시세 복구 + 배지 숨김 ──
  await page.evaluate(() => {
    const thenable = data => ({ eq: () => Promise.resolve({ data }), then: res => res({ data }) });
    window.AlpexaSync = { db: { auth: { getSession: async () => ({ data: { session: null } }) },
      from: t => ({ select: () => t === 'prices' ? thenable([{ symbol: 'BTC', mid: 61234, spr_pts: 10 }]) : thenable([]) }),
      rpc: async () => ({ data: null }) } };
    mk.lastTick = Date.now() - 30000;   // 여전히 무틱 — 하네스가 폴백을 돌려 살려야 함
  });
  await page.waitForTimeout(5800);   // 치유(1주기) + 배지 재평가(다음 주기)까지 — 2.5s×2 여유
  const B = await page.evaluate(() => ({
    bid: mk.q.BTC && mk.q.BTC.bid, ageS: Math.round((Date.now() - mk.lastTick) / 1000),
    badge: !!(feedHz.badge && feedHz.badge.style.display !== 'none') }));
  ok('B: harness self-corrects prices via server fallback (BTC bid≈61234)', B.bid > 61000 && B.bid < 61500, JSON.stringify(B));
  ok('B: tick freshness restored (' + B.ageS + 's)', B.ageS <= 5);
  ok('B: badge auto-hides on recovery', B.badge === false);

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' feed-harness — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ feed-harness crashed: ' + e.message); process.exit(1); });

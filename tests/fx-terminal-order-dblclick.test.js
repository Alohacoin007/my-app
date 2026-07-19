// Alpexa — 시세창 더블클릭 → 주문 티켓 행위 게이트 (실제 마우스 2클릭, 네트워크 0)
//
// 버그(2026-07-19 사장님 발견): 핸들러는 있었지만 첫 클릭의 mwRender()가 행 DOM을 교체 →
// 브라우저 네이티브 dblclick이 "같은 노드 2클릭" 조건을 못 채워 영영 발화 안 함.
// (1초 주기 mwRender도 두 클릭 사이에 끼면 동일하게 죽임 — dispatchEvent 테스트는 이걸 못 잡는다.)
// 수정 = 클릭 위임에서 심볼 기준 수동 더블클릭 판정(450ms) — DOM 교체와 무관.
// 이 테스트는 playwright의 "진짜 마우스 2클릭"으로 검증한다.
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
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-order-dblclick (no playwright/chromium)'); process.exit(0); }

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
  const PORT = 8876, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal order dblclick — behavior gate (real mouse)');
  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/dev/fx-terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  // ── ① 미선택 행 실제 더블클릭 → 주문 티켓 (첫 클릭이 선택+재렌더를 유발하는 최악 경로) ──
  const row = await page.$('#w-marketwatch .mwrow:nth-child(3)');
  const sym = await row.getAttribute('data-sym');
  await row.dblclick();
  await page.waitForTimeout(250);
  const r1 = await page.evaluate(() => { const m = document.getElementById('ordModal');
    return { open: !!m && m.style.display === 'flex', sym: (typeof ordUI !== 'undefined' && ordUI) ? ordUI.sym : null }; });
  ok('unselected row real dblclick → order ticket opens', r1.open === true, JSON.stringify(r1));
  ok('ticket symbol = double-clicked row (' + sym + ')', r1.sym === sym, r1.sym + ' vs ' + sym);

  // ── ② Esc로 닫기 → 이미 선택된 행 더블클릭도 열림 ──
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const closed = await page.evaluate(() => { const m = document.getElementById('ordModal'); return !m || m.style.display !== 'flex'; });
  ok('Escape closes ticket', closed);
  const row2 = await page.$('#w-marketwatch .mwrow[data-sym="' + sym + '"]');
  await row2.dblclick();
  await page.waitForTimeout(250);
  ok('already-selected row dblclick → opens again',
     await page.evaluate(() => { const m = document.getElementById('ordModal'); return !!m && m.style.display === 'flex'; }));
  await page.keyboard.press('Escape');

  // ── ③ 느린 2클릭(600ms 간격)은 더블클릭 아님 — 선택만 바뀌고 티켓 안 뜸 ──
  const row3 = await page.$('#w-marketwatch .mwrow:nth-child(5)');
  await row3.click();
  await page.waitForTimeout(600);
  const row3b = await page.$('#w-marketwatch .mwrow:nth-child(5)');
  await row3b.click();
  await page.waitForTimeout(250);
  ok('slow two clicks (600ms apart) do NOT open ticket',
     await page.evaluate(() => { const m = document.getElementById('ordModal'); return !m || m.style.display !== 'flex'; }));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-order-dblclick — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-order-dblclick crashed: ' + e.message); process.exit(1); });

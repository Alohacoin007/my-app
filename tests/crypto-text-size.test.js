#!/usr/bin/env node
// Alpexa — 크립토 모바일 작은 글자 키움 (2026-10-29 사장님 "사이즈 키울 만한 부분 시안" → 시안 승인 "진행해")
// ============================================================================
// 매핑(시안과 동일): 10→12 · 11→13 · 11.5→13 · 12→14 · 12.5→14 · 13→14.5 · 13.5→15. 탭바(iOS 표준 11px)는 그대로.
// 보유 행(AssetRow): 종목 13.5→16 · 보유수량 줄 11→13 · 금액 14→17 · 변동률 11→15.
// 핀: ① 실제 화면 Home·Trade·Discover·Account 에서 탭바를 뺀 보이는 글자 최소 12px (10·11·11.5px 0)
//     ② 보유 행 크기 (소스 + **배포되는 컴파일본**) ③ 탭바 11px 유지(아이폰 표준 — 바꾸지 않기로 함)
// 네트워크 0 (localhost 외 차단). 브라우저 없으면 ①③ SKIP.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} crypto-text-size — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
// ② 보유 행 — 소스·컴파일본
for (const [name, file] of [['소스', 'src/crypto-live-app.jsx'], ['컴파일본', 'vendor/crypto-live-compiled.js']]) {
  const s = fs.readFileSync(path.join(REPO, file), 'utf8'); const i = s.indexOf('function AssetRow('), j = s.indexOf('function WatchRow(', i); const b = i >= 0 && j > i ? s.slice(i, j) : '';
  const sizes = (b.match(/fontSize[:=]\s*\{?\s*([0-9.]+)/g) || []).map((x) => x.match(/([0-9.]+)$/)[1]).join(',');
  ok(`② ${name}: 보유 행 글자 = 종목 16 · 수량줄 13 · (잠금 배지 8.5) · 금액 17·17 · 변동률 15`, sizes === '16,13,8.5,17,17,15', sizes);
}
(async () => {
  let chromium = null, exe = null;
  try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
  if (!chromium) { try { chromium = require('playwright').chromium; } catch (_) {} }
  try { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (!exe && fs.existsSync(p)) exe = p; } } catch (_) {}
  if (!chromium || !exe) { console.log('  ⏭️  브라우저 없음 — 화면 검사 생략'); return done(); }
  const srv = http.createServer((q, r) => { let p = path.join(REPO, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(REPO)) { r.writeHead(403); return r.end(); }
    fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((res) => srv.listen(0, res));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), (r) => r.abort());
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await page.addInitScript(() => { try { localStorage.setItem('alpexa.me', JSON.stringify({ email: 'size@test', authId: 'size', accts: { crypto: 'C-SIZE' } })); sessionStorage.setItem('alpexa.sessChecked', '1'); localStorage.setItem('alpexa.theme', JSON.stringify('dark')); localStorage.setItem('alpexa.themeDefaultLight', '1'); } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/crypto-live.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Discover'), null, { timeout: 15000 }).catch(() => {});
    const scan = () => { const tabs = new Set(['Home', 'Trade', 'Discover', 'Account']); const small = [], tab = [];
      document.querySelectorAll('#phone *').forEach((el) => { if (![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) return; const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
        const fs = parseFloat(getComputedStyle(el).fontSize); const isTab = tabs.has(el.textContent.trim()) && r.top > innerHeight - 140;
        if (isTab) tab.push(fs); else if (fs < 12) small.push(fs + 'px「' + el.textContent.trim().slice(0, 16) + '」'); });
      return { small, tab }; };
    let n = 0;
    for (const t of ['Home', 'Trade', 'Discover', 'Account']) {
      await page.locator('button', { hasText: new RegExp('^' + t + '$') }).last().click(); await page.waitForTimeout(700);
      const r = await page.evaluate(scan); n++;
      ok(`① ${t}: 탭바 뺀 글자 최소 12px (10·11·11.5px 0)`, r.small.length === 0, r.small.slice(0, 8).join(' · '));
      if (t === 'Home') ok('③ 탭바 11px 그대로 (아이폰 표준)', r.tab.length === 4 && r.tab.every((x) => x === 11), r.tab.join(','));
    }
  } finally { await browser.close(); srv.close(); }
  done();
})();

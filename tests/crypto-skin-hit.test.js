#!/usr/bin/env node
// Alpexa — 크립토 앱 월드클락 스킨 히트·실클릭 테스트 (2026-10-25 사장님 "진행해" · FX 때 "버튼 클릭이 잘 안되는 버그 만들지 말고")
// ============================================================================
// 크립토 스킨은 팔레트(RH)·서체 교체 + 몇몇 컴포넌트 인라인 스타일만 바꿨다 (TabBar 를 떠 있는 알약으로, 기간 버튼을 주황 캡슐로).
// 손가락이 실제로 닿는지 두 겹으로 고정한다:
//   ① 탭바 버튼 4개 × 5지점 elementFromPoint → 그 버튼(또는 자식). 알약 바탕 div 가 버튼을 덮으면 🔴.
//   ② 실제 클릭으로 화면 전환: Trade → "Your position" · Discover → "Discover" · Account → "Portfolio overview" · Home → "My wallet".
//   ③ 홈 기간 버튼(1W) 실클릭 → 선택 캡슐이 그 버튼으로 옮겨감 (주황 바탕 = RH.acc).
//   라이트·다크 둘 다. 네트워크 0 (localhost 외 차단) — 시세 없이도 뼈대·전환은 잴 수 있다.
// 🛡️ 헛초록 방지: 탭 버튼 수 = 4 를 먼저 확인 (0개면 검사 고장).
//    RED 확인(작성 시): TabBar 알약 div 를 position:relative 로 하고 버튼들 뒤에 투명 <div style={{position:'absolute',inset:0}}/> 덮개를
//    넣으면 ① 🔴 (Home@65,768→DIV …) + 실클릭도 막혀 ② 이하 🔴. 되돌리면 🟢.
// 브라우저 없으면 SKIP(exit 0).
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} crypto-skin-hit — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };

(async () => {
  let chromium = null, exe = null;
  try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
  if (!chromium) { try { chromium = require('playwright').chromium; } catch (_) {} }
  try { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (!exe && fs.existsSync(p)) exe = p; } } catch (_) {}
  if (!chromium || !exe) { console.log('  ⏭️  브라우저 없음 — 크립토 스킨 히트테스트 생략'); return done(); }

  const srv = http.createServer((q, r) => { let p = path.join(REPO, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(REPO)) { r.writeHead(403); return r.end(); }
    fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), (r) => r.abort());
      await page.routeWebSocket(/.*/, (ws) => ws.close());
      await page.addInitScript((th) => { try {
        localStorage.setItem('alpexa.me', JSON.stringify({ email: 'skin@test', authId: 'skin', accts: { crypto: 'C-SKIN' } }));
        sessionStorage.setItem('alpexa.sessChecked', '1');
        localStorage.setItem('alpexa.theme', JSON.stringify(th)); localStorage.setItem('alpexa.themeDefaultLight', '1');
      } catch (e) {} }, theme);
      await page.goto(`http://localhost:${port}/crypto-live.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Discover'), null, { timeout: 15000 }).catch(() => {});
      const tabSel = (label) => page.locator('button', { hasText: new RegExp('^' + label + '$') }).last();
      const r = await page.evaluate(() => {
        const out = { miss: [] };
        const tabs = [...document.querySelectorAll('button')].filter((b) => ['Home', 'Trade', 'Discover', 'Account'].includes(b.textContent.trim()) && b.getBoundingClientRect().top > innerHeight - 140);
        out.n = tabs.length;
        tabs.forEach((t) => { const b = t.getBoundingClientRect();
          [[b.left + b.width / 2, b.top + 6], [b.left + b.width / 2, b.top + b.height / 2], [b.left + 4, b.top + b.height / 2], [b.right - 4, b.top + b.height / 2], [b.left + b.width / 2, b.bottom - 4]]
            .forEach(([x, y]) => { const e = document.elementFromPoint(x, y); if (!(e && t.contains(e))) out.miss.push(t.textContent.trim() + '@' + Math.round(x) + ',' + Math.round(y) + '→' + (e ? e.tagName : 'null')); }); });
        out.bg = getComputedStyle(document.querySelector('.phone-shell')).backgroundColor;
        return out; });
      ok(`[${theme}] 테마 적용 (phone 바탕 ${r.bg})`, theme === 'dark' ? r.bg === 'rgb(0, 0, 0)' : r.bg === 'rgb(255, 255, 255)');
      ok(`[${theme}] 탭바 버튼 4개 (0이면 검사 고장)`, r.n === 4, 'n=' + r.n);
      ok(`[${theme}] ① 탭 4개 × 5지점 — 알약·캡슐이 손가락을 가로채지 않음`, r.n === 4 && r.miss.length === 0, r.miss.join(' | '));
      const seen = async (txt) => page.locator(`text=${txt}`).first().isVisible().catch(() => false);
      await tabSel('Trade').click(); await page.waitForTimeout(500);
      const tTrade = await seen('Your position');
      await tabSel('Discover').click(); await page.waitForTimeout(500);
      const tDisc = await seen('Top 5 daily movers');
      await tabSel('Account').click(); await page.waitForTimeout(500);
      const tAcct = await seen('Portfolio overview');
      await tabSel('Home').click(); await page.waitForTimeout(500);
      const tHome = await seen('My wallet');
      ok(`[${theme}] ② 실클릭 화면 전환 Trade·Discover·Account·Home`, tTrade && tDisc && tAcct && tHome, JSON.stringify({ tTrade, tDisc, tAcct, tHome }));
      const accRgb = theme === 'dark' ? 'rgb(255, 159, 10)' : 'rgb(255, 149, 0)';
      await page.locator('button', { hasText: /^1W$/ }).first().click(); await page.waitForTimeout(300);
      const bg1w = await page.locator('button', { hasText: /^1W$/ }).first().evaluate((b) => getComputedStyle(b).backgroundColor);
      const bg1d = await page.locator('button', { hasText: /^1D$/ }).first().evaluate((b) => getComputedStyle(b).backgroundColor);
      ok(`[${theme}] ③ 홈 기간 1W 실클릭 → 주황 캡슐 이동 (1W ${bg1w} · 1D ${bg1d})`, bg1w === accRgb && bg1d !== accRgb);
      await page.close();
    }
  } finally { await browser.close(); srv.close(); }
  done();
})().catch((e) => { console.log('  ❌ crashed: ' + (e && e.message)); fail++; done(); });

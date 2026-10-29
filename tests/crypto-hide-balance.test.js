#!/usr/bin/env node
// Alpexa — 크립토 홈 "My wallet" 옆 눈 버튼 (2026-10-29 사장님 "눈깔 클릭시 내 계좌가 안 보이게" → 시안 승인 "ㅇㅇ")
// ============================================================================
// ① 눈 버튼 존재 · 손가락 히트(중앙·모서리 안쪽) ② 누르면 잔고·오늘 변동 가림("$ ••••••" · "Balance hidden"), 다시 누르면 보임
// ③ 저장되는 건 UI 설정 alpexa.hideBalance(true/false) 하나 — 돈 숫자는 localStorage 에 안 씀 (CLAUDE.md #5)
// ④ 새로고침해도 가림 유지 ⑤ 보유 행(AssetRow masked): 금액·수량 가림, 변동률 % 는 그대로
// 네트워크 0 (localhost 외 차단). 브라우저 없으면 SKIP.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} crypto-hide-balance — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
(async () => {
  let chromium = null, exe = null;
  try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
  if (!chromium) { try { chromium = require('playwright').chromium; } catch (_) {} }
  try { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (!exe && fs.existsSync(p)) exe = p; } } catch (_) {}
  if (!chromium || !exe) { console.log('  ⏭️  브라우저 없음 — 생략'); return done(); }
  const srv = http.createServer((q, r) => { let p = path.join(REPO, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(REPO)) { r.writeHead(403); return r.end(); }
    fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((res) => srv.listen(0, res));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), (r) => r.abort());
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await page.addInitScript(() => { try { localStorage.setItem('alpexa.me', JSON.stringify({ email: 'eye@test', authId: 'eye', accts: { crypto: 'C-EYE' } })); sessionStorage.setItem('alpexa.sessChecked', '1'); if (!localStorage.getItem('alpexa.theme')) { localStorage.setItem('alpexa.theme', JSON.stringify('dark')); localStorage.setItem('alpexa.themeDefaultLight', '1'); } } catch (e) {} });
    const url = `http://localhost:${srv.address().port}/crypto-live.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /My wallet/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {});
    const eye = page.locator('[data-eye="wallet"]');
    ok('① My wallet 옆 눈 버튼 있음', (await eye.count()) === 1);
    if ((await eye.count()) !== 1) { await browser.close(); srv.close(); return done(); }   // 버튼이 없으면 여기서 🔴 로 끝냄 (조용한 통과 방지)
    const hit = await page.evaluate(() => { const b = document.querySelector('[data-eye="wallet"]'), r = b.getBoundingClientRect();
      return [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.bottom - 3], [r.left - 4, r.top + r.height / 2]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && b.contains(e)); }); });
    ok('① 눈 버튼 손가락 히트 (중앙·모서리·바깥 4px 까지 = 44px 영역)', hit.every(Boolean), JSON.stringify(hit));
    await eye.tap(); await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ hero: !!document.querySelector('[data-masked="hero"]'), txt: (document.querySelector('[data-masked="hero"]') || {}).textContent, note: /Balance hidden/.test(document.body.textContent), ls: localStorage.getItem('alpexa.hideBalance'),
      money: Object.keys(localStorage).filter((k) => /bal(?!ance$)|balance(?!$)|holding|equity|wallet\.|usd/i.test(k) && k !== 'alpexa.hideBalance') }));
    ok('② 누르면 잔고 "$ ••••••" · "Balance hidden"', st.hero && /••••••/.test(st.txt || '') && st.note, JSON.stringify(st));
    ok('③ 저장 = alpexa.hideBalance=true (UI 설정만 — 돈 숫자 키 0)', st.ls === 'true' && st.money.length === 0, JSON.stringify(st));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => /My wallet/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {});
    ok('④ 새로고침해도 가림 유지', (await page.locator('[data-masked="hero"]').count()) === 1);
    await page.locator('[data-eye="wallet"]').tap(); await page.waitForTimeout(300);
    ok('② 다시 누르면 보임 (가림 0 · 설정 false)', (await page.locator('[data-masked="hero"]').count()) === 0 && (await page.evaluate(() => localStorage.getItem('alpexa.hideBalance'))) === 'false');
    const rows = await page.evaluate(async () => { const host = document.createElement('div'); document.body.appendChild(host);
      const a = { sym: 'BTC', name: 'Bitcoin', qty: 51.3197, price: 81036, chg: 1.61, seed: 1, mine: 51.3197 * 81036 };
      ReactDOM.createRoot(host).render(React.createElement(AssetRow, { a, kind: 'crypto', liveValue: a.mine, masked: true })); await new Promise((r) => setTimeout(r, 300));
      const t = host.textContent; host.remove(); return t; });
    ok('⑤ 보유 행 가림: 금액·수량 •••• · 실제 숫자(4,15x,xxx / 51.3197) 없음 · 변동률 % 그대로', /\$••••••/.test(rows) && /•••• held/.test(rows) && !/51\.3197/.test(rows) && !/4,15\d/.test(rows) && /1\.61%/.test(rows), rows);
  } finally { await browser.close(); srv.close(); }
  done();
})();

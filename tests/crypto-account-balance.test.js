#!/usr/bin/env node
// Alpexa — 크립토 Account 잔고 실시간·정합 (2026-10-29 사장님 "계좌 발란스가 실시간으로 업데이트가 되게 해줘. 안 맞는 거 같아")
// ============================================================================
// 불변식: 합계 = 화면의 세 줄(Crypto·FX·Sport) 합 · 각 줄은 서버/실시세 값 · 가짜 움직임 0 · 돈은 localStorage 에 없음 (CLAUDE.md #5)
// 실측 결함(스크린샷): 합계 $8,738,546.99 vs 줄 합 $8,737,623 (≈$924) ← 크립토 줄 사인파(±0.018%) + 합계 useMemo 가 __srvBal 변화 놓침
// ① 크립토 줄 = 보유+스테이킹 그대로, 2초 동안 안 흔들림  ② 합계 = 세 줄 합
// ③ FX 줄 = 서버 평가잔고(메모리 __srvBal.fxEquity) — localStorage 'alpexa.fxEquity'(오래된·계정간 누수 값) 무시
// ④ 서버 값이 바뀌면(10초 폴링 → alpexa-balance-change) 줄·합계 둘 다 1초 안에 따라옴
// ⑤ Account 열려 있는 동안 3초마다 서버 잔고 조회 (pullBalances 호출 수)
// ⑥ 정적: fxEquity 를 localStorage 에 쓰는 곳 0 (alpexa-sync · trading 소스·컴파일본) · Account 에 Math.sin 0
// 네트워크 0 (localhost 외 차단). 브라우저 없으면 ⑥만.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} crypto-account-balance — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
const rd = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

// ⑥ 정적 핀 (브라우저 없어도 돈다)
const acctBody = (x) => { const i = x.indexOf('function Account('); const j = x.indexOf('\nfunction ', i + 20); return i >= 0 && j > i ? x.slice(i, j) : ''; };
const LS_FXEQ = /localStorage\.setItem\(\s*['"]alpexa\.fxEquity['"]/;
ok('⑥ alpexa-sync.js: fxEquity localStorage 쓰기 0', !LS_FXEQ.test(rd('alpexa-sync.js')));
ok('⑥ trading 소스·컴파일본: fxEquity localStorage 쓰기 0', !LS_FXEQ.test(rd('src/trading-app.jsx')) && !LS_FXEQ.test(rd('vendor/trading-compiled.js')));
for (const [nm, f] of [['소스', 'src/crypto-live-app.jsx'], ['컴파일본', 'vendor/crypto-live-compiled.js']]) {
  const x = rd(f), b = acctBody(x);
  ok(`⑥ 크립토 ${nm}: fxEquity 를 localStorage 에서 읽는 곳 0`, !/getItem\(\s*['"]alpexa\.fxEquity['"]/.test(x));
  ok(`⑥ 크립토 ${nm} Account: 가짜 사인파(Math.sin) 0`, b.length > 2000 && !/Math\.sin/.test(b), b.length);
}

(async () => {
  let chromium = null, exe = null;
  try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
  if (!chromium) { try { chromium = require('playwright').chromium; } catch (_) {} }
  try { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (!exe && fs.existsSync(p)) exe = p; } } catch (_) {}
  if (!chromium || !exe) { console.log('  ⏭️  브라우저 없음 — ①~⑤ 생략'); return done(); }
  const srv = http.createServer((q, r) => { let p = path.join(REPO, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(REPO)) { r.writeHead(403); return r.end(); }
    fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((res) => srv.listen(0, res));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), (r) => r.abort());
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await page.addInitScript(() => { try {
      localStorage.setItem('alpexa.me', JSON.stringify({ email: 'acct@test', authId: 'acct', accts: { crypto: 'C-ACCT', fx: 'F-ACCT', sports: 'S-ACCT' } }));
      sessionStorage.setItem('alpexa.sessChecked', '1');
      localStorage.setItem('alpexa.fxEquity', '999');   // 다른 계정/옛 세션이 남긴 값 — 화면에 나오면 🔴
    } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/crypto-live.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof Account === 'function' && window.AlpexaSync, null, { timeout: 15000 }).catch(() => {});
    // 서버 응답 대역: pullBalances 를 가짜 서버로 교체 (호출 수 기록, 값은 테스트가 바꿈)
    await page.evaluate(() => {
      window.__srvCalls = 0; window.__srvNow = { fx: 3000000, fxEquity: 3080887, sports: 114287 };
      AlpexaSync.pullBalances = () => { window.__srvCalls++; return Promise.resolve(Object.assign({}, window.__srvNow)); };
      window.__srvBal = { fx: 3000000, fxEquity: 3080887, sports: 114287 };
    });
    const read = () => page.evaluate(() => { const h = document.getElementById('acct-test'); const t = h ? h.innerText.replace(/\s+/g, ' ') : '';
      const num = (re) => { const m = t.match(re); return m ? +m[1].replace(/,/g, '') : null; };
      return { total: num(/\$([\d,]+\.\d\d)/), crypto: num(/CRYPTO \$([\d,]+)/i), fx: num(/FX \$([\d,]+)/i), sport: num(/SPORT \$([\d,]+)/i) }; });
    await page.evaluate(() => { const host = document.createElement('div'); host.id = 'acct-test'; document.body.appendChild(host);
      window.__acctRoot = ReactDOM.createRoot(host);
      window.__acctRoot.render(React.createElement(Account, { balances: { BTC: 5000000, USDT: 442449 }, staked: { ETH: { usd: 100000 } }, serverBalances: { fx: 3000000, sports: 114287 } })); });
    await page.waitForTimeout(400);
    const samples = []; for (let i = 0; i < 10; i++) { samples.push(await read()); await page.waitForTimeout(200); }
    const s0 = samples[0];
    ok('① 크립토 줄 = 보유 5,442,449 + 스테이킹 100,000 = 5,542,449', s0.crypto === 5542449, JSON.stringify(s0));
    const cr = [...new Set(samples.map((s) => s.crypto))], tt = [...new Set(samples.map((s) => s.total))];
    ok('① 2초 동안 크립토 줄·합계 안 흔들림 (가짜 움직임 0)', cr.length === 1 && tt.length === 1, JSON.stringify({ cr, tt }));
    ok('③ FX 줄 = 서버 평가잔고 3,080,887 (localStorage 999 무시)', s0.fx === 3080887, JSON.stringify(s0));
    ok('② 합계 = 세 줄 합 (8,737,623.00)', s0.total === 8737623 && s0.total === s0.crypto + s0.fx + s0.sport, JSON.stringify(s0));
    // ④ 서버 값 변경 → 폴링이 가져옴
    await page.evaluate(() => { window.__srvNow = { fx: 3000000, fxEquity: 3050000, sports: 200000 }; });
    const c0 = await page.evaluate(() => window.__srvCalls);
    await page.waitForTimeout(3600);
    const s1 = await read(), c1 = await page.evaluate(() => window.__srvCalls);
    ok('⑤ Account 열려 있는 동안 3초마다 서버 조회 (3.6초에 ≥1회)', c1 - c0 >= 1, `calls ${c0}→${c1}`);
    ok('④ 서버 변경 → FX 3,050,000 · Sport 200,000 반영', s1.fx === 3050000 && s1.sport === 200000, JSON.stringify(s1));
    ok('④ 합계도 같이 따라옴 (= 세 줄 합 8,792,449)', s1.total === 8792449 && s1.total === s1.crypto + s1.fx + s1.sport, JSON.stringify(s1));
    const leaked = await page.evaluate(() => localStorage.getItem('alpexa.fxEquity'));
    ok('⑥ 실행 후 localStorage 에 fxEquity 없음 (옛 값 청소)', leaked == null, String(leaked));
  } finally { await browser.close(); srv.close(); }
  done();
})();

#!/usr/bin/env node
// Alpexa — 크립토 코인 상세 차트 현재가 박스 (2026-10-31 사장님 "Crypto 모바일 챠트에도 현재가 박스 넣어줘" — FX 앱과 같은 문법)
// ============================================================================
// ① 캔들: 박스 값 = 마지막 봉 종가 · 점선과 같은 높이 · 마지막 봉 오른쪽(안 겹침) — 320/360/393px · BTC 급 긴 가격
// ② 색 = 마지막 봉 방향 (상승 파랑 RH.green / 하락 빨강 RH.red)
// ③ 라인(pxTag): 박스 값 = 마지막 값 · 끝점 높이 · 선 끝점 오른쪽
// ④ 홈 포트폴리오 차트(pxTag 없음)는 박스 없음 — 그대로
// ⑤ 배포 컴파일본에도 반영 (src 만 고치고 재컴파일 잊으면 🔴)
// 네트워크 0 (localhost 외 차단). 브라우저 없으면 ⑤만.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} crypto-pxtag — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
const bin = fs.readFileSync(path.join(REPO, 'vendor/crypto-live-compiled.js'), 'utf8');
ok('⑤ 컴파일본: 현재가 박스(PxTag · usePxTagGutter) 반영', /function PxTag\(/.test(bin) && /function usePxTagGutter\(/.test(bin));
(async () => {
  let chromium = null, exe = null;
  try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
  if (!chromium) { try { chromium = require('playwright').chromium; } catch (_) {} }
  try { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (!exe && fs.existsSync(p)) exe = p; } } catch (_) {}
  if (!chromium || !exe) { console.log('  ⏭️  브라우저 없음 — ①~④ 생략'); return done(); }
  const srv = http.createServer((q, r) => { let p = path.join(REPO, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(REPO)) { r.writeHead(403); return r.end(); }
    fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((res) => srv.listen(0, res));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 844 }, isMobile: true, hasTouch: true });
    await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), (r) => r.abort());
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await page.addInitScript(() => { try { localStorage.setItem('alpexa.me', JSON.stringify({ email: 'tag@test', authId: 'tag', accts: { crypto: 'C-TAG' } })); sessionStorage.setItem('alpexa.sessChecked', '1'); } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/crypto-live.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof CandleChart === 'function' && typeof Chart === 'function', null, { timeout: 15000 }).catch(() => {});
    // 렌더 도우미: 실제 컴포넌트를 폭 w 상자에 그리고 박스·봉·점선 위치를 잰다
    const measure = (kind, w, up) => page.evaluate(async ({ kind, w, up }) => {
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:' + w + 'px;background:#000;z-index:99999'; host.id = 'tag-host'; document.body.appendChild(host);
      let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const candles = []; let p = 104000; for (let i = 0; i < 60; i++) { const o = p, c = +(o + (rnd() - 0.5) * 400).toFixed(2); candles.push({ t: i, o, h: Math.max(o, c) + rnd() * 150, l: Math.min(o, c) - rnd() * 150, c }); p = c; }
      const k = candles[59]; if (up) { k.c = k.o + 120.37; } else { k.c = k.o - 120.37; } k.h = Math.max(k.h, k.o, k.c); k.l = Math.min(k.l, k.o, k.c);
      const series = candles.map((x) => x.c);
      const root = ReactDOM.createRoot(host);
      root.render(kind === 'candle' ? React.createElement(CandleChart, { candles, scrubIdx: null, onScrub: () => {} })
        : React.createElement(Chart, { series, color: '#0A6CFF', baseline: series[0], scrubIdx: null, onScrub: () => {}, pxTag: kind === 'line' }));
      await new Promise((r) => setTimeout(r, 250));
      const svg = host.querySelector('svg'), tag = host.querySelector('[data-pxtag]'), s = svg.getBoundingClientRect();
      const out = { has: !!tag };
      if (tag) { const a = tag.getBoundingClientRect(); out.txt = tag.textContent; out.want = k.c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        out.bg = getComputedStyle(tag).backgroundColor; out.right = Math.round(s.right - a.right);
        const dash = [...svg.querySelectorAll('line[stroke-dasharray="2 4"]')].pop(); const ly = dash ? s.top + (+dash.getAttribute('y1')) / 220 * s.height : null;
        out.dy = ly == null ? null : Math.round(Math.abs((a.top + a.height / 2) - ly));
        if (kind === 'candle') { const rects = [...svg.querySelectorAll('rect')]; out.clear = Math.round(a.left - rects[rects.length - 1].getBoundingClientRect().right); }
        else { const cs = [...svg.querySelectorAll('circle')]; const end = cs.length ? cs[cs.length - 1].getBoundingClientRect() : null; out.clear = end ? Math.round(a.left - end.right) : null; } }
      root.unmount(); host.remove(); return out; }, { kind, w, up });
    const res = [];
    for (const w of [320, 360, 393]) { const r = await measure('candle', w, true); res.push(w + ':' + JSON.stringify(r));
      ok(`① 캔들 ${w}px: 박스 값 = 마지막 종가(${r.want}) · 점선 높이 ±1px · 마지막 봉과 안 겹침(간격 ${r.clear}px)`, r.has && r.txt === r.want && r.dy <= 1 && r.clear >= 0, JSON.stringify(r)); }
    const upR = await measure('candle', 393, true), dnR = await measure('candle', 393, false);
    ok('② 색 = 마지막 봉 방향 (상승 ≠ 하락, 하락 = 빨강 계열)', upR.bg !== dnR.bg && /^rgb\(25[0-5], (5[0-9]|6[0-9]|69)/.test(dnR.bg), JSON.stringify({ up: upR.bg, dn: dnR.bg }));
    for (const w of [320, 393]) { const r = await measure('line', w, true);
      ok(`③ 라인 ${w}px: 박스 값 = 마지막 값 · 끝점 높이 · 끝점 오른쪽(간격 ${r.clear}px)`, r.has && r.txt === r.want && r.dy <= 1 && r.clear >= 0, JSON.stringify(r)); }
    const home = await measure('home', 393, true);
    ok('④ 홈 포트폴리오 차트(pxTag 없음)는 박스 없음', home.has === false, JSON.stringify(home));
    if (process.env.SHOT_DIR) {
      await page.evaluate(() => { const host = document.createElement('div'); host.id = 'shot'; host.style.cssText = 'position:fixed;left:0;top:0;width:393px;padding:20px 0;background:' + RH.bg + ';z-index:99999'; document.body.appendChild(host);
        let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const candles = []; let p = 104000;
        for (let i = 0; i < 60; i++) { const o = p, c = +(o + (rnd() - 0.48) * 400).toFixed(2); candles.push({ t: i, o, h: Math.max(o, c) + rnd() * 150, l: Math.min(o, c) - rnd() * 150, c }); p = c; }
        ReactDOM.createRoot(host).render(React.createElement(CandleChart, { candles, scrubIdx: null, onScrub: () => {} })); });
      await page.waitForTimeout(400); await page.locator('#shot').screenshot({ path: path.join(process.env.SHOT_DIR, 'crypto-pxtag.png') });
    }
  } finally { await browser.close(); srv.close(); }
  done();
})();

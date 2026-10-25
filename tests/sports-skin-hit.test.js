#!/usr/bin/env node
// Alpexa — 스포츠 앱 월드클락 스킨 히트테스트 (2026-10-25 사장님 "스포츠 앱도 진행해" · FX 때 "버튼 클릭이 잘 안되는 버그 만들지 말고")
// ============================================================================
// 스킨은 CSS 만 바꿨다. 그래도 "그림"이 "손가락"을 가로챌 수 있는 자리 세 곳을 실제 브라우저 히트테스트로 고정한다:
//   ① 떠 있는 알약 탭바 — 알약·선택 캡슐은 .nav::before / .item.active::before 그림. 각 탭 5지점이 그 탭(또는 자식)을 맞아야 한다.
//   ② 슬립 바 — 숨김 상태는 화면 밖으로 완전히 내려가야 한다 (예전 bottom:62 → 지금 탭바 위로 띄움: 숨김 이동량이 모자라면
//      투명하지 않은 막대가 탭바 위에 걸쳐 탭을 먹는다). 보임 상태는 탭바와 겹치지 않고, Bet Slip 버튼 한가운데가 버튼을 맞는다.
//   ③ 종목 칩·검색칸 — 가로 스크롤 줄로 바꾼 칩 한가운데가 칩을 맞는다.
//   라이트·다크 둘 다. 네트워크 0 (localhost 외 전부 차단) — 경기 데이터 없이도 뼈대 히트는 잴 수 있다.
// 🛡️ 헛초록 방지: 대상 요소 수를 센다(탭 4 · 칩 7). 0개면 검사 고장이지 통과가 아니다.
//    RED 확인(작성 시): .nav::before 를 z-index:10 으로 올리면 ① 🔴, .slipbar 숨김 이동을 translate(-50%,60%) 로 줄이면 ② 🔴.
// 브라우저 없으면 SKIP(exit 0).
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} sports-skin-hit — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };

(async () => {
  let chromium = null, exe = null;
  try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
  if (!chromium) { try { chromium = require('playwright').chromium; } catch (_) {} }
  try { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (!exe && fs.existsSync(p)) exe = p; } } catch (_) {}
  if (!chromium || !exe) { console.log('  ⏭️  브라우저 없음 — 스포츠 스킨 히트테스트 생략'); return done(); }

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
        localStorage.setItem('alpexa.me', JSON.stringify({ email: 'skin@test', authId: 'skin', accts: [{ id: 'S1', type: 'sports' }] }));
        sessionStorage.setItem('alpexa.sessChecked', '1');
        localStorage.setItem('alpexaSettings', JSON.stringify({ theme: th, _themeLightV1: true }));
      } catch (e) {} }, theme);
      await page.goto(`http://localhost:${port}/sports-live.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => {
        const out = { miss: [], nTabs: 0, nChips: 0 };
        const vh = innerHeight;
        out.dark = document.body.classList.contains('dark');
        const items = [...document.querySelectorAll('#nav .item')]; out.nTabs = items.length;
        items.forEach((t) => { const b = t.getBoundingClientRect();
          [[b.left + b.width / 2, b.top + 6], [b.left + b.width / 2, b.top + b.height / 2], [b.left + 4, b.top + b.height / 2], [b.right - 4, b.top + b.height / 2], [b.left + b.width / 2, b.bottom - 3]]
            .forEach(([x, y]) => { const e = document.elementFromPoint(x, y); if (!(e && t.contains(e))) out.miss.push('nav:' + t.dataset.page + '@' + Math.round(x) + ',' + Math.round(y) + '→' + (e ? (e.id || e.className || e.tagName) : 'null')); }); });
        const chips = [...document.querySelectorAll('#page-home .sport')]; out.nChips = chips.length;
        chips.slice(0, 4).forEach((c) => { const b = c.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (!(e && c.contains(e))) out.miss.push('chip:' + c.dataset.sport + '→' + (e ? e.className : 'null')); });
        { const s = document.getElementById('gameSearch'); const b = s.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (e !== s) out.miss.push('search→' + (e ? e.className : 'null')); }
        const bar = document.getElementById('slipbar'); bar.classList.remove('show');
        bar.style.transition = 'none'; void bar.offsetWidth;
        out.hiddenTop = Math.round(bar.getBoundingClientRect().top); out.vh = vh;
        bar.classList.add('show'); void bar.offsetWidth;
        const sb = bar.getBoundingClientRect(); const navTop = Math.min(...items.map((t) => t.getBoundingClientRect().top));
        out.shownBottom = Math.round(sb.bottom); out.navTop = Math.round(navTop);
        const btn = bar.querySelector('.open'); const bb = btn.getBoundingClientRect(); const e = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
        out.openHit = !!(e && btn.contains(e));
        bar.classList.remove('show');
        return out; });
      ok(`[${theme}] 테마 적용 확인 (body.dark=${r.dark})`, r.dark === (theme === 'dark'));
      ok(`[${theme}] 대상 수: 탭 4 · 종목 칩 7 (0이면 검사 고장)`, r.nTabs === 4 && r.nChips === 7, `tabs=${r.nTabs} chips=${r.nChips}`);
      ok(`[${theme}] ① 탭 4개 × 5지점 + 칩 4 + 검색칸 — 장식(알약·캡슐)이 손가락을 가로채지 않음`, r.miss.length === 0, r.miss.join(' | '));
      ok(`[${theme}] ② 숨긴 슬립 바는 화면 밖 (top ${r.hiddenTop} ≥ ${r.vh}) — 탭바 위에 걸쳐 탭을 먹지 않음`, r.hiddenTop >= r.vh);
      ok(`[${theme}] ② 보인 슬립 바는 탭바와 안 겹침 (바닥 ${r.shownBottom} ≤ 탭 윗변 ${r.navTop}) · Bet Slip 버튼 한가운데 = 버튼`, r.shownBottom <= r.navTop && r.openHit, JSON.stringify(r));
      await page.close();
    }
  } finally { await browser.close(); srv.close(); }
  done();
})().catch((e) => { console.log('  ❌ crashed: ' + (e && e.message)); fail++; done(); });

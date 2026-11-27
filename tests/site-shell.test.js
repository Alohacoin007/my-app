#!/usr/bin/env node
// 사이트 공용 틀 계약 (v3 디자인 · 2026-11-27 사장님 "최고의 디자인으로 나머지 페이지도" → 시안 승인 "진행해").
//
// 왜: 페이지마다 메뉴·푸터를 따로 들고 있으면 한 곳만 고치고 나머지를 잊는다 (예전 사이트가 그랬다 — 홈만 새 헤더).
//   · 모양 = assets/site.css 한 파일 (모든 페이지가 같은 ?v= 로 불러온다)
//   · 메뉴 · 모바일 메뉴 · 푸터 · 메뉴 스크립트 = 홈(fx.html)과 **글자 하나까지 같아야** 한다 (락스텝)
//   · 어느 화면 폭에서도 가로 스크롤 0 · 페이지 에러 0 · 큰 ALPEXA 가운데 · 올려도 메뉴가 안 밀린다
// 새 페이지를 이 디자인으로 옮기면 PAGES 에 추가한다.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const PAGES = ['fx.html', 'about.html', 'ib.html'];
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const css = read('assets/site.css');
const block = {
  nav: (h) => (h.match(/<header class="nav">[\s\S]*?<\/header>/) || [''])[0],
  sheet: (h) => (h.match(/<div class="sheet" id="sheet"[\s\S]*?<div class="sheet-cta">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0],
  footer: (h) => (h.match(/<footer class="site-foot">[\s\S]*?<\/footer>/) || [''])[0],
  navJs: (h) => (h.match(/<script>\s*\(function\(\)\{\s*\/\/ 하위 메뉴[\s\S]*?<\/script>/) || [''])[0],
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const home = read('fx.html');
const ref = Object.fromEntries(Object.keys(block).map((k) => [k, norm(block[k](home))]));
ok('기준(홈)에 공용 틀 4개가 다 있다 — 메뉴 · 모바일 메뉴 · 푸터 · 메뉴 스크립트', Object.values(ref).every((v) => v.length > 200), JSON.stringify(Object.fromEntries(Object.entries(ref).map(([k, v]) => [k, v.length]))));
const ver = (h) => (h.match(/<link rel="stylesheet" href="assets\/site\.css\?v=(\d+)">/) || [])[1];
const LAYOUT = /(^|[;{\s])(gap|padding[a-z-]*|margin[a-z-]*|width|height|font-size|font-weight|letter-spacing|border[a-z-]*-width|top|left|right|bottom|display)\s*:/;

for (const f of PAGES) {
  const h = read(f);
  ok(`${f}: 공용 스타일을 같은 버전으로 불러온다 (site.css?v=${ver(home)})`, !!ver(h) && ver(h) === ver(home), 'v=' + ver(h));
  for (const k of Object.keys(block)) ok(`${f}: ${k} 가 홈과 글자 하나까지 같다`, norm(block[k](h)) === ref[k], norm(block[k](h)).slice(0, 80));
  ok(`${f}: 옛 틀이 남아 있지 않다 (검정 바 헤더 · 알약 버튼 · 네모 A 표식 · 옛 글꼴)`, !/class="(cmenu|acctpill|mark)"|<header class="site"|<footer class="site"|Space\+Grotesk|Source\+Serif|Roboto\+Mono/.test(h));
  ok(`${f}: 글꼴 = Inter(가는 굵기 포함) · 제목 h1 은 하나`, /family=Inter:opsz,wght@14\.\.32,300\.\.700/.test(h) && (h.match(/<h1[\s>]/g) || []).length === 1);
  const hover = ((h + css).match(/[^{}]*:hover[^{}]*\{[^}]*\}/g) || []).filter((r) => LAYOUT.test(r.slice(r.indexOf('{'))) && !/\.dd\{display:block\}/.test(r.replace(/\s+/g, '')));
  ok(`${f}: 올림(hover) 효과가 자리를 바꾸지 않는다`, hover.length === 0, hover.join(' | ').slice(0, 200));
}
ok('공용 파일에 페이지 고유 규칙이 섞이지 않았다 (홈 전용 .hero/.panel/.quote 등은 홈에)', !/\.(hero|panel|quote|accounts|cmp|state|letter-card|pillar)[\s{.:,]/.test(css.replace(/\.hero-(sub|cta)/g, '')));

// ── 실브라우저 ──
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (fs.existsSync(p)) return p; }
  } catch (_) {}
  return null;
}
let chromium = null;
try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} site-shell — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const open = async (f, vw, vh, mobile) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0
    await page.routeWebSocket(/.*/, ws => ws.close());
    await page.goto('http://localhost:' + server.address().port + '/' + f, { waitUntil: 'load' });
    return { page, errs };
  };
  const measure = (page) => page.evaluate(() => {
    const q = (s) => document.querySelector(s), vw = document.documentElement.clientWidth;
    const head = q('header.nav'), w = q('.wordmark span'), wb = w ? w.getBoundingClientRect() : null, foot = q('footer.site-foot');
    const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    return { vw, overflow: document.documentElement.scrollWidth - vw, headPos: head ? getComputedStyle(head).position : '', headBg: head ? getComputedStyle(head).backgroundColor : '',
      menu: shown(q('header.nav .menu')), burger: shown(q('.burger')), cssOn: getComputedStyle(document.body).backgroundColor === 'rgb(10, 10, 11)',
      word: wb ? { l: Math.round(wb.left), r: Math.round(wb.right), w: +getComputedStyle(w).fontWeight } : null, footBg: foot ? getComputedStyle(foot).backgroundColor : '',
      current: [...document.querySelectorAll('header.nav .menu>a[aria-current="page"]')].map((a) => a.getAttribute('href')), h1: (q('h1') || {}).textContent || '' };
  });
  try {
    for (const f of PAGES) {
      for (const [vw, vh] of [[1440, 900], [1920, 1080]]) {
        const d = await open(f, vw, vh), m = await measure(d.page);
        ok(`${f} @${vw}: 공용 스타일 적용 · 가로 스크롤 0 · 페이지 에러 0`, m.cssOn && m.overflow <= 0 && d.errs.length === 0, JSON.stringify({ cssOn: m.cssOn, overflow: m.overflow, errs: d.errs }));
        ok(`${f} @${vw}: 메뉴가 첫 화면 위에 투명하게 · 가로 메뉴 보임`, m.headPos === 'absolute' && /rgba\(0, 0, 0, 0\)|transparent/.test(m.headBg) && m.menu && !m.burger, JSON.stringify({ pos: m.headPos, bg: m.headBg, menu: m.menu, burger: m.burger }));
        ok(`${f} @${vw}: 큰 ALPEXA 가 가운데 · 굵게`, !!m.word && Math.abs(m.word.l - (m.vw - m.word.r)) <= 6 && m.word.w >= 600 && m.word.l >= 0, JSON.stringify(m.word));
        if (vw === 1440) {
          const want = ['markets.html', 'ib.html', 'about.html', 'support.html'].includes(f) ? [f] : [];
          ok(`${f}: 메뉴에 지금 페이지 표시 (${want[0] || '홈은 표시 없음'})`, JSON.stringify(m.current) === JSON.stringify(want), JSON.stringify(m.current));
          const spots = () => d.page.evaluate(() => [...document.querySelectorAll('header.nav .logo, header.nav .menu > *, header.nav .nav-r > a')].map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.width * 10) / 10]; }));
          const before = await spots(); await d.page.hover('header.nav .nav-r .link'); await d.page.waitForTimeout(300); const after = await spots();
          ok(`${f}: 메뉴의 Open account 에 올려도 메뉴 줄이 움직이지 않는다`, before.length >= 7 && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
          await d.page.hover('header.nav .menu .has-dd');
          ok(`${f}: What We Offer 하위 메뉴가 열린다`, await d.page.evaluate(() => { const e = document.querySelector('header.nav .dd'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }));
        }
        await d.page.close();
      }
      const p = await open(f, 390, 844, true), mm = await measure(p.page);
      ok(`${f} 모바일: 가로 스크롤 0 · 페이지 에러 0 · 햄버거 보임 · 큰 ALPEXA 가운데`, mm.overflow <= 0 && p.errs.length === 0 && !mm.menu && mm.burger && !!mm.word && Math.abs(mm.word.l - (mm.vw - mm.word.r)) <= 6, JSON.stringify({ overflow: mm.overflow, errs: p.errs, menu: mm.menu, burger: mm.burger, word: mm.word }));
      await p.page.click('.burger');
      const links = await p.page.evaluate(() => { const s = document.querySelector('.sheet'); return getComputedStyle(s).display !== 'none' ? [...s.querySelectorAll('a')].map((a) => a.getAttribute('href')) : []; });
      ok(`${f} 모바일: 햄버거를 누르면 메뉴가 열리고 모든 목적지가 있다`, ['markets.html', 'webtrade.html', 'fx.html#vip', 'ib.html', 'about.html', 'support.html', 'login.html?switch=1', 'signup.html'].every((x) => links.includes(x)), JSON.stringify(links));
      await p.page.click('.sheet .sheet-x');
      ok(`${f} 모바일: 닫기를 누르면 닫힌다`, await p.page.evaluate(() => getComputedStyle(document.querySelector('.sheet')).display === 'none'));
      await p.page.close();
    }
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 220)); }
  await browser.close(); server.close(); done();
})();

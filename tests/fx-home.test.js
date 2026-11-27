#!/usr/bin/env node
// 홈(fx.html) 새 디자인 계약 (2026-11-27 사장님 "이 버전으로 홈부터 진행해" — 실제 트레이딩 화면 버전).
//
// 방향: 화면 전체를 쓰는 첫 화면 · 글꼴 하나 · 검정/흰색/회색 + 라임 한 점 · 상자 대신 가는 선 · 밑줄 링크.
// 이 테스트가 지키는 것:
//   ① 모양만 바꿨다 — 기존 링크·앵커·문구(숫자 포함)는 그대로다. 새로 지어낸 숫자·주장 없음.
//   ② 캡처 이미지에 "Live" 라고 쓰지 않는다 (정지 화면을 실시간처럼 보이게 하면 거짓 표시).
//   ③ PC·모바일에서 실제로 그 모양으로 그려진다 (가로 스크롤 0 · 페이지 에러 0 · 모바일 메뉴가 열린다).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'fx.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const has = (s) => html.includes(s);
const count = (re) => (html.match(re) || []).length;

// ── ① 정적: 방향 ──
const fontLink = (html.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"/) || [''])[0];
ok('글꼴은 Inter 하나 (Space Grotesk · Source Serif · Roboto Mono 제거 · 가는 굵기 300 포함)', /family=Inter:/.test(fontLink) && !/Space\+Grotesk|Source\+Serif|Roboto\+Mono/.test(fontLink) && /300/.test(fontLink), fontLink.slice(0, 160));
ok('첫 화면 제목 = "Tight spreads. Nothing hidden."', /<h1[^>]*>Tight spreads\.<br>Nothing hidden\.<\/h1>/.test(html));
ok('첫 화면 그림 = 실제 터미널 차트 캡처 (파일이 리포에 있다 · 설명글 있음)', /<img class="art"[^>]*src="assets\/img\/home-hero-chart\.jpg"[^>]*alt="[^"]{10,}"/.test(html) &&
   ['home-hero-chart.jpg', 'home-hero-chart-1000.jpg', 'home-platform.jpg', 'home-platform-1200.jpg'].every((f) => fs.existsSync(path.join(REPO, 'assets/img', f))));
ok('캡처 이미지를 "Live" 라고 표시하지 않는다', !/class="shot-label"[^>]*>[^<]*\bLive\b/i.test(html) && !/<figcaption[^>]*>[^<]*\blive\b/i.test(html) && /class="shot-label"/.test(html));
const specs = [['0.0', 'Spreads from'], ['500:1', 'Leverage up to'], ['$100', 'Minimum deposit'], ['3', 'One account, one platform']];
ok('제원 줄 4칸: 0.0 pips · 500:1 · $100 · 3 asset classes', specs.every(([n, l]) => new RegExp('<div class="spec"><b>' + n.replace(/[$.]/g, '\\$&') + '(<i>[^<]*</i>)?</b><span>' + l + '</span></div>').test(html)));
ok('로고는 글자만 — 네모 "A" 표식 없음 (2026-11-27 사장님 "이거 빼자") · 헤더·모바일 메뉴·푸터 3곳', !/class="mark"/.test(html) && !/\.logo \.mark/.test(html) && count(/<a class="logo[^"]*" href="\/">Alpexa-FX<\/a>/g) === 3);
ok('회전 배너(슬라이드) 제거 — 첫 화면은 한 문장', !has('id="hslides"') && !has('h-dots'));
ok('둥근 형광 버튼 대신 밑줄 링크 (btn-lg 없음)', !has('btn-lg') && count(/class="link"/g) >= 8);

// ── ① 정적: 기존 것 보존 ──
ok('앵커 유지: #top · #crypto · #vip · #trust (다른 페이지가 fx.html#vip 로 들어온다)', ['top', 'crypto', 'vip', 'trust'].every((i) => count(new RegExp('id="' + i + '"', 'g')) === 1));
ok('시장 3면 링크 유지: markets.html?tab=fx · stock · crypto', ['fx', 'stock', 'crypto'].every((t) => has('href="markets.html?tab=' + t + '"')));
ok('가입 링크는 전부 새 창 (target=_blank rel=noopener) · 6개 이상', count(/href="signup\.html" target="_blank" rel="noopener"/g) >= 6 && count(/href="signup\.html"/g) === count(/href="signup\.html" target="_blank" rel="noopener"/g));
ok('My Account → login.html?switch=1 (새 창)', has('href="login.html?switch=1" target="_blank" rel="noopener"'));
ok('메뉴 유지: What We Offer(Markets · WebTrade Terminal · Account Tiers) · Markets · IB · About · Support', ['href="markets.html"', 'href="webtrade.html"', 'href="fx.html#vip"', 'href="ib.html"', 'href="about.html"', 'href="support.html"'].every(has) && has('What We Offer'));
ok('푸터 유지: Log in(레전드 터미널) · IB Portal · PAMM · Risk Disclosure · 수상 배지 2개 · 저작권', has('<a href="webtrade.html?theme=legend" target="_blank" rel="noopener">Log in</a>') && has('href="agent.html"') && has('href="pamm-desk.html"') && has('href="fx-risk.html"') &&
   has('Best Forex Broker 2026') && has('Best Forex Broker 2025') && has('© 2026, Alpexa-FX · An Alpexa Suisse company'));
ok('위험 고지 문구 그대로', has('Trading forex and CFDs on margin carries a high level of risk and may not be suitable for all investors. Leverage can work against you — only trade with capital you can afford to lose.'));
const COPY = [
  'Majors, minors and exotics — deep ECN liquidity aggregated from 80 tier&#8209;1 banks, spreads from 0.0 pips.',
  'US blue chips and high&#8209;momentum names, priced live — trade the moves that make the headlines.',
  'Bitcoin, Ethereum and the majors — 24/7, on the same account and the same platform as FX.',
  'You can never lose more than you deposit.',
  'Negative balance protection resets any negative equity to zero — automatically, on every account.',
  'Client funds are segregated at tier&#8209;1 banks, every session uses 256&#8209;bit encryption,',
  'An account for every trader', 'Trade the world&rsquo;s markets', 'Start trading in minutes',
];
ok('기존 문구 그대로 (시장 3종 설명 · 손실 한도 · 자금 분리 · 제목들)', COPY.every(has), COPY.filter((c) => !has(c)).join(' | ').slice(0, 200));
const acct = (html.match(/<section class="accounts" id="vip">[\s\S]*?<\/section>/) || [''])[0];
ok('계좌 3종의 사실만: Standard $100 · 0.8 pips · 수수료 없음 / Raw ECN 0.0 pips · $3.50 per lot · 24/5 / Pro $10,000 · VPS & API',
   ['Standard', 'Raw ECN', 'Pro', '$100', '0.8 pips', 'None', '0.0 pips', '$3.50 per lot', '24/5', '$10,000', 'Deepest tier', 'Custom', 'Dedicated', 'VPS &amp; API'].every((t) => acct.includes(t)), acct.slice(0, 120));
ok('지어낸 항목 없음 (시안에 있던 "Support: Standard" 줄 · 강조 점 제거)', !/<dt>Support<\/dt><dd>Standard<\/dd>/.test(acct) && !/class="tag"/.test(acct));
ok('플랫폼 구역: 터미널 화면 · 늦게 불러오기 · 크기 지정(화면 밀림 방지) · WebTrade 링크', /<img[^>]*src="assets\/img\/home-platform\.jpg"[^>]*loading="lazy"[^>]*width="2400" height="1076"/.test(html) && /class="platform"[\s\S]*?href="webtrade\.html"/.test(html));
ok('쓰지 않는 스크립트 제거 (supabase — 홈은 로그인·데이터 호출이 없다)', !/supabase/i.test(html));

// ── ③ 실브라우저 ──
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const f = path.join(base, d, c); if (fs.existsSync(f)) return f; }
  } catch (_) {}
  return null;
}
let chromium = null;
try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} fx-home — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const open = async (vw, vh, mobile) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0 (글꼴 CDN 포함)
    await page.routeWebSocket(/.*/, ws => ws.close());                                              // 핀: browser-test-isolation.test.js
    await page.goto('http://localhost:' + server.address().port + '/fx.html', { waitUntil: 'load' });
    return { page, errs };
  };
  const measure = (page) => page.evaluate(() => {
    const q = (s) => document.querySelector(s), r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    const img = q('.hero img.art'), h1 = q('h1'), head = q('header.nav');
    return { vw: document.documentElement.clientWidth, vh: innerHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hero: r(q('.hero')), h1px: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0, h1w: h1 ? +getComputedStyle(h1).fontWeight : 0,
      imgOk: !!img && img.complete && img.naturalWidth > 0, headPos: head ? getComputedStyle(head).position : '', headBg: head ? getComputedStyle(head).backgroundColor : '',
      panels: [...document.querySelectorAll('.panels .panel')].map(r), cols: [...document.querySelectorAll('.cmp .col')].map(r), specs: [...document.querySelectorAll('.specs .spec')].map(r),
      menuShown: (() => { const m = q('header.nav .menu'); return !!m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().width > 0; })(),
      burgerShown: (() => { const b = q('.burger'); return !!b && getComputedStyle(b).display !== 'none'; })() };
  });
  try {
    const d = await open(1440, 900), m = await measure(d.page);
    ok('PC: 가로 스크롤 없음 · 페이지 에러 0', m.overflow <= 0 && d.errs.length === 0, JSON.stringify({ overflow: m.overflow, errs: d.errs }));
    ok('PC: 첫 화면이 화면 전체를 쓴다 (좌우 끝까지 · 높이 ≥ 화면)', !!m.hero && m.hero.l === 0 && m.hero.r === m.vw && m.hero.h >= m.vh - 1, JSON.stringify(m.hero));
    ok('PC: 제목이 크고 가늘다 (≥ 96px · 굵기 300)', m.h1px >= 96 && m.h1w === 300, JSON.stringify({ px: m.h1px, w: m.h1w }));
    ok('PC: 첫 화면 그림이 실제로 떴다', m.imgOk);
    ok('PC: 메뉴가 첫 화면 위에 투명하게 얹힌다 (메뉴 보임 · 햄버거 숨김)', m.headPos === 'absolute' && /rgba\(0, 0, 0, 0\)|transparent/.test(m.headBg) && m.menuShown && !m.burgerShown, JSON.stringify({ pos: m.headPos, bg: m.headBg, menu: m.menuShown, burger: m.burgerShown }));
    ok('PC: 제원 4칸이 한 줄', m.specs.length === 4 && m.specs.every((s) => s.t === m.specs[0].t), JSON.stringify(m.specs));
    ok('PC: 시장 3면이 한 줄 · 화면 좌우 끝까지', m.panels.length === 3 && m.panels.every((p) => p.t === m.panels[0].t) && m.panels[0].l === 0 && m.panels[2].r === m.vw, JSON.stringify(m.panels));
    ok('PC: 계좌 3종이 한 줄', m.cols.length === 3 && m.cols.every((c) => c.t === m.cols[0].t), JSON.stringify(m.cols));
    await d.page.hover('header.nav .menu .has-dd'); const dd = await d.page.evaluate(() => { const e = document.querySelector('header.nav .dd'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; });
    ok('PC: What We Offer 에 올리면 하위 메뉴가 열린다', dd);
    await d.page.close();

    const p = await open(390, 844, true), mm = await measure(p.page);
    ok('모바일: 가로 스크롤 없음 · 페이지 에러 0', mm.overflow <= 0 && p.errs.length === 0, JSON.stringify({ overflow: mm.overflow, errs: p.errs }));
    ok('모바일: 시장 3면 · 계좌 3종이 세로로 쌓인다', mm.panels.length === 3 && mm.panels[1].t > mm.panels[0].t && mm.cols.length === 3 && mm.cols[1].t > mm.cols[0].t, JSON.stringify({ p: mm.panels.map((x) => x.t), c: mm.cols.map((x) => x.t) }));
    ok('모바일: 제원은 2칸씩 2줄', mm.specs.length === 4 && mm.specs[0].t === mm.specs[1].t && mm.specs[2].t > mm.specs[0].t, JSON.stringify(mm.specs.map((x) => x.t)));
    ok('모바일: 가로 메뉴 숨김 · 햄버거 보임', !mm.menuShown && mm.burgerShown, JSON.stringify({ menu: mm.menuShown, burger: mm.burgerShown }));
    await p.page.click('.burger');
    const sheet = await p.page.evaluate(() => { const s = document.querySelector('.sheet'); const vis = !!s && getComputedStyle(s).display !== 'none' && s.getBoundingClientRect().height > 200;
      return { vis, links: [...(s ? s.querySelectorAll('a') : [])].map((a) => a.getAttribute('href')) }; });
    ok('모바일: 햄버거를 누르면 메뉴가 열리고 모든 목적지가 있다', sheet.vis && ['markets.html', 'webtrade.html', 'fx.html#vip', 'ib.html', 'about.html', 'support.html', 'login.html?switch=1', 'signup.html'].every((h) => sheet.links.includes(h)), JSON.stringify(sheet));
    await p.page.click('.sheet .sheet-x');
    ok('모바일: 닫기를 누르면 메뉴가 닫힌다', await p.page.evaluate(() => getComputedStyle(document.querySelector('.sheet')).display === 'none'));
    await p.page.close();
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 220)); }
  await browser.close(); server.close(); done();
})();

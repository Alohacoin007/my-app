#!/usr/bin/env node
// 홈(fx.html) 새 디자인 계약 (2026-11-27 사장님 "이 버전으로 홈부터 진행해" — 실제 트레이딩 화면 버전).
//
// 방향: 화면 전체를 쓰는 첫 화면 · 글꼴 하나 · 검정/흰색/회색 + 라임 한 점 · 상자 대신 가는 선 · 밑줄 링크.
// 이 테스트가 지키는 것:
//   ① 모양만 바꿨다 — 기존 링크·앵커·문구(숫자 포함)는 그대로다. 새로 지어낸 숫자·주장 없음.
//   ② 캡처 이미지에 "Live" 라고 쓰지 않는다 (정지 화면을 실시간처럼 보이게 하면 거짓 표시).
//   ④ 첫 화면 차트는 **실제 시세로만** 움직인다 (2026-11-27 사장님 "위로 움직이면 초록, 내려가면 빨강" → "3번 진행해"):
//      실제 봉 + 실제 현재가 · 난수/가짜 움직임 금지 · 휴장·정지 때는 Live 표시와 색 반응이 꺼진다 · 못 받으면 캡처 이미지가 남는다.
//   ③ PC·모바일에서 실제로 그 모양으로 그려진다 (가로 스크롤 0 · 페이지 에러 0 · 모바일 메뉴가 열린다).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'fx.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const css = fs.readFileSync(path.join(REPO, 'assets/site.css'), 'utf8');      // 공용 스타일 (메뉴·푸터·링크…) — 2026-11-27 분리
const all = html + '\n' + css;                                               // 모양 규칙 핀은 페이지 + 공용 파일을 합쳐서 본다
const has = (s) => html.includes(s);
const count = (re) => (html.match(re) || []).length;

// ── ① 정적: 방향 ──
const fontLink = (html.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"/) || [''])[0];
ok('공용 스타일을 한 파일에서 불러온다 (assets/site.css?v=N · 파일 존재)', /<link rel="stylesheet" href="assets\/site\.css\?v=\d+">/.test(html) && css.length > 2000);
ok('글꼴은 Inter 하나 (Space Grotesk · Source Serif · Roboto Mono 제거 · 가는 굵기 300 포함)', /family=Inter:/.test(fontLink) && !/Space\+Grotesk|Source\+Serif|Roboto\+Mono/.test(fontLink) && /300/.test(fontLink), fontLink.slice(0, 160));
ok('첫 화면 제목 = "Tight spreads. Nothing hidden."', /<h1[^>]*>Tight spreads\.<br>Nothing hidden\.<\/h1>/.test(html));
ok('첫 화면 그림 = 실제 터미널 차트 캡처 (파일이 리포에 있다 · 설명글 있음)', /<img class="art"[^>]*src="assets\/img\/home-hero-chart\.jpg"[^>]*alt="[^"]{10,}"/.test(html) &&
   ['home-hero-chart.jpg', 'home-hero-chart-1000.jpg'].every((f) => fs.existsSync(path.join(REPO, 'assets/img', f))));
ok('캡처 이미지를 "Live" 라고 표시하지 않는다', !/class="shot-label"[^>]*>[^<]*\bLive\b/i.test(html) && !/<figcaption[^>]*>[^<]*\blive\b/i.test(html) && /class="shot-label"/.test(html));
const specs = [['0.0', 'Spreads from'], ['500:1', 'Leverage up to'], ['$100', 'Minimum deposit'], ['3', 'One account, one platform']];
ok('제원 줄 4칸: 0.0 pips · 500:1 · $100 · 3 asset classes', specs.every(([n, l]) => new RegExp('<div class="spec"><b(?: id="[^"]*")?>' + n.replace(/[$.]/g, '\\$&') + '(<i>[^<]*</i>)?</b><span(?: id="[^"]*")?>' + l + '</span></div>').test(html)));
ok('로고는 글자만 — 네모 "A" 표식 없음 (2026-11-27 사장님 "이거 빼자") · 헤더·모바일 메뉴·푸터 3곳', !/class="mark"/.test(html) && !/\.logo \.mark/.test(all) && count(/<a class="logo[^"]*" href="\/">Alpexa-FX<\/a>/g) === 3);
const liveJs = (html.match(/<script>\s*\/\* 첫 화면 라이브 차트[\s\S]*?<\/script>/) || [''])[0];
ok('라이브 차트: 가짜 움직임 없음 (Math.random 0) · 우리 피드만 읽는다 (fx-prices 봉 + prices 현재가) · 공개 키만', liveJs.length > 500 && !/Math\.random/.test(html) && /functions\/v1\/fx-prices\?candles=/.test(liveJs) && /rest\/v1\/prices\?symbol=eq\./.test(liveJs) && /sb_publishable_/.test(liveJs) && !/service_role|eyJ[A-Za-z0-9_-]{20,}/.test(html));
// 실시간 스프레드 (2026-11-27 사장님 "스프레드가 실시간으로 움직이게 해야해") — 고객이 실제로 내는 값 = 서버 청산식과 같은 식
const sqlClose = fs.readFileSync(path.join(REPO, 'supabase/sql/fx_close.sql'), 'utf8');
ok('실시간 스프레드: 자리와 기본 글이 있다 (못 받으면 남는 글 = "0.0 pips · Spreads from")', /<b id="heroSpread">0\.0<i>pips<\/i><\/b><span id="heroSpreadL">Spreads from<\/span>/.test(html));
ok('실시간 스프레드: 식이 서버 청산(fx_close)과 같다 — max(0.1, spr_pts + markup_pts) · 같은 두 테이블에서 읽는다',
  /Math\.max\(0\.1,\s*s\+mk\)/.test(liveJs) && /greatest\(0\.1, coalesce\(v_spr,0\) \+ coalesce\(v_mk,0\)\)/.test(sqlClose) && /select=mid,spr_pts,updated_at/.test(liveJs) && /pricing_marks\?symbol=eq\.'\+SYM\+'&select=markup_pts/.test(liveJs));
ok('라이브 차트: 보일 때만 읽는다 (탭 숨김 · 화면 밖이면 멈춤) · 요청에 시간 상한', /document\.hidden/.test(liveJs) && /IntersectionObserver/.test(liveJs) && /AbortController/.test(liveJs));
ok('라이브 차트: 못 받으면 캡처가 남도록 — 캔버스는 기본이 투명, 봉을 받은 뒤에만 보인다', /\.hero canvas\.chart\{[^}]*opacity:0/.test(html) && /\.hero\.has-chart canvas\.chart\{opacity:1\}/.test(html) && /\.hero\.has-chart img\.art\{opacity:0\}/.test(html));
ok('회전 배너(슬라이드) 제거 — 첫 화면은 한 문장', !has('id="hslides"') && !has('h-dots'));
// 올리면 자리가 밀리는 사고 (2026-11-27 사장님 "마우스 대면 메뉴 전체가 움직여"): .link:hover 가 gap 을 넓혀 링크 폭이 늘었고,
// 양끝 정렬인 메뉴 줄 전체가 다시 배치됐다. 올림 효과는 자리를 바꾸지 않는 속성(transform·opacity·color)만 쓴다.
const hoverRules = (all.match(/[^{}]*:hover[^{}]*\{[^}]*\}/g) || []);
const LAYOUT = /(^|[;{\s])(gap|padding[a-z-]*|margin[a-z-]*|width|height|font-size|font-weight|letter-spacing|border[a-z-]*-width|top|left|right|bottom|display)\s*:/;
const badHover = hoverRules.filter((r) => LAYOUT.test(r.slice(r.indexOf('{'))) && !/\.dd\{display:block\}/.test(r.replace(/\s+/g, '')));
ok('올림(hover) 효과가 자리를 바꾸지 않는다 — gap·padding·margin·크기 변경 없음 (하위 메뉴 열기 제외)', hoverRules.length >= 4 && badHover.length === 0, badHover.join(' | ').slice(0, 220));
ok('둥근 형광 버튼 대신 밑줄 링크 (btn-lg 없음)', !has('btn-lg') && count(/class="link"/g) >= 8);

// ── ① 정적: 기존 것 보존 ──
ok('앵커 유지: #top · #crypto · #vip · #trust (다른 페이지가 fx.html#vip 로 들어온다)', ['top', 'crypto', 'vip', 'trust'].every((i) => count(new RegExp('id="' + i + '"', 'g')) === 1));
ok('시장 3면 링크 유지: markets.html?tab=fx · stock · crypto', ['fx', 'stock', 'crypto'].every((t) => has('href="markets.html?tab=' + t + '"')));
ok('가입 링크는 전부 새 창 (target=_blank rel=noopener) · 6개 이상', count(/href="signup\.html" target="_blank" rel="noopener"/g) >= 6 && count(/href="signup\.html"/g) === count(/href="signup\.html" target="_blank" rel="noopener"/g));
// 2026-11-27 사장님: "my account 를 클릭하면 새로운 페이지가 뜨는데… 연결된 전체 페이지로 넘어가게" → 같은 창에서 이동 (가입 링크는 종전대로 새 창)
ok('My Account → login.html?switch=1 · 같은 창에서 이동 (새 창 아님) · 메뉴와 모바일 메뉴 2곳', count(/href="login\.html\?switch=1"[^>]*>My Account</g) === 2 && !/href="login\.html\?switch=1"[^>]*target=/.test(html));
ok('메뉴 유지: What We Offer(Markets · WebTrade Terminal · Account Tiers) · Markets · IB · About · Support', ['href="markets.html"', 'href="webtrade.html"', 'href="fx.html#vip"', 'href="ib.html"', 'href="about.html"', 'href="support.html"'].every(has) && has('What We Offer'));
ok('푸터 유지: Log in(레전드 터미널) · IB Portal · PAMM · Risk Disclosure · 수상 배지 5개(2026~2022) · 저작권', has('<a href="webtrade.html?theme=legend" target="_blank" rel="noopener">Log in</a>') && has('href="agent.html"') && has('href="pamm-desk.html"') && has('href="fx-risk.html"') &&
   ['2026', '2025', '2024', '2023', '2022'].every((y) => has('Best Forex Broker ' + y)) && has('© 2026, Alpexa-FX · An Alpexa Suisse company'));
const awardsHtml = (html.match(/<div class="award"[\s\S]*?<\/svg>\s*<\/div>/g) || []).join('');
ok('수상 배지 = 흑백 (2026-11-27 사장님 "흰색을 블랙으로 블랙을 흰색으로"): 흰 바탕 상자 없음 · 파란색 없음 · 선과 글자는 currentColor', (html.match(/<div class="award"/g) || []).length === 5 &&   // 2026-11-27 사장님 "상패 … 만들어서 넣어줘" → 연도 확인 2024·2023·2022 (총 5개)
   !/awBlue|#1e40d8|#4a6bf0|#1631a8|#0e1726/i.test(all) && !/\.award\{[^}]*background/.test(all) && /currentColor/.test(awardsHtml) && !/#[0-9a-f]{3,6}/i.test(awardsHtml) &&
   JSON.stringify(awardsHtml.match(/>(20\d\d)<\/text>/g)) === JSON.stringify(['>2026</text>', '>2025</text>', '>2024</text>', '>2023</text>', '>2022</text>']) && (awardsHtml.match(/>BEST FOREX<\/text>/g) || []).length === 5 && (awardsHtml.match(/>ECN\/STP BROKER<\/text>/g) || []).length === 5, awardsHtml.slice(0, 160));
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
// 터미널 전체 캡처 구역 → CEO 의 한 문장 (2026-11-27 사장님 "이거 말고 다른 거" → 시안 중 "1번으로 진행해").
// 문장은 About 의 CEO 인사말에 실제로 있는 것만 쓴다 — 인사말이 바뀌면 여기서 걸리게 락스텝.
const QUOTE = 'Your orders are filled at the market, not at a number invented to work against you.';
const about = fs.readFileSync(path.join(REPO, 'about.html'), 'utf8');
const qsec = (html.match(/<section class="quote">[\s\S]*?<\/section>/) || [''])[0];
ok('인용 구역: CEO 의 한 문장 (blockquote) · 이름과 직함 · 인사말 전문 링크(about.html#ceo)', qsec.includes('<blockquote>') && qsec.includes('&ldquo;' + QUOTE + '&rdquo;') &&
   /<b>Christian Rossi<\/b>/.test(qsec) && /Chief Executive Officer, Alpexa-FX/.test(qsec) && /<a class="link" href="about\.html#ceo">Read the full letter<\/a>/.test(qsec), qsec.slice(0, 200));
ok('인용문은 About 의 CEO 인사말에 실제로 있는 문장이다 (지어낸 말 아님) · #ceo 앵커 존재', about.includes(QUOTE) && /<article class="letter-card" id="ceo">/.test(about));
ok('터미널 전체 캡처 구역은 없다 (구역 · 이미지 · 파일 모두 제거)', !/class="platform"/.test(html) && !/home-platform/.test(html) && !fs.existsSync(path.join(REPO, 'assets/img/home-platform.jpg')) && !fs.existsSync(path.join(REPO, 'assets/img/home-platform-1200.jpg')));
ok('무거운 라이브러리 없음 (supabase-js · 차트 라이브러리 미탑재 — 시세는 가벼운 fetch 로만 읽는다 · 로그인 코드 없음)', !/vendor\/supabase|supabase-js|createClient|lightweight-charts|<script[^>]+src=/i.test(html));

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
  const MIME = { '.html': 'text/html', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png', '.css': 'text/css' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const open = async (vw, vh, mobile, prep) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0 (글꼴 CDN 포함)
    await page.routeWebSocket(/.*/, ws => ws.close());                                              // 핀: browser-test-isolation.test.js
    if (prep) await prep(page);                                                                      // 나중에 건 route 가 먼저 잡힌다 — 시세 스텁
    await page.goto('http://localhost:' + server.address().port + '/fx.html', { waitUntil: 'load' });
    return { page, errs };
  };
  const measure = (page) => page.evaluate(() => {
    const q = (s) => document.querySelector(s), r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    const img = q('.hero img.art'), h1 = q('h1'), head = q('header.nav');
    return { vw: document.documentElement.clientWidth, vh: innerHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hero: r(q('.hero')), h1px: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0, h1w: h1 ? +getComputedStyle(h1).fontWeight : 0,
      imgOk: !!img && img.complete && img.naturalWidth > 0, headPos: head ? getComputedStyle(head).position : '', headBg: head ? getComputedStyle(head).backgroundColor : '',
      quote: (() => { const e = q('.quote blockquote p'); return e ? { px: parseFloat(getComputedStyle(e).fontSize), w: +getComputedStyle(e).fontWeight, box: r(q('.quote')) } : null; })(),
      award: (() => { const e = q('.award'); if (!e) return null; const c = getComputedStyle(e), b = e.getBoundingClientRect(); return { bg: c.backgroundColor, color: c.color, w: Math.round(b.width), h: Math.round(b.height) }; })(),
      word: (() => { const e = q('.wordmark span'); if (!e) return null; const b = e.getBoundingClientRect(), c = getComputedStyle(e); return { l: Math.round(b.left), r: Math.round(b.right), w: +c.fontWeight }; })(),
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
    ok('PC: 인용문이 크고 가늘게 보인다 (≥ 60px · 굵기 300 · 구역이 좌우 끝까지)', !!m.quote && m.quote.px >= 60 && m.quote.w === 300 && m.quote.box.l === 0 && m.quote.box.r === m.vw, JSON.stringify(m.quote));
    ok('PC: 수상 배지가 검정 바탕 위 흰 선으로 보인다 (바탕 투명 · 흰색 · 폭 72px 이상 — 5개를 한 줄에)', !!m.award && /rgba\(0, 0, 0, 0\)|transparent/.test(m.award.bg) && m.award.color === 'rgb(255, 255, 255)' && m.award.w >= 72, JSON.stringify(m.award));
    const centered = (g, vw) => !!g && Math.abs(g.l - (vw - g.r)) <= 6 && g.l >= 0 && g.r <= vw && g.w >= 600;
    ok('PC: 푸터의 큰 ALPEXA 글자가 가운데 · 굵게 (좌우 여백 차 ≤ 6px · 굵기 ≥ 600 · 화면 안)', centered(m.word, m.vw), JSON.stringify({ word: m.word, vw: m.vw }));
    ok('PC: 계좌 3종이 한 줄', m.cols.length === 3 && m.cols.every((c) => c.t === m.cols[0].t), JSON.stringify(m.cols));
    // 실제로 올려 본다: 메뉴 줄의 모든 항목과 첫 화면 버튼들의 자리가 1px 도 안 움직여야 한다
    const spots = () => d.page.evaluate(() => [...document.querySelectorAll('header.nav .logo, header.nav .menu > *, header.nav .nav-r > a, .hero-cta a')].map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.width * 10) / 10]; }));
    const before = await spots();
    await d.page.hover('header.nav .nav-r .link'); await d.page.waitForTimeout(350); const navHover = await spots();
    await d.page.hover('.hero-cta a.link'); await d.page.waitForTimeout(350); const ctaHover = await spots();
    await d.page.mouse.move(5, 500); await d.page.waitForTimeout(250);
    const same = (x) => JSON.stringify(x) === JSON.stringify(before);
    ok('PC: 메뉴의 Open account 에 올려도 메뉴 줄이 움직이지 않는다', before.length >= 9 && same(navHover), JSON.stringify({ before, navHover }));
    ok('PC: 첫 화면 Open account 에 올려도 옆 Try demo 가 밀리지 않는다', same(ctaHover), JSON.stringify({ before, ctaHover }));
    const arrow = await d.page.evaluate(async () => { const a = document.querySelector('.hero-cta a.link'); return getComputedStyle(a, '::after').transitionProperty; });
    ok('PC: 화살표는 transform 으로만 움직인다', /transform/.test(arrow), arrow);
    await d.page.hover('header.nav .menu .has-dd'); const dd = await d.page.evaluate(() => { const e = document.querySelector('header.nav .dd'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; });
    ok('PC: What We Offer 에 올리면 하위 메뉴가 열린다', dd);
    // 하위 메뉴 각 줄은 한 줄씩 (2026-11-27 사장님 "서브 메뉴가 2줄로 되어있는데 한줄로"): 설명글이 좁은 상자에서 줄바꿈되어 Markets 만 3줄이 됐었다
    const ddLines = await d.page.evaluate(() => [...document.querySelectorAll('header.nav .dd a')].map((a) => { const s = a.querySelector('small'); const one = (e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
      return { text: a.firstChild.textContent, small: s ? one(s) : 0, h: Math.round(a.getBoundingClientRect().height) }; }));
    ok('PC: 하위 메뉴 항목의 설명글이 전부 한 줄 · 세 항목 높이가 같다 · 화면 밖으로 안 나간다', ddLines.length === 3 && ddLines.every((x) => x.small === 1) && new Set(ddLines.map((x) => x.h)).size === 1 &&
      await d.page.evaluate(() => { const b = document.querySelector('header.nav .dd').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }), JSON.stringify(ddLines));
    await d.page.close();
    const wd = await open(1920, 1080), mw = await measure(wd.page);
    ok('넓은 모니터(1920): 큰 ALPEXA 글자가 가운데 · 화면 폭의 70% 이상을 채운다', centered(mw.word, mw.vw) && (mw.word.r - mw.word.l) >= mw.vw * 0.7, JSON.stringify({ word: mw.word, vw: mw.vw }));
    await wd.page.close();

    const p = await open(390, 844, true), mm = await measure(p.page);
    ok('모바일: 가로 스크롤 없음 · 페이지 에러 0', mm.overflow <= 0 && p.errs.length === 0, JSON.stringify({ overflow: mm.overflow, errs: p.errs }));
    ok('모바일: 시장 3면 · 계좌 3종이 세로로 쌓인다', mm.panels.length === 3 && mm.panels[1].t > mm.panels[0].t && mm.cols.length === 3 && mm.cols[1].t > mm.cols[0].t, JSON.stringify({ p: mm.panels.map((x) => x.t), c: mm.cols.map((x) => x.t) }));
    ok('모바일: 인용문이 화면 안에 들어온다 (≥ 30px)', !!mm.quote && mm.quote.px >= 30 && mm.quote.box.r <= mm.vw, JSON.stringify(mm.quote));
    ok('모바일: 큰 ALPEXA 글자가 가운데 · 화면 안', !!mm.word && Math.abs(mm.word.l - (mm.vw - mm.word.r)) <= 6 && mm.word.l >= 0 && mm.word.r <= mm.vw, JSON.stringify({ word: mm.word, vw: mm.vw }));
    ok('모바일: 제원은 2칸씩 2줄', mm.specs.length === 4 && mm.specs[0].t === mm.specs[1].t && mm.specs[2].t > mm.specs[0].t, JSON.stringify(mm.specs.map((x) => x.t)));
    ok('모바일: 가로 메뉴 숨김 · 햄버거 보임', !mm.menuShown && mm.burgerShown, JSON.stringify({ menu: mm.menuShown, burger: mm.burgerShown }));
    await p.page.click('.burger');
    const sheet = await p.page.evaluate(() => { const s = document.querySelector('.sheet'); const vis = !!s && getComputedStyle(s).display !== 'none' && s.getBoundingClientRect().height > 200;
      return { vis, links: [...(s ? s.querySelectorAll('a') : [])].map((a) => a.getAttribute('href')) }; });
    ok('모바일: 햄버거를 누르면 메뉴가 열리고 모든 목적지가 있다', sheet.vis && ['markets.html', 'webtrade.html', 'fx.html#vip', 'ib.html', 'about.html', 'support.html', 'login.html?switch=1', 'signup.html'].every((h) => sheet.links.includes(h)), JSON.stringify(sheet));
    await p.page.click('.sheet .sheet-x');
    ok('모바일: 닫기를 누르면 메뉴가 닫힌다', await p.page.evaluate(() => getComputedStyle(document.querySelector('.sheet')).display === 'none'));
    await p.page.close();
    // ── ④ 라이브 차트 (스텁 피드 · 네트워크 0) ──
    const T0 = Math.floor(Date.now() / 3600e3) * 3600e3;
    const CANDLES = { ok: true, symbol: 'EURUSD', tf: 'H1', candles: Array.from({ length: 80 }, (_, i) => { const o = 1.09 + Math.sin(i / 7) * 0.004, c = o + (i % 2 ? 0.0006 : -0.0004); return { t: T0 - (79 - i) * 3600e3, o: +o.toFixed(5), h: +(Math.max(o, c) + 0.0005).toFixed(5), l: +(Math.min(o, c) - 0.0005).toFixed(5), c: +c.toFixed(5) }; }) };
    const feed = (st) => async (page) => {
      await page.addInitScript(() => { window.__HERO_POLL_MS = 150; });
      await page.route(/functions\/v1\/fx-prices\?candles/, (r) => st.candlesFail ? r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' }) : r.fulfill({ contentType: 'application/json', body: JSON.stringify(CANDLES) }));
      if (st.mk !== undefined) await page.route(/rest\/v1\/pricing_marks/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(st.mk === null ? [] : [{ markup_pts: st.mk }]) }));
      await page.route(/rest\/v1\/prices/, (r) => { st.calls++; return r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ mid: st.mid, spr_pts: st.spr, updated_at: new Date(Date.now() - (st.ageMs || 0)).toISOString() }]) }); });
    };
    const state = (page) => page.evaluate(() => { const h = document.getElementById('top'), cv = document.getElementById('heroChart'), g = cv.getContext('2d');
      // 가격축 왼쪽 가장자리의 세로 한 줄에서 가장 색이 진한 점을 찾는다 (가격표가 물들었는지)
      const dpr = cv.width / cv.clientWidth, x = Math.round((cv.clientWidth - 78 + 4) * dpr); let best = { d: 0, r: 0, g: 0 };
      if (cv.width) { const col = g.getImageData(x, 0, 1, cv.height).data; for (let i = 0; i < col.length; i += 4) { const d = Math.abs(col[i] - col[i + 1]); if (d > best.d) best = { d, r: col[i], g: col[i + 1] }; } }
      return { chart: h.classList.contains('has-chart'), live: h.dataset.live, tick: h.dataset.tick || '', price: h.dataset.price || '', label: document.getElementById('heroLabel').textContent,
        cvOpacity: +getComputedStyle(cv).opacity, imgOpacity: +getComputedStyle(document.querySelector('.hero img.art')).opacity, tint: best.d < 40 ? 'none' : (best.g > best.r ? 'green' : 'red') }; });
    const until = async (page, fn, ms) => { const t = Date.now(); for (;;) { const s = await state(page); if (fn(s) || Date.now() - t > (ms || 4000)) return s; await page.waitForTimeout(60); } };

    const A = { mid: 1.0903, calls: 0 }, la = await open(1440, 900, false, feed(A));
    let s1 = await until(la.page, (x) => x.chart && x.live === '1' && x.cvOpacity > 0.98);
    ok('라이브: 봉과 시세를 받으면 차트가 캡처 위로 나타나고 "Live · EUR/USD · H1" 로 표시된다', s1.chart && s1.live === '1' && s1.cvOpacity > 0.98 && s1.imgOpacity < 0.05 && /^Live · EUR\/USD · H1/.test(s1.label) && s1.price === '1.09030', JSON.stringify(s1));
    ok('라이브: 값이 안 바뀌는 동안은 가격표에 색이 없다', s1.tick === '' && s1.tint === 'none', JSON.stringify(s1));
    A.mid = 1.09042; let s2 = await until(la.page, (x) => x.tick === 'up' && x.tint === 'green');
    ok('라이브: 시세가 오르면 가격표가 초록으로 물든다', s2.tick === 'up' && s2.tint === 'green' && s2.price === '1.09042', JSON.stringify(s2));
    A.mid = 1.09021; let s3 = await until(la.page, (x) => x.tick === 'down' && x.tint === 'red');
    ok('라이브: 시세가 내리면 가격표가 빨강으로 물든다', s3.tick === 'down' && s3.tint === 'red' && s3.price === '1.09021', JSON.stringify(s3));
    let s4 = await until(la.page, (x) => x.tint === 'none', 3000);
    ok('라이브: 색은 잠깐 뒤 원래대로 돌아온다 (계속 켜져 있지 않다)', s4.tint === 'none', JSON.stringify(s4));
    await la.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await la.page.waitForTimeout(400);
    const c0 = A.calls; await la.page.waitForTimeout(700);
    ok('라이브: 첫 화면이 안 보이면 시세 읽기를 멈춘다', A.calls - c0 <= 1 && c0 >= 5, JSON.stringify({ before: c0, after: A.calls }));
    ok('라이브: 페이지 에러 0', la.errs.length === 0, la.errs.join(' | '));
    await la.page.close();

    const B = { mid: 1.0903, calls: 0, ageMs: 10 * 60e3 }, lb = await open(1440, 900, false, feed(B));
    let b1 = await until(lb.page, (x) => x.chart && x.live === '0');
    B.mid = 1.0915; await lb.page.waitForTimeout(600); const b2 = await state(lb.page);
    ok('휴장·정지(시세가 10분 전 것): 차트는 실제 봉으로 보이되 "Live" 표시와 색 반응이 없다', b1.chart && b2.live === '0' && !/Live/.test(b2.label) && /EUR\/USD · H1/.test(b2.label) && b2.tick === '' && b2.tint === 'none', JSON.stringify(b2));
    await lb.page.close();

    const C = { mid: 1.0903, calls: 0, candlesFail: true }, lc = await open(1440, 900, false, feed(C));
    await lc.page.waitForTimeout(900); const c1 = await state(lc.page);
    ok('수신 실패: 캡처 이미지와 원래 표시가 그대로 남는다 (빈 화면 없음 · 시세 읽기도 시작 안 함)', !c1.chart && c1.imgOpacity === 1 && c1.cvOpacity === 0 && c1.label === 'EUR/USD · H1 · Alpexa WebTrade' && C.calls === 0 && lc.errs.length === 0, JSON.stringify({ c1, calls: C.calls, errs: lc.errs }));
    await lc.page.close();

    const M = { mid: 1.0903, calls: 0 }, lm = await open(390, 844, true, feed(M));
    await until(lm.page, (x) => x.chart && x.live === '1'); M.mid = 1.09041; const m2 = await until(lm.page, (x) => x.tick === 'up');
    ok('모바일: 라이브 차트가 뜨고 오르면 반응한다 · 가로 스크롤 없음', m2.chart && m2.tick === 'up' && (await lm.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0 && lm.errs.length === 0, JSON.stringify(m2));
    await lm.page.close();
    // ── 상패 5개: 한 줄에 나란히 (PC 1440 · 1920 · 모바일 390) ──
    for (const [vw, vh, mob] of [[1440, 900, false], [1920, 1080, false], [390, 844, true]]) {
      const pa = await open(vw, vh, mob);
      const aw = await pa.page.evaluate(() => { const top = document.querySelector('.fb-top').getBoundingClientRect(), logo = document.querySelector('.fb-top .logo').getBoundingClientRect();
        const a = [...document.querySelectorAll('.fb-top .award')].map((e) => { const b = e.getBoundingClientRect(); return { y: Math.round(b.top), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), yr: e.querySelector('text').textContent }; });
        return { n: a.length, rows: new Set(a.map((x) => x.y)).size, years: a.map((x) => x.yr).join(' '), inBox: a.every((x) => x.l >= Math.floor(top.left) && x.r <= Math.ceil(top.right) + 1), minW: Math.min(...a.map((x) => x.w)), below: a.every((x) => x.y >= Math.round(logo.bottom)), noOverlap: a.every((x, i) => !i || x.l >= a[i - 1].r),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      ok(`상패 @${vw}: 5개가 한 줄 · 2026→2022 순서 · 서로 안 겹침 · 로고 아래 · 가로 스크롤 없음`, aw.n === 5 && aw.rows === 1 && aw.years === '2026 2025 2024 2023 2022' && aw.inBox && aw.noOverlap && aw.below && aw.minW >= (mob ? 54 : 72) && aw.overflow <= 0, JSON.stringify(aw));
      await pa.page.close();
    }
    // ── ⑤ 실시간 스프레드 (스텁 피드) ──
    const spr = (page) => page.evaluate(() => ({ v: document.getElementById('heroSpread').firstChild.nodeValue, unit: document.querySelector('#heroSpread i').textContent, l: document.getElementById('heroSpreadL').textContent, d: document.getElementById('top').dataset.spread || '',
      w: Math.round(document.querySelector('.specs .spec').getBoundingClientRect().width * 10) / 10, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    const sprUntil = async (page, fn, ms) => { const t = Date.now(); for (;;) { const x = await spr(page); if (fn(x) || Date.now() - t > (ms || 4000)) return x; await page.waitForTimeout(60); } };
    const S = { mid: 1.0903, calls: 0, spr: 0.5, mk: 0 }, ls = await open(1440, 900, false, feed(S));
    const p0 = await spr(ls.page);
    const p1 = await sprUntil(ls.page, (x) => x.v === '0.5');
    ok('스프레드: 실제 값이 뜨고 "EUR/USD spread · live" 로 표시된다 (피드 0.5 + 마크업 0 = 0.5)', p1.v === '0.5' && p1.unit === 'pips' && p1.l === 'EUR/USD spread · live' && p1.d === '0.5', JSON.stringify(p1));
    S.spr = 0.2; const p2 = await sprUntil(ls.page, (x) => x.v === '0.2'); S.spr = 0.7; const p3 = await sprUntil(ls.page, (x) => x.v === '0.7');
    ok('스프레드: 피드 값이 바뀌면 따라 움직인다 (0.5 → 0.2 → 0.7) · 칸 폭은 그대로', p2.v === '0.2' && p3.v === '0.7' && p1.w === p2.w && p2.w === p3.w && p3.w === p0.w, JSON.stringify({ p0, p2, p3 }));
    S.spr = 0; const p4 = await sprUntil(ls.page, (x) => x.v === '0.1');
    ok('스프레드: 피드가 0 이어도 0.1 로 표시한다 (서버 청산의 최소값 — 0.0 이라고 속이지 않는다)', p4.v === '0.1', JSON.stringify(p4));
    ok('스프레드: 추가 요청 없이 시세와 같은 응답에서 읽는다 · 페이지 에러 0', ls.errs.length === 0 && S.calls >= 3, JSON.stringify({ errs: ls.errs, calls: S.calls }));
    await ls.page.close();
    const S2 = { mid: 1.0903, calls: 0, spr: 0.5, mk: 0.3 }, ls2 = await open(1440, 900, false, feed(S2));
    const q1 = await sprUntil(ls2.page, (x) => x.v === '0.8');
    ok('스프레드: 딜링 마크업을 더한 값 = 고객이 실제로 내는 값 (0.5 + 0.3 = 0.8)', q1.v === '0.8' && /live/.test(q1.l), JSON.stringify(q1));
    await ls2.page.close();
    const S3 = { mid: 1.0903, calls: 0, spr: 0.5, mk: 0, ageMs: 10 * 60e3 }, ls3 = await open(1440, 900, false, feed(S3));
    await until(ls3.page, (x) => x.chart && x.live === '0'); await ls3.page.waitForTimeout(500); const q2 = await spr(ls3.page);
    ok('스프레드: 휴장·정지(10분 전 시세)면 실시간 표시를 하지 않는다 — 원래 글로', q2.v === '0.0' && q2.l === 'Spreads from' && q2.d === '' && S3.calls >= 2, JSON.stringify(q2));
    await ls3.page.close();
    const S4 = { mid: 1.0903, calls: 0, spr: 0.5 }, ls4 = await open(1440, 900, false, feed(S4));   // 마크업을 못 받음 (요청 차단)
    await until(ls4.page, (x) => x.chart && x.live === '1'); await ls4.page.waitForTimeout(500); const q3 = await spr(ls4.page);
    ok('스프레드: 마크업을 못 받으면 추측하지 않는다 — 원래 글로 (차트는 정상)', q3.v === '0.0' && q3.l === 'Spreads from' && ls4.errs.length === 0, JSON.stringify(q3));
    await ls4.page.close();
    const S5 = { mid: 1.0903, calls: 0, spr: 0.4, mk: null }, ls5 = await open(390, 844, true, feed(S5));   // 마크업 행 없음 = 0 (서버 coalesce 와 같게)
    const q4 = await sprUntil(ls5.page, (x) => x.v === '0.4');
    ok('스프레드 모바일: 값이 뜨고 가로 스크롤 없음 (마크업 행이 없으면 0 으로 — 서버와 같게)', q4.v === '0.4' && q4.overflow <= 0 && ls5.errs.length === 0, JSON.stringify(q4));
    await ls5.page.close();
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 220)); }
  await browser.close(); server.close(); done();
})();

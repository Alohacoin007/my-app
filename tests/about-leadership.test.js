#!/usr/bin/env node
// About 페이지 "Executive Leadership" (2026-11-25 사장님 승인: CEO 옆에 President 소개).
//
// 계약:
//   · 별도 구역(#leadership · h2 "Executive Leadership")에 CEO 와 President 카드가 **나란히**, 같은 뼈대로 들어간다
//     (머리: 이니셜 + 이름 + 직함 → 인사말 → 서명 → 인물 소개).
//   · CEO 인사말 4문단은 한 글자도 바뀌지 않는다 ("$100" 포함 — 치환 사고 방지 핀).
//   · President 문구 = 사장님이 준 인사말(3번)·인물 소개(2번) + 승인된 추가 문장.
//   · PC: 두 카드 같은 높이 · 가운데 정렬 (예전엔 CEO 카드가 왼쪽에 붙어 있었다) / 모바일: 세로 배치 · 가로 스크롤 없음.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'about.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const has = (s) => html.includes(s);

// ── 정적 핀 ──
const sec = (html.match(/<section class="sec" id="leadership">[\s\S]*?<\/section>/) || [''])[0];
ok('별도 구역 #leadership · 제목 "Executive Leadership" · 역할 구분 한 줄', !!sec && /<h2>Executive Leadership<\/h2>/.test(sec) && /Our CEO sets the vision\. Our President leads the strategy and growth/.test(sec));
const cards = sec.match(/<article class="letter-card" id="(ceo|president)">[\s\S]*?<\/article>/g) || [];
ok('카드 2장 — CEO 먼저, President 다음', cards.length === 2 && /id="ceo"/.test(cards[0]) && /id="president"/.test(cards[1]));
const anatomy = (c) => ['class="letter-top"', 'class="avatar"', 'class="who"', 'class="letter-body"', 'class="sign"', 'class="sig"', 'class="bio"'].map((k) => c.indexOf(k));
const inOrder = (a) => a.every((v, i) => v >= 0 && (i === 0 || v > a[i - 1]));
ok('두 카드의 뼈대가 같다 (머리 → 인사말 → 서명 → 인물 소개)', cards.length === 2 && inOrder(anatomy(cards[0])) && inOrder(anatomy(cards[1])));
ok('CEO: 이니셜 CR · Christian Rossi · Chief Executive Officer', cards[0] && /<div class="avatar">CR<\/div>/.test(cards[0]) && /<div class="n">Christian Rossi<\/div><div class="r">Chief Executive Officer &middot; Alpexa-FX<\/div>/.test(cards[0]));
ok('President: 이니셜 HK · Hyo Kim · President', cards[1] && /<div class="avatar">HK<\/div>/.test(cards[1]) && /<div class="n">Hyo Kim<\/div><div class="r">President &middot; Alpexa-FX<\/div>/.test(cards[1]));
const CEO_PS = [
  'When we started Alpexa, we had spent years on the other side of the screen — trading, and being let down by brokers who treated the spread as a place to hide. We decided to build the opposite.',
  'Our promise is simple. You see the same price our engine sees. Your orders are filled at the market, not at a number invented to work against you. And your funds are held separately from the company&rsquo;s — because your money is yours, full stop.',
  'We also believe a modern trader shouldn&rsquo;t need five apps. FX, stocks and crypto now live on one account, one platform, one clear view — so you can act on an idea the moment you have it.',
  'Whether you are opening your first $100 account or managing serious size, you will be treated with the same honesty. Thank you for trusting us with your trading. We are only just getting started.',
];
ok('CEO 인사말 4문단은 그대로다 ("$100 account" 포함)', cards[0] && CEO_PS.every((p) => cards[0].includes('<p>' + p + '</p>')) && (cards[0].match(/<p>/g) || []).length === 5);
const PRES_MSG = [
  'At Alpexa-FX, we believe that sustainable success is built on trust, transparency, and integrity.',
  'Our mission is to create a professional and accessible trading environment that empowers clients to navigate global financial markets with greater confidence.',
  'As President, my focus is on how we grow: a clear corporate strategy, disciplined business development, and expansion into new markets worldwide.',
  'Through strategic partnerships, continuous innovation, and a commitment to excellence, we strive to build lasting relationships and deliver meaningful value to our clients and business partners worldwide.',
];
ok('President 인사말 = 받은 문구 3문단 + 전략·사업 개발·글로벌 확장 한 문단', cards[1] && PRES_MSG.every((p) => cards[1].includes('<p>' + p + '</p>')));
ok('President 소개 = 경력(10년 · 월가 펀드매니저) + 받은 문구 3문단', cards[1] &&
   cards[1].includes('Hyo Kim brings 10 years of experience in financial services, including work as a fund manager on Wall Street.') &&
   cards[1].includes('As President of Alpexa-FX, Hyo Kim is committed to advancing the company&rsquo;s strategic vision, strengthening global partnerships, and driving sustainable business growth.') &&
   cards[1].includes('His leadership philosophy emphasizes integrity, transparency, innovation, and operational excellence, with a focus on creating long-term value for clients and business partners.') &&
   cards[1].includes('He aims to position Alpexa-FX as a trusted global financial services provider while fostering a responsible and client-focused trading environment.'));
ok('인사말 카드는 이 구역에만 있다 (상단 hero 안의 옛 카드 제거)', (html.match(/class="letter-card"/g) || []).length === 2 && !has('wrap narrow letter'));
ok('나머지 구역은 그대로: 헤드라인 · What we stand for · 계좌 개설', has('<h1>The broker we always wished we had.</h1>') && has('<h2>What we stand for</h2>') && has('href="signup.html"'));
ok('치환 사고 없음: 같은 문단이 두 번 들어가지 않았다', (html.match(/When we started Alpexa/g) || []).length === 1 && (html.match(/\$100 account/g) || []).length === 1);

// ── 실브라우저 ──
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
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} about-leadership — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 배치 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const measure = async (vw, mobile) => {
    const page = await browser.newPage({ viewport: { width: vw, height: 900 }, isMobile: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0 (글꼴 CDN 포함)
    await page.routeWebSocket(/.*/, ws => ws.close());
    await page.goto('http://localhost:' + server.address().port + '/about.html', { waitUntil: 'domcontentloaded' });
    const m = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#leadership .letter-card')].map((e) => e.getBoundingClientRect());
      return { n: c.length, rects: c.map((r) => ({ l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), h: Math.round(r.height) })),
        vw: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    await page.close();
    return Object.assign(m, { errs });
  };
  try {
    const d = await measure(1280), a = d.rects[0] || {}, b = d.rects[1] || {};
    ok('PC: 카드 2장이 나란히 (같은 줄 · 왼쪽이 CEO)', d.n === 2 && a.t === b.t && a.r <= b.l, JSON.stringify(d.rects));
    ok('PC: 두 카드의 높이가 같다', d.n === 2 && Math.abs(a.h - b.h) <= 1, JSON.stringify(d.rects));
    ok('PC: 구역이 가운데 정렬 (좌우 여백 차 ≤ 2px)', d.n === 2 && Math.abs(a.l - (d.vw - b.r)) <= 2, JSON.stringify({ left: a.l, right: d.vw - b.r }));
    ok('PC: 가로 스크롤 없음 · 페이지 에러 0', d.overflow <= 0 && d.errs.length === 0, JSON.stringify({ overflow: d.overflow, errs: d.errs }));
    const mo = await measure(390, true), ma = mo.rects[0] || {}, mb = mo.rects[1] || {};
    ok('모바일: 세로 배치 (CEO 아래 President) · 가로 스크롤 없음', mo.n === 2 && mb.t >= ma.t + ma.h && mo.overflow <= 0, JSON.stringify({ rects: mo.rects, overflow: mo.overflow }));
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 200)); }
  await browser.close(); server.close(); done();
})();

#!/usr/bin/env node
// About 페이지 "Executive Leadership" (2026-11-25 사장님 승인: CEO 옆에 President 소개).
//
// 계약:
//   · 별도 구역(#leadership · h2 "Executive Leadership")에 CEO 와 President 카드가 **나란히**, 같은 뼈대로 들어간다
//     (머리: 이름 + 직함 → 인사말 → 서명 → 인물 소개).
//   · 2026-11-27 새 디자인(v3): 사장님 "about 페이지 내용은 유지 하고" — **글은 전부 그대로**, 모양만 바꿨다.
//     둥근 카드 → 가는 선으로 나눈 두 칸 · 이니셜 네모(CR/HK) 제거 · 원칙 4개는 그림+제목+설명 줄. 아래 TEXT 핀이 글을 지킨다.
//   · CEO 인사말 4문단은 한 글자도 바뀌지 않는다 ("$100" 포함 — 치환 사고 방지 핀).
//   · President 문구 = 사장님이 준 인사말(3번)·인물 소개(2번) + 승인된 추가 문장.
//   · 서명: CEO = 필기체 글꼴, President = **실제 서명을 따라 그린 인라인 SVG** (2026-11-26 사장님 "진짜 싸인… 바꿔줄래" → 시안 승인 "진행해").
//     외부 이미지 파일이 아니라 페이지 안에 든 벡터 — 어느 화면에서도 선명하고, 글꼴 CDN 이 막혀도 그대로 보인다.
//   · PC: 두 카드 같은 높이 · 가운데 정렬 (예전엔 CEO 카드가 왼쪽에 붙어 있었다) / 모바일: 세로 배치 · 가로 스크롤 없음.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'about.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const has = (s) => html.includes(s);

// ── 정적 핀 ──
const sec = (html.match(/<section class="sec[^"]*" id="leadership">[\s\S]*?<\/section>/) || [''])[0];
ok('별도 구역 #leadership · 제목 "Executive Leadership" · 역할 구분 한 줄', !!sec && /<h2>Executive Leadership<\/h2>/.test(sec) && /Our CEO sets the vision\. Our President leads the strategy and growth/.test(sec));
const cards = sec.match(/<article class="letter-card" id="(ceo|president)">[\s\S]*?<\/article>/g) || [];
ok('카드 2장 — CEO 먼저, President 다음', cards.length === 2 && /id="ceo"/.test(cards[0]) && /id="president"/.test(cards[1]));
const anatomy = (c) => [/class="letter-top"/, /class="who"/, /class="letter-body"/, /class="sign"/, /class="sig[ "]/, /class="bio"/].map((k) => c.search(k));
const inOrder = (a) => a.every((v, i) => v >= 0 && (i === 0 || v > a[i - 1]));
ok('두 카드의 뼈대가 같다 (머리 → 인사말 → 서명 → 인물 소개)', cards.length === 2 && inOrder(anatomy(cards[0])) && inOrder(anatomy(cards[1])));
ok('CEO: Christian Rossi · Chief Executive Officer', cards[0] && /<div class="n">Christian Rossi<\/div><div class="r">Chief Executive Officer &middot; Alpexa-FX<\/div>/.test(cards[0]));
ok('President: Hyo Kim · President', cards[1] && /<div class="n">Hyo Kim<\/div><div class="r">President &middot; Alpexa-FX<\/div>/.test(cards[1]));
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
const presSig = ((cards[1] || '').match(/<div class="sign">([\s\S]*?)<\/div>/) || ['', ''])[1];
ok('President 서명 = 인라인 SVG (이름표 "Signature of Hyo Kim" · 획 6개 이상 · 글꼴 글씨 아님)', /^<svg class="sig sig-img"[^>]*viewBox="[\d. ]+"[^>]*role="img"[^>]*aria-label="Signature of Hyo Kim"/.test(presSig) &&
   (presSig.match(/<path /g) || []).length >= 6 && !/<span class="sig">Hyo Kim<\/span>/.test(html), presSig.slice(0, 160));
ok('President 서명은 페이지 안에서 끝난다 (외부 파일·고정 색 없음 — currentColor)', !/<img|href=|url\(/.test(presSig) && /currentColor/.test(presSig) && !/#[0-9a-f]{3,6}/i.test(presSig), presSig.slice(0, 160));
ok('CEO 서명은 그대로 (필기체 글꼴)', cards[0] && cards[0].includes('<div class="sign"><span class="sig">Christian Rossi</span></div>'));
ok('인사말 카드는 이 구역에만 있다 (상단 hero 안의 옛 카드 제거)', (html.match(/class="letter-card"/g) || []).length === 2 && !has('wrap narrow letter'));
// 글 내용 유지 핀 — 카드 밖의 글(첫 화면 · 구역 설명 · 원칙 4개 · 마지막 권유)
const TEXT = [
  'Alpexa-FX is a multi&#8209;asset broker built on three convictions: prices should be real, execution should be fair, and your money should be kept separate and safe.',
  'Our CEO sets the vision. Our President leads the strategy and growth that deliver it.', 'The principles behind every quote we publish.',
  '<h3>Transparency</h3><p>Real market prices and clear costs — no hidden markups, no games in the spread.</p>',
  '<h3>Fair execution</h3><p>ECN&#8209;style fills at the market with no dealing desk working against you.</p>',
  '<h3>Safety of funds</h3><p>Client money is segregated, with negative&#8209;balance protection on every account.</p>',
  '<h3>Client&#8209;first</h3><p>From a first $100 deposit to serious size, everyone gets the same honest treatment.</p>',
  'Trade with a broker<br>on your side.', 'Trading involves significant risk',
];
ok('글 내용 유지: 첫 화면 소개 · 구역 설명 2개 · 원칙 4개 · 마지막 권유 · 위험 안내', TEXT.every(has), TEXT.filter((x) => !has(x)).join(' | ').slice(0, 200));
ok('원칙 4개의 선 그림 유지 (지구본 · 저울 · 금고 · 겹친 원) — 색은 currentColor', ['Wireframe globe line art', 'Balanced beam line art', 'Vault cube line art', 'Overlapping circles line art'].every((a) => has('aria-label="' + a + '"')) && (html.match(/<div class="pillar">/g) || []).length === 4 && !/stroke="#16191F"/.test(html));
ok('이니셜 네모(CR/HK) 없음 · 가입 링크는 새 창 1개', !/class="avatar"/.test(html) && (html.match(/href="signup\.html" target="_blank" rel="noopener">Open account<\/a>/g) || []).length >= 2);
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
    r.writeHead(200, { 'Content-Type': ({ '.css': 'text/css', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' })[path.extname(fp)] || 'text/html' }); r.end(fs.readFileSync(fp)); });
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
      const sg = document.querySelector('#president .sign svg'), sr = sg ? sg.getBoundingClientRect() : null;
      const pc = document.querySelector('#president').getBoundingClientRect();
      return { sig: sr ? { w: Math.round(sr.width), h: Math.round(sr.height), in: sr.left >= pc.left && sr.right <= pc.right, color: getComputedStyle(sg).color } : null,
        n: c.length, rects: c.map((r) => ({ l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), h: Math.round(r.height) })),
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
    const sigOk = (g) => !!g && g.h >= 50 && g.h <= 70 && g.w >= 110 && g.w <= 190 && g.in && g.color === 'rgb(10, 10, 11)';   // 새 디자인의 먹색(--ink)
    ok('PC: President 서명이 보인다 (높이 50~70px · 가로 110~190px · 카드 안 · 남색)', sigOk(d.sig), JSON.stringify(d.sig));
    const mo = await measure(390, true), ma = mo.rects[0] || {}, mb = mo.rects[1] || {};
    ok('모바일: 세로 배치 (CEO 아래 President) · 가로 스크롤 없음', mo.n === 2 && mb.t >= ma.t + ma.h && mo.overflow <= 0, JSON.stringify({ rects: mo.rects, overflow: mo.overflow }));
    ok('모바일: President 서명이 보인다 (같은 크기 · 카드 안)', sigOk(mo.sig), JSON.stringify(mo.sig));
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 200)); }
  await browser.close(); server.close(); done();
})();

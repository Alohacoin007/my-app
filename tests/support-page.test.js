#!/usr/bin/env node
// Support(도움말) 페이지 계약 — 새 디자인(v3 · 2026-11-27 사장님 시안 승인 "진행해").
//
// 모양만 바꿨다. 지켜야 할 것:
//   ① 주제 6묶음 · 18개와 그 답변 글이 그대로 있다 (버튼마다 답변이 연결돼 있다 — 빈 주제 없음)
//   ② 동작 그대로: 주제를 누르면 답변이 열리고(주소에 #a=…) · "All topics" 로 돌아오고 · 주소로 바로 들어와도 열리고
//      · 검색은 제목·묶음 이름·답변 본문까지 찾고 · 없으면 안내 문구가 뜬다 · 메일 링크는 주제 제목을 달고 간다
// 네트워크 0. 공용 틀(메뉴·푸터)은 tests/site-shell.test.js 가 본다.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'support.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const has = (s) => html.includes(s);

const CATS = { 'Getting started': [['open-account', 'Open an account'], ['verify-identity', 'Verify your identity'], ['fund-account', 'Fund your account']],
  'Account and login': [['reset-password', 'Reset your password'], ['account-security', 'Account security'], ['new-device', 'Sign in on a new device']],
  'Trading': [['spreads', 'Spreads and commissions'], ['leverage', 'Leverage and margin'], ['orders', 'Order types and execution']],
  'Deposits and withdrawals': [['deposits', 'Deposit methods'], ['withdrawals', 'Withdrawal processing times'], ['transfers', 'Transfers between accounts']],
  'Platforms': [['webtrade', 'WebTrade terminal'], ['mobile', 'Mobile trading'], ['charts', 'Charts and indicators']],
  'Partners': [['become-ib', 'Become an IB'], ['ib-commissions', 'Partner commissions'], ['ib-portal', 'IB portal access']] };
const ALL = Object.values(CATS).flat();
ok('주제 6묶음 · 18개가 그대로 (이름 · 순서 · 연결 키)', Object.entries(CATS).every(([c, ts]) => has('<h3>' + c + '</h3>') && ts.every(([k, t]) => has(`<a class="tp" data-art="${k}">${t}</a>`))) && (html.match(/class="tp"/g) || []).length === 18);
const artSrc = (html.match(/var ART=\{([\s\S]*?)\n\s*\};/) || ['', ''])[1];
const arts = [...artSrc.matchAll(/'([\w-]+)':\{t:'([^']*)',b:'((?:[^'\\]|\\.)*)'\}/g)].map((m) => ({ k: m[1], t: m[2], b: m[3] }));
ok('답변 글 18편 — 모든 주제에 답변이 연결돼 있고(키 일치) 제목이 같고 본문이 비어 있지 않다', arts.length === 18 && ALL.every(([k, t]) => { const a = arts.find((x) => x.k === k); return a && a.t === t && a.b.length > 150 && /<p>/.test(a.b); }), arts.map((a) => a.k + ':' + a.b.length).join(' '));
ok('답변 속 사실 유지 (표본): Standard $100 · Raw ECN $3.50 per lot per side · 500:1 on FX · 출금 OTP · IB $8 per lot',
   ['Standard accounts start from <b>$100</b>', '<b>$3.50 per lot</b> per side', 'up to <b>500:1 on FX</b>', 'confirm it with an <b>email OTP</b>', 'pays up to <b>$8 per lot</b>'].every((x) => artSrc.includes(x)));
ok('답변 속 바로가기 유지: Open WebTrade · Go to the IB page · Open the IB portal', ['href="webtrade.html" target="_blank" rel="noopener">Open WebTrade</a>', 'href="ib.html">Go to the IB page</a>', 'href="agent.html">Open the IB portal</a>'].every((x) => artSrc.includes(x)));
const TEXT = ['<h1>Hello!<br>How can we help?</h1>', 'id="hcQ" placeholder="Search"', 'No topics match your search — email us below and we&rsquo;ll help directly.', '&larr; All topics',
  'Didn&rsquo;t answer your question?', 'href="mailto:support@alpexa.com">Email us about this topic</a>', '<h2>Still need help?</h2>', 'Our team answers 24/5 — most replies within a few hours.',
  'href="mailto:support@alpexa.com?subject=Support%20request">Email support</a>'];
ok('나머지 글 그대로 (제목 · 검색칸 · 결과 없음 안내 · 돌아가기 · 문의 구역 · 메일 주소)', TEXT.every(has), TEXT.filter((x) => !has(x)).join(' | ').slice(0, 200));
ok('머리말 태그 유지 (title · description · canonical) · 새 틀 사용', has('<title>Support · Alpexa-FX</title>') && has('href="https://alpexa-sports.com/support.html"') && /<meta name="description" content="Alpexa-FX help center/.test(html) && /<section class="page-hero/.test(html));

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
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} support-page — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const open = async (vw, vh, mobile, hash) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0
    await page.routeWebSocket(/.*/, ws => ws.close());
    await page.goto('http://localhost:' + server.address().port + '/support.html' + (hash || ''), { waitUntil: 'load' });
    return { page, errs };
  };
  const view = (page) => page.evaluate(() => { const g = (i) => document.getElementById(i), vis = (e) => !!e && getComputedStyle(e).display !== 'none';
    const cats = [...document.querySelectorAll('.hc-cat')].filter(vis);
    return { grid: vis(g('hcGrid')), art: vis(g('hcArt')), none: vis(g('hcNone')), title: g('hcArtT').textContent, bodyLen: g('hcArtB').textContent.length, mail: g('hcArtMail').getAttribute('href'), hash: location.hash,
      cats: cats.map((c) => c.querySelector('h3').textContent), topics: [...document.querySelectorAll('.hc-cat a.tp')].filter((a) => vis(a) && vis(a.parentElement)).map((a) => a.getAttribute('data-art')),
      tops: cats.map((c) => Math.round(c.getBoundingClientRect().top + scrollY)), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  try {
    const a = await open(1440, 900);
    let v = await view(a.page);
    ok('PC: 주제 6묶음이 3칸씩 2줄 · 18개 보임 · 가로 스크롤 0 · 페이지 에러 0', v.grid && !v.art && v.cats.length === 6 && v.topics.length === 18 && v.tops[0] === v.tops[1] && v.tops[1] === v.tops[2] && v.tops[3] > v.tops[0] && v.overflow <= 0 && a.errs.length === 0, JSON.stringify({ tops: v.tops, n: v.topics.length, o: v.overflow, e: a.errs }));
    await a.page.click('a.tp[data-art="spreads"]'); v = await view(a.page);
    ok('주제를 누르면 답변이 열린다 (제목 · 본문 · 주소 #a=spreads · 목록 숨김)', v.art && !v.grid && v.title === 'Spreads and commissions' && v.bodyLen > 150 && v.hash === '#a=spreads', JSON.stringify(v));
    ok('열린 답변의 메일 링크가 주제 제목을 달고 간다', v.mail === 'mailto:support@alpexa.com?subject=' + encodeURIComponent('Support: Spreads and commissions'), v.mail);
    await a.page.click('#hcBack'); v = await view(a.page);
    ok('"All topics" 를 누르면 목록으로 돌아온다 (주소의 #a 지움 · 18개 다시 보임)', v.grid && !v.art && v.hash === '' && v.topics.length === 18, JSON.stringify({ grid: v.grid, art: v.art, hash: v.hash, n: v.topics.length }));
    await a.page.fill('#hcQ', 'withdraw'); v = await view(a.page);
    ok('검색 "withdraw": 제목·묶음 이름·본문에서 찾는다 (출금 관련 주제가 남고 무관한 묶음은 숨는다)', v.topics.includes('withdrawals') && v.topics.includes('verify-identity') && !v.topics.includes('charts') && v.topics.length < 18 && !v.none, JSON.stringify(v.topics));
    await a.page.fill('#hcQ', 'OTP'); v = await view(a.page);
    ok('검색은 답변 본문까지 본다 ("OTP" → 계정 보안 · 출금)', v.topics.includes('account-security') && v.topics.includes('withdrawals') && v.topics.length <= 4, JSON.stringify(v.topics));
    await a.page.fill('#hcQ', 'zzzqqq'); v = await view(a.page);
    ok('없는 말이면 "No topics match your search" 안내가 뜬다 · 묶음은 다 숨는다', v.none && v.cats.length === 0, JSON.stringify({ none: v.none, cats: v.cats }));
    await a.page.fill('#hcQ', ''); v = await view(a.page);
    ok('검색을 지우면 18개가 다 돌아온다', v.topics.length === 18 && !v.none, String(v.topics.length));
    await a.page.close();

    const b = await open(1440, 900, false, '#a=ib-portal'); v = await view(b.page);
    ok('주소로 바로 들어와도 답변이 열린다 (#a=ib-portal)', v.art && v.title === 'IB portal access' && b.errs.length === 0, JSON.stringify({ art: v.art, title: v.title, errs: b.errs }));
    const link = await b.page.evaluate(() => { const l = document.querySelector('#hcArtB a.act'); return l ? [l.getAttribute('href'), l.textContent] : null; });
    ok('답변 속 바로가기가 보인다 (Open the IB portal → agent.html)', !!link && link[0] === 'agent.html' && link[1] === 'Open the IB portal', JSON.stringify(link));
    await b.page.close();

    const m = await open(390, 844, true); v = await view(m.page);
    ok('모바일: 묶음이 세로로 쌓인다 · 가로 스크롤 0 · 페이지 에러 0', v.cats.length === 6 && v.tops.every((t, i) => i === 0 || t > v.tops[i - 1]) && v.overflow <= 0 && m.errs.length === 0, JSON.stringify({ tops: v.tops, o: v.overflow }));
    await m.page.click('a.tp[data-art="mobile"]'); v = await view(m.page);
    ok('모바일: 주제를 누르면 답변이 열리고 화면 밖으로 안 나간다', v.art && v.title === 'Mobile trading' && v.overflow <= 0, JSON.stringify({ art: v.art, t: v.title, o: v.overflow }));
    await m.page.close();
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 220)); }
  await browser.close(); server.close(); done();
})();

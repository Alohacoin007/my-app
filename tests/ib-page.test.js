#!/usr/bin/env node
// IB(파트너) 페이지 계약 — 새 디자인(v3 · 2026-11-27 사장님 시안 승인 "진행해").
//
// 모양만 바꿨다. 지켜야 할 것:
//   ① 글 내용 그대로 (제목 · 소개 · 수수료 안내 · 양식 문구 · 완료 문구)
//   ② 신청 양식의 동작 그대로 — 같은 주소(broker-apply)로 같은 내용(name·email·notes·company)을 보낸다.
//      이름·이메일 검사 문구, 서버 오류·통신 오류 문구, 완료 화면까지 예전과 같다. 봇 덫(company)은 사람 눈에 안 보인다.
//   ③ 예전엔 팝업이었고 지금은 페이지 안 구역 — "Become a partner" 를 누르면 그 구역으로 가고 이름 칸에 커서가 간다.
// 네트워크 0 (신청 주소는 스텁). 공용 틀(메뉴·푸터)은 tests/site-shell.test.js 가 본다.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'ib.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const has = (s) => html.includes(s);

// ── ① 글 ──
const TEXT = ['Partner Program', 'Earn up to $8 per lot, paid weekly',
  'Join the Alpexa introducing&#8209;broker program. Refer traders to one multi&#8209;asset', 'account — FX, stocks and crypto — and watch commission accrue in real time on your dashboard.',
  'Commission rates vary by product and referred volume.', 'See full terms in the <a href="agent.html">IB Portal</a>.',
  'Become a partner', 'Tell us who you are — our partnership team will reply by email.', 'Full name', 'Email', 'Notes (optional)',
  'placeholder="Your audience, clients or expected volume"', 'Submit application', 'Application received', 'Thanks — our partnership team will contact you<br>at your email within one business day.'];
ok('글 내용 그대로 (제목 · 소개 · 수수료 안내 · 양식 · 완료 문구)', TEXT.every(has), TEXT.filter((x) => !has(x)).join(' | ').slice(0, 200));
ok('제목은 h1 하나 · 머리말 태그(title · description · canonical) 유지', /<h1>Earn up to \$8 per lot, paid weekly<\/h1>/.test(html) && has('<title>Introducing Broker · Alpexa-FX</title>') && has('href="https://alpexa-sports.com/ib.html"') && /<meta name="description" content="Partner with Alpexa-FX/.test(html));
ok('제원 줄 3칸은 소개 문구에서 나온 사실만: $8 per lot(up to) · Weekly · Real time', ['<b>$8<i>per lot</i></b><span>Commission, up to</span>', '<b>Weekly</b><span>Payouts</span>', '<b>Real time</b><span>Commission on your dashboard</span>'].every(has));
ok('궤도 선 그림 유지 (색은 currentColor)', has('aria-label="Orbital line illustration"') && (html.match(/<ellipse /g) || []).length === 6 && !/class="art"[\s\S]{0,200}stroke="#fff"/.test(html));
// ── ② 양식 (정적) ──
ok('신청 주소 = broker-apply (그대로) · 보내는 항목 = name · email · notes · company', has("var EP='https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/broker-apply';") && /JSON\.stringify\(\{ name:name, email:mail,\s*notes:document\.getElementById\('apNotes'\)\.value\.trim\(\),\s*company:document\.getElementById\('apHp'\)\.value \}\)/.test(html));
ok('입력 길이 제한 유지 (이름 200 · 이메일 200 · 메모 4000) · 봇 덫 칸 유지', /id="apName" maxlength="200" autocomplete="name"/.test(html) && /id="apMail" type="email" maxlength="200" autocomplete="email"/.test(html) && /id="apNotes" maxlength="4000"/.test(html) && /class="hp" id="apHp" name="company" tabindex="-1" autocomplete="off" aria-hidden="true"/.test(html));
ok('팝업 흔적 없음 (apOv · apsheet · apX) · 키·토큰 없음', !/apOv|apsheet|id="apX"/.test(html) && !/service_role|sb_secret|eyJ[A-Za-z0-9_-]{20,}/.test(html));

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
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} ib-page — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const open = async (vw, vh, mobile, st) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0
    await page.routeWebSocket(/.*/, ws => ws.close());
    if (st) await page.route(/functions\/v1\/broker-apply/, (r) => { st.posts.push({ method: r.request().method(), body: r.request().postData() });
      if (st.mode === 'net') return r.abort(); if (st.mode === 'fail') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await page.goto('http://localhost:' + server.address().port + '/ib.html', { waitUntil: 'load' });
    return { page, errs };
  };
  const ui = (page) => page.evaluate(() => { const g = (i) => document.getElementById(i), vis = (e) => !!e && getComputedStyle(e).display !== 'none';
    return { err: vis(g('apErr')) ? g('apErr').textContent : '', form: vis(g('apForm')), okPanel: vis(g('apOk')), okText: g('apOk').textContent.replace(/\s+/g, ' ').trim(), btn: g('apSend').textContent, disabled: g('apSend').disabled }; });
  try {
    const A = { mode: 'ok', posts: [] }, a = await open(1440, 900, false, A);
    const lay = await a.page.evaluate(() => { const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top + scrollY), w: Math.round(b.width) }; };
      const hp = document.getElementById('apHp').getBoundingClientRect(), h1 = document.querySelector('h1');
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, specs: [...document.querySelectorAll('.specs .spec')].map(r), h1px: parseFloat(getComputedStyle(h1).fontSize), h1w: +getComputedStyle(h1).fontWeight,
        hpHidden: hp.right < 0 || hp.width <= 1, cols: [...document.querySelectorAll('.apply > div')].map(r), inputBorder: getComputedStyle(document.getElementById('apName')).borderTopWidth + '/' + getComputedStyle(document.getElementById('apName')).borderBottomWidth }; });
    ok('PC: 가로 스크롤 0 · 페이지 에러 0 · 제목이 크고 가늘다 (≥ 80px · 300)', lay.overflow <= 0 && a.errs.length === 0 && lay.h1px >= 80 && lay.h1w === 300, JSON.stringify({ o: lay.overflow, e: a.errs, px: lay.h1px, w: lay.h1w }));
    ok('PC: 제원 3칸이 한 줄 · 양식은 설명과 나란히 2칸', lay.specs.length === 3 && lay.specs.every((s) => s.t === lay.specs[0].t) && lay.cols.length === 2 && lay.cols[0].t === lay.cols[1].t && lay.cols[1].l > lay.cols[0].r, JSON.stringify({ specs: lay.specs, cols: lay.cols }));
    ok('PC: 입력칸은 밑줄만 (위 테두리 0 · 아래 1px) · 봇 덫은 화면 밖', lay.inputBorder === '0px/1px' && lay.hpHidden, JSON.stringify({ b: lay.inputBorder, hp: lay.hpHidden }));
    await a.page.click('#apOpen'); await a.page.waitForTimeout(700);
    const jump = await a.page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, top: Math.round(document.getElementById('apply').getBoundingClientRect().top) }));
    ok('"Become a partner" 를 누르면 양식 구역으로 가고 이름 칸에 커서', jump.focus === 'apName' && Math.abs(jump.top) <= 40, JSON.stringify(jump));
    await a.page.click('#apSend'); let u = await ui(a.page);
    ok('이름이 비면: "Please enter your name." · 전송 안 함', u.err === 'Please enter your name.' && A.posts.length === 0, JSON.stringify(u));
    await a.page.fill('#apName', '  Jane Doe  '); await a.page.fill('#apMail', 'not-an-email'); await a.page.click('#apSend'); u = await ui(a.page);
    ok('이메일이 틀리면: "Please enter a valid email." · 전송 안 함', u.err === 'Please enter a valid email.' && A.posts.length === 0, JSON.stringify(u));
    await a.page.fill('#apMail', ' jane@example.com '); await a.page.fill('#apNotes', '  40 clients in Seoul  '); await a.page.click('#apSend'); await a.page.waitForTimeout(400); u = await ui(a.page);
    const body = A.posts[0] ? JSON.parse(A.posts[0].body || '{}') : {};
    ok('올바르면: broker-apply 로 POST 1회 — 앞뒤 공백을 뗀 name · email · notes + 빈 company', A.posts.length === 1 && A.posts[0].method === 'POST' && JSON.stringify(body) === JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com', notes: '40 clients in Seoul', company: '' }), JSON.stringify(A.posts));
    ok('성공하면: 양식이 사라지고 "Application received" 안내가 보인다', !u.form && u.okPanel && /^✓ Application received Thanks — our partnership team will contact you ?at your email within one business day\.$/.test(u.okText), JSON.stringify(u));
    await a.page.close();

    const B = { mode: 'fail', posts: [] }, b = await open(1440, 900, false, B);
    await b.page.fill('#apName', 'Jane'); await b.page.fill('#apMail', 'j@e.co'); await b.page.click('#apSend'); await b.page.waitForTimeout(400); u = await ui(b.page);
    ok('서버 오류면: "Something went wrong — please try again." · 버튼이 다시 눌린다 · 양식 유지', u.err === 'Something went wrong — please try again.' && !u.disabled && u.btn === 'Submit application' && u.form && !u.okPanel, JSON.stringify(u));
    await b.page.close();
    const C = { mode: 'net', posts: [] }, c = await open(1440, 900, false, C);
    await c.page.fill('#apName', 'Jane'); await c.page.fill('#apMail', 'j@e.co'); await c.page.click('#apSend'); await c.page.waitForTimeout(400); u = await ui(c.page);
    ok('통신 오류면: "Network error — please try again." · 버튼이 다시 눌린다', u.err === 'Network error — please try again.' && !u.disabled && u.btn === 'Submit application', JSON.stringify(u));
    await c.page.close();

    const m = await open(390, 844, true, { mode: 'ok', posts: [] });
    const ml = await m.page.evaluate(() => { const t = (s) => [...document.querySelectorAll(s)].map((e) => Math.round(e.getBoundingClientRect().top + scrollY)); return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, specs: t('.specs .spec'), cols: t('.apply > div') }; });
    ok('모바일: 가로 스크롤 0 · 제원과 양식이 세로로 쌓인다 · 페이지 에러 0', ml.overflow <= 0 && ml.specs[1] > ml.specs[0] && ml.cols[1] > ml.cols[0] && m.errs.length === 0, JSON.stringify(ml));
    await m.page.close();
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 220)); }
  await browser.close(); server.close(); done();
})();

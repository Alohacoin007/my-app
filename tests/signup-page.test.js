#!/usr/bin/env node
// 가입(Open Account) 화면 계약 (2026-11-27 사장님 시안 승인 "오픈어카운트 진행해").
//
// 디자인 = 로그인과 같은 문법(모바일 FX 앱 다크): 순검정 · 주황 한 색 · 가는 숫자 · 가는 선 · 알약.
// **가입 스크립트는 0 변경** — 5단계 흐름 · 검증 · 이메일 인증 · 계정 생성(잔고 0) · 국가 제한 · 추천 코드 · 착지.
//   모양은 CSS 로만 바꿨다(템플릿이 스크립트 안에 있어서, 템플릿을 건드리면 가입 로직과 섞인다).
// 네트워크 0 (가입 시도 없음).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const html = fs.readFileSync(path.join(REPO, 'signup.html'), 'utf8');
const engine = (h) => { const a = h.indexOf('<script>\nconst SERVERS = ['), b = h.indexOf('</script>', a); return a < 0 ? '' : h.slice(a, b); };
let before = ''; try { before = cp.execSync('git show e2fee7e:signup.html', { cwd: REPO, maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (_) {}
if (before) ok('가입 스크립트가 새 디자인 전과 글자 하나까지 같다 (흐름 · 검증 · 계정 생성 — 0 변경)', engine(html).length > 20000 && engine(html) === engine(before), engine(html).length + ' vs ' + engine(before).length);
else console.log('  ⏭️  옛 파일 대조 생략 (얕은 복제)');
ok('세션 저장 = sessionStorage (3곳 락스텝 유지) · 스크립트가 쓰는 요소가 전부 있다', /auth:\{storage:_ss,persistSession:true/.test(html.replace(/\s+/g, '')) || /storage:_ss/.test(html) && ['wrap', 'hdrTtl', 'progress', 'body', 'foot', 'csheetBg', 'csheetSearch', 'csheetList', 'toast'].every((id) => new RegExp('id="' + id + '"').test(html)));
ok('디자인 토큰 = 로그인과 같다 (순검정 · 주황 #FF9F0A) · 옛 파랑 · 아이콘 글꼴 불러오기 없음', /--bg:#000/.test(html) && /--acc:#FF9F0A/.test(html) && !/Material\+Symbols/.test(html) && !/JetBrains\+Mono/.test(html));

function findChromium() { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x))) for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (fs.existsSync(p)) return p; } } catch (_) {} return null; }
let chromium = null; try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} signup-page — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const O = () => 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const open = async (vw, vh, mobile, from) => {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: !!mobile, hasTouch: !!mobile }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0
    await page.routeWebSocket(/.*/, ws => ws.close());
    await page.goto(O() + '/signup.html', Object.assign({ waitUntil: 'load' }, from ? { referer: O() + '/' + from } : {})); await page.waitForTimeout(200);
    return { page, errs, ctx };
  };
  const lum = `(c) => { const m = c.match(/[\\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }`;
  const S = (page) => page.evaluate((lumSrc) => { const lum = eval(lumSrc), q = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)], t = (e) => e ? e.textContent.replace(/\s+/g, ' ').trim() : '', cs = (e) => getComputedStyle(e);
    const vis = (e) => !!e && cs(e).display !== 'none' && cs(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0 && parseFloat(cs(e).fontSize) > 0;
    const btn = q('.primary-btn'), bb = btn ? btn.getBoundingClientRect() : null, sel = q('.opt-grid .opt-card.sel');
    const dark = all('.body-title,.body-sub,.section-label,.field-label,.field-inner input,.opt-name,.term-text,.otp-help,.suc-title-big,.suc-sub-big,.acct-card-num,.hdr-ttl').filter((e) => vis(e) && !e.closest('.opt-card.sel') && lum(cs(e).color) < 0.38).map((e) => e.className + ':' + cs(e).color);
    return { bg: cs(document.body).backgroundColor, title: t(q('.body-title') || q('.suc-title-big')), step: t(q('#hdrTtl')), brand: t(all('.wordmark *').find(vis) || q('.wordmark')), servers: all('.opt-grid .opt-card').map((c) => t(c.querySelector('.opt-name')).replace(/ (SPORTS|FX & Stock|CRYPTO)$/i, '') + (c.classList.contains('sel') ? '*' : '')).join(' | '),
      selBg: sel ? cs(sel).backgroundColor : '', selR: sel ? parseFloat(cs(sel).borderRadius) : 0, desc: all('.opt-grid .opt-desc').filter(vis).map(t).join(' / '), lev: all('.opt-row .opt-card').map((c) => t(c.querySelector('.opt-name')) + (c.classList.contains('sel') ? '*' : '')).join(' '),
      btn: btn ? t(btn) : '', btnBg: btn ? cs(btn).backgroundColor : '', btnIn: bb ? bb.top >= 0 && bb.bottom <= innerHeight : false, icons: all('.msi').filter((e) => vis(e) && /^[a-z_]{3,}$/.test(e.textContent.trim()) && parseFloat(cs(e).fontSize) > 2).map((e) => e.textContent.trim()).join(','),
      faceN: t(q('#faceN')), faceOn: t(q('#faceSteps li.on span')), faceVis: vis(q('#face')), dark: dark.join(' ; '), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      otp: all('.otp-cell').filter(vis).length, terms: all('.term-cb').map((e) => (e.classList.contains('on') ? cs(e).backgroundColor : 'off')).join(','), eye: q('.eye') ? getComputedStyle(q('.eye'), '::after').content.replace(/"/g, '') : '', idW: q('.acct-card-num') ? +cs(q('.acct-card-num')).fontWeight : 0, id: t(q('.acct-card-num')) }; }, lum);
  const go = (page, i) => page.evaluate((i) => { cur = i; renderStep(); }, i);
  try {
    const a = await open(1440, 900, false); const s0 = await S(a.page);
    ok('PC 1단계: 순검정 · "Choose your account" · 서버 3개 알약(고른 것 = 주황) · Continue = 주황 알약 · 아이콘 글자 노출 없음', s0.bg === 'rgb(0, 0, 0)' && s0.title === 'Choose your account' && /Alpexa-Sports\* \| Alpexa-FX \| Alpexa-Crypto/.test(s0.servers) && s0.selBg === 'rgb(255, 159, 10)' && s0.selR >= 18 && s0.btnBg === 'rgb(255, 159, 10)' && /Continue/.test(s0.btn) && s0.icons === '', JSON.stringify({ bg: s0.bg, servers: s0.servers, sel: s0.selBg, r: s0.selR, btn: s0.btnBg, icons: s0.icons }));
    ok('PC: 바로 들어오면 종전대로 — 기본 서버 Sports · 브랜드 Alpexa Suisse · 고른 서버의 설명 한 줄만 보인다', s0.brand === 'Alpexa Suisse' && s0.desc === 'Live sports betting · USDT-based · 1:1.', JSON.stringify({ brand: s0.brand, desc: s0.desc }));
    ok('PC: 왼쪽 큰 숫자 = 지금 단계 (1 of 5 · Account Type)', s0.faceVis && s0.faceN === '1' && s0.faceOn === 'Account Type' && s0.step === 'Step 1 of 5', JSON.stringify({ n: s0.faceN, on: s0.faceOn, step: s0.step }));
    ok('어두운 바탕에 어두운 글씨가 없다 (읽을 수 없는 글 0)', s0.dark === '', s0.dark);
    await a.page.click('.opt-grid .opt-card:nth-child(2)'); const s1 = await S(a.page);
    ok('서버를 FX 로 고르면: 알약이 바뀌고 설명도 바뀐다 · 레버리지 4개를 고를 수 있다', /Alpexa-FX\*/.test(s1.servers) && s1.desc === 'FX, stocks, metals, indices.' && /1:1 1:50 1:100\* 1:500/.test(s1.lev.replace(/\s*★\s*/g, '').replace(/\s+/g, ' ')), JSON.stringify({ servers: s1.servers, desc: s1.desc, lev: s1.lev }));
    await a.page.click('.primary-btn'); const s2 = await S(a.page);
    ok('Continue → 2단계 "Tell us about you" · 왼쪽 숫자 2 · 빈칸이라 버튼은 회색', s2.title === 'Tell us about you' && s2.faceN === '2' && s2.faceOn === 'Personal Info' && s2.btnBg !== 'rgb(255, 159, 10)' && s2.dark === '', JSON.stringify({ t: s2.title, n: s2.faceN, btn: s2.btnBg, dark: s2.dark }));
    await a.page.click('.field-inner[onclick]'); await a.page.waitForTimeout(350);
    const sheet = await a.page.evaluate(() => { const b = document.getElementById('csheetBg'), s = document.querySelector('.csheet'), i = document.querySelector('.cs-item .cs-name'); return { open: b.classList.contains('open'), bg: getComputedStyle(s).backgroundColor, name: i ? getComputedStyle(i).color : '', n: document.querySelectorAll('.cs-item').length }; });
    ok('국가 고르기 창이 어두운 바탕으로 열린다 (목록 40개 이상 · 글씨 밝게)', sheet.open && sheet.bg !== 'rgb(255, 255, 255)' && sheet.name === 'rgb(255, 255, 255)' && sheet.n >= 40, JSON.stringify(sheet));
    await a.page.click('.cs-item:nth-child(2)'); await a.page.waitForTimeout(300);
    ok('국가를 고르면 칸에 들어간다', await a.page.evaluate(() => /United States/.test(document.querySelector('.field-inner[onclick] input').value)));
    await go(a.page, 2); const s3 = await S(a.page);
    ok('3단계: 인증 코드 6칸 · 읽히는 글', s3.title === 'Verify your email' && s3.otp === 6 && s3.dark === '' && s3.faceN === '3', JSON.stringify({ otp: s3.otp, dark: s3.dark }));
    await go(a.page, 3); const s4 = await S(a.page);
    await a.page.click('.term-row'); await a.page.click('.eye'); const s4b = await S(a.page);
    ok('4단계: PIN 4칸 · 약관 누르면 주황으로 켜진다 · 비밀번호 Show ↔ Hide', s4.title === 'Set up security' && s4.otp === 4 && s4.eye === 'Show' && s4b.eye === 'Hide' && /^rgb\(255, 159, 10\),off,off$/.test(s4b.terms) && s4.dark === '', JSON.stringify({ otp: s4.otp, eye: [s4.eye, s4b.eye], terms: s4b.terms, dark: s4.dark }));
    await go(a.page, 4); const s5 = await S(a.page);
    ok('5단계: "Welcome to ALPEXA" · 고객 번호가 크고 가는 숫자 · Open my app = 주황', s5.title === 'Welcome to ALPEXA' && /^ALX-\d{8}$/.test(s5.id) && s5.idW <= 300 && /Open my app/.test(s5.btn) && s5.btnBg === 'rgb(255, 159, 10)' && s5.dark === '' && s5.icons === '', JSON.stringify({ id: s5.id, w: s5.idW, btn: s5.btn, dark: s5.dark, icons: s5.icons }));
    ok('PC: 가로 스크롤 없음 · 페이지 에러 0', s5.overflow <= 0 && a.errs.length === 0, JSON.stringify({ overflow: s5.overflow, errs: a.errs }));
    await a.ctx.close();
    const f = await open(1440, 900, false, 'fx.html'); const f0 = await S(f.page);
    ok('FX 사이트에서 Open account 로 오면: 브랜드 Alpexa-FX · FX 서버가 기본으로 골라져 있다', f0.brand === 'Alpexa-FX' && /Alpexa-FX\*/.test(f0.servers) && f0.desc === 'FX, stocks, metals, indices.', JSON.stringify({ brand: f0.brand, servers: f0.servers }));
    await f.ctx.close();
    const m = await open(390, 844, true); const m0 = await S(m.page);
    ok('모바일 1단계: 가로 스크롤 없음 · 큰 숫자 칸 숨김 · 단계 표시 보임 · 읽히는 글 · 페이지 에러 0', m0.overflow <= 0 && !m0.faceVis && m0.step === 'Step 1 of 5' && m0.dark === '' && m.errs.length === 0, JSON.stringify({ overflow: m0.overflow, face: m0.faceVis, dark: m0.dark, errs: m.errs }));
    for (const i of [1, 2, 3, 4]) { await go(m.page, i); const x = await S(m.page); ok(`모바일 ${i + 1}단계: 가로 스크롤 없음 · 읽히는 글 · 아이콘 글자 노출 없음`, x.overflow <= 0 && x.dark === '' && x.icons === '', JSON.stringify({ overflow: x.overflow, dark: x.dark, icons: x.icons })); }
    await m.ctx.close();
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 260)); }
  await browser.close(); server.close(); done();
})();

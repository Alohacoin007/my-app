#!/usr/bin/env node
// 로그인 화면 계약 (2026-11-27 사장님 시안 승인 "다크 버젼으로 진행해").
//
// 디자인 = 모바일 FX 앱(fx-app.html)의 다크 문법: 순검정 바탕 · 주황 한 색 · 크고 가는 숫자 · 가는 선 · 알약 버튼.
// **인증 경로는 0 변경** — 로그인 · 계좌번호 로그인 · 프로필 · 캐시 정리 · 세션 저장(sessionStorage) · 기기별 착지 · 비밀번호 재설정 · Face ID.
// 새로 지키는 것: 왼쪽 큰 숫자는 실제 시세만(받기 전 = 비움 · 멈추면 live 꺼짐) · 고른 서버를 따라간다 · FX 사이트에서 왔을 때만 사이트 메뉴.
// 스텁 피드 · 네트워크 0.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const html = fs.readFileSync(path.join(REPO, 'login.html'), 'utf8');
const engine = (h) => { const a = h.indexOf('<script>\nconst SERVERS=['), b = h.indexOf('</script>', a); return a < 0 ? '' : h.slice(a, b); };
let before = ''; try { before = cp.execSync('git show d17c83b:login.html', { cwd: REPO, maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (_) {}
if (before) ok('인증 스크립트가 새 디자인 전과 글자 하나까지 같다 (로그인 · 재설정 · Face ID · 기기별 착지 — 0 변경)', engine(html).length > 15000 && engine(html) === engine(before), engine(html).length + ' vs ' + engine(before).length);
else console.log('  ⏭️  옛 파일 대조 생략 (얕은 복제)');
ok('세션 저장 = sessionStorage · createClient 1개 (3곳 락스텝 유지)', (html.match(/createClient\(/g) || []).length === 1 && /auth:\{storage:_ss,persistSession:true/.test(html));
ok('스크립트가 쓰는 요소가 전부 있다', ['wrap', 'errBar', 'errTxt', 'srvSeg', 'loginInput', 'pwInput', 'eyeIcon', 'signinBtn', 'signinTxt', 'spinner', 'bioBtn', 'bioTxt', 'serverVal', 'serverSheet', 'serverList', 'serverSearch', 'loginForm', 'qrForm', 'tab-login', 'tab-qr', 'saveBox', 'qrBox', 'qrTimer', 'successScreen', 'splashMark', 'resetScreen', 'resetSub', 'resetPw', 'toast']
  .every((id) => new RegExp('id="' + id + '"').test(html)) && (html.match(/class="srv-opt"/g) || []).length === 3 && ['wordmark', 'overline', 'h1'].every((c) => new RegExp('class="[^"]*\\b' + c + '\\b').test(html)));
ok('디자인 토큰 = 모바일 FX 앱 다크 (순검정 · 주황 #FF9F0A · 오름 파랑 · 내림 빨강) · 옛 파랑 버튼 · 네모 A 표식 없음', /--bg:#000/.test(html) && /--acc:#FF9F0A/.test(html) && /--up:#0A6CFF/.test(html) && /--down:#FF3B30/.test(html) && !/class="amark"/.test(html) && !/linear-gradient\(160deg,#3a5bf0/.test(html));
ok('큰 숫자는 실제 시세만: prices 를 읽고 · 난수 없음 · 스프레드 식은 서버 청산과 같다 · 터미널 스킨에서는 읽지 않는다', /rest\/v1\/prices\?symbol=in\./.test(html) && !/Math\.random/.test(html) && /Math\.max\(0\.1,\s*s\+mk\)/.test(html) && /get\('skin'\)==='wt'/.test(html));
ok('터미널 스킨 유지: body.wt-skin 카드 · FX 서버 고정 · 서버 고르기 숨김', /body\.wt-skin #wrap\{/.test(html) && /selectServer\(0\)/.test(html) && /seg\.parentElement\.style\.display='none'/.test(html));

function findChromium() { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x))) for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (fs.existsSync(p)) return p; } } catch (_) {} return null; }
let chromium = null; try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} login-page — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const ORIGIN = () => 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const PX = { EURUSD: 1.0975, GBPUSD: 1.31229, USDJPY: 159.3215, BTC: 61983.78, ETH: 1739.15, SOL: 73.5 };
  const open = async (url, vw, vh, mobile, st, opt) => {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: !!mobile, hasTouch: !!mobile });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
    await page.addInitScript((ls) => { window.__LOGIN_POLL_MS = 150; window.__faceSeen = []; try { Object.keys(ls || {}).forEach((k) => localStorage.setItem(k, ls[k])); } catch (e) {}
      const tick = () => { const f = document.getElementById('face'), n = f && f.querySelector('.num'); if (f && n && +getComputedStyle(f).opacity > 0.02) { const v = n.textContent; if (!window.__faceSeen.includes(v)) window.__faceSeen.push(v); } requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, (opt && opt.ls) || null);
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0
    await page.routeWebSocket(/.*/, ws => ws.close());
    if (!st.noFeed) await page.route(/rest\/v1\/prices/, async (r) => { st.calls = (st.calls || 0) + 1; if (st.delay) await new Promise((z) => setTimeout(z, st.delay)); const at = new Date(Date.now() - (st.ageMs || 0)).toISOString();
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.entries(Object.assign({}, PX, st.px || {})).map(([symbol, mid]) => ({ symbol, mid, spr_pts: st.spr == null ? 0.5 : st.spr, updated_at: at }))) }); });
    if (st.mk !== undefined) await page.route(/rest\/v1\/pricing_marks/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ markup_pts: st.mk }]) }));
    await page.goto(ORIGIN() + '/' + url, Object.assign({ waitUntil: 'load' }, (opt && opt.from) ? { referer: ORIGIN() + '/' + opt.from } : {}));
    return { page, errs, ctx };
  };
  const S = (page) => page.evaluate(() => { const q = (s) => document.querySelector(s), t = (e) => e ? e.textContent.trim() : '', vis = (e) => !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
    const f = q('#face'), btn = q('#signinBtn'), b = btn.getBoundingClientRect(), on = q('.srv-opt.on');
    return { bg: getComputedStyle(document.body).backgroundColor, h1: t(q('.h1')), brand: t([...document.querySelectorAll('.wordmark *')].find((e) => vis(e)) || q('.wordmark')), menu: vis(q('.lg-menu')), menuLinks: [...document.querySelectorAll('.lg-menu a')].map((a) => a.getAttribute('href')).join(' '),
      srv: on ? t(on) : '', srvBg: on ? getComputedStyle(on).backgroundColor : '', srvVis: vis(q('#srvSeg')), btnBg: getComputedStyle(btn).backgroundColor, btnR: getComputedStyle(btn).borderRadius, btnIn: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth,
      faceOp: f ? +getComputedStyle(f).opacity : -1, faceVis: vis(f), live: !!f && f.classList.contains('live'), lbl: t(q('#face .lbl')), num: t(q('#face .num')), numW: q('#face .num') ? +getComputedStyle(q('#face .num')).fontWeight : 0, numCls: q('#face .num') ? q('#face .num').className : '',
      numFit: q('#face .num') ? q('#face .num').scrollWidth <= q('#face').clientWidth + 1 : true, kv: [...document.querySelectorAll('#face .kv > div')].map((d) => t(d).replace(/\s+/g, ' ')).join(' | '), seen: window.__faceSeen.join(' , '),
      err: vis(q('#errBar')) ? t(q('#errTxt')) : '', eye: getComputedStyle(q('.eye'), '::after').content.replace(/"/g, ''), pwType: q('#pwInput').type, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wrapBg: getComputedStyle(q('#wrap')).backgroundColor, foot: vis(q('.lg-foot')), selServer: typeof selServer === 'number' ? selServer : null }; });
  const until = async (page, fn, ms) => { const t = Date.now(); for (;;) { const s = await S(page); if (fn(s) || Date.now() - t > (ms || 4000)) return s; await page.waitForTimeout(60); } };
  try {
    // ── 기본 (바로 들어옴: 앱 · 스포츠 사이트 · 로그아웃 뒤) ──
    const A = { mk: 0 }, a = await open('login.html', 1440, 900, false, A);
    const s1 = await until(a.page, (x) => x.faceOp > 0.98 && /61,983/.test(x.num));
    ok('PC: 순검정 바탕 · 제목 Log in · 로그인 버튼 = 주황 알약 · 고른 서버 = 주황 알약', s1.bg === 'rgb(0, 0, 0)' && s1.h1 === 'Log in' && s1.btnBg === 'rgb(255, 159, 10)' && parseFloat(s1.btnR) >= 20 && s1.srvBg === 'rgb(255, 159, 10)', JSON.stringify({ bg: s1.bg, h1: s1.h1, btn: s1.btnBg, r: s1.btnR, srv: s1.srvBg }));
    ok('PC: 바로 들어오면 종전대로 — 브랜드 Alpexa Suisse · 사이트 메뉴 없음 · 기본 서버 Crypto (동작 0 변경)', s1.brand === 'Alpexa Suisse' && !s1.menu && s1.srv === 'Crypto' && s1.selServer === 1, JSON.stringify({ brand: s1.brand, menu: s1.menu, srv: s1.srv }));
    ok('PC: 큰 숫자 = 고른 서버의 실제 시세 (Crypto → BTC/USD · live) · 가는 굵기 · 칸을 넘지 않는다', s1.num === '$61,983.78' && s1.lbl === 'BTC/USD · live' && s1.live && s1.numW <= 300 && s1.numFit && /ETH\/USD ?\$1,739\.15/.test(s1.kv), JSON.stringify({ num: s1.num, lbl: s1.lbl, w: s1.numW, fit: s1.numFit, kv: s1.kv }));
    await a.page.click('.srv-opt[data-srv="0"]'); const s2 = await until(a.page, (x) => x.num === '1.09750');
    ok('서버를 FX 로 바꾸면 숫자도 EUR/USD 로 바뀐다 · 아래 줄 = 실제 스프레드 · GBP/USD · USD/JPY', s2.srv === 'FX' && s2.num === '1.09750' && s2.lbl === 'EUR/USD · live' && s2.kv.replace(/ /g, '') === 'Spread0.5pips|GBP/USD1.31229|USD/JPY159.322', JSON.stringify({ srv: s2.srv, num: s2.num, kv: s2.kv }));
    A.px = { EURUSD: 1.09771 }; A.spr = 0.2; const s3 = await until(a.page, (x) => x.num === '1.09771' && /t-up/.test(x.numCls));
    ok('실시간: 오르면 숫자가 바뀌고 잠깐 파랑(앱과 같은 규칙) · 스프레드도 따라 움직인다', s3.num === '1.09771' && /t-up/.test(s3.numCls) && /Spread ?0\.2 pips/.test(s3.kv), JSON.stringify({ num: s3.num, cls: s3.numCls, kv: s3.kv }));
    A.px = { EURUSD: 1.0974 }; const s4 = await until(a.page, (x) => /t-dn/.test(x.numCls)); const s4b = await until(a.page, (x) => !/t-(up|dn)/.test(x.numCls), 3000);
    ok('실시간: 내리면 잠깐 빨강 · 색은 곧 원래대로', /t-dn/.test(s4.numCls) && !/t-(up|dn)/.test(s4b.numCls), JSON.stringify({ a: s4.numCls, b: s4b.numCls }));
    await a.page.click('.srv-opt[data-srv="2"]'); const s5 = await until(a.page, (x) => x.srv === 'Sports' && !/\d/.test(x.num));
    ok('Sports 를 고르면 시세 숫자를 보이지 않는다 (관계없는 값을 띄우지 않는다)', s5.srv === 'Sports' && !/\d/.test(s5.num) && !s5.live && s5.kv === '', JSON.stringify({ num: s5.num, lbl: s5.lbl, kv: s5.kv }));
    ok('비밀번호 보기: Show ↔ Hide', s5.eye === 'Show' && s5.pwType === 'password' && (await (async () => { await a.page.click('.eye'); const x = await S(a.page); return x.eye === 'Hide' && x.pwType === 'text'; })()));
    await a.page.click('#signinBtn'); const s6 = await until(a.page, (x) => x.err !== '');
    ok('빈칸으로 누르면 안내가 보인다 (종전 문구 그대로)', s6.err === 'Please enter your account number or email.', s6.err);
    ok('PC: 가로 스크롤 없음 · 페이지 에러 0', s6.overflow <= 0 && a.errs.length === 0, JSON.stringify({ overflow: s6.overflow, errs: a.errs }));
    await a.ctx.close();

    // ── 깜빡임 · 정지 · 수신 실패 ──
    const B = { mk: 0, delay: 600 }, b = await open('login.html', 1440, 900, false, B, { ls: { 'alpexa.lastServer': 'fx' } });
    await b.page.waitForTimeout(250); const b0 = await S(b.page); const b1 = await until(b.page, (x) => x.faceOp > 0.98 && x.num === '1.09750');
    ok('시세가 오기 전에는 숫자 자리가 비어 있다 — 눈에 보인 값은 실제 값뿐 (대기용 숫자 없음)', b0.faceOp === 0 && b1.num === '1.09750' && b1.seen === '1.09750' && b1.srv === 'FX', JSON.stringify({ op0: b0.faceOp, seen: b1.seen }));
    await b.ctx.close();
    const C = { mk: 0, ageMs: 10 * 60e3 }, c = await open('login.html', 1440, 900, false, C, { ls: { 'alpexa.lastServer': 'fx' } }); const c1 = await until(c.page, (x) => x.faceOp > 0.98);
    C.px = { EURUSD: 1.0999 }; await c.page.waitForTimeout(500); const c2 = await S(c.page);
    ok('휴장·정지(10분 전 시세): live 표시와 점이 없다 · "last price" · 색 반응 없음 · 스프레드 칸 없음', !c1.live && c1.lbl === 'EUR/USD · last price' && !/t-(up|dn)/.test(c2.numCls) && !/Spread/.test(c2.kv), JSON.stringify({ lbl: c1.lbl, live: c1.live, cls: c2.numCls, kv: c2.kv }));
    await c.ctx.close();
    const D = { noFeed: true }, d = await open('login.html', 1440, 900, false, D, { ls: { 'alpexa.lastServer': 'fx' } }); await d.page.waitForTimeout(900); const d1 = await S(d.page);
    ok('시세를 못 받으면 숫자 없이 로그인 화면만 (지어내지 않는다 · 에러 0 · 로그인 버튼 정상)', d1.faceOp === 0 && d1.seen === '' && d1.h1 === 'Log in' && d1.btnIn && d.errs.length === 0, JSON.stringify({ op: d1.faceOp, seen: d1.seen, errs: d.errs }));
    await d.ctx.close();

    // ── FX 사이트에서 My Account 로 넘어왔을 때 ──
    const E = { mk: 0 }, e = await open('login.html?switch=1', 1440, 900, false, E, { from: 'fx.html' }); const e1 = await until(e.page, (x) => x.num === '1.09750');
    ok('FX 사이트에서 오면: 브랜드 Alpexa-FX · 사이트 메뉴(Markets · IB · About · Support) · 저장된 것이 없으면 FX 서버가 기본', e1.brand === 'Alpexa-FX' && e1.menu && e1.menuLinks === 'markets.html ib.html about.html support.html' && e1.srv === 'FX' && e1.num === '1.09750', JSON.stringify({ brand: e1.brand, menu: e1.menu, links: e1.menuLinks, srv: e1.srv }));
    await e.ctx.close();
    const F = { mk: 0 }, f = await open('login.html?switch=1', 1440, 900, false, F, { from: 'fx.html', ls: { 'alpexa.lastServer': 'sports' } }); const f1 = await until(f.page, (x) => x.srv !== '');
    ok('FX 사이트에서 와도 지난번 고른 서버(Sports)가 있으면 그것을 존중한다', f1.srv === 'Sports' && f1.brand === 'Alpexa-FX', JSON.stringify({ srv: f1.srv }));
    await f.ctx.close();

    // ── 터미널 스킨 · 재설정 화면 ──
    const G = { mk: 0 }, g = await open('login.html?skin=wt', 1440, 900, false, G); await g.page.waitForTimeout(500); const g1 = await S(g.page);
    ok('터미널 스킨(?skin=wt): 어두운 카드 · "Connect to Trade Server" · 서버 고르기 숨김 · FX 고정 · 큰 숫자 · 사이트 메뉴 없음 · 시세 읽지 않음', g1.h1 === 'Connect to Trade Server' && !g1.srvVis && g1.selServer === 0 && g1.wrapBg === 'rgb(18, 21, 28)' && !g1.faceVis && !g1.menu && !G.calls && g1.btnIn && g.errs.length === 0, JSON.stringify({ h1: g1.h1, seg: g1.srvVis, srv: g1.selServer, bg: g1.wrapBg, face: g1.faceVis, calls: G.calls, errs: g.errs }));
    await g.page.evaluate(() => openResetSheet()); await g.page.waitForTimeout(300);
    ok('비밀번호 재설정 화면이 열린다 (어두운 바탕 위 읽히는 글)', await g.page.evaluate(() => { const r = document.getElementById('resetScreen'), c = getComputedStyle(r), t = getComputedStyle(r.querySelector('.suc-title')); return c.display === 'flex' && c.backgroundColor !== 'rgb(255, 255, 255)' && t.color === 'rgb(255, 255, 255)'; }));
    await g.ctx.close();

    // ── 모바일 ──
    const M = { mk: 0 }, m = await open('login.html', 390, 844, true, M, { ls: { 'alpexa.lastServer': 'fx' } }); const m1 = await until(m.page, (x) => x.num === '1.09750');
    ok('모바일: 가로 스크롤 없음 · 숫자가 화면 안 · 로그인 버튼이 스크롤 없이 보인다 · 페이지 에러 0', m1.overflow <= 0 && m1.numFit && m1.btnIn && m1.num === '1.09750' && m.errs.length === 0, JSON.stringify({ overflow: m1.overflow, fit: m1.numFit, btn: m1.btnIn, errs: m.errs }));
    const m0 = await open('login.html', 390, 844, true, { noFeed: true }, { ls: { 'alpexa.lastServer': 'fx' } }); await m0.page.waitForTimeout(400);
    const y0 = await m0.page.evaluate(() => Math.round(document.querySelector('.h1').getBoundingClientRect().top)), y1 = await m.page.evaluate(() => Math.round(document.querySelector('.h1').getBoundingClientRect().top));
    ok('모바일: 시세가 와도 로그인 칸이 밀리지 않는다 (숫자 자리는 처음부터 확보)', y0 === y1, JSON.stringify({ before: y0, after: y1 }));
    await m0.ctx.close(); await m.ctx.close();
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 260)); }
  await browser.close(); server.close(); done();
})();

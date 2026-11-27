#!/usr/bin/env node
// Alpha Fund 페이지 계약 (2026-11-27 사장님 "알파 펀드 페이지 진행해" — What We Offer 의 Account Tiers 자리).
//
// 이 페이지는 투자 권유물이다. 그래서:
//   · 숫자는 **서버의 실제 값만** (pamm_funds + pamm_health) — 받기 전 = 비움 · 못 받음 = "—" · 지어낸 실적 없음
//   · 라벨과 숫자가 같은 것을 가리킨다: "marked to market" = Equity ÷ units(nav) · "realised" = 잔고 ÷ units(nav_trade)
//     (시안 단계에서 둘을 바꿔 적었다 — 여기서 고정)
//   · 열린 포지션이 있으면 그 사실과 미실현 비중을 같이 적는다 · 수익 약속 문구 금지 · 손실 가능 문구 필수
//   · 구조 설명(매니저 출금 불가 · 같은 NAV · HWM 초과분만 보수 · 포지션 없을 때만 가입/환매)은 pamm_core.sql 의 규칙과 같아야 한다
// 스텁 피드 · 네트워크 0.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const rd = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch (_) { return ''; } };
const html = rd('fund.html'), core = rd('supabase/sql/pamm_core.sql'), health = rd('supabase/sql/pamm_health.sql');
const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
ok('페이지가 있다 · 새 틀(공용 스타일) · 제목 하나 "Alpha Fund"', html.length > 4000 && /assets\/site\.css\?v=\d+/.test(html) && (html.match(/<h1[\s>]/g) || []).length === 1 && /<h1>Alpha Fund<\/h1>/.test(html));
ok('수익 약속 문구 없음 (guarantee · risk-free · assured · no risk · 확정 수익 류)', !/guarante|risk.?free|assured|no risk|safe returns|fixed return|profit every/i.test(text), (text.match(/guarante\w*|risk.?free|assured|no risk/i) || [''])[0]);
ok('손실 가능을 분명히 적는다 (큰 글씨 한 줄 + 과거 실적 문구)', /You can lose money in this fund\./.test(html) && /past results do not predict future results/i.test(html));
ok('숫자를 페이지에 박아 두지 않는다 — 서버에서 읽는다 (pamm_funds · pamm_health) · 난수 없음', /rest\/v1\/pamm_funds\?/.test(html) && /rest\/v1\/rpc\/pamm_health/.test(html) && !/Math\.random/.test(html) && !/>\s*0\.9349\s*<|>\s*5\.0\d\d\d\s*</.test(html));
ok('라벨과 숫자의 짝이 서버 정의와 같다: marked to market = nav(Equity÷units) · realised = nav_trade(잔고÷units)', /h\.nav!=null&&nav!=null\)\{ put\('nav',nav\.toFixed\(4\)\); put\('navLabel','NAV per unit, marked to market/.test(html) && /real=h\?num\(h\.nav_trade\)/.test(html) && /else if\(real!=null\)\{ put\('nav',real\.toFixed\(4\)\); put\('navLabel','NAV per unit, realised/.test(html) &&
  /as nav,\s*\n\s*-- 거래용 NAV = 잔고 \/ units/.test(health) && /\(coalesce\(a\.balance,0\) \+ p\.flt\) \/ f\.total_units, 6\) end as nav/.test(health));
ok('구조 설명이 엔진 규칙과 같다: 최초 NAV 1.0 · HWM 초과분에만 보수 · 관리보수 없음(엔진에 항목 없음)', /최초 1\.0에서 시작/.test(core) && /v_nav > v_m\.hwm_nav/.test(core) && !/mgmt_fee|management_fee/i.test(core) && /high&#8209;water mark|high-water mark/.test(html) && /Management fee<\/dt><dd>None/.test(html));
ok('가입 = 로그인(같은 창) · 계좌 개설(새 창) 링크', /href="login\.html\?switch=1"[^>]*>Log in to join</.test(html) && /href="signup\.html" target="_blank" rel="noopener">Open account</.test(html));
// 메뉴: Account Tiers → Managed Fund (모든 페이지 공용 틀)
for (const f of ['fx.html', 'about.html', 'ib.html', 'support.html', 'markets.html', 'fund.html']) { const h = rd(f);
  ok(`${f}: What We Offer 3번째 = Managed Fund → fund.html (메뉴 · 모바일 메뉴 2곳) · Account Tiers 항목 없음`, (h.match(/<a href="fund\.html">Managed Fund<small>/g) || []).length === 2 && !/>Account Tiers</.test(h)); }
ok('홈의 계좌 등급 구역(#vip)은 그대로 있다 (메뉴에서만 뺐다)', /id="vip"/.test(rd('fx.html')));

function findChromium() { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x))) for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (fs.existsSync(p)) return p; } } catch (_) {} return null; }
let chromium = null; try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} fund-page — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!html) { ok('fund.html 없음 — 실브라우저 확인 불가', false); done(); }
else if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const FUND = { name: 'Alpha', perf_fee_pct: 20, min_join: 100, status: 'active', created_at: '2026-08-04T00:20:38.930735+00:00' };
  const HEALTH = { nav: 5.005542, name: 'Alpha', priced: true, status: 'active', members: 2, float_pct: 81.32, nav_trade: 0.934858, open_positions: 5, join_leave_locked: true };
  const open = async (vw, vh, mobile, st) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
    await page.addInitScript(() => { window.__FUND_POLL_MS = 200; window.__seen = [];
      const tick = () => { document.querySelectorAll('[data-f]').forEach((e) => { const p = e.closest('.spec, .status, dd') || e; if (+getComputedStyle(p).opacity > 0.02 && +getComputedStyle(e).opacity > 0.02) { const v = e.textContent.trim(); if (v && !window.__seen.includes(v)) window.__seen.push(v); } }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0
    await page.routeWebSocket(/.*/, ws => ws.close());
    if (!st.fail) {
      await page.route(/rest\/v1\/pamm_funds/, async (r) => { if (st.delay) await new Promise((z) => setTimeout(z, st.delay)); return r.fulfill({ contentType: 'application/json', body: JSON.stringify([Object.assign({}, FUND, st.fund || {})]) }); });
      await page.route(/rest\/v1\/rpc\/pamm_health/, async (r) => { st.calls = (st.calls || 0) + 1; if (st.delay) await new Promise((z) => setTimeout(z, st.delay)); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, at: new Date().toISOString(), funds: [Object.assign({}, HEALTH, st.health || {})] }) }); });
    }
    await page.goto('http://localhost:' + server.address().port + '/fund.html', { waitUntil: 'load' });
    return { page, errs };
  };
  const S = (page) => page.evaluate(() => { const g = (k) => { const e = document.querySelector('[data-f="' + k + '"]'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
    return { nav: g('nav'), navL: g('navLabel'), fee: g('fee'), min: g('min'), inv: g('investors'), opened: g('opened'), status: g('status'), detail: g('detail'), tFee: g('termFee'), tMin: g('termMin'),
      ready: document.getElementById('fund').className, seen: window.__seen.join(' ; '), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      specOp: +getComputedStyle(document.querySelector('.specs')).opacity, h1: document.querySelector('h1').textContent }; });
  const until = async (page, fn, ms) => { const t = Date.now(); for (;;) { const s = await S(page); if (fn(s) || Date.now() - t > (ms || 4000)) return s; await page.waitForTimeout(60); } };
  try {
    const A = {}, a = await open(1440, 900, false, A); const s1 = await until(a.page, (x) => x.nav === '5.0055');
    ok('실제 값이 들어온다: NAV 5.0055 = marked to market · 보수 20% · 최소 $100 · 투자자 2 · 개설 4 Aug 2026', s1.nav === '5.0055' && /marked to market/.test(s1.navL) && /started at 1\.0000/.test(s1.navL) && s1.fee === '20%' && s1.min === '$100' && s1.inv === '2' && s1.opened.replace(/\s/g, '') === '4Aug2026', JSON.stringify(s1));
    ok('열린 포지션이 있으면: 가입·환매 닫힘 + 포지션 수 · 미실현 비중 · 실현 NAV 를 같이 적는다', /closed while positions are open/.test(s1.status) && /5 open/.test(s1.status) && /81% of the fund.s value is unrealised/.test(s1.detail) && /Realised NAV 0\.9349/.test(s1.detail), JSON.stringify({ st: s1.status, d: s1.detail }));
    ok('약관 줄의 보수 · 최소 금액도 서버 값에서 온다', /^20% of profit above the high.water mark$/.test(s1.tFee) && s1.tMin === '$100', JSON.stringify({ f: s1.tFee, m: s1.tMin }));
    ok('PC: 가로 스크롤 없음 · 페이지 에러 0', s1.overflow <= 0 && a.errs.length === 0, JSON.stringify({ overflow: s1.overflow, errs: a.errs }));
    A.health = { nav: 5.1234, float_pct: 82.01 }; const s2 = await until(a.page, (x) => x.nav === '5.1234');
    ok('숫자는 주기적으로 새로 읽는다 (NAV 5.0055 → 5.1234)', s2.nav === '5.1234' && /82% of/.test(s2.detail) && A.calls >= 2, JSON.stringify({ nav: s2.nav, calls: A.calls }));
    await a.page.close();

    const B = { health: { nav: 1.0421, nav_trade: 1.0421, open_positions: 0, join_leave_locked: false, float_pct: 0 } }, b = await open(1440, 900, false, B); const b1 = await until(b.page, (x) => x.nav === '1.0421');
    ok('포지션이 없으면: 가입·환매 열림 · 미실현 줄 없음', b1.nav === '1.0421' && /^Joins and redemptions: open$/.test(b1.status) && b1.detail === '', JSON.stringify({ st: b1.status, d: b1.detail }));
    await b.page.close();
    const C = { health: { nav: null, priced: false, float_pct: null } }, c = await open(1440, 900, false, C); const c1 = await until(c.page, (x) => x.nav === '0.9349');
    ok('열린 포지션의 값을 모를 때(미가격): 추측하지 않고 실현 NAV 만, 라벨도 "realised" 로', c1.nav === '0.9349' && /realised/i.test(c1.navL) && !/marked to market/.test(c1.navL) && !/unrealised/.test(c1.detail), JSON.stringify({ nav: c1.nav, l: c1.navL, d: c1.detail }));
    await c.page.close();
    const D = { fund: { status: 'paused' }, health: { status: 'paused', open_positions: 0, join_leave_locked: false, nav: 1.01, nav_trade: 1.01, float_pct: 0 } }, d = await open(1440, 900, false, D); const d1 = await until(d.page, (x) => x.status !== '' && x.nav === '1.0100');
    ok('펀드가 일시정지면 그대로 적는다 (열려 있다고 하지 않는다)', /paused/i.test(d1.status) && !/: open$/.test(d1.status), d1.status);
    await d.page.close();
    const E = { delay: 700 }, e = await open(1440, 900, false, E); await e.page.waitForTimeout(250); const e0 = await S(e.page); await until(e.page, (x) => x.nav === '5.0055'); await e.page.waitForTimeout(700); const e1 = await S(e.page);
    ok('받기 전에는 숫자 칸이 비어 있다 — 눈에 보인 값은 실제 값뿐 (대기용 숫자 없음)', e0.seen === '' && e1.nav === '5.0055' && !/—/.test(e1.seen) && /5\.0055/.test(e1.seen), JSON.stringify({ seen0: e0.seen, seen1: e1.seen }));
    await e.page.close();
    const F = { fail: true }, f = await open(1440, 900, false, F); const f1 = await until(f.page, (x) => x.nav === '—');
    ok('못 받으면 숫자 대신 — 와 안내 한 줄 (지어내지 않는다 · 에러 0 · 설명 글은 그대로 보인다)', f1.nav === '—' && f1.inv === '—' && /unavailable right now/.test(f1.status) && !/\d/.test(f1.seen.replace(/1\.0000/g, '')) && f.errs.length === 0 && f1.h1 === 'Alpha Fund', JSON.stringify({ nav: f1.nav, st: f1.status, seen: f1.seen, errs: f.errs }));
    await f.page.close();
    for (const [vw, vh, mob] of [[1920, 1080, false], [390, 844, true]]) { const m = await open(vw, vh, mob, {}); const m1 = await until(m.page, (x) => x.nav === '5.0055');
      ok(`@${vw}: 가로 스크롤 없음 · 숫자 표시 · 페이지 에러 0`, m1.overflow <= 0 && m1.nav === '5.0055' && m.errs.length === 0, JSON.stringify({ overflow: m1.overflow, errs: m.errs })); await m.page.close(); }
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 260)); }
  await browser.close(); server.close(); done();
})();

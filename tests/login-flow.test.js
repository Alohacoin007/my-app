// Alpexa — login.html 클라 플로우 행위 테스트 (E2E, supabase 스텁 — 네트워크 0)
//
// 목적: "웹사이트 로그인이 안돼" 클래스의 클라 측을 매 커밋 자동 검증.
//  · 페이지 로드 무에러 (JS 크래시 = 로그인 전면 불능)
//  · 해피패스: doLogin → 성공 화면 → alpexa.me(accts 포함) 기록 → dest2 라우팅 준수
//  · 실패패스: 잘못된 암호 → 에러바 표시 + 버튼 복구 (무한 스피너 금지)
// 서버측(Supabase 실인증·Pages 전파)은 이 테스트 범위 밖 — 클라 회귀만 잡는다.
// playwright/Chromium 없으면 SKIP(exit 0).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter(x => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const f = path.join(base, d, c); if (fs.existsSync(f)) return f;
      }
  } catch (_) {}
  return null;
}
let chromium = null;
try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
if (!chromium || !exe) { console.log('⏭️  SKIP login-flow (no playwright/chromium)'); process.exit(0); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
function serve(port) {
  return new Promise(res => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const fp = path.join(REPO, p);
      if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rq.writeHead(404); rq.end('nf'); return; }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); rq.end(fs.readFileSync(fp));
    });
    s.listen(port, () => res(s));
  });
}
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };

// supabase 스텁 — badPw면 auth 실패, 아니면 해피패스 (players/accounts 포함)
const initStub = badPw => ({
  window: undefined,   // placeholder (addInitScript arg 규약용)
  fn: `() => {
    window.supabase = { createClient: () => ({
      auth: { signInWithPassword: async ({password}) => (password === 'bad'
                ? { data: {}, error: { message: 'Invalid login credentials' } }
                : { data: { user: { id: 'auth-1' } }, error: null }),
              getSession: async () => ({ data: { session: { user: { id: 'auth-1' } } } }) },
      rpc: async (fn) => fn === 'login_email' ? { data: 'boss@x.com', error: null } : { data: null, error: null },
      from: (t) => { const q = { select: () => q, eq: () => q, ilike: () => q, order: () => q,
        limit: async () => t === 'players' ? { data: [{ id: 'p1', cust_id: 'CR-1', name: 'T', email: 'boss@x.com' }], error: null } : { data: [], error: null },
        then: res => res(t === 'accounts' ? { data: [{ server: 'crypto', acct_no: 'CR-1', balance: 1 }], error: null } : { data: [], error: null }) };
        return q; } }) };
  }`
});

(async () => {
  const PORT = 8867, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('login-flow — client E2E (stubbed auth)');

  // ── 해피패스 + dest2 라우팅 ──
  let page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(new Function('return ' + initStub().fn)());
  await page.goto(`http://localhost:${PORT}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { sessionStorage.setItem('alpexa.dest2', 'crypto-dashboard'); } catch (e) {} });
  await page.waitForTimeout(300);
  ok('login page loads without JS errors', errs.length === 0, errs.join(' | '));
  ok('form present (login/pw/button)', !!(await page.$('#loginInput')) && !!(await page.$('#pwInput')) && !!(await page.$('#signinBtn')));
  await page.fill('#loginInput', 'boss@x.com'); await page.fill('#pwInput', 'good');
  await page.click('#signinBtn'); await page.waitForTimeout(600);
  ok('happy path → success screen', (await page.$eval('#successScreen', el => getComputedStyle(el).display)) === 'flex');
  const me = await page.evaluate(() => localStorage.getItem('alpexa.me'));
  ok('alpexa.me written with accts.crypto', !!me && me.includes('"crypto":"CR-1"'), me && me.slice(0, 100));
  await page.waitForTimeout(1300);
  ok('dest2=crypto-dashboard → redirects to dev/crypto-dashboard.html', page.url().includes('dev/crypto-dashboard.html'), page.url());
  ok('no page errors end-to-end', errs.length === 0, errs.join(' | '));
  await page.close();

  // ── 실패패스: 잘못된 암호 → 에러바 + 버튼 복구 (무한 스피너 금지) ──
  page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.addInitScript(new Function('return ' + initStub().fn)());
  await page.goto(`http://localhost:${PORT}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.fill('#loginInput', 'boss@x.com'); await page.fill('#pwInput', 'bad');
  await page.click('#signinBtn'); await page.waitForTimeout(500);
  const err = await page.evaluate(() => ({
    bar: getComputedStyle(document.getElementById('errBar')).display !== 'none',
    txt: document.getElementById('errTxt').textContent,
    btnRestored: getComputedStyle(document.getElementById('spinner')).display === 'none'
      && getComputedStyle(document.getElementById('signinTxt')).display !== 'none' }));
  ok('wrong password → visible error ("' + err.txt + '")', err.bar && /wrong|password/i.test(err.txt));
  ok('wrong password → button restored (no infinite spinner)', err.btnRestored);
  await page.close();

  await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' login-flow — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ login-flow crashed: ' + e.message); process.exit(1); });

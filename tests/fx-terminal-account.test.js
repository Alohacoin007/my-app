// Alpexa — FX 터미널 M3 계좌 읽기 행위 게이트 (스텁 supabase, 네트워크 0, 돈 쓰기 0)
//
// 증명하는 계약:
//  ① 유령세션 가드 — alpexa.me 태그만 있고 실세션 없음 → DEMO 유지 (남의/옛 계좌 표시 금지)
//  ② 로그인 → Trade 탭이 실계좌 잔고 + 실포지션 표시 (LIVE 태그·데모 대기주문 숨김)
//  ③ 플로팅 P/L = 서버 공식 락스텝: dir*(bid-open)*lots*100000 (BUY→bid 청산) · Equity=Balance+Floating
//  ④ 실포지션 ✕ = 서버 청산(data-rclose) · S/L·T/P 셀 = fx_modify(data-rmod) — M4
//  ⑤ 시세 이동 → 1s 마스터 루프가 Trade 재마킹 (P/L이 굳지 않음)
//  ⑥ 로그아웃 → DEMO 프리뷰 복귀
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
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-account (no playwright/chromium)'); process.exit(0); }

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

// 스텁 계좌·포지션 (webtrade positions 스키마 미러)
const ACCT = { acct_no: 'FX-1', balance: 50000 };
const POS = [{ local_id: 'FXP-77001', symbol: 'EURUSD', side: 'buy', size: 0.10, open_price: 1.10,
               status: 'open', updated_at: '2026-07-19T10:00:00Z', meta: { sl: 1.05, tp: 1.25 } }];

// 페이지 안에서 AlpexaSync 스텁 설치 (mode: 'ghost' = 태그만·세션 없음, 'live' = 실세션)
function installStub(mode) {
  return `(() => {
    const q = data => { const o = { select(){return o}, eq(){return o},
      limit(){ return Promise.resolve({ data }); } }; return o; };
    window.AlpexaSync = {
      acctFor: k => k === 'fx' ? 'FX-1' : null,
      db: {
        auth: { getSession: async () => ({ data: { session: ${mode === 'live' ? "{ user: { id: 'u1' } }" : 'null'} } }) },
        from: t => q(t === 'accounts' ? ${JSON.stringify([ACCT])} : t === 'positions' ? ${JSON.stringify(POS)} : []),
        channel: () => ({ on(){ return this; }, subscribe(){ return this; } })
      } };
  })()`;
}

(async () => {
  const PORT = 8873, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal account — M3 behavior gate');

  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  // ── 기준선: 미로그인 = 클린 슬레이트(시드 0) + 연습 체결은 가능 ──
  const demo0 = await page.evaluate(() => {
    const seeded = DEMO_POS.length;
    mwStore.apply([{ symbol: 'EURUSD', mid: 1.15000, spr_pts: 1.0 }]);
    placeMarketDemo('EURUSD', 'buy', 0.02, 0, 0);
    return ({ seeded, authed: fxAcct.authed, closes: document.querySelectorAll('#tbxBody .poclose[data-close]').length,
      liveTag: !!document.querySelector('#tbxBody .acctlive'),
      bal: (document.querySelector('#tbxBody .acctline span b') || {}).textContent }); });
  ok('baseline: no seeded demo rows (clean slate) + practice fill works with ✕', demo0.seeded === 0 && demo0.authed === false && demo0.closes === 1 && !demo0.liveTag, JSON.stringify(demo0));
  ok('baseline: demo balance 100 000.00', /100 000\.00/.test(demo0.bal || ''));

  // ── ① 유령세션 가드: 태그(acctFor)만 있고 세션 없음 → DEMO 유지 ──
  await page.evaluate(installStub('ghost'));
  await page.evaluate(() => fxAcct.load());
  await page.waitForTimeout(200);
  const ghost = await page.evaluate(() => ({ authed: fxAcct.authed,
    closes: document.querySelectorAll('#tbxBody .poclose[data-close]').length }));
  ok('ghost session (tag, no session) → stays DEMO (practice row kept)', ghost.authed === false && ghost.closes === 1, JSON.stringify(ghost));

  // ── ② 로그인 → 실계좌·실포지션 ──  (실시세 먼저 주입: BUY 청산가 = bid)
  await page.evaluate(() => { mwStore.apply([{ symbol: 'EURUSD', mid: 1.20000, spr_pts: 1.0 }]); });
  await page.evaluate(installStub('live'));
  await page.evaluate(() => fxAcct.load());
  await page.waitForTimeout(300);
  const live = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#tbxBody tbody tr:first-child td')].map(td => td.textContent);
    const spans = [...document.querySelectorAll('#tbxBody .acctline span')].map(s => s.textContent);
    return { authed: fxAcct.authed, cells, spans,
      bid: mwStore.rows.EURUSD.bid,
      liveTag: !!document.querySelector('#tbxBody .acctlive'),
      firstRowRealClose: !!document.querySelector('#tbxBody tbody tr:first-child .poclose[data-rclose="FXP-77001"]'),
      firstRowRealMod: !!document.querySelector('#tbxBody tbody tr:first-child .sltp[data-rmod="FXP-77001"]'),
      practiceHd: [...document.querySelectorAll('#tbxBody .pendhd td')].map(x=>x.textContent).join('|'),
      total: (document.querySelector('#tbxBody .tbxtotal') || {}).textContent };
  });
  ok('login → real position row (EURUSD buy 0.10 @1.10000, ticket FXP-77001)',
     live.authed === true && live.cells[0] === 'EURUSD' && live.cells[1] === 'FXP-77001' &&
     live.cells[3] === 'buy' && live.cells[4] === '0.10' && live.cells[5] === '1.10000', JSON.stringify(live.cells));
  ok('LIVE view = real account ONLY (no practice/demo section, no bare pending)',
     live.liveTag === true && live.practiceHd === '');
  const expPl = 1 * (live.bid - 1.10) * 0.10 * 100000;                       // dir*(bid-open)*lots*contract
  ok('floating P/L = server formula (dir*(bid-open)*lots*100000 = ' + expPl.toFixed(2) + ')',
     Math.abs(+live.cells[11] - expPl) < 0.01 && Math.abs(+live.total - expPl) < 0.01, live.cells[11] + ' / ' + live.total);
  const balTxt = live.spans.find(s => /Balance/.test(s)) || '', eqTxt = live.spans.find(s => /Equity/.test(s)) || '';
  ok('account bar: Balance 50 000.00 USD', /50 000\.00 USD/.test(balTxt), balTxt);
  const expEq = 50000 + expPl;
  ok('Equity = Balance + Floating (' + expEq.toFixed(2) + ')',
     eqTxt.replace(/\s/g, '').includes(expEq.toLocaleString('en-US', { minimumFractionDigits: 2 }).replace(/,/g, '')), eqTxt);
  // ── ④ M4: 실포지션 ✕=서버 청산 경로 · S/L·T/P=fx_modify 경로로 배선 ──
  ok('real row: ✕ wired to server close (data-rclose)', live.firstRowRealClose === true);
  ok('real row: S/L·T/P wired to fx_modify (data-rmod)', live.firstRowRealMod === true);

  // ── ⑤ 시세 이동 → 1s 루프가 Trade 재마킹 ──
  await page.evaluate(() => { mwStore.apply([{ symbol: 'EURUSD', mid: 1.30000, spr_pts: 1.0 }]); });
  await page.waitForTimeout(1400);
  const remark = await page.evaluate(() => ({
    pl: +[...document.querySelectorAll('#tbxBody tbody tr:first-child td')][11].textContent,
    bid: mwStore.rows.EURUSD.bid }));
  const expPl2 = 1 * (remark.bid - 1.10) * 0.10 * 100000;
  ok('price move → P/L re-marks within 1s loop (' + expPl2.toFixed(2) + ')', Math.abs(remark.pl - expPl2) < 0.01, JSON.stringify(remark));

  // ── ⑥ 로그아웃 → DEMO 복귀 ──
  await page.evaluate(installStub('ghost'));
  await page.evaluate(() => fxAcct.load());
  await page.waitForTimeout(200);
  const out = await page.evaluate(() => ({ authed: fxAcct.authed,
    closes: document.querySelectorAll('#tbxBody .poclose[data-close]').length,
    liveTag: !!document.querySelector('#tbxBody .acctlive') }));
  ok('logout → DEMO preview restored (practice row back)', out.authed === false && out.closes === 1 && out.liveTag === false, JSON.stringify(out));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-account — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-account crashed: ' + e.message); process.exit(1); });

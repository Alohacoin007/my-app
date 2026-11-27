#!/usr/bin/env node
// Markets 페이지 계약 (v3 디자인 · 2026-11-27 사장님 "로그인 및 마켓 새디자인 진행해").
//
// 모양은 바꾸되 **동작은 그대로**: 서버 prices 실시간 시세 · 탭 4개(FX·Metals·Stocks·Crypto) · 종목 60개 · 실제 차트 · 기간 5개 · ?tab= 바로가기.
// 새로 지키는 것: "Live" 표시는 방금 받은 시세일 때만 (휴장·정지면 마지막 시각) · 지어낸 값 없음 · 폰에서 종목을 고르면 차트가 보인다.
// 스텁 피드 · 네트워크 0.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const html = fs.readFileSync(path.join(REPO, 'markets.html'), 'utf8');
const syms = (h) => (h.match(/\{sym:'[A-Z]+',td:'[^']+',name:'[^']+',cls:'(fx|stock|crypto)',dp:\d\}/g) || []);
ok('종목표 60개 (FX 20 · 주식 20 · 크립토 20) — 이름·기호·자릿수 포함', syms(html).length === 60 && ['fx', 'stock', 'crypto'].every((k) => syms(html).filter((s) => s.includes(`cls:'${k}'`)).length === 20));
let before = ''; try { before = cp.execSync('git show 0727d81:markets.html', { cwd: REPO, maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (_) {}
if (before) ok('종목표가 새 디자인 전과 글자 하나까지 같다 (손으로 옮기다 빠뜨린 종목 없음)', JSON.stringify(syms(before)) === JSON.stringify(syms(html)));
else console.log('  ⏭️  옛 파일 대조 생략 (얕은 복제)');
ok('새 틀: 공용 스타일 · 큰 제목 Markets · 옛 검정 바 헤더/지수 띠/알약 버튼 없음', /assets\/site\.css\?v=\d+/.test(html) && /<h1>Markets<\/h1>/.test(html) && !/header class="site"|acctpill|tkbar|class="pill"|Space\+Grotesk/.test(html));
ok('시세는 서버 prices 한 곳에서 · 차트는 실제 이력 · 가짜 움직임 없음 · 안내 글 유지', /sb\.from\('prices'\)\.select\('symbol,mid,spr_pts,updated_at'\)/.test(html) && /api\.twelvedata\.com\/time_series/.test(html) && !/Math\.random/.test(html) &&
  html.includes('Live prices from the Alpexa server feed · chart history via market data provider.'));
ok('바로가기 유지: markets.html?tab=fx|metals|stock|crypto', /get\('tab'\)/.test(html) && /\['fx','metals','stock','crypto'\]\.indexOf\(_qt\)/.test(html));
ok('"Live" 는 방금 받은 시세일 때만 (정지 화면을 실시간처럼 보이지 않는다)', /Date\.now\(\)-c\.ts<FRESH/.test(html) && /\.mk-asof\.live::before/.test(html) && !/\.mk-asof::before/.test(html));

function findChromium() { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x))) for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (fs.existsSync(p)) return p; } } catch (_) {} return null; }
let chromium = null; try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} markets-page — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe) { console.log('  ⏭️  실브라우저 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.js': 'application/javascript', '.png': 'image/png' };
  const server = http.createServer((q, r) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const PX = { EURUSD: 1.0975, GBPUSD: 1.31229, USDJPY: 159.3215, XAUUSD: 3658.7, XAGUSD: 41.25, AAPL: 271.4, MSFT: 512.33, BTC: 91234.5, ETH: 3120.25 };
  const open = async (url, vw, vh, mobile, st) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: !!mobile, hasTouch: !!mobile });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
    await page.addInitScript(() => { window.__MKT_POLL_MS = 150; });
    await page.route(u => !/^(http:\/\/localhost|data:|blob:)/.test(String(u)), r => r.abort());   // 네트워크 0
    await page.routeWebSocket(/.*/, ws => ws.close());
    await page.route(/rest\/v1\/prices/, (r) => { st.calls = (st.calls || 0) + 1; const at = new Date(Date.now() - (st.ageMs || 0)).toISOString();
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.entries(Object.assign({}, PX, st.px || {})).map(([symbol, mid]) => ({ symbol, mid, spr_pts: 0.5, updated_at: at }))) }); });
    await page.route(/rest\/v1\/sparklines/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(st.spark ? { data: st.spark } : null) }));
    await page.route(/api\.twelvedata\.com\/time_series/, (r) => { const u = new URL(r.request().url()); (st.td = st.td || []).push(u.searchParams.get('symbol') + '|' + u.searchParams.get('interval'));
      if (st.tdFail) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', code: 429 }) });
      const base = st.tdBase || 1.09; return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ values: Array.from({ length: 40 }, (_, i) => { const o = base * (1 + Math.sin(i / 5) * 0.004); return { datetime: `2026-11-26 ${String(i % 24).padStart(2, '0')}:00:00`, open: o.toFixed(5), high: (o * 1.001).toFixed(5), low: (o * 0.999).toFixed(5), close: (o * 1.0004).toFixed(5) }; }) }) }); });
    await page.goto('http://localhost:' + server.address().port + '/' + url, { waitUntil: 'load' });
    return { page, errs };
  };
  const S = (page) => page.evaluate(() => { const q = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)], t = (e) => e ? e.textContent.trim() : '';
    const rows = all('#mktSide [data-sym]'), on = q('#mktSide [data-sym].on'), svg = q('#mktChart svg');
    return { tabs: all('#mktRail button').map((b) => t(b) + (b.classList.contains('on') ? '*' : '')).join(' '), nRows: rows.length, first: rows[0] ? t(rows[0]).replace(/\s+/g, ' ') : '', on: on ? on.dataset.sym : '',
      onMark: on ? getComputedStyle(on).boxShadow : '', title: t(q('#mktMain h2')), sym: t(q('#mktMain .sym')), big: t(q('#mktBig')), bigCls: q('#mktBig') ? q('#mktBig').className : '', chg: t(q('#mktChg')),
      asof: t(q('#mktAsof')), live: !!q('#mktAsof.live'), chart: !!svg && !!svg.querySelector('path'), chartMsg: t(q('#mktChart .mk-loading')), svgBox: svg ? (() => { const b = svg.getBoundingClientRect(), v = svg.viewBox.baseVal; return Math.abs(b.width / b.height - v.width / v.height) < 0.05; })() : false,
      tfs: all('#mktMain .tfs button').map((b) => t(b) + (b.classList.contains('on') ? '*' : '')).join(' '), stats: all('#mktStats > div').map((d) => t(d.querySelector('b')) + '=' + t(d.querySelector('span'))), rel: all('#mktRel [data-sym]').map((d) => d.dataset.sym + '=' + t(d.querySelector('span'))),
      note: t(q('.mk-note')), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, h1: t(q('h1')) }; });
  const until = async (page, fn, ms) => { const t = Date.now(); for (;;) { const s = await S(page); if (fn(s) || Date.now() - t > (ms || 4000)) return s; await page.waitForTimeout(60); } };
  try {
    const A = {}, a = await open('markets.html', 1440, 900, false, A);
    const s1 = await until(a.page, (x) => x.chart && x.big === '1.09750' && x.live);
    ok('PC: 탭 4개(FX 선택) · FX 종목 20줄 · 첫 줄 Euro / US Dollar 가 골라져 있다(라임 선)', s1.tabs === 'FX* Metals Stocks Crypto' && s1.nRows === 20 && s1.on === 'EURUSD' && /205, 241, 56/.test(s1.onMark) && /^Euro \/ US Dollar ?EUR\/USD ?1\.09750/.test(s1.first), JSON.stringify({ tabs: s1.tabs, n: s1.nRows, on: s1.on, mark: s1.onMark, first: s1.first }));
    ok('PC: 오른쪽에 이름 · 기호 · 큰 가격 · 실시간 표시', s1.title === 'Euro / US Dollar' && s1.sym === 'EUR/USD · FX' && s1.big === '1.09750' && s1.live && s1.asof === 'Live price from the Alpexa server feed', JSON.stringify({ t: s1.title, sym: s1.sym, big: s1.big, asof: s1.asof }));
    ok('PC: 실제 이력으로 차트가 그려진다 (찌그러짐 없음) · 기간 5개(1D 선택) · 요청 = EUR/USD 15분봉', s1.chart && s1.svgBox && s1.tfs === '1D* 1W 1M 3M 1Y' && A.td[0] === 'EUR/USD|15min', JSON.stringify({ chart: s1.chart, box: s1.svgBox, tfs: s1.tfs, td: A.td }));
    ok('PC: 차트 아래 시가·고가·저가·종가 4칸 · 관련 종목 4개(가격 포함) · 안내 글', s1.stats.length === 4 && /^Open \(1D\)=1\.09/.test(s1.stats[0]) && /^Last close=/.test(s1.stats[3]) && s1.rel.length === 4 && s1.rel[0] === 'GBPUSD=1.31229' && /chart history via market data provider/.test(s1.note), JSON.stringify({ stats: s1.stats, rel: s1.rel }));
    ok('PC: 등락(%)은 차트 시가 대비 실제 계산 · 기간 표시', /^[+-]\d+\.\d\d%1D$/.test(s1.chg.replace(/\s/g, '')), s1.chg);
    A.px = { EURUSD: 1.09771 }; const s2 = await until(a.page, (x) => x.big === '1.09771' && /t-up/.test(x.bigCls));
    ok('실시간: 시세가 오르면 큰 가격과 목록이 함께 바뀌고 잠깐 초록', s2.big === '1.09771' && /t-up/.test(s2.bigCls) && /1\.09771/.test(s2.first), JSON.stringify({ big: s2.big, cls: s2.bigCls, first: s2.first }));
    A.px = { EURUSD: 1.0974 }; const s3 = await until(a.page, (x) => x.big === '1.09740' && /t-dn/.test(x.bigCls));
    const s3b = await until(a.page, (x) => !/t-(up|dn)/.test(x.bigCls), 3000);
    ok('실시간: 내리면 잠깐 빨강 · 색은 곧 원래대로', s3.big === '1.09740' && /t-dn/.test(s3.bigCls) && !/t-(up|dn)/.test(s3b.bigCls), JSON.stringify({ cls: s3.bigCls, after: s3b.bigCls }));
    A.tdBase = 1.31; await a.page.click('#mktSide [data-sym="GBPUSD"]'); const s4 = await until(a.page, (x) => x.title === 'British Pound / US Dollar' && x.chart);
    ok('종목을 누르면 오른쪽이 그 종목으로 바뀐다 (이름 · 가격 · 차트 요청 GBP/USD)', s4.on === 'GBPUSD' && s4.big === '1.31229' && s4.sym === 'GBP/USD · FX' && A.td.includes('GBP/USD|15min') && s4.rel[0].startsWith('EURUSD='), JSON.stringify({ on: s4.on, big: s4.big, td: A.td, rel: s4.rel }));
    await a.page.click('#mktMain .tfs button[data-tf="1W"]'); const s5 = await until(a.page, (x) => x.tfs === '1D 1W* 1M 3M 1Y' && /Open \(1W\)/.test(x.stats[0] || ''));
    ok('기간을 누르면 그 기간으로 다시 그린다 (1W = 1시간봉)', s5.tfs === '1D 1W* 1M 3M 1Y' && A.td.includes('GBP/USD|1h') && /Open \(1W\)/.test(s5.stats[0]), JSON.stringify({ tfs: s5.tfs, td: A.td, stats: s5.stats }));
    await a.page.focus('#mktSide [data-sym="USDJPY"]'); await a.page.keyboard.press('Enter'); const s6 = await until(a.page, (x) => x.on === 'USDJPY');
    ok('키보드: 줄에서 Enter 로 고를 수 있다 · 엔화는 소수 3자리', s6.on === 'USDJPY' && s6.big === '159.322', JSON.stringify({ on: s6.on, big: s6.big }));
    A.tdBase = 270; await a.page.click('#mktRail button[data-tab="stock"]'); const s7 = await until(a.page, (x) => x.on === 'AAPL' && x.chart);
    ok('Stocks 탭: 20줄 · 첫 종목 Apple 이 골라지고 가격에 $ · 기호는 티커', s7.tabs === 'FX Metals Stocks* Crypto' && s7.nRows === 20 && s7.big === '$271.40' && s7.sym === 'AAPL · Stock' && A.td.includes('AAPL|15min'), JSON.stringify({ tabs: s7.tabs, n: s7.nRows, big: s7.big, sym: s7.sym }));
    await a.page.click('#mktRail button[data-tab="metals"]'); const s8 = await until(a.page, (x) => x.on === 'XAUUSD');
    ok('Metals 탭: 금 · 은 2줄', s8.nRows === 2 && s8.on === 'XAUUSD' && s8.big === '3,658.70', JSON.stringify({ n: s8.nRows, big: s8.big }));
    await a.page.click('#mktRel [data-sym]'); const s9 = await until(a.page, (x) => x.on !== 'XAUUSD');
    ok('관련 종목을 누르면 그 종목으로 가고 탭도 따라간다 (Metals → FX)', s9.on === 'EURUSD' && s9.title === 'Euro / US Dollar' && s9.tabs === 'FX* Metals Stocks Crypto' && s9.nRows === 20, JSON.stringify({ on: s9.on, title: s9.title, tabs: s9.tabs, n: s9.nRows }));
    ok('PC: 가로 스크롤 없음 · 페이지 에러 0 · 값이 없는 종목은 — 로 (지어내지 않는다)', s9.overflow <= 0 && a.errs.length === 0 && (await a.page.evaluate(() => [...document.querySelectorAll('#mktSide .px')].some((e) => e.textContent === '—'))), JSON.stringify({ overflow: s9.overflow, errs: a.errs }));
    await a.page.close();

    const B = { ageMs: 10 * 60e3 }, b = await open('markets.html', 1440, 900, false, B); const b1 = await until(b.page, (x) => x.chart && x.big === '1.09750' && x.asof !== '');
    B.px = { EURUSD: 1.0999 }; await b.page.waitForTimeout(500); const b2 = await S(b.page);
    ok('휴장·정지(10분 전 시세): "Live" 표시와 점이 없고 마지막 시각을 적는다 · 색 반응 없음', !b1.live && /^Last price · updated /.test(b1.asof) && !/Live/.test(b1.asof) && !/t-(up|dn)/.test(b2.bigCls) && b2.big === '1.09990', JSON.stringify({ asof: b1.asof, live: b1.live, cls: b2.bigCls }));
    await b.page.close();

    const C = { tdFail: true }, c = await open('markets.html?tab=crypto', 1440, 900, false, C); const c1 = await until(c.page, (x) => x.on === 'BTC' && x.big === '$91,234.50' && x.chartMsg !== 'Loading chart…');
    ok('바로가기 ?tab=crypto: Crypto 탭 · Bitcoin 선택 · 가격 $91,234.50', c1.tabs === 'FX Metals Stocks Crypto*' && c1.on === 'BTC' && c1.big === '$91,234.50' && C.td[0] === 'BTC/USD|15min', JSON.stringify({ tabs: c1.tabs, on: c1.on, big: c1.big, td: C.td }));
    ok('차트 이력을 못 받으면 안내 글 · 가격은 계속 실시간 (빈 화면·에러 없음)', !c1.chart && c1.chartMsg === 'Chart data unavailable right now — the live price above is current.' && c1.live && c1.stats.length === 0 && c.errs.length === 0, JSON.stringify({ msg: c1.chartMsg, live: c1.live, errs: c.errs }));
    await c.page.close();

    const D = { spark: { EURUSD: [1.09, 1.092, 1.094], GBPUSD: [1.32, 1.315, 1.313] } }, d = await open('markets.html', 1440, 900, false, D); await until(d.page, (x) => x.big === '1.09750');
    const chg = await (async () => { const t = Date.now(); for (;;) { const v = await d.page.evaluate(() => [...document.querySelectorAll('#mktSide [data-sym]')].slice(0, 2).map((r) => r.querySelector('.chg').textContent + '|' + r.querySelector('.chg').className)); if (/%/.test(v[0]) || Date.now() - t > 3000) return v; await d.page.waitForTimeout(60); } })();
    ok('목록의 등락(%)은 서버의 최근 흐름으로 계산 — 오르면 초록 + · 내리면 빨강 −', /^\+0\.\d\d%\|chg up$/.test(chg[0]) && /^-0\.\d\d%\|chg dn$/.test(chg[1]), JSON.stringify(chg));
    await d.page.close();

    const M = { tdBase: 1.31 }, m = await open('markets.html', 390, 844, true, M); const m1 = await until(m.page, (x) => x.chart && x.big === '1.09750');
    const order = await m.page.evaluate(() => document.getElementById('mktMain').getBoundingClientRect().top < document.getElementById('mktSide').getBoundingClientRect().top);
    ok('모바일: 가로 스크롤 없음 · 가격·차트가 목록보다 위 · 차트 정상', m1.overflow <= 0 && order && m1.chart && m1.svgBox && m.errs.length === 0, JSON.stringify({ overflow: m1.overflow, order, box: m1.svgBox, errs: m.errs }));
    await m.page.evaluate(() => document.querySelector('#mktSide [data-sym="GBPUSD"]').scrollIntoView({ block: 'center' })); await m.page.tap('#mktSide [data-sym="GBPUSD"]');
    const m2 = await until(m.page, (x) => x.on === 'GBPUSD' && x.chart); const seen = await m.page.evaluate(() => { const b = document.getElementById('mktBig').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
    ok('모바일: 아래 목록에서 종목을 고르면 그 종목의 가격·차트가 화면에 보인다', m2.on === 'GBPUSD' && m2.title === 'British Pound / US Dollar' && seen, JSON.stringify({ on: m2.on, seen }));
    await m.page.close();
  } catch (e) { ok('실브라우저 측정', false, String(e.message).slice(0, 240)); }
  await browser.close(); server.close(); done();
})();

// Alpexa — FX 터미널 차트 실봉 행위 게이트 (스텁 fetch, 네트워크 0)
//
// 증명하는 계약 (webtrade fetchRealCandles 락스텝):
//  ① 크립토 = Binance 미러 klines(sym+'T', ms 배열) → 시리즈 교체(real)
//  ② FX = fx-prices ?candles(폴리곤 {t,o,h,l,c,v}) → 시리즈 교체(real)
//  ③ 수락 게이트 — 짧은(<160봉)/역순 응답은 통째로 거절 → 합성 유지 (차트 오염 금지)
//  ④ 갭 점프 — 실봉 끝이 과거(주말 FX 등)여도 1s 루프가 갭 봉 플러드로 히스토리를 밀어내지 않음
//  ⑤ 주식/MN = 소스 없음 → fetch 자체를 안 함(합성 유지)
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
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-real-candles (no playwright/chromium)'); process.exit(0); }

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

(async () => {
  const PORT = 8874, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal real candles — behavior gate');
  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/dev/fx-terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  // 스텁 fetch 설치 + 요청 로그 — 이후의 모든 시리즈 생성이 이 스텁을 침
  await page.evaluate(() => {
    window.__req = [];
    const bar1m = 60000, now = Math.floor(Date.now() / bar1m) * bar1m;
    window.fetch = async (url) => {
      window.__req.push(String(url));
      const mk = ok => ({ ok, json: async () => null });
      if (/binance\.vision.*symbol=BTCUSDT/.test(url)) {
        // Binance kline 배열 300봉 (오름차순, 마지막 = 현재 버킷)
        const rows = []; for (let i = 299; i >= 0; i--) {
          const t = now - i * bar1m, o = 60000 + i, c = 60000 + i + 5;
          rows.push([t, String(o), String(c + 3), String(o - 3), String(c), '123.4']);
        }
        return { ok: true, json: async () => rows };
      }
      if (/binance\.vision.*symbol=SOLUSDT/.test(url)) {
        // 깊은 이력 페이지 스텁: endTime 기준 직전 1000봉 (역보행 페이지네이션 검증용)
        const end = +((String(url).match(/endTime=(\d+)/) || [])[1] || Date.now());
        const last = Math.floor(end / bar1m) * bar1m;
        const rows = []; for (let i = 999; i >= 0; i--) rows.push([last - i * bar1m, '100', '101', '99', '100.5', '7']);
        return { ok: true, json: async () => rows };
      }
      if (/binance\.vision.*symbol=ETHUSDT/.test(url)) {
        // 짧은 응답(50봉) → 거절돼야 함
        const rows = []; for (let i = 49; i >= 0; i--) rows.push([now - i * bar1m, '3000', '3010', '2990', '3005', '9']);
        return { ok: true, json: async () => rows };
      }
      if (/fx-prices\?candles=EURUSD/.test(url)) {
        const candles = []; for (let i = 299; i >= 0; i--)
          candles.push({ t: now - i * bar1m, o: 1.2, h: 1.201, l: 1.199, c: 1.2005, v: 0 });
        return { ok: true, json: async () => ({ ok: true, candles }) };
      }
      if (/fx-prices\?candles=USDJPY/.test(url)) {
        // 역순(내림차순) 응답 → 거절돼야 함
        const candles = []; for (let i = 0; i < 300; i++)
          candles.push({ t: now - i * bar1m, o: 155, h: 155.1, l: 154.9, c: 155.05, v: 1 });
        return { ok: true, json: async () => ({ ok: true, candles }) };
      }
      return mk(false);
    };
  });

  // ── ① 크립토 실봉 수락 ──
  const c1 = await page.evaluate(async () => {
    series('BTCUSD', 'M1'); await new Promise(r => setTimeout(r, 250));
    const s = chartSeries['BTCUSD|M1'];
    return { st: realSeriesState['BTCUSD|M1'], n: s.c.length, real: s.real === true,
             lastC: s.c[s.c.length - 1].c, firstO: s.c[0].o, vol: s.c[0].v,
             url: window.__req.find(u => /BTCUSDT/.test(u)) };
  });
  ok('crypto: Binance klines accepted → series replaced (300 real bars)', c1.st === 'real' && c1.real && c1.n === 300, JSON.stringify(c1));
  ok('crypto: OHLC values from feed (last close 60005+ / real volume)', c1.lastC === 60005 && c1.vol === 123, c1.lastC + '/' + c1.vol);
  ok('crypto: request = mirror + sym+T + interval 1m', /data-api\.binance\.vision.*BTCUSDT.*interval=1m/.test(c1.url || ''), c1.url);

  // ── ② FX 실봉 수락 (fx-prices ?candles) ──
  const c2 = await page.evaluate(async () => {
    series('EURUSD', 'M5'); await new Promise(r => setTimeout(r, 250));
    const s = chartSeries['EURUSD|M5'];
    return { st: realSeriesState['EURUSD|M5'], n: s.c.length, real: s.real === true,
             v: s.c[0].v, url: window.__req.find(u => /candles=EURUSD/.test(u)) };
  });
  ok('fx: fx-prices candles accepted → series replaced', c2.st === 'real' && c2.real && c2.n === 300, JSON.stringify(c2));
  ok('fx: request = ?candles=EURUSD&tf=M5', /fx-prices\?candles=EURUSD&tf=M5/.test(c2.url || ''), c2.url);
  ok('fx: v=0(폴리곤) → 틱볼륨 근사 채움 (v>0)', c2.v > 0, String(c2.v));

  // ── ②b 깊은 이력 (2026-07-22 "고고" — webtrade HIST_N 락스텝, 1,000→15,000봉) ──
  const src = fs.readFileSync(path.join(REPO, 'dev/fx-terminal.html'), 'utf8');
  const wsrc = fs.readFileSync(path.join(REPO, 'webtrade.html'), 'utf8');
  const histOf = s => (s.match(/const HIST_N=\{[^}]*\}/) || [''])[0];
  ok('deep: HIST_N 자구 락스텝 (터미널 == webtrade, H1/H4 15000)',
     histOf(src) !== '' && histOf(src) === histOf(wsrc) && /H4:15000/.test(histOf(src)), histOf(src));
  ok('deep: FX 요청 n=HIST_N (M5→5000)', /candles=EURUSD&tf=M5&n=5000/.test(c2.url || ''), c2.url);
  ok('deep: 실이력은 라이브 1500봉 트림에서 제외 (합성만 트림)', /if\(!s\.real&&s\.c\.length>1500\) s\.c\.shift\(\)/.test(src));
  const cdeep = await page.evaluate(async () => {
    series('SOLUSD', 'M1'); await new Promise(r => setTimeout(r, 500));
    const s = chartSeries['SOLUSD|M1'];
    const reqs = window.__req.filter(u => /SOLUSDT/.test(u));
    const ends = reqs.map(u => +((u.match(/endTime=(\d+)/) || [])[1] || 0));
    return { st: realSeriesState['SOLUSD|M1'], n: s ? s.c.length : 0, pages: reqs.length,
             desc: ends.every((e, i) => i === 0 || e < ends[i - 1]),
             asc: s ? s.c.every((b, i) => i === 0 || b.t > s.c[i - 1].t) : false };
  });
  ok('deep: crypto 1000봉 페이지 ×5 역보행(endTime 감소) → 5,000봉 엄격 오름차순',
     cdeep.st === 'real' && cdeep.n === 5000 && cdeep.pages === 5 && cdeep.desc && cdeep.asc, JSON.stringify(cdeep));

  // ── ③ 수락 게이트 — 짧은/역순 응답 거절 → 합성 유지 ──
  const c3 = await page.evaluate(async () => {
    series('ETHUSD', 'M1'); series('USDJPY', 'M1'); await new Promise(r => setTimeout(r, 250));
    return { eth: realSeriesState['ETHUSD|M1'], jpy: realSeriesState['USDJPY|M1'],
             ethReal: chartSeries['ETHUSD|M1'].real === true, jpyReal: chartSeries['USDJPY|M1'].real === true };
  });
  ok('short (<160 bars) response rejected → synth kept', c3.eth === 'synth' && !c3.ethReal, JSON.stringify(c3));
  ok('unsorted (desc) response rejected → synth kept', c3.jpy === 'synth' && !c3.jpyReal);

  // ── ④ 갭 점프 — 실봉 끝이 10분 과거여도 봉 1개로 현재 버킷 점프 (플러드 없음) ──
  const c4 = await page.evaluate(() => {
    const s = chartSeries['BTCUSD|M1'], step = 60000, now = Date.now();
    s.c[s.c.length - 1].t = now - 10 * step;                    // 주말 갭 시뮬
    mwStore.apply([{ symbol: 'BTCUSD', mid: 60100, spr_pts: 10 }]);
    const n0 = s.c.length; tickSeries('BTCUSD', 'M1');
    const last = s.c[s.c.length - 1];
    return { grew: s.c.length - n0, lastT: last.t, bucket: Math.floor(now / step) * step, close: last.c };
  });
  ok('gap jump: ONE bar to current bucket (no flood)', c4.grew === 1 && c4.lastT === c4.bucket && c4.close === 60100, JSON.stringify(c4));

  // ── ⑤ 주식/MN — 소스 없음 → fetch 안 함 ──
  const c5 = await page.evaluate(async () => {
    const before = window.__req.length;
    series('AAPL', 'M1'); series('GBPUSD', 'MN'); await new Promise(r => setTimeout(r, 150));
    return { newReq: window.__req.slice(before), aapl: realSeriesState['AAPL|M1'], mn: realSeriesState['GBPUSD|MN'] };
  });
  ok('stocks/MN: no fetch attempted, synth kept', c5.newReq.length === 0 && c5.aapl === 'synth' && c5.mn === 'synth', JSON.stringify(c5));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-real-candles — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-real-candles crashed: ' + e.message); process.exit(1); });

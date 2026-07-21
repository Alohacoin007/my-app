// Alpexa — FX 터미널 데모 SL/TP 자동 청산 게이트 (서버 무접촉 — 인메모리 전용, 돈/RPC 0)
//
// 결함-로그 2026-07-21 "데모에 SL/TP 실행 엔진 부재" 영구핀. 증명하는 계약 (MT5 판정):
//  ① BUY + TP: bid ≥ tp → 1s 스위프가 자동 청산, History에 via:'TP', Journal 기록
//  ② BUY + SL: bid ≤ sl → 자동 청산, via:'SL'
//  ③ SELL은 ask로 반전 판정 (ask ≥ sl → SL)
//  ④ SL/TP 미설정 포지션은 큰 가격 변동에도 절대 자동 청산 안 됨
//  ⑤ 스위프는 어느 Toolbox 탭에서든 돈다 (Trade 탭이 아니어도 — 마스터 1s 루프)
// 구버전 RED: TP/SL을 아무리 넘어도 포지션이 영원히 열려 있음 (2026-07-20 사장님 스샷 사건).
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
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-demo-sltp (no playwright/chromium)'); process.exit(0); }

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
  const PORT = 8894, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal demo SL/TP — 로컬 자동 청산 게이트');
  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/dev/fx-terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // 헬퍼: 포지션 생성 + SL/TP 설정 (전역 lexical — window. 접두 없이)
  const seed = (side, sl, tp) => page.evaluate(([side, sl, tp]) => {
    mwStore.apply([{ symbol: 'EURUSD', mid: 1.15000, spr_pts: 1.0 }]);
    placeMarketDemo('EURUSD', side, 0.02, 0, 0);
    const p = DEMO_POS[DEMO_POS.length - 1];
    if (sl || tp) modifyPosDemo(p.ticket, sl || 0, tp || 0);
    return p.ticket;
  }, [side, sl, tp]);
  const jump = (mid) => page.evaluate(m => mwStore.apply([{ symbol: 'EURUSD', mid: m, spr_pts: 1.0 }]), mid);
  const state = (tk) => page.evaluate(t => ({
    open: DEMO_POS.some(x => x.ticket === t),
    hist: (DEMO_HIST.find(h => h.ticket === t) || {}),
    journal: JOURNAL.entries.slice(0, 6).map(r => r.msg).join(' | ') }), tk);

  // ── ① BUY + TP 돌파 → 자동 청산 (via:'TP') ──
  const t1 = await seed('buy', 0, 1.15100);          // TP 10핍 위
  await jump(1.15200);                                // bid ≈ 1.15199 > tp
  await page.waitForTimeout(1600);                    // 1s 스위프 대기
  const s1 = await state(t1);
  ok('BUY + bid≥TP → auto-closed by sweep (구버전 RED: 영원히 열림)', s1.open === false, JSON.stringify(s1.hist));
  ok('… History via:"TP" + Journal "TP hit"', s1.hist.via === 'TP' && /TP hit/.test(s1.journal), s1.hist.via + ' | ' + s1.journal.slice(0, 120));

  // ── ② BUY + SL 하향 돌파 → 자동 청산 (via:'SL') ──
  await jump(1.15000);
  const t2 = await seed('buy', 1.14900, 0);          // SL 10핍 아래
  await jump(1.14800);                                // bid < sl
  await page.waitForTimeout(1600);
  const s2 = await state(t2);
  ok('BUY + bid≤SL → auto-closed, via:"SL"', s2.open === false && s2.hist.via === 'SL', JSON.stringify(s2.hist));

  // ── ③ SELL + SL 상향 돌파 (ask 기준 반전) ──
  await jump(1.15000);
  const t3 = await seed('sell', 1.15100, 0);         // SELL: SL은 위
  await jump(1.15200);                                // ask > sl
  await page.waitForTimeout(1600);
  const s3 = await state(t3);
  ok('SELL + ask≥SL → auto-closed, via:"SL" (반전 판정)', s3.open === false && s3.hist.via === 'SL', JSON.stringify(s3.hist));

  // ── ④ SL/TP 없는 포지션은 큰 변동에도 유지 ──
  await jump(1.15000);
  const t4 = await seed('buy', 0, 0);
  await jump(1.20000);                                // +500핍
  await page.waitForTimeout(1600);
  const s4 = await state(t4);
  ok('no SL/TP → never auto-closed (500핍 이동에도 유지)', s4.open === true);

  // ── ⑤ Trade 탭이 아니어도 스위프가 돈다 (마스터 루프) ──
  await page.evaluate(() => { renderToolbox('Journal'); });   // 다른 탭으로
  const t5 = await seed('buy', 0, 1.20100);
  await jump(1.20300);
  await page.waitForTimeout(1600);
  const s5 = await state(t5);
  ok('sweep runs on ANY toolbox tab (Journal tab active)', s5.open === false && s5.hist.via === 'TP', JSON.stringify({ open: s5.open, via: s5.hist.via }));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-demo-sltp — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-demo-sltp crashed: ' + e.message); process.exit(1); });

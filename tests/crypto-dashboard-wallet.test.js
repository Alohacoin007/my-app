// Alpexa — 크립토 대시보드 지갑 헤드라인 행위 테스트 (결함-로그 2026-07-19 ×2의 영구 게이트)
//
// 잡는 버그 클래스:
//  ① "로그인했는데 Sign in" — 헤드라인을 히스토리 RPC 유무로 판정 (신원≠데이터 가용성)
//  ② 세션 하이드레이션 레이스 — 첫 loadWallet이 세션보다 먼저 돌아 authed=false로 영구 잔류
//  ③ 미로그인 = 헐벗은 '···' 금지 — 명시적 Sign-in CTA (규칙 #5: 가짜 $ 금지는 유지)
//
// 네트워크 0 — supabase는 스텁. playwright/Chromium 없으면 SKIP(exit 0, verify 게이트 비취약).
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
if (!chromium || !exe) { console.log('⏭️  SKIP crypto-dashboard-wallet (no playwright/chromium)'); process.exit(0); }

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

// 스텁: 세션 + 실보유(BTC/USDT/스테이크) + "빈" 히스토리 RPC — ①의 정확한 트리거
const STUB = `(sessOn)=>{
  localStorage.setItem('alpexa.me', JSON.stringify({name:'T',accts:{crypto:'CR-1'}}));
  const thenable=data=>({ eq:()=>Promise.resolve({data}), then:res=>res({data}) });
  window.AlpexaSync={db:{
    auth:{ getSession:async()=>({data:{session: sessOn?{user:{id:'u1'}}:null}}) },
    from:(t)=>({ select:()=> t==='crypto_holdings'?thenable([{asset:'BTC',qty:1},{asset:'USDT',qty:100}])
                  : t==='prices'?thenable([{symbol:'BTC',mid:64000}])
                  : thenable([]) }),
    rpc:async()=>({data:{ok:true,points:[]}})
  }};
}`;

(async () => {
  const PORT = 8865, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('crypto-dashboard wallet — behavior gate');

  // ── ③ 미로그인: CTA (헐벗은 ··· 금지) ──
  let page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(`http://localhost:${PORT}/dev/crypto-dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  ok('signed-out → Sign-in CTA (not bare ···)',
     await page.evaluate(() => !!document.querySelector('#walAmt [data-signin]')));
  ok('signed-out → PREVIEW tag shown',
     await page.evaluate(() => getComputedStyle(document.getElementById('walPv')).display !== 'none'));

  // ── ② 세션 늦게 도착 → 자가치유 재판정이 헤드라인 전환 ──
  await page.evaluate(`(${STUB})(true)`);
  await page.waitForTimeout(2100);   // 1.5s self-heal retry
  const late = await page.evaluate(() => ({
    amt: document.getElementById('walAmt').textContent.trim(),
    cta: !!document.querySelector('#walAmt [data-signin]'),
    pv: getComputedStyle(document.getElementById('walPv')).display !== 'none' }));
  ok('late session → self-heal shows real $ total (no Sign in, no PREVIEW)',
     /^\$[\d,]/.test(late.amt) && !late.cta && !late.pv, JSON.stringify(late));

  // ── ① authed + 빈 히스토리: 총액 = KV Total과 동일 소스 ──
  const tot = await page.evaluate(() => ({
    amt: document.getElementById('walAmt').textContent.trim(),
    kv: document.getElementById('kvTotal').textContent.trim() }));
  ok('authed + EMPTY history → headline equals KV Total (' + tot.amt + ')', tot.amt === tot.kv, JSON.stringify(tot));

  // ── ② KV-only 갱신 경로도 헤드라인을 전환시킨다 (loadWallet 재실행 없이) ──
  const b = await page.evaluate(`(async()=>{ wal.authed=false;
    const s=await walSession(); await loadWalletKvs(s); await new Promise(r=>setTimeout(r,150));
    return { cta: !!document.querySelector('#walAmt [data-signin]'),
             amt: document.getElementById('walAmt').textContent.trim() }; })()`);
  ok('KV-only refresh path flips headline (race closed)', /^\$[\d,]/.test(b.amt) && !b.cta, JSON.stringify(b));

  // ── ③′ 로그아웃 복귀: CTA로 되돌아감 (가짜 $ 잔류 금지) ──
  const out = await page.evaluate(`(async()=>{ (${STUB})(false); localStorage.removeItem('alpexa.me');
    await loadWallet(); await new Promise(r=>setTimeout(r,150));
    return !!document.querySelector('#walAmt [data-signin]'); })()`);
  ok('signed out again → reverts to Sign-in CTA', out === true);

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' crypto-dashboard-wallet — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ crypto-dashboard-wallet crashed: ' + e.message); process.exit(1); });

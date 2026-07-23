// Alpexa — 대기주문 서버 매칭 엔진 게이트 (SQL 정적 핀 + 트리거 진리표 미러 + 터미널 배선, 실돈 0)
//
// 계약 (2026-07-22 M4.5):
//  ① 단일 체결 엔진 — fx_open v4·fx_pending_fill 모두 fx_fill_internal 호출 (마진/스프레드 코드 이중화 금지)
//  ② 트리거 판정 MT5 진리표 — BUY LIMIT ask≤tr · BUY STOP ask≥tr · SELL LIMIT bid≥tr · SELL STOP bid≤tr
//  ③ fail-safe — 장마감/무가격/신선도초과 스킵 · 원자적 선점(pending→filled) · 실패 시 rejected+reason 보존
//  ④ 터미널: LIVE 대기 접수 → rpc(fx_place_pending) 정확 인자 · Stop Limit 정직 거절(RPC 0) ·
//     서버 대기 행 렌더 + ✕ → rpc(fx_cancel_pending)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx pending engine — 서버 매칭 게이트');

// ── ①③ SQL 정적 핀 ──
const sql = fs.readFileSync(path.join(REPO, 'supabase/sql/fx_pending_engine.sql'), 'utf8');
const openBody = (sql.match(/create or replace function public\.fx_open[\s\S]*?end;\$\$/) || [''])[0];
const fillBody = (sql.match(/create or replace function public\.fx_pending_fill[\s\S]*?end;\$\$/) || [''])[0];
ok('fx_open v4 = 얇은 래퍼 (fx_fill_internal 호출, 마진 코드 없음)',
   /fx_fill_internal\(/.test(openBody) && !/fx_notional_usd/.test(openBody) && /MARKET_CLOSED/.test(openBody));
ok('fx_pending_fill도 같은 코어 호출 (단일 체결 엔진)', /fx_fill_internal\(/.test(fillBody));
ok('원자적 선점: pending→filled 후 not found면 스킵', /set status = 'filled'[\s\S]*?if not found then continue/.test(fillBody));
ok('체결 실패 → rejected + reason 보존 (조용히 안 사라짐)', /'rejected'[\s\S]*?'reason', v_res->>'error'/.test(fillBody));
ok('장마감/신선도 fail-safe 스킵', /fx_market_open\(r\.cls\)[\s\S]*?continue/.test(fillBody) && /120 seconds[\s\S]*?continue/.test(fillBody));
ok('SL/TP 이식 → positions.meta (fx_sltp가 발동)', /jsonb_build_object\('sl', r\.sl, 'tp', r\.tp\)/.test(fillBody));
ok('fx_fill_internal·fx_pending_fill 클라 호출 불가 (revoke)',
   /revoke all on function public\.fx_fill_internal[\s\S]*?from public, anon, authenticated/.test(sql) &&
   /revoke all on function public\.fx_pending_fill\(int\) from public, anon, authenticated/.test(sql));

// ── ② 트리거 진리표 미러 (SQL v_hit와 자구 동일 로직) ──
const hit = (side, otype, bid, ask, tr) =>
  side === 'BUY'  && otype === 'LIMIT' ? ask <= tr :
  side === 'BUY'  && otype === 'STOP'  ? ask >= tr :
  side === 'SELL' && otype === 'LIMIT' ? bid >= tr :
  side === 'SELL' && otype === 'STOP'  ? bid <= tr : false;
const T = [
  ['BUY','LIMIT', 1.1400, 1.1401, 1.1410, true ,'Buy Limit: ask 아래로 → 체결'],
  ['BUY','LIMIT', 1.1420, 1.1421, 1.1410, false,'Buy Limit: 아직 위 → 대기'],
  ['BUY','STOP',  1.1420, 1.1421, 1.1410, true ,'Buy Stop: ask 위로 → 체결'],
  ['BUY','STOP',  1.1400, 1.1401, 1.1410, false,'Buy Stop: 아직 아래 → 대기'],
  ['SELL','LIMIT',1.1420, 1.1421, 1.1410, true ,'Sell Limit: bid 위로 → 체결'],
  ['SELL','LIMIT',1.1400, 1.1401, 1.1410, false,'Sell Limit: 아직 아래 → 대기'],
  ['SELL','STOP', 1.1400, 1.1401, 1.1410, true ,'Sell Stop: bid 아래로 → 체결'],
  ['SELL','STOP', 1.1420, 1.1421, 1.1410, false,'Sell Stop: 아직 위 → 대기'],
];
let tOk = true, tBad = null;
for (const [s, o, b, a, tr, exp, lbl] of T) if (hit(s, o, b, a, tr) !== exp) { tOk = false; tBad = lbl; }
ok('MT5 트리거 진리표 8케이스 전부 일치', tOk, tBad);
ok('SQL의 판정식이 미러와 자구 대응 (4분기 존재)',
   /v_ask <= r\.trigger/.test(fillBody) && /v_ask >= r\.trigger/.test(fillBody) &&
   /v_bid >= r\.trigger/.test(fillBody) && /v_bid <= r\.trigger/.test(fillBody));

// ── ②-b 워터마크 v1.1 (2026-07-22 "고고") — 정적 핀 + 판정·체결가 미러 ──
// 계약: 스침(워터마크만 교차) → 트리거 레벨가 체결 + meta.wm · 현재가 교차 → 기존 시장가 체결 ·
//       워터마크 null → 자구 동일(폴백 불변) · LIMIT은 지정가보다 나쁘게 체결 구조적 불가.
ok('v1.1: fx_pending_fill이 워터마크(coalesce(tick_lo/tick_hi, mid)) 읽음',
   /coalesce\(tick_lo, mid\), coalesce\(tick_hi, mid\)/.test(fillBody));
ok('v1.1: 창 판정 4분기 (lo/hi에 같은 half 적용)',
   /\(v_lo \+ v_half\) <= r\.trigger/.test(fillBody) && /\(v_hi \+ v_half\) >= r\.trigger/.test(fillBody) &&
   /\(v_hi - v_half\) >= r\.trigger/.test(fillBody) && /\(v_lo - v_half\) <= r\.trigger/.test(fillBody));
ok('v1.1: 스침 체결 = 트리거 레벨가 오버라이드 전달', /case when v_wm then r\.trigger else null end/.test(fillBody));
ok('v1.1: 워터마크 체결 감사 표기 (fx_pending.meta.wm + fill_px)',
   /jsonb_build_object\('wm', true, 'fill_px', r\.trigger\)/.test(fillBody));
ok('v1.1: fx_fill_internal p_price_override(default null) + 구 9-인자 drop(42725 방지) + v_open 대체',
   /p_price_override numeric default null/.test(sql) &&
   /drop function if exists public\.fx_fill_internal\(text,text,text,text,text,numeric,numeric,numeric,numeric\);/.test(sql) &&
   /if p_price_override is not null and p_price_override > 0 then v_open := p_price_override/.test(sql));
ok('v1.1: 새 10-인자 시그니처 revoke 유지 (클라 호출 불가)',
   /revoke all on function public\.fx_fill_internal\(text,text,text,text,text,numeric,numeric,numeric,numeric,numeric\) from public, anon, authenticated/.test(sql));

// 판정·체결가 미러 (SQL v_hit_now/v_hit/v_wm/오버라이드와 자구 동일 의미)
const judge2 = (side, otype, mid, lo, hi, half, tr) => {
  lo = lo == null ? mid : lo; hi = hi == null ? mid : hi;
  const now = hit(side, otype, mid - half, mid + half, tr);
  const w = side === 'BUY'  && otype === 'LIMIT' ? (lo + half) <= tr :
            side === 'BUY'  && otype === 'STOP'  ? (hi + half) >= tr :
            side === 'SELL' && otype === 'LIMIT' ? (hi - half) >= tr :
            side === 'SELL' && otype === 'STOP'  ? (lo - half) <= tr : false;
  if (!w) return { fill: false };
  const wm = !now;
  return { fill: true, wm, px: wm ? tr : (side === 'BUY' ? mid + half : mid - half) };
};
const H = 0.00005;   // half (1.0pip 스프레드)
let j = judge2('BUY', 'LIMIT', 1.1420, null, null, H, 1.1400);
ok('v1.1 ① null 워터마크 + 미교차 → 대기 (폴백 불변)', j.fill === false);
j = judge2('BUY', 'LIMIT', 1.1395, null, null, H, 1.1400);
ok('v1.1 ① null 워터마크 + 현재가 교차 → 시장가 체결 (폴백 불변)', j.fill === true && j.wm === false && j.px === 1.1395 + H);
j = judge2('BUY', 'LIMIT', 1.1420, 1.1395, 1.1425, H, 1.1400);
ok('v1.1 ② BUY LIMIT 스침(lo<tr<mid) → 레벨가(1.14) 체결 + wm', j.fill === true && j.wm === true && j.px === 1.1400);
j = judge2('BUY', 'STOP', 1.1400, 1.1398, 1.1425, H, 1.1410);
ok('v1.1 ② BUY STOP 스침(hi>tr>mid) → 레벨가 체결 + wm', j.fill === true && j.wm === true && j.px === 1.1410);
j = judge2('SELL', 'LIMIT', 1.1400, 1.1398, 1.1425, H, 1.1410);
ok('v1.1 ② SELL LIMIT 스침(hi>tr>mid) → 레벨가 체결 + wm', j.fill === true && j.wm === true && j.px === 1.1410);
j = judge2('SELL', 'STOP', 1.1420, 1.1395, 1.1425, H, 1.1400);
ok('v1.1 ② SELL STOP 스침(lo<tr<mid) → 레벨가 체결 + wm', j.fill === true && j.wm === true && j.px === 1.1400);
j = judge2('BUY', 'LIMIT', 1.1420, 1.1405, 1.1425, H, 1.1400);
ok('v1.1 ③ 창이 트리거에 안 닿음 → 대기 (유령 체결 금지)', j.fill === false);
// 속성: LIMIT은 어떤 경우에도 지정가보다 나쁘게 체결되지 않는다
let limOk = true;
for (const mid of [1.1380, 1.1395, 1.1400, 1.1410, 1.1430])
  for (const lo of [null, mid - 0.002, mid - 0.0005])
    for (const hi of [null, mid + 0.002, mid + 0.0005]) {
      const b = judge2('BUY', 'LIMIT', mid, lo, hi, H, 1.1400);
      if (b.fill && b.px > 1.1400 + 1e-12) limOk = false;
      const s = judge2('SELL', 'LIMIT', mid, lo, hi, H, 1.1400);
      if (s.fill && s.px < 1.1400 - 1e-12) limOk = false;
    }
ok('v1.1 속성: LIMIT 체결가는 지정가보다 항상 같거나 유리 (30조합)', limOk);

// ── ④ 터미널 배선 (헤드리스 — playwright 없으면 여기까지만) ──
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
if (!chromium || !exe) {
  console.log('⏭️  browser pins skipped (no playwright/chromium)');
  console.log((fail ? '🔴' : '🟢') + ' fx-pending-engine — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
const serve = port => new Promise(res => {
  const s = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = path.join(REPO, p);
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rq.writeHead(404); rq.end('nf'); return; }
    rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); rq.end(fs.readFileSync(fp));
  });
  s.listen(port, () => res(s));
});
const STUB = `(() => {
  window.__rpcLog = [];
  const q = data => { const o = { select(){return o}, eq(){return o}, order(){return o}, range(){ return Promise.resolve({ data: [] }); },
    limit(){ return Promise.resolve({ data }); } }; return o; };
  window.AlpexaSync = {
    acctFor: k => k === 'fx' ? 'FX-1' : null,
    db: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: t => t === 'accounts' ? q([{ acct_no: 'FX-1', balance: 50000 }])
        : t === 'fx_pending' ? q([{ local_id: 'fxt-1', symbol: 'EURUSD', side: 'BUY', size: 0.10, otype: 'LIMIT',
                                    trigger: 1.14, sl: null, tp: null, status: 'pending', created_at: '2026-07-22T00:00:00Z' }])
        : q([]),
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
      rpc: async (fn, args) => { window.__rpcLog.push({ fn, args }); return { data: { ok: true } }; }
    } };
})()`;
(async () => {
  const PORT = 8891, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { fxMarketOpen = () => true; });
  await page.evaluate(STUB);
  await page.evaluate(() => { mwStore.apply([{ symbol: 'EURUSD', mid: 1.15000, spr_pts: 1.0 }]); return fxAcct.load(); });
  await page.waitForTimeout(400);

  // 접수: LIVE + Buy Limit 1.1400 → fx_place_pending 정확 인자
  await page.evaluate(() => { window.__rpcLog = [];
    openOrderDialog('EURUSD', 'buy'); ordUI.mode = 'pending'; ordUI.otype = 'Buy Limit'; buildOrder();
    document.getElementById('odVol').value = '0.10';
    document.getElementById('odPrice').value = '1.1400';
    submitOrder('pending'); });
  await page.waitForTimeout(400);
  const place = await page.evaluate(() => window.__rpcLog.find(x => x.fn === 'fx_place_pending'));
  ok('LIVE Buy Limit → rpc(fx_place_pending) {BUY, LIMIT, 0.10, 1.14}',
     !!place && place.args.p_symbol === 'EURUSD' && place.args.p_side === 'BUY' && place.args.p_otype === 'LIMIT' &&
     Math.abs(place.args.p_size - 0.10) < 1e-9 && Math.abs(place.args.p_trigger - 1.14) < 1e-9 &&
     /^fxt-\d{13}-\d{1,6}$/.test(place.args.p_local_id), JSON.stringify(place && place.args));

  // Stop Limit → 정직 거절 (RPC 0)
  await page.evaluate(() => { window.__rpcLog = [];
    openOrderDialog('EURUSD', 'buy'); ordUI.mode = 'pending'; ordUI.otype = 'Buy Stop Limit'; buildOrder();
    document.getElementById('odVol').value = '0.10';
    document.getElementById('odPrice').value = '1.1600';
    submitOrder('pending'); });
  await page.waitForTimeout(250);
  const slp = await page.evaluate(() => ({ n: window.__rpcLog.length, toast: document.getElementById('toast').textContent }));
  ok('Stop Limit → 정직 거절 (RPC 0 + v2 안내)', slp.n === 0 && /Stop Limit/i.test(slp.toast), JSON.stringify(slp));

  // 서버 대기 행 렌더 + ✕ → fx_cancel_pending
  await page.evaluate(() => { renderToolbox('Trade'); });
  await page.waitForTimeout(200);
  const row = await page.evaluate(() => ({
    hd: [...document.querySelectorAll('#tbxBody .pendhd td')].map(x => x.textContent).join('|'),
    cancel: !!document.querySelector('#tbxBody [data-rpcancel="fxt-1"]') }));
  ok('LIVE Trade 탭에 서버 대기 섹션 + ✕(data-rpcancel) 렌더', /server matched \(1\)/.test(row.hd) && row.cancel, JSON.stringify(row));
  await page.evaluate(() => { window.__rpcLog = []; document.querySelector('#tbxBody [data-rpcancel="fxt-1"]').click(); });
  await page.waitForTimeout(300);
  const canc = await page.evaluate(() => window.__rpcLog.find(x => x.fn === 'fx_cancel_pending'));
  ok('✕ 클릭 → rpc(fx_cancel_pending, {p_local_id})', !!canc && canc.args.p_local_id === 'fxt-1', JSON.stringify(canc));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-pending-engine — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-pending-engine crashed: ' + e.message); process.exit(1); });

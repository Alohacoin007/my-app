// Alpexa — 스포츠북 데스크 (sportsbook-desk.html) Phase 1 행위 게이트 (스텁, 네트워크 0, 돈 0)
//
// 계약 (2026-07-24 사장님 "리스크 감시·헤징·관리감독 백오피스"):
//  ① READ-ONLY 구조 핀 — 이 파일엔 쓰기 호출(insert/update/delete/upsert)과 돈 RPC가 없다.
//     허용된 서버 호출은 sbdesk_report(어드민 읽기)와 auth뿐. Phase 3 전까지 이 핀이 지킨다.
//  ② SQL 게이트 핀 — sportsbook_desk.sql 은 is_admin() 게이트 + anon revoke.
//  ③ 렌더 행위 — 미로그인=게이트, 스텁 리포트 주입 시 전 위젯 렌더(위젯별 격리),
//     헤징 수식(net/(dec-1)), SHARP 플래그, 알람 임계, XSS 이스케이프.
// playwright/Chromium 없으면 렌더 파트만 SKIP.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('sportsbook-desk — Phase 1 gate');

// ── ① READ-ONLY 구조 핀 (정적) ──
const src = fs.readFileSync(path.join(REPO, 'sportsbook-desk.html'), 'utf8');
ok('① 쓰기 호출 0 (.insert/.update/.delete/.upsert 금지)', !/\.(insert|update|delete|upsert)\s*\(/.test(src));
ok('① 돈 RPC 0 — rpc 호출은 sbdesk_report·backup_status(둘 다 읽기)뿐',
   (src.match(/\.rpc\s*\(\s*'([^']+)'/g) || []).every(m => m.includes('sbdesk_report') || m.includes('backup_status'))
   && /sbdesk_report/.test(src));
ok('① fetch는 live_games 읽기(GET)뿐 — POST/PATCH 없음', !/method\s*:\s*['"](POST|PATCH|PUT|DELETE)/i.test(src));
ok('① service_role/JWT 리터럴 없음', !/service_role|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(src));
ok('① 어드민 세션 격리 플래그 (manager 락스텝)', /ALPEXA_ADMIN_SESSION\s*=\s*true/.test(src));
ok('① 위젯 렌더 격리 (하나 죽어도 나머지 생존)', /forEach\(f=>\{ try\{ f\(\); \}catch\(e\)\{/.test(src));

// ── ② SQL 게이트 핀 (정적) ──
const sql = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'sportsbook_desk.sql'), 'utf8');
ok('② is_admin() 게이트 (비어드민 = not admin)', /if not public\.is_admin\(\) then return jsonb_build_object\('ok',false,'error','not admin'\)/.test(sql));
ok('② anon/public revoke + 읽기 전용(INSERT/UPDATE/DELETE 문 없음)',
   /revoke all on function public\.sbdesk_report\(int\) from public, anon/.test(sql)
   && !/\b(insert into|update |delete from)\b/i.test(sql.replace(/--[^\n]*/g, '')));
ok('② 기존 사령탑 RPC 재사용 (정의 중복 금지)', /public\.sports_liability\(\)/.test(sql) && /public\.sports_pnl\(/.test(sql));

// ── ③ 렌더 행위 (헤드리스) ──
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
  console.log('⏭️  SKIP render checks (no playwright/chromium)');
  console.log((fail ? '🔴' : '🟢') + ' sportsbook-desk — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}
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

// 스텁 리포트 — 실제 sbdesk_report 모양 미러
const STUB = {
  ok: true, days: 7,
  liability: { ok: true, open_bets: 2, total_payout_if_all_win: 34057, biggest_single_payout: 34000,
    by_event_pick: [
      { gid: 'SOC_1', game: 'COV @ ARS', pick: 'Coventry ML', bets: 1, stake: 10000, payout_if_wins: 34000, net_liability: 24000 },
      { gid: 'SOC_2', game: 'PAR @ LAY', pick: 'Parlay', bets: 1, stake: 4000, payout_if_wins: 12000, net_liability: 8000 },
      { gid: 'NFL_1', game: 'NE @ SEA', pick: 'Patriots ML', bets: 1, stake: 20, payout_if_wins: 57, net_liability: 37 }] },
  pnl: { ok: true, handle: 12000, payouts: 9000, ggr: 3000, hold_pct: 25, bets: 40, won: 12, lost: 20 },
  today: { handle: 500, payouts: 100 },
  pnl_daily: [{ day: '2026-07-23', handle: 700, payouts: 300, ggr: 400 }, { day: '2026-07-24', handle: 500, payouts: 100, ggr: 400 }],
  open_tickets: [{ local_id: 'sb1', ticket: 'SP-100001', cust_id: 'SP-777', type: 'Single', game: 'NE @ SEA',
    pick: '<script>alert(1)</script>', odds: 185, stake: 20, potential: 57, legs: [], created_at: '2026-07-23T15:57:00Z' }],
  recent_settlements: [{ kind: 'bet_won', ticket: 'SP-99', symbol: 'Single', cust_id: 'SP-1', stake: 10, pnl: 15, created_at: '2026-07-23T01:00:00Z' }],
  settle_queue: [{ local_id: 'q1', ticket: 'SP-88', cust_id: 'SP-2', game: 'OLD @ GAME', pick: 'X ML',
    stake: 30, potential: 60, last_kick: '2026-07-20T00:00:00Z', approx: false, created_at: '2026-07-19T00:00:00Z' }],
  customers: [
    { cust_id: 'SP-777', name: 'Sharp Sam', email: 's@x.com', balance: 900, open_bets: 1, open_stake: 20,
      open_potential: 57, won: 6, lost: 1, player_net: 400, sharp: true },
    { cust_id: 'SP-100', name: 'Reg Rita', email: 'r@x.com', balance: 100, open_bets: 1, open_stake: 10000,
      open_potential: 34000, won: 0, lost: 3, player_net: -30, sharp: false }],
  audit_last: { ran_at: '2026-07-24T04:00:00Z', verdict: 'yellow', red: 0, yellow: 1 }
};
const GAMES_STUB = [
  { gid: 'SOC_1', lg: 'SOC', live: false, iso: '2026-08-21T19:00Z', time: 'Fri 12:00 PM',
    home: { ab: 'ARS' }, away: { ab: 'COV' }, ml: [{ sel: 'Coventry ML', am: 900 }, { sel: 'Arsenal ML', am: 150 }] },
  { gid: 'SOC_2', lg: 'SOC', live: false, iso: '2026-08-22T19:00Z', time: 'Sat 12:00 PM',
    home: { ab: 'LAY' }, away: { ab: 'PAR' }, ml: [{ sel: 'Par ML', am: -110 }, { sel: 'Lay ML', am: -110 }] }];

(async () => {
  const PORT = 8882, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/jsdelivr|supabase\.co|googleapis/, rt => rt.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto(`http://localhost:${PORT}/sportsbook-desk.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  // ③a 미로그인(CDN 실패 포함) — 게이트 표시, 죽지 않음
  ok('③ 미로그인 → 로그인 게이트 표시', await page.$eval('#gate', el => getComputedStyle(el).display !== 'none'));
  ok('③ 위젯 보드는 만들어짐 (빈 상태)', (await page.$$('#board .wg')).length === 9);

  // ③b 스텁 리포트 주입 → 전 위젯 렌더
  const r = await page.evaluate(([stub, games]) => {
    try {
      REPORT = stub; GAMES = games; GAMES_AT = Date.now(); renderAll();
      const txt = id => (document.getElementById('b-' + id) || {}).innerText || '';
      return { threw: null,
        kpi: txt('kpi'), expo: txt('expo'), hedge: txt('hedge'), alerts: txt('alerts'),
        ticker: txt('ticker'), cust: txt('cust'), queue: txt('queue'), pnl: txt('pnl'), lines: txt('lines'),
        tickerHTML: (document.getElementById('b-ticker') || {}).innerHTML || '' };
    } catch (e) { return { threw: e.message }; }
  }, [STUB, GAMES_STUB]);
  ok('③ 주입 렌더 무예외', r.threw === null, r.threw || '');
  ok('③ KPI — 오픈2 · 최대지급 $34,000 · 홀드 25%', /2/.test(r.kpi) && /\$34,000/.test(r.kpi) && /25%/.test(r.kpi));
  ok('③ 노출 매트릭스 — 쏠림 🔴 (net $24,000)', /24,000/.test(r.expo) && /🔴/.test(r.expo));
  ok('③ 헤징 수식 — 픽 일치 시 반대편(+150): 24000/(2.5-1) = $16,000', /16,000/.test(r.hedge), r.hedge.slice(0, 200));
  ok('③ 헤징 — 팔레이(픽 불일치)는 자동계산 금지 → 수동 검토 표기', /자동판별 불가/.test(r.hedge), r.hedge.slice(0, 300));
  ok('③ 알람 — 최대지급 초과 + SHARP + 정산큐', /34,000/.test(r.alerts) && /SHARP/i.test(r.alerts) && /정산 큐 1건/.test(r.alerts));
  ok('③ 티커 — 티켓 표시 + XSS 이스케이프', /SP-100001/.test(r.ticker) && !/<script>alert/.test(r.tickerHTML));
  ok('③ 고객 — SHARP 뱃지 + 고객순익 색', /Sharp Sam/.test(r.cust) && /SHARP/.test(r.cust));
  ok('③ 정산 큐 — 행 + "감시만" 명시', /OLD @ GAME/.test(r.queue) && /감시만/.test(r.queue));
  ok('③ P&L — 7일 합계 + CSV 버튼', /12,000/.test(r.pnl) && /CSV/.test(r.pnl));
  ok('③ 라인 뷰어 — 경기 + ML', /COV @ ARS/.test(r.lines) && /\+900 \/ \+150/.test(r.lines));
  ok('③ no page errors', errs.length === 0, errs.join(' | '));

  // ③c 백업 알람 (2026-07-24 "3주 빈 백업" 재발 방지): stale/ledger0 = 🔴, 정상 = 🟢 라인
  const rb = await page.evaluate(() => {
    try {
      BACKUP = { ok: true, last_day: '2026-07-20', age_hours: 99, stale: true, money_empty: false, tables: { ledger: 0 } };
      renderAlerts(); const stale = (document.getElementById('b-alerts') || {}).innerText || '';
      BACKUP = { ok: true, last_day: '2026-07-24', age_hours: 2, stale: false, money_empty: false, tables: { ledger: 1234 } };
      renderAlerts(); const okTxt = (document.getElementById('b-alerts') || {}).innerText || '';
      return { threw: null, stale, okTxt };
    } catch (e) { return { threw: e.message }; }
  });
  ok('③ 백업 stale → 🔴 알람', rb.threw === null && /백업 stale/.test(rb.stale), rb.threw || rb.stale);
  ok('③ 백업 정상 → 🟢 라인 (ledger 행수 표시)', /백업 OK/.test(rb.okTxt) && /1,?234/.test(rb.okTxt), rb.okTxt.slice(0, 200));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' sportsbook-desk — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ sportsbook-desk crashed: ' + e.message); process.exit(1); });

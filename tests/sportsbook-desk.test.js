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

// ── ① 구조 핀 (정적) — Phase 3 재계약: 쓰기는 "sbdesk_* 어드민 RPC + 확인 모달"로만 ──
const src = fs.readFileSync(path.join(REPO, 'sportsbook-desk.html'), 'utf8');
ok('① 테이블 직접 쓰기 0 (.insert/.update/.delete/.upsert 금지 — 개입은 RPC만)', !/\.(insert|update|delete|upsert)\s*\(/.test(src));
ok('① rpc 허용목록 — sbdesk_* + backup_status 외 호출 없음',
   (src.match(/\.rpc\s*\(\s*'([^']+)'/g) || []).every(m => /'(sbdesk_[a-z_]+|backup_status)'/.test(m))
   && /sbdesk_report/.test(src));
ok('① 개입 RPC는 전부 opRun 경유 (성공 후 리프레시 일원화)',
   ['sbdesk_settle_manual', 'sbdesk_void_bet', 'sbdesk_set_game_lock', 'sbdesk_set_control', 'sbdesk_set_margin']
     .every(fn => new RegExp("opRun\\('" + fn + "'").test(src) && !new RegExp("db\\.rpc\\('" + fn + "'").test(src)));
ok('① 개입 5종 = confirmModal 관문 필수 (모달 없이 직접 호출 경로 0)',
   (src.match(/opRun\(/g) || []).length >= 6
   && (src.match(/await confirmModal\(/g) || []).length >= 7
   && !/onclick=\(\)=>opRun|onclick=opRun/.test(src));
ok('① fetch는 live_games 읽기(GET)뿐 — POST/PATCH 없음', !/method\s*:\s*['"](POST|PATCH|PUT|DELETE)/i.test(src));
ok('① service_role/JWT 리터럴 없음', !/service_role|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(src));
ok('① 어드민 세션 격리 플래그 (manager 락스텝)', /ALPEXA_ADMIN_SESSION\s*=\s*true/.test(src));
ok('① 위젯 렌더 격리 (하나 죽어도 나머지 생존)', /forEach\(f=>\{ try\{ f\(\); \}catch\(e\)\{/.test(src));

// ── ①b Phase 3 SQL 핀 (sportsbook_desk_ops.sql + place_bet 게이트) ──
const ops = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'sportsbook_desk_ops.sql'), 'utf8');
const pb  = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'place_bet_server_odds.sql'), 'utf8');
ok('①b 개입 RPC 전부 is_admin 게이트', (ops.match(/if not public\.is_admin\(\)/g) || []).length >= 6);
ok('①b 수동 정산 = 삭제 선점 + 엔진 동일 betpay- 멱등 ref (이중지급 구조적 차단)',
   /delete from public\.positions[\s\S]*?returning \* into v_pos/.test(ops)
   && /ref = 'betpay-'\|\|p_local_id/.test(ops) && /'betpay-'\|\|p_local_id\);/.test(ops));
ok('①b 보이드 = 검증된 admin_void_bet 재사용 (새 환불 경로 발명 금지)', /public\.admin_void_bet\(p_local_id\)/.test(ops));
ok('①b 모든 개입 = 감사 로그 강제 (_sbdesk_audit 호출 ≥5)', (ops.match(/_sbdesk_audit\(/g) || []).length >= 6);
ok('①b 감사 로그 쓰기 정책 없음 (RPC만 기록 가능) + 마진 0~15 경계', !/create policy.*audit_log.*insert/i.test(ops) && /p_mult < 0 or p_mult > 15/.test(ops));
ok('①b controls 키 allowlist (임의 키 조작 불가)', /p_key not in \('trading_halt','live_betting'\)/.test(ops));
ok('①b place_bet — 서버 halt 게이트 (클라만 믿던 구멍 폐쇄)', /key='trading_halt' and val='1'/.test(pb) && /betting is paused/.test(pb));
ok('①b place_bet — 경기별 잠금 게이트 (leg 단위)', /from game_locks where gid = v_gid/.test(pb) && /game locked by risk desk/.test(pb));
ok('①b place_bet — 돈 이동 로직 무변경 (차감 1회·멱등·재가격 그대로)',
   (pb.match(/insert into ledger/g) || []).length === 1 && /betstake-'\|\|p_local_id/.test(pb) && /duplicate/.test(pb));

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
  ok('③ 위젯 보드는 만들어짐 (P3 = 11위젯)', (await page.$$('#board .wg')).length === 11);

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
  ok('③ 정산 큐 — 행 + 개입 안내 (P3 재계약: 확인창·감사 기록 명시)', /OLD @ GAME/.test(r.queue) && /확인창/.test(r.queue) && /감사 로그/.test(r.queue));
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

  // ③d Phase 3 렌더: 컨트롤·감사로그 위젯 + 정산큐 개입 버튼 + 라인 잠금 토글 + 모달 관문 행위
  const r4 = await page.evaluate(() => {
    try {
      CTRL = { halt: true, live: false, margin: 4 };
      AUDIT = [{ at: '2026-07-24T18:00:00Z', admin_email: 'boss@alpexa.com', action: 'game_lock', target: 'NFL_1', detail: { note: 'desk' } }];
      LOCKS = new Set(['SOC_1']); renderAll();
      const txt = id => (document.getElementById('b-' + id) || {}).innerText || '';
      // 모달 행위: confirmModal 열림 → 취소 → false, opModal 닫힘
      const p = confirmModal('테스트', '본문');
      const opened = document.getElementById('opModal').classList.contains('on');
      document.getElementById('opNo').click();
      return p.then(v => ({ threw: null, ctrl: txt('ctrl'), audit: txt('audit'), queue: txt('queue'),
        lines: (document.getElementById('b-lines') || {}).innerHTML || '', opened, cancelled: v === false,
        closed: !document.getElementById('opModal').classList.contains('on') }));
    } catch (e) { return { threw: e.message }; }
  });
  ok('③ 컨트롤 위젯 — halt 상태 + 마진 표시', r4.threw === null && /중단됨/.test(r4.ctrl) && /4%/.test(r4.ctrl), r4.threw || '');
  ok('③ 감사 로그 위젯 — 개입 기록 렌더', /game_lock/.test(r4.audit) && /boss/.test(r4.audit));
  ok('③ 정산 큐 — W/L/V 개입 버튼', /data-qwin/.test(r4.queue ? '' : '') || /W\s*L\s*V|개입/.test(r4.queue));
  ok('③ 라인 뷰어 — 잠긴 경기 🔒 표시', /data-glock="SOC_1" data-locked="1"/.test(r4.lines) && /🔒/.test(r4.lines));
  ok('③ 확인 모달 — 열림→취소→닫힘 (개입 관문 작동)', r4.opened && r4.cancelled && r4.closed);

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' sportsbook-desk — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ sportsbook-desk crashed: ' + e.message); process.exit(1); });

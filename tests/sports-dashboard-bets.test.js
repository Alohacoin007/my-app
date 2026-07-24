// Alpexa — 스포츠 대시보드 오픈벳 렌더 행위 게이트 (2026-07-19 "오픈벳 다 사라짐" 사고의 영구핀)
//
// 배경: 정렬 헬퍼가 renderBets 지역 별칭(ms)을 전역에서 참조 → 호출 즉시 ReferenceError →
//       오픈벳 위젯 전체 사망. 정적 파스·fidelity는 통과했는데 런타임 렌더 검사가 없어서 샜다.
// 이 게이트: 실제 페이지를 띄우고 스텁 티켓으로 renderBets를 돌려 (1) 무예외 (2) 전 티켓 렌더
//            (3) 정렬 = LIVE 우선 → 킥오프 오름차순 (앱 sortedOpen 계약 미러)를 실측한다.
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
if (!chromium || !exe) { console.log('⏭️  SKIP sports-dashboard-bets (no playwright/chromium)'); process.exit(0); }

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
  const PORT = 8873, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/sports-dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  console.log('sports-dashboard open-bets render gate');

  const r = await page.evaluate(() => {
    const now = Date.now(), iso = ms => new Date(now + ms).toISOString();
    try {
      gamesStore.games = (gamesStore.games || []).concat([
        { gid: 'g-live', lg: 'MLB', live: true, iso: iso(-3600e3), away: { ab: 'AA', sc: 1 }, home: { ab: 'BB', sc: 2 }, time: 'T5' }]);
      moneyStore.authed = true; moneyStore.sessAbsent = false;
      moneyStore.openBets = [
        { id: 'b-late',  type: 'Single', placedTs: now - 100, stake: 10, potential: 20, legs: [{ sel: 'LateTeam',  am: -110, gid: 'gx1', kt: iso(7200e3) }] },
        { id: 'b-await', type: 'Single', placedTs: now - 200, stake: 10, potential: 20, legs: [{ sel: 'AwaitTeam', am: -110, gid: 'gx-done', kt: iso(-90000e3) }] },   // 어제 끝남 — 정산 대기
        { id: 'b-early', type: 'Single', placedTs: now - 50,  stake: 10, potential: 20, legs: [{ sel: 'EarlyTeam', am: -110, gid: 'gx2', kt: iso(600e3) }] },
        { id: 'b-live',  type: 'Single', placedTs: now - 10,  stake: 10, potential: 20, legs: [{ sel: 'LiveTeam',  am: -110, gid: 'g-live', kt: iso(-3600e3) }] } ];
      renderBets();
      const el = document.getElementById('mbList');
      const picks = [...el.querySelectorAll('.tleg .pk')].map(x => x.textContent.trim());
      return { threw: null, n: picks.length, picks };
    } catch (e) { return { threw: e.message }; }
  });
  ok('renderBets runs without exception', r.threw === null, r.threw || '');
  ok('ALL stub tickets render (4/4 — 사라짐 금지)', r.n === 4, JSON.stringify(r));
  ok('order = LIVE → 곧 시작(빠른 순) → 정산 대기 맨 아래 (' + (r.picks || []).join(' → ') + ')',
     Array.isArray(r.picks) && r.picks[0] === 'LiveTeam' && r.picks[1] === 'EarlyTeam'
     && r.picks[2] === 'LateTeam' && r.picks[3] === 'AwaitTeam');
  ok('no page errors', errs.length === 0, errs.join(' | '));

  // 엣지: 게임 목록이 비어도(gamesStore 미적재) 렌더는 절대 죽지 않는다
  const r2 = await page.evaluate(() => {
    try { gamesStore.games = []; renderBets();
      return { threw: null, n: document.getElementById('mbList').querySelectorAll('.tleg').length };
    } catch (e) { return { threw: e.message }; }
  });
  ok('empty games list → still renders (no crash)', r2.threw === null && r2.n === 4, JSON.stringify(r2));

  // 먼 경기 날짜 표시 (2026-07-24 SP-100001 오해의 영구핀): 저장 tm이 "Thu 12:20 AM"뿐이어도
  // kt 또는 현재 피드 iso로 날짜(월·일) 포함 재포맷 — 7주 뒤 경기가 임박/과거처럼 보이면 안 된다.
  const r3 = await page.evaluate(() => {
    const now = Date.now(), iso = ms => new Date(now + ms).toISOString();
    try {
      const far = iso(49 * 86400e3);                                  // ~7주 뒤 (SP-100001 = 9/10 NFL)
      gamesStore.games = (gamesStore.games || []).concat([
        { gid: 'g-far', lg: 'NFL', live: false, iso: far, away: { ab: 'NE' }, home: { ab: 'SEA' }, time: 'Thu 12:20 AM' }]);
      moneyStore.openBets = [
        { id: 'b-far-nokt', type: 'Single', placedTs: now, stake: 20, potential: 57,
          legs: [{ sel: 'FarNoKt', am: 185, gid: 'g-far', tm: 'Thu 12:20 AM' }] },     // kt 없음 → 피드 iso 폴백
        { id: 'b-far-kt', type: 'Single', placedTs: now, stake: 20, potential: 57,
          legs: [{ sel: 'FarKt', am: 185, gid: 'gx-none', tm: 'Thu 12:20 AM', kt: far }] } ]; // kt 우선
      renderBets();
      const mon = new Date(far).toLocaleDateString('en-US', { month: 'short' });
      const gms = [...document.querySelectorAll('#mbList .tleg .gm')].map(x => x.textContent);
      return { threw: null, mon, gms, allDated: gms.length === 2 && gms.every(t => t.includes(mon)) };
    } catch (e) { return { threw: e.message }; }
  });
  ok('먼 경기 leg = 날짜 포함 라벨 (kt·피드 iso 양경로, tm 원문 금지)',
     r3.threw === null && r3.allDated === true, JSON.stringify(r3));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' sports-dashboard-bets — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ sports-dashboard-bets crashed: ' + e.message); process.exit(1); });

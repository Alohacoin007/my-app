#!/usr/bin/env node
// Alpexa — ESPN 날짜범위(dates=A-B) 프로브 (2026-09-16 피드 축소 사고)
// ============================================================================
// 2026-09-15 22:51Z live_games id='diag' 실측: 우리 UA(alpexa-feed/1.0)로 `?dates=YYYYMMDD-YYYYMMDD`
// 범위 요청이 NBA·NFL·SOC·NHL·NCAAB 에서 전부 **400**, 같은 리그 plain URL 은 200(당일만),
// MLB 범위(8일)는 200. 그 결과 목록이 484→113 으로 줄고 붕괴 가드가 이후 쓰기를 거부했다.
// 이 스크립트는 **어느 범위 모양이 400 을 내는지** 를 리그별로 실측한다 — 추측으로 고치지 않는다.
// GitHub 러너에서 돈다(espn-probe.yml, 이 파일 push 시 자동). 읽기만 · 돈/DB 0.
// ============================================================================
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
const day = (n) => new Date(Date.now() + n * 86400000);
const T = ymd(day(0));
const UA = { 'User-Agent': 'alpexa-feed/1.0' };   // Edge 와 동일 (정직한 식별자)
const PATHS = ['football/nfl', 'hockey/nhl', 'soccer/eng.1', 'soccer/usa.1', 'basketball/nba', 'baseball/mlb'];
const VARIANTS = [
  ['plain',        ''],
  ['dates=T',      `?dates=${T}`],
  ['range +1d',    `?dates=${T}-${ymd(day(1))}`],
  ['range +8d',    `?dates=${T}-${ymd(day(8))}`],
  ['range +14d',   `?dates=${T}-${ymd(day(14))}`],
  ['range +30d',   `?dates=${T}-${ymd(day(30))}`],
  ['range +60d',   `?dates=${T}-${ymd(day(60))}`],
  ['range -6d..T', `?dates=${ymd(day(-6))}-${T}`],          // sports-settle 가 쓰는 모양 (돈 쪽)
  ['+8d&limit',    `?dates=${T}-${ymd(day(8))}&limit=1000`],
  ['month YYYYMM', `?dates=${T.slice(0, 6)}`],
];
async function hit(url) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(url, { headers: UA, signal: ctl.signal }); clearTimeout(tm);
    const txt = await res.text();
    let events = null; try { events = (JSON.parse(txt).events || []).length; } catch (_e) {}
    return { status: res.status, events, snip: res.ok ? '' : txt.replace(/\s+/g, ' ').slice(0, 160), ms: Date.now() - t0 };
  } catch (e) { return { status: 0, events: null, snip: String(e && e.message).slice(0, 80), ms: Date.now() - t0 }; }
}
(async () => {
  console.log(`🛰️  ESPN 날짜범위 프로브 · today=${T} · UA=${UA['User-Agent']}\n`);
  for (const path of PATHS) {
    console.log(`── ${path}`);
    for (const [nm, q] of VARIANTS) {
      const r = await hit(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard${q}`);
      const mark = r.status === 200 ? (r.events > 0 ? '🟢' : '🟡') : '🔴';
      console.log(`  ${mark} ${nm.padEnd(14)} status=${r.status}${r.events != null ? ` events=${r.events}` : ''}${r.snip ? `  «${r.snip}»` : ''}  ${r.ms}ms`);
    }
  }
  process.exit(0);
})();

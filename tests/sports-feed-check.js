#!/usr/bin/env node
// Alpexa — sports feed morning check (run me, don't wait for a customer).
//
// Reads the LIVE `live_games` feed (the exact row the app renders) and verifies the
// ROLLING NEXT-7-DAYS window: on Jul 8 it checks Jul 8→15, on Jul 9 it checks Jul 9→16.
// Per league it reports game counts, how many of the 7 days are covered, and — the part
// that bit us — whether ODDS came in (REAL vs PLACEHOLDER vs MISSING), plus TBD/bracket
// teams and structurally-broken entries.
//
// FAILS (exit 1, so the daily workflow emails the owner) only on REAL problems:
//   empty/stale feed · broken entries · an IMMINENT game (next 48h) with no real odds.
// Far-future placeholder odds and TBD bracket teams are just ⚠️ warnings (odds load
// closer to kickoff) — they don't spam a daily alert.
//
//   node tests/sports-feed-check.js
// Exit: 0 = healthy / warnings only / network unavailable · 1 = real problems.

const URL = 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';

const NOW = Date.now();
const GRACE = 6 * 3600e3;                 // count a game "in window" from 6h ago (just-started)
const WIN_END = NOW + 7 * 86400e3;        // rolling +7 days
const IMMINENT = NOW + 2 * 86400e3;       // next 48h — odds MUST be real by now
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

function oddsStatus(g) {
  if (g.lg === 'SOC') {
    const tw = g.threeWay || [];
    if (tw.length < 3) return 'MISSING';
    if (+tw[1].am === 230) return 'PLACEHOLDER';           // exact mkCore Draw default → overlay didn't match
    return 'REAL';
  }
  const ml = g.ml || [];
  if (ml.length < 2) return 'MISSING';
  const a = +ml[0].am, b = +ml[1].am;
  if ((a === -140 && b === 120) || (a === 120 && b === -140)) return 'PLACEHOLDER';
  return 'REAL';
}
function isTBD(g) {
  const s = ((g.home && g.home.nm) || '') + ' ' + ((g.away && g.away.nm) || '');
  return /\b(?:rd\d|qf|sf|r16|w\d|l\d)\b|winner|loser|to be determined|\btbd\b/i.test(s);
}
function structOK(g) {
  if (g.lg === 'SOC') return (g.threeWay || []).length >= 3 || (g.ml || []).length >= 2;
  return (g.spread || []).length >= 2 && (g.total || []).length >= 2 && (g.ml || []).length >= 2;
}

async function fetchFeed() {
  const r = await fetch(`${URL}/rest/v1/live_games?id=eq.all&select=data,updated_at`, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = await r.json();
  return (rows && rows[0]) || null;
}
// A game is imminent-broken if it kicks off ≤48h out but has no real odds.
function countImminentBad(all) {
  return all.filter((g) => {
    const t = Date.parse(g.iso || ''); if (isNaN(t) || t > IMMINENT || t < NOW - GRACE) return false;
    return oddsStatus(g) !== 'REAL';
  }).length;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let row;
  try { row = await fetchFeed(); }
  catch (e) { console.log('⏭  SKIP — Supabase 접근 불가 (' + e.message + '). 네트워크 열린 곳에서 실행.'); process.exit(0); }

  // TRANSIENT FILTER: odds arrive ~1 min before the next games-feed write, so a single
  // read can briefly catch imminent games at placeholder. If we see that, wait one cron
  // cycle and re-read — only a PERSISTENT gap is a real problem (daily job won't false-alarm).
  if (row && countImminentBad((row.data) || []) > 0) {
    console.log('  … 임박 배당 공백 감지 → 65초 후 재확인(일시적 blip 필터)');
    await sleep(65000);
    try { const row2 = await fetchFeed(); if (row2) row = row2; } catch (_e) { /* keep first */ }
  }

  const all = (row && row.data) || [];
  const ageMin = row && row.updated_at ? Math.round((Date.now() - new Date(row.updated_at).getTime()) / 60000) : null;

  console.log('── 스포츠 피드 아침 점검 ──────────────────────────────');
  console.log(`  점검 창(rolling 7일): ${ymd(NOW)} → ${ymd(WIN_END)}  ·  live_games ${all.length}개 · ${ageMin == null ? '?' : ageMin + '분 전'} 갱신`);

  const fails = [];
  if (!all.length) { console.log('  🔴 live_games 비어있음 — 전 종목 경기 없음.'); process.exit(1); }
  if (ageMin != null && ageMin > 15) fails.push('피드 STALE(>15분) — sports-games 크론 확인');

  // window = games kicking off within [now-6h, +7d]
  const win = all.filter((g) => { const t = Date.parse(g.iso || ''); return isNaN(t) ? true : (t >= NOW - GRACE && t <= WIN_END); });

  const byLg = {};
  for (const g of win) {
    const lg = g.lg || '?';
    const s = (byLg[lg] = byLg[lg] || { n: 0, real: 0, ph: 0, miss: 0, tbd: 0, bad: 0, days: new Set(), immBad: 0 });
    s.n++;
    const o = oddsStatus(g);
    if (o === 'REAL') s.real++; else if (o === 'PLACEHOLDER') s.ph++; else s.miss++;
    if (isTBD(g)) s.tbd++;
    if (!structOK(g)) { s.bad++; }
    const t = Date.parse(g.iso || ''); if (!isNaN(t)) s.days.add(ymd(t));
    // imminent (≤48h) game must have REAL odds
    if (!isNaN(t) && t <= IMMINENT && o !== 'REAL') s.immBad++;
  }

  console.log('\n  종목   경기  요일  실배당 가짜 없음 TBD broken  임박48h배당X');
  for (const lg of Object.keys(byLg).sort()) {
    const s = byLg[lg];
    const warn = [];
    if (s.ph) warn.push(`가짜${s.ph}`);
    if (s.tbd) warn.push(`TBD${s.tbd}`);
    if (s.bad) { warn.push(`broken${s.bad}`); fails.push(`${lg}: broken 항목 ${s.bad}`); }
    if (s.immBad) { warn.push(`임박배당X${s.immBad}`); fails.push(`${lg}: 48h내 경기 ${s.immBad}건 실배당 없음`); }
    console.log(
      `  ${lg.padEnd(6)} ${String(s.n).padStart(4)} ${String(s.days.size).padStart(4)}일 ${String(s.real).padStart(5)} ${String(s.ph).padStart(4)} ${String(s.miss).padStart(4)} ${String(s.tbd).padStart(3)} ${String(s.bad).padStart(6)} ${String(s.immBad).padStart(8)}` +
      (warn.length ? '   ⚠️ ' + warn.join(' ') : '   ✅')
    );
  }

  console.log('');
  if (fails.length) { console.log('  🔴 문제 ' + fails.length + '건:'); fails.forEach((f) => console.log('     - ' + f)); process.exit(1); }
  console.log('  🟢 이상 없음 — 이번주 경기·임박 배당 정상 (가짜/TBD는 경고만, 정상 범주).');
  process.exit(0);
}
main();

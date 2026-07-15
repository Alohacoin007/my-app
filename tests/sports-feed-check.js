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
//   empty/stale feed · broken entries · 🚨 a fabricated line that is STILL BETTABLE
//   (oddsReal not false → the app would offer it and place_bet would honor a made-up
//   line). That last one is the money invariant added 2026-07-08.
// A fabricated line on a game FLAGGED oddsReal:false is fine — the app locks it and
// place_bet rejects it, so it's just ⚠️ 잠금 (we can't force the provider to post a
// line; we only must never OFFER a fake one). TBD/far-future placeholders = ⚠️ only.
// (This means a provider gap no longer cries wolf daily — only a LEAKING gate does.)
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
    // oddsReal is the server's authoritative bettability flag. sports-games sets it true ONLY
    // together with a real overlay 3-way line (index.ts:174 — atomic with g.threeWay=core.threeWay,
    // and oddsToCore only yields threeWay when H/Draw/A are all real). So a flagged-real game IS
    // real even when its Draw price coincidentally equals +230 — the exact value mkCore uses for an
    // *unflagged* placeholder Draw (real example: France–Spain Draw +230). Don't call it a fake on
    // the draw value alone. Only classify the sentinel as a placeholder when NOT flagged real.
    if (g.oddsReal === true) return 'REAL';
    if (+tw[1].am === 230) return 'PLACEHOLDER';           // mkCore stub Draw on an un-flagged game
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
  // A no-line game (oddsReal:false) is INTENTIONALLY empty — locked, not broken. Only a
  // game that CLAIMS a real line must carry full, well-formed markets.
  if (g.oddsReal === false) return true;
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
// Robust team match (mirrors sports-games): strip club suffixes, significant-token subset.
const _norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(fc|sc|cf|afc|ac|sd|cd)\b/g, ' ').replace(/\s+/g, ' ').trim();
const _sig = (s) => _norm(s).split(' ').filter((t) => t.length > 2);
function teamMatch(a, b) { const A = _sig(a), B = _sig(b); if (!A.length || !B.length) return false; const [x, y] = A.length <= B.length ? [A, B] : [B, A]; return x.every((t) => y.includes(t)); }
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
    const s = (byLg[lg] = byLg[lg] || { n: 0, real: 0, ph: 0, miss: 0, tbd: 0, bad: 0, days: new Set(), locked: 0, leak: 0, immBad: 0 });
    s.n++;
    const o = oddsStatus(g);
    if (o === 'REAL') s.real++; else if (o === 'PLACEHOLDER') s.ph++; else s.miss++;
    // A fabricated line (no real odds) is only OK if the game is FLAGGED unbettable
    // (oddsReal:false → the app locks it, place_bet rejects it). A fake line that is
    // still bettable (oddsReal missing/true) = the safety gate is LEAKING = hard fail.
    if (o !== 'REAL') { if (g.oddsReal === false) s.locked++; else s.leak++; }
    if (isTBD(g)) s.tbd++;
    if (!structOK(g)) { s.bad++; }
    const t = Date.parse(g.iso || ''); if (!isNaN(t)) s.days.add(ymd(t));
    // imminent (≤48h) game still lacking a real line — informational once it's locked
    // (we can't force the provider to post a line; we just must not offer a fake one).
    if (!isNaN(t) && t <= IMMINENT && o !== 'REAL') s.immBad++;
  }

  console.log('\n  종목   경기  요일  실배당 가짜 잠금 🚨샘 없음 TBD broken  임박무배당');
  for (const lg of Object.keys(byLg).sort()) {
    const s = byLg[lg];
    const warn = [];
    if (s.ph || s.miss) warn.push(`가짜${s.ph + s.miss}`);
    // THE money invariant: a fabricated line that is still bettable. Hard fail.
    if (s.leak) { warn.push(`🚨샘${s.leak}`); fails.push(`${lg}: 가짜 라인인데 베팅 가능 ${s.leak}건 — oddsReal 미설정(sports-games 배포/플래그 확인). 하우스가 가짜 라인 honor 위험`); }
    if (s.locked) warn.push(`잠금${s.locked}`);
    if (s.tbd) warn.push(`TBD${s.tbd}`);
    if (s.bad) { warn.push(`broken${s.bad}`); fails.push(`${lg}: broken 항목 ${s.bad}`); }
    if (s.immBad) warn.push(`임박무배당${s.immBad}${s.leak ? '' : '(잠금)'}`);   // info once locked
    console.log(
      `  ${lg.padEnd(6)} ${String(s.n).padStart(4)} ${String(s.days.size).padStart(4)}일 ${String(s.real).padStart(5)} ${String(s.ph).padStart(4)} ${String(s.locked).padStart(4)} ${String(s.leak).padStart(4)} ${String(s.miss).padStart(4)} ${String(s.tbd).padStart(3)} ${String(s.bad).padStart(6)} ${String(s.immBad).padStart(8)}` +
      (s.leak ? '   🚨 ' + warn.join(' ') : warn.length ? '   ⚠️ ' + warn.join(' ') : '   ✅')
    );
  }

  // ── C7 · 오즈 테이블 신선도 + 잠금 경기 근본원인 (회수가능 vs 프로바이더에 없음) ──
  let odds = null;
  try {
    const r = await fetch(`${URL}/rest/v1/sports_odds?select=sport,updated_at,data`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (r.ok) odds = await r.json();
  } catch (_e) { /* network — skip the extra report */ }
  if (odds) {
    const stale = odds.filter((o) => o.updated_at && (NOW - new Date(o.updated_at).getTime()) > 15 * 60000);
    console.log('\n  오즈 테이블(C7): ' + odds.length + '개 리그' + (stale.length ? '  ⚠️ 스테일(>15분): ' + stale.map((o) => o.sport).join(', ') + ' — sports-odds 크론 확인' : '  ✅ 전부 신선'));
    const bySport = {}; odds.forEach((o) => { bySport[o.sport] = Array.isArray(o.data) ? o.data : []; });
    const OK = { NFL: 'americanfootball_nfl', NBA: 'basketball_nba', MLB: 'baseball_mlb', NHL: 'icehockey_nhl' };
    const socAll = Object.keys(bySport).filter((k) => k.indexOf('soccer_') === 0).flatMap((k) => bySport[k]);
    const cls = {};
    for (const g of win) {
      if (g.oddsReal !== false) continue;
      const c = (cls[g.lg || '?'] = cls[g.lg || '?'] || { rec: 0, abs: 0 });
      const pool = g.lg === 'SOC' ? socAll : (bySport[OK[g.lg]] || []);
      const gt = Date.parse(g.iso || '');
      const hit = pool.find((e) => {
        const ok = (teamMatch(e.home_team, g.home && g.home.nm) && teamMatch(e.away_team, g.away && g.away.nm)) ||
                   (teamMatch(e.home_team, g.away && g.away.nm) && teamMatch(e.away_team, g.home && g.home.nm));
        if (!ok) return false;
        const et = Date.parse(e.commence_time || '');
        return (isNaN(gt) || isNaN(et)) ? true : Math.abs(et - gt) <= 6 * 3600e3;
      });
      if (hit && (hit.bookmakers || []).length) c.rec++; else c.abs++;
    }
    if (Object.keys(cls).length) {
      console.log('  잠금 분류: ' + Object.keys(cls).sort().map((lg) => `${lg} ${cls[lg].rec + cls[lg].abs}(회수${cls[lg].rec}/없음${cls[lg].abs})`).join(' · '));
      const recTotal = Object.values(cls).reduce((a, c) => a + c.rec, 0);
      if (recTotal) console.log(`     ⚠️ 회수가능 ${recTotal}건 — 프로바이더에 실배당 있는데 안 붙음(매칭/접미사 or sports-games 미배포). 잠긴 경기가 열릴 수 있음.`);
    }
  }

  console.log('');
  if (fails.length) { console.log('  🔴 문제 ' + fails.length + '건:'); fails.forEach((f) => console.log('     - ' + f)); process.exit(1); }
  console.log('  🟢 이상 없음 — 가짜 라인은 전부 잠김(베팅 불가). 프로바이더 공백은 정상 범주.');
  process.exit(0);
}
main();

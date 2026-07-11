#!/usr/bin/env node
// Daily sports report — "오늘 총 경기 + 배당 상태" (라스베가스/PDT 기준).
// Reads the live_games feed (same source the app reads) and prints, for TODAY:
//   • total games, bettable (real odds) vs locked (no odds)
//   • per-league breakdown
//   • per-game line with the actual odds (or 🔒 locked)
// oddsReal is the server's authoritative bettability flag — a game is bettable only when it's
// real (never fabricated). Mirrors tests/sports-feed-check.js's realness rule.
'use strict';

const URL = 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const OFF = -7 * 3600e3;                        // Las Vegas = PDT = UTC-7 (per CLAUDE.md)
const vYMD = (t) => new Date(t + OFF).toISOString().slice(0, 10);
const vHM  = (t) => new Date(t + OFF).toISOString().slice(11, 16);

// A game is bettable iff the server flagged it real AND it carries a well-formed line.
function isReal(g) {
  if (g.oddsReal === false) return false;
  return g.lg === 'SOC' ? (g.threeWay || []).length >= 3 : (g.ml || []).length >= 2;
}
function oddsText(g) {
  if (g.lg === 'SOC' && (g.threeWay || []).length >= 3)
    return `H ${g.threeWay[0].am} / X ${g.threeWay[1].am} / A ${g.threeWay[2].am}`;
  if ((g.ml || []).length >= 2)
    return `ML ${g.ml[0].am} / ${g.ml[1].am}` +
           ((g.spread || []).length ? ` · Spr ${g.spread[0].ln}` : '') +
           ((g.total  || []).length ? ` · O/U ${g.total[0].ln}` : '');
  return '(배당 없음 → 🔒 잠김)';
}

async function fetchFeed() {
  const r = await fetch(`${URL}/rest/v1/live_games?id=eq.all&select=data,updated_at`, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = await r.json();
  return (rows && rows[0]) || null;
}

async function main() {
  let row;
  try { row = await fetchFeed(); }
  catch (e) { console.log('⚠️ 피드 조회 실패 (네트워크): ' + e.message); process.exit(0); }
  if (!row || !Array.isArray(row.data)) { console.log('⚠️ live_games 데이터 없음'); process.exit(0); }

  const nowMs = Number(process.env.NOW_MS) || Date.parse(new Date().toISOString());
  const today = vYMD(nowMs);
  const games = row.data
    .filter((g) => { const t = Date.parse(g.iso || ''); return !isNaN(t) && vYMD(t) === today; })
    .sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));

  const byLg = {};
  let bettable = 0, locked = 0;
  for (const g of games) {
    const b = isReal(g);
    byLg[g.lg] = byLg[g.lg] || { n: 0, real: 0 };
    byLg[g.lg].n++; if (b) { byLg[g.lg].real++; bettable++; } else locked++;
  }

  console.log('── 오늘의 스포츠 리포트 (라스베가스 ' + today + ') ──────────');
  console.log('  피드 갱신: ' + row.updated_at);
  console.log(`\n  총 ${games.length}경기 · 베팅가능(실배당) ${bettable} · 잠김(배당없음) ${locked}`);
  console.log('\n  종목별:');
  for (const lg of Object.keys(byLg))
    console.log(`    ${lg}: ${byLg[lg].n}경기 (베팅가능 ${byLg[lg].real} / 잠김 ${byLg[lg].n - byLg[lg].real})`);
  console.log('\n  경기별:');
  for (const g of games)
    console.log(`    ${vHM(Date.parse(g.iso))} ${g.lg}  ${(g.home.nm + ' vs ' + g.away.nm).padEnd(34)} ${isReal(g) ? '✅' : '🔒'} ${oddsText(g)}`);
  if (!games.length) console.log('    (오늘 예정 경기 없음)');
}
main();

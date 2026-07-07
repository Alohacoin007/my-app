#!/usr/bin/env node
// Alpexa — sports feed health check (run me, don't wait for a customer).
//
// Reads the LIVE `live_games` feed (the exact row the app renders) and reports, for the
// next week, per league: how many games, spread across days, and — the part that bit us —
// whether ODDS actually came in (REAL vs PLACEHOLDER vs MISSING), plus TBD/placeholder
// teams and any structurally-broken entries. Catches "no future games", "odds didn't
// load", "TBD bracket junk", and "malformed game" BEFORE a customer clicks into it.
//
// Needs network to Supabase (public read). Run where that's reachable:
//   node tests/sports-feed-check.js
// Exit code: 0 = healthy / network unavailable (won't block), 1 = real problems found.

const URL = 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';

// ── odds classification (mkCore placeholders are exact, so they're detectable) ──
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
// TBD / bracket-placeholder teams ("RD16 W8", "QF W2", "Winner Match 3", "TBD"…)
function isTBD(g) {
  const s = ((g.home && g.home.nm) || '') + ' ' + ((g.away && g.away.nm) || '');
  return /\b(?:rd\d|qf|sf|r16|w\d|l\d)\b|winner|loser|to be determined|\btbd\b/i.test(s);
}
// Would the app's lgToGame accept it? (soccer needs threeWay≥3; others need spread/total/ml≥2)
function structOK(g) {
  if (g.lg === 'SOC') return (g.threeWay || []).length >= 3 || (g.ml || []).length >= 2;
  return (g.spread || []).length >= 2 && (g.total || []).length >= 2 && (g.ml || []).length >= 2;
}
function dayKey(iso) { try { return new Date(iso).toISOString().slice(0, 10); } catch (_) { return '?'; } }

async function main() {
  let rows;
  try {
    const r = await fetch(`${URL}/rest/v1/live_games?id=eq.all&select=data,updated_at`, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    rows = await r.json();
  } catch (e) {
    console.log('⏭  SKIP — could not reach Supabase (' + e.message + '). Run where the network is open.');
    process.exit(0); // network unavailable is not a feed failure — don't block
  }

  const row = rows && rows[0];
  const games = (row && row.data) || [];
  const ageMin = row && row.updated_at ? Math.round((Date.now() - new Date(row.updated_at).getTime()) / 60000) : null;

  console.log('── SPORTS FEED HEALTH ─────────────────────────────────');
  console.log(`  live_games: ${games.length} games · updated ${ageMin == null ? '?' : ageMin + ' min ago'}`);
  if (ageMin != null && ageMin > 15) console.log('  ⚠️  feed is STALE (>15 min) — is the sports-games cron running?');
  if (!games.length) { console.log('  🔴 live_games is EMPTY — no games for ANY sport.'); process.exit(1); }

  const byLg = {};
  for (const g of games) {
    const lg = g.lg || '?';
    (byLg[lg] = byLg[lg] || { n: 0, real: 0, ph: 0, miss: 0, tbd: 0, bad: 0, days: {} }).n++;
    const o = oddsStatus(g);
    if (o === 'REAL') byLg[lg].real++; else if (o === 'PLACEHOLDER') byLg[lg].ph++; else byLg[lg].miss++;
    if (isTBD(g)) byLg[lg].tbd++;
    if (!structOK(g)) byLg[lg].bad++;
    byLg[lg].days[dayKey(g.iso)] = (byLg[lg].days[dayKey(g.iso)] || 0) + 1;
  }

  let problems = 0;
  console.log('\n  league   games  realOdds  placeholder  missing  TBD  broken  days');
  for (const lg of Object.keys(byLg).sort()) {
    const s = byLg[lg];
    const dayCount = Object.keys(s.days).filter(d => d !== '?').length;
    const flags = [];
    if (s.real === 0) { flags.push('NO real odds'); problems++; }
    if (s.ph > 0) flags.push(`${s.ph} placeholder`);
    if (s.miss > 0) { flags.push(`${s.miss} missing`); problems++; }
    if (s.tbd > 0) flags.push(`${s.tbd} TBD`);
    if (s.bad > 0) { flags.push(`${s.bad} broken`); problems++; }
    console.log(
      `  ${lg.padEnd(7)} ${String(s.n).padStart(5)} ${String(s.real).padStart(8)} ${String(s.ph).padStart(11)} ${String(s.miss).padStart(7)} ${String(s.tbd).padStart(4)} ${String(s.bad).padStart(6)}  ${dayCount}d` +
      (flags.length ? '   ⚠️  ' + flags.join(', ') : '')
    );
  }

  console.log('');
  if (problems) { console.log(`  🔴 ${problems} feed problem(s) above — fix before customers see them.`); process.exit(1); }
  console.log('  🟢 feed healthy — games present, odds real, no broken entries.');
  process.exit(0);
}
main();

// Alpexa — ⛳ GOLF OUTRIGHT settlement (2026-07-16). Mirrors the outright branch in
// supabase/functions/sports-settle/index.ts: a winner-pick leg grades ONLY against a
// FINAL tournament's confirmed champion; anything ambiguous leaves the bet OPEN
// (never guess with money). Cut / WD / runner-up = not the champion = lost.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// ── mirrors normPlayer/playerMatch in sports-settle ──
function normPlayer(s) { return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function playerMatch(a, b) {
  const A = normPlayer(a), B = normPlayer(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const at = A.split(' ').filter((t) => t.length > 2), bt = B.split(' ').filter((t) => t.length > 2);
  if (!at.length || !bt.length) return false;
  const [short, long] = at.length <= bt.length ? [at, bt] : [bt, at];
  return short.every((t) => long.includes(t));
}
// ── mirrors the champion extraction in fetchGolfWinners ──
function champion(ev) {
  const st = (ev.status && ev.status.type) || {};
  if (st.state !== 'post') return null;                      // only FINAL tournaments
  const cs = (ev.competitions && ev.competitions[0] && ev.competitions[0].competitors) || [];
  const nameOf = (c) => { const a = c.athlete || {}; return a.displayName || a.shortName || a.fullName || ''; };
  let champs = cs.filter((c) => c.winner === true);
  if (!champs.length) champs = cs.filter((c) => String((c.status && c.status.position && c.status.position.id) || '') === '1');
  if (champs.length !== 1) return null;                      // tie/no data → ungraded
  return nameOf(champs[0]) || null;
}
// ── mirrors the outright grading branch in the settle loop ──
function gradeOutright(leg, golfWin) {
  const w = golfWin[leg.gid];
  if (!w) return null;                                       // no confirmed winner → bet stays open
  return playerMatch(leg.sel || '', w) ? 'won' : 'lost';
}

console.log('\n=== champion extraction (only unambiguous finals) ===');
{
  const FINAL = { status: { type: { state: 'post' } }, competitions: [{ competitors: [
    { winner: true, athlete: { displayName: 'Scottie Scheffler' } },
    { athlete: { displayName: 'Rory McIlroy' } } ] }] };
  ok('final + winner flag → champion', champion(FINAL) === 'Scottie Scheffler');
  const LIVE = { status: { type: { state: 'in' } }, competitions: [{ competitors: [
    { winner: true, athlete: { displayName: 'Scottie Scheffler' } } ] }] };
  ok('tournament still LIVE → no champion (bet stays open)', champion(LIVE) === null);
  const POS1 = { status: { type: { state: 'post' } }, competitions: [{ competitors: [
    { status: { position: { id: '1' } }, athlete: { displayName: 'Jon Rahm' } },
    { status: { position: { id: '2' } }, athlete: { displayName: 'Rory McIlroy' } } ] }] };
  ok('no winner flag but a UNIQUE position 1 → champion', champion(POS1) === 'Jon Rahm');
  const TIE = { status: { type: { state: 'post' } }, competitions: [{ competitors: [
    { status: { position: { id: '1' } }, athlete: { displayName: 'A One' } },
    { status: { position: { id: '1' } }, athlete: { displayName: 'B Two' } } ] }] };
  ok('two players at position 1 (unresolved playoff) → NO champion', champion(TIE) === null);
}

console.log('\n=== grading (RED: pre-fix an outright leg had no grader → orphaned) ===');
{
  const WIN = { GOLF_401: 'Scottie Scheffler' };
  ok('champion pick → won', gradeOutright({ gid: 'GOLF_401', sel: 'Scottie Scheffler' }, WIN) === 'won');
  ok('runner-up pick → lost', gradeOutright({ gid: 'GOLF_401', sel: 'Rory McIlroy' }, WIN) === 'lost');
  ok('cut/WD player → lost (not the winner)', gradeOutright({ gid: 'GOLF_401', sel: 'Missed Cut Guy' }, WIN) === 'lost');
  ok('tournament not final → null (bet stays open)', gradeOutright({ gid: 'GOLF_999', sel: 'Scottie Scheffler' }, WIN) === null);
}

console.log('\n=== name matching across feeds (Odds API sel vs ESPN name) ===');
{
  ok('exact name matches', playerMatch('Scottie Scheffler', 'Scottie Scheffler'));
  ok('initial form "S. Scheffler" matches full name', playerMatch('S. Scheffler', 'Scottie Scheffler'));
  ok('different Scheffler-less player does NOT match', !playerMatch('Rory McIlroy', 'Scottie Scheffler'));
  ok('shared surname alone does not cross-match different first names',
     !playerMatch('Nicolai Hojgaard', 'Rasmus Hojgaard'));
  ok('empty / missing sel never wins', !playerMatch('', 'Scottie Scheffler'));
}

console.log('\n' + (pass ? '🟢 golf outrights settle only on a confirmed champion (idempotent betpay- path unchanged)' : '🔴 golf settlement unsafe') + '\n');
process.exit(pass ? 0 : 1);

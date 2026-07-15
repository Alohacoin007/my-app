// Alpexa — odds team-name matching (RED→GREEN). #odds-coverage
//
// nick() (last word) silently dropped REAL soccer odds because club feeds differ:
// ESPN "Vancouver" vs The Odds API "Vancouver Whitecaps FC" → last words don't match,
// so 4 soccer games sat LOCKED while real lines existed (lost revenue). teamMatch()
// strips club suffixes and requires the shorter name's significant tokens to be a subset
// of the longer — recovering those while NOT cross-matching different teams.
//
// Mirrors normNm/sigToks/teamMatch + the overlay's unique-match rule in
// supabase/functions/sports-games/index.ts.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

const normNm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(fc|sc|cf|afc|ac|sd|cd)\b/g, ' ').replace(/\s+/g, ' ').trim();
const sigToks = (s) => normNm(s).split(' ').filter((t) => t.length > 2);
function teamMatch(a, b) {
  const A = sigToks(a), B = sigToks(b);
  if (!A.length || !B.length) return false;
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  return short.every((t) => long.includes(t));
}

console.log('\n=== GREEN: soccer club names now match (the 4 that were wrongly locked) ===');
ok('Vancouver ⇄ Vancouver Whitecaps FC', teamMatch('Vancouver Whitecaps FC', 'Vancouver'));
ok('Kansas City ⇄ Sporting Kansas City', teamMatch('Sporting Kansas City', 'Kansas City'));
ok('St. Louis ⇄ St. Louis City SC', teamMatch('St. Louis City SC', 'St. Louis'));
ok('Seattle ⇄ Seattle Sounders FC', teamMatch('Seattle Sounders FC', 'Seattle'));
ok('Coventry ⇄ Coventry City', teamMatch('Coventry City', 'Coventry'));

console.log('\n=== GREEN: US sports (nicknames) still match ===');
ok('Reds ⇄ Cincinnati Reds', teamMatch('Cincinnati Reds', 'Reds'));
ok('Yankees ⇄ New York Yankees', teamMatch('New York Yankees', 'Yankees'));

console.log('\n=== RED→GREEN: must NOT cross-match different teams ===');
ok('Red Sox ⇏ Chicago White Sox', !teamMatch('Chicago White Sox', 'Red Sox'));
ok('Yankees ⇏ Mets (both New York)', !teamMatch('New York Yankees', 'New York Mets'));
ok('Man United ⇏ Man City is not asserted here; City token differs', !teamMatch('Manchester United', 'Manchester City'));
ok('empty name → no match', !teamMatch('', 'Arsenal'));

// Unique-match rule the overlay enforces: if two events both match, attach NOTHING (lock).
function uniqueEvent(events, home, away) {
  const hits = events.filter((e) => (teamMatch(e.h, home) && teamMatch(e.a, away)) || (teamMatch(e.h, away) && teamMatch(e.a, home)));
  return hits.length === 1 ? hits[0] : null;
}
console.log('\n=== SAFETY: ambiguous (2 possible events) → attach nothing (stay locked) ===');
{
  const evs = [{ h: 'Arsenal', a: 'Coventry City' }, { h: 'Arsenal', a: 'Coventry City' }];
  ok('two identical matches → null (locked, not wrong odds)', uniqueEvent(evs, 'Coventry', 'Arsenal') === null);
  const one = [{ h: 'Arsenal', a: 'Coventry City' }, { h: 'Chelsea', a: 'Fulham' }];
  ok('exactly one match → that event', uniqueEvent(one, 'Coventry', 'Arsenal') && uniqueEvent(one, 'Coventry', 'Arsenal').h === 'Arsenal');
}

console.log('\n' + (pass ? '🟢 team matching recovers soccer odds without cross-matching' : '🔴 matcher broken') + '\n');
process.exit(pass ? 0 : 1);

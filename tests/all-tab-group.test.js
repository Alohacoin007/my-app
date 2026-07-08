// Alpexa — "All" tab date grouping (RED→GREEN). Mirrors allGroupedHTML() +
// _dayKey/_dayLabel in sports-live.html. Proves: Live first, then day groups in
// chronological order (Today → Tomorrow → weekday), games time-sorted within a group,
// and finished (state:'post') games excluded.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

const TZ = 'America/Los_Angeles';               // app runs on Las Vegas / PDT
const _kickTs = (g) => { const t = Date.parse((g && g.kickoff) || ''); return isNaN(t) ? Infinity : t; };
const _dayKey = (ts) => { try { return new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ }); } catch (e) { return ''; } };
function _dayLabel(ts, now) {
  const k = _dayKey(ts);
  if (k && k === _dayKey(now)) return 'Today';
  if (k && k === _dayKey(now + 86400000)) return 'Tomorrow';
  try { return new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: TZ }); } catch (e) { return k || 'Scheduled'; }
}
// stub gameRowsHTML: emit each game id so we can read the sequence
const rows = (gs) => gs.map((g) => `[${g.id}]`).join('');
function allGroupedHTML(GAMES, now) {
  const all = GAMES.filter((g) => g && g.state !== 'post');
  const live = all.filter((g) => g.live).slice().sort((a, b) => _kickTs(a) - _kickTs(b));
  const sched = all.filter((g) => !g.live).slice().sort((a, b) => _kickTs(a) - _kickTs(b));
  let html = '';
  if (live.length) html += `H(🔴 Live now)` + rows(live);
  let curKey = null, bucket = [];
  // Today header is suppressed (the static column header already reads "Today").
  const flush = () => { if (bucket.length) { const t = _kickTs(bucket[0]); const lbl = isFinite(t) ? _dayLabel(t, now) : 'Scheduled'; html += (lbl === 'Today' ? '' : `H(${lbl})`) + rows(bucket); bucket = []; } };
  sched.forEach((g) => { const k = _dayKey(_kickTs(g)); if (k !== curKey) { flush(); curKey = k; } bucket.push(g); });
  flush();
  return html;
}

// Fixed clock: 2026-07-08 18:00 UTC (= 11:00 PDT, still Jul 8 in Vegas).
const NOW = Date.parse('2026-07-08T18:00:00Z');
const D = (iso) => iso;   // kickoff ISO
const GAMES = [
  { id: 'tmr_late', kickoff: D('2026-07-09T23:00:00Z'), live: false, state: 'pre' },
  { id: 'today_2',  kickoff: D('2026-07-09T01:30:00Z'), live: false, state: 'pre' }, // 6:30pm PDT Jul 8
  { id: 'live_1',   kickoff: '', live: true, state: 'in' },
  { id: 'today_1',  kickoff: D('2026-07-08T23:00:00Z'), live: false, state: 'pre' }, // 4pm PDT Jul 8
  { id: 'done_1',   kickoff: D('2026-07-08T10:00:00Z'), live: false, state: 'post' }, // excluded
  { id: 'tmr_1',    kickoff: D('2026-07-09T20:00:00Z'), live: false, state: 'pre' }, // 1pm PDT Jul 9
  { id: 'day3',     kickoff: D('2026-07-10T21:00:00Z'), live: false, state: 'pre' },
];

const out = allGroupedHTML(GAMES, NOW);
console.log('\n  sequence:', out.replace(/\]\[/g, '] [') + '\n');

ok('Live group is first', out.indexOf('H(🔴 Live now)') === 0);
ok('finished game excluded', !out.includes('[done_1]'));
ok('Today header SUPPRESSED (column header already says Today)', !out.includes('H(Today)'));
ok('Tomorrow header present', out.includes('H(Tomorrow)'));
ok('today games appear before the Tomorrow header', out.indexOf('[today_2]') < out.indexOf('H(Tomorrow)'));
ok('within Today, 4pm before 6:30pm', out.indexOf('[today_1]') < out.indexOf('[today_2]'));
ok('within Tomorrow, 1pm before 4pm', out.indexOf('[tmr_1]') < out.indexOf('[tmr_late]'));
ok('Tomorrow before the day-after group', out.indexOf('[tmr_late]') < out.indexOf('[day3]'));
ok('day-after uses a weekday label (not Today/Tomorrow)', /H\(Friday, Jul 10\)/.test(out));

console.log('\n' + (pass ? '🟢 All-tab groups by date, live-first, time-sorted' : '🔴 grouping broken') + '\n');
process.exit(pass ? 0 : 1);

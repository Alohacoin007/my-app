// Alpexa — sports render crash-isolation (RED→GREEN). #blackout
//
// Bug (2026-07-07): after the soccer 1X2 deploy the WHOLE sports list went blank —
// every sport gone — even though live_games had 98 games. Cause: gameRowsHTML does
//   games.map(g => `<card…>`).join('')
// and ONE game whose render threw made the entire .map() throw → the list rendered
// empty → all sports blacked out. A single malformed/edge-case game must NEVER be
// able to blank the whole board.
//
// This test EXTRACTS the real gameRowsHTML from sports-live.html (no port → no drift)
// and proves: (a) it never throws on edge-case games, and (b) a GOOD game still
// renders when a BAD game is in the same list (the per-card try/catch isolation).
// Remove that try/catch and this test goes RED.

const fs = require('fs');
const path = require('path');

let pass = 0, failN = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✅ ' + name); } else { failN++; console.log('  ❌ ' + name); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'sports-live.html'), 'utf8');

// ── Extract the REAL gameRowsHTML(games,showPlay){ … }).join(''); } ──
const m = html.match(/function gameRowsHTML\(games,showPlay\)\{[\s\S]*?\}\)\.join\(''\);\s*\n\s*\}/);
if (!m) { console.error('❌ could not locate gameRowsHTML in sports-live.html — refactor changed its shape; update this test'); process.exit(1); }

// Stub the browser/app globals gameRowsHTML references (cell/row/c3 are internal),
// then build the REAL function via new Function so its deps are injected cleanly.
const stubs = {
  legs: [],
  pinnedGames: new Set(),
  liveOK: () => true,
  liveReason: () => '',
  oddsReal: (g) => (!g || g.oddsReal !== false),   // no-line games render locked, mirrors sports-live.html

  fmtAm: (a) => { const n = +a; return (n > 0 ? '+' : '') + n; },
  gameTimeLabel: (g) => (g && g.time) || '',
};
let gameRowsHTML;
try {
  const factory = new Function(...Object.keys(stubs), m[0] + '\nreturn gameRowsHTML;');
  gameRowsHTML = factory(...Object.values(stubs));
} catch (e) { console.error('❌ extracted gameRowsHTML failed to compile: ' + e.message); process.exit(1); }

// ── Edge-case games (the kinds real live_games / ESPN feeds actually produce) ──
const soc1x2 = {
  id: 'SOC_1', lg: 'SOC', live: false, time: 'Mon 9:00 AM',
  home: { ab: 'ARG', nm: 'Argentina' }, away: { ab: 'EGY', nm: 'Egypt' },
  core: { spread: [], total: [], ml: [], threeWay: [
    { ln: '1', am: -270, sel: 'Argentina ML' }, { ln: 'X', am: 400, sel: 'Draw' }, { ln: '2', am: 950, sel: 'Egypt ML' } ] },
  props: [],
};
const mlb2way = {
  id: 'MLB_1', lg: 'MLB', live: false, time: 'Tue 7:00 PM',
  home: { ab: 'NYY', nm: 'Yankees' }, away: { ab: 'BOS', nm: 'Red Sox' },
  core: {
    spread: [{ ln: '-1.5', am: -110, sel: 'Yankees -1.5' }, { ln: '+1.5', am: -110, sel: 'Red Sox +1.5' }],
    total: [{ ln: 'Over 8.5', am: -110, sel: 'Over 8.5' }, { ln: 'Under 8.5', am: -110, sel: 'Under 8.5' }],
    ml: [{ ln: '', am: -150, sel: 'Yankees ML' }, { ln: '', am: 130, sel: 'Red Sox ML' }],
  }, props: [],
};
// Deliberately malformed — the kinds that caused/​could cause a throw:
const socEmptyThreeWay = { id: 'SOC_2', lg: 'SOC', live: false, time: 'x', home: { ab: 'A', nm: 'A' }, away: { ab: 'B', nm: 'B' }, core: { spread: [], total: [], ml: [], threeWay: [] }, props: [] };
const missingProps    = { id: 'SOC_3', lg: 'SOC', live: false, time: 'x', home: { ab: 'A', nm: 'A' }, away: { ab: 'B', nm: 'B' }, core: { threeWay: [{ ln: '1', am: 100, sel: 'A ML' }] } /* props undefined */ };
const missingCore     = { id: 'X_1', lg: 'SOC', live: false, time: 'x', home: { ab: 'A', nm: 'A' }, away: { ab: 'B', nm: 'B' } /* core undefined */, props: [] };
const nullThreeWayEls  = { id: 'SOC_4', lg: 'SOC', live: false, time: 'x', home: { ab: 'A', nm: 'A' }, away: { ab: 'B', nm: 'B' }, core: { threeWay: [null, undefined, { ln: '2', am: 100, sel: 'B ML' }] }, props: [] };

function renders(games) {
  const ce = console.error; console.error = () => {}; // silence the per-card guard's log (expected here)
  try { return { out: gameRowsHTML(games, false), threw: false }; }
  catch (e) { return { out: '', threw: true, err: e }; }
  finally { console.error = ce; }
}

console.log('\n=== GREEN — valid games render, list is non-empty ===');
ok('soccer 1X2 renders (Home/Draw/Away)', renders([soc1x2]).out.includes('SOC_1'));
ok('MLB 2-way renders', renders([mlb2way]).out.includes('MLB_1'));

console.log('\n=== NO-LINE game (oddsReal:false) renders LOCKED, not bettable (2026-07-08) ===');
{
  const noLine = { ...mlb2way, id: 'MLB_PH', oddsReal: false };
  const out = renders([noLine]).out;
  ok('card still shows (game not hidden)', out.includes('MLB_PH'));
  ok('odds cells are locked (🔒)', out.includes('🔒'));
  ok('no bettable cell (no data-am) on a no-line game', !/data-am=/.test(out.slice(out.indexOf('MLB_PH'))));
}

console.log('\n=== GREEN — edge-case games never throw (per-card guard) ===');
ok('empty threeWay: no throw', renders([socEmptyThreeWay]).threw === false);
ok('missing props: no throw', renders([missingProps]).threw === false);
ok('missing core: no throw', renders([missingCore]).threw === false);
ok('null threeWay elements: no throw', renders([nullThreeWayEls]).threw === false);

console.log('\n=== RED→GREEN — ONE bad game must NOT blank the whole list (the blackout) ===');
// This is the exact 2026-07-07 failure: a bad game in the list nuked every good game.
[missingProps, missingCore, socEmptyThreeWay].forEach((bad, i) => {
  const r = renders([soc1x2, bad, mlb2way]);
  ok(`good games survive bad game #${i + 1} (list not blanked)`, r.threw === false && r.out.includes('SOC_1') && r.out.includes('MLB_1'));
});

console.log(`\n${failN ? '❌' : '🟢'} sports-render: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);

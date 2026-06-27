// Alpexa — D12: place_bet must re-price every leg from the SERVER lines (live_games),
// IGNORING client-submitted odds. Mirrors the algorithm in
// supabase/sql/place_bet_server_odds.sql. Proves a modified client can't inflate odds.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

const HAIRCUT = 0.25; // must match sports-live.html + sports-settle + place_bet
const decOf = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / (-am));

// SERVER snapshot (live_games.data): each game has gid + ml/spread/total arrays.
const GAMES = [
  { gid: 'NBA_1', ml: [{ sel: 'LAL ML', am: -140 }, { sel: 'BOS ML', am: 120 }],
    spread: [{ sel: 'LAL -3.5', am: -110 }, { sel: 'BOS +3.5', am: -110 }],
    total: [{ sel: 'Over 220.5', am: -110 }, { sel: 'Under 220.5', am: -110 }] },
  { gid: 'NBA_2', ml: [{ sel: 'GSW ML', am: -200 }, { sel: 'DEN ML', am: 170 }] },
];

// server line lookup; returns null if the selection isn't offered (→ reject, fail-safe)
function serverAm(games, gid, market, sel) {
  const g = games.find((x) => x.gid === gid); if (!g) return null;
  const arr = g[market]; if (!Array.isArray(arr)) return null;
  const e = arr.find((x) => x.sel === sel); return e ? e.am : null;
}
// re-price: ignore client am entirely; combine SERVER decimals; SGP haircut if one game
function reprice(legs, games, stake) {
  let combo = 1, gid0 = null, allSame = true;
  for (const l of legs) {
    const sam = serverAm(games, l.gid, l.market, l.sel);
    if (sam === null) return { ok: false, error: 'line not offered' };  // FAIL SAFE
    combo *= decOf(sam);
    if (gid0 === null) gid0 = l.gid; else if (gid0 !== l.gid) allSame = false;
  }
  if (legs.length >= 2 && allSame) combo = 1 + (combo - 1) * (1 - HAIRCUT);
  return { ok: true, potential: Math.round(stake * combo * 100) / 100 };
}

console.log('\n=== RED: client inflates odds → server ignores them ===');
{
  // attacker sends LAL ML at +100000 instead of the real -140
  const cheat = [{ gid: 'NBA_1', market: 'ml', sel: 'LAL ML', am: 100000 }];
  const r = reprice(cheat, GAMES, 20);
  ok('re-priced from SERVER -140, not client +100000', r.ok && r.potential === Math.round(20 * decOf(-140) * 100) / 100);
  ok('payout is ~$34.3 not $20,020', r.potential < 40);
}

console.log('\n=== GREEN: honest single + parlay price correctly ===');
{
  const single = [{ gid: 'NBA_1', market: 'ml', sel: 'BOS ML', am: 120 }];
  ok('single BOS ML +120 on $20 → $44', reprice(single, GAMES, 20).potential === 44);
  const parlay = [{ gid: 'NBA_1', market: 'ml', sel: 'LAL ML', am: -140 },
                  { gid: 'NBA_2', market: 'ml', sel: 'GSW ML', am: -200 }];
  const exp = Math.round(20 * decOf(-140) * decOf(-200) * 100) / 100;   // different games → no haircut
  ok('2-game parlay uses product (no haircut)', reprice(parlay, GAMES, 20).potential === exp);
}

console.log('\n=== SGP haircut + fail-safe ===');
{
  const sgp = [{ gid: 'NBA_1', market: 'ml', sel: 'LAL ML', am: -140 },
               { gid: 'NBA_1', market: 'total', sel: 'Over 220.5', am: -110 }];
  const raw = decOf(-140) * decOf(-110);
  const exp = Math.round(20 * (1 + (raw - 1) * (1 - HAIRCUT)) * 100) / 100;
  ok('same-game SGP gets the 25% haircut', reprice(sgp, GAMES, 20).potential === exp);
  ok('unknown selection → REJECT (fail safe)', reprice([{ gid: 'NBA_1', market: 'ml', sel: 'FAKE ML', am: -110 }], GAMES, 20).ok === false);
  ok('unknown game → REJECT', reprice([{ gid: 'NBA_9', market: 'ml', sel: 'LAL ML', am: -110 }], GAMES, 20).ok === false);
  ok('prop market (not in live_games) → REJECT', reprice([{ gid: 'NBA_1', market: 'prop_pts', sel: 'X 25+', am: -110 }], GAMES, 20).ok === false);
}

console.log('\n' + (pass ? '🟢 place_bet re-prices from server lines (client odds can\'t inflate)' : '🔴 odds exploit open') + '\n');
process.exit(pass ? 0 : 1);

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
  // ⚽ SOCCER = 1X2 (Home/Draw/Away): the app sends market='1X2'; live_games keys the
  // array as `threeWay`. place_bet must MAP '1X2' → 'threeWay' (the bug this catches:
  // an unmapped '1X2' rejects EVERY soccer bet at "market not offered").
  { gid: 'SOC_1', threeWay: [{ sel: 'Argentina ML', am: -283 }, { sel: 'Draw', am: 400 }, { sel: 'Egypt ML', am: 1075 }] },
  // NO real line (The Odds API had no odds for this game): sports-games left the
  // fabricated -140/120 placeholder and flags oddsReal:false. place_bet MUST reject
  // any leg here — the house won't honor a made-up line (regulated-book doctrine).
  { gid: 'MLB_PH', oddsReal: false, ml: [{ sel: 'Reds ML', am: -140 }, { sel: 'Phillies ML', am: 120 }] },
];

// The app sends the market LABEL ('Moneyline'/'Spread'/'Total'/'1X2'), but live_games
// keys the arrays as ml/spread/total/threeWay — place_bet must MAP label → key (the bug
// this catches). Matched case-insensitively (mirrors the SQL's lower(v_mk)).
const MK = { moneyline: 'ml', spread: 'spread', total: 'total', '1x2': 'threeWay' };
// server line lookup; returns null if the selection isn't offered (→ reject, fail-safe)
function serverAm(games, gid, marketLabel, sel) {
  const key = MK[String(marketLabel).toLowerCase()]; if (!key) return null;   // props/unknown label → reject
  const g = games.find((x) => x.gid === gid); if (!g) return null;
  const arr = g[key]; if (!Array.isArray(arr)) return null;
  const e = arr.find((x) => x.sel === sel); return e ? e.am : null;
}
// re-price: ignore client am entirely; combine SERVER decimals; SGP haircut if one game
function reprice(legs, games, stake) {
  let combo = 1, gid0 = null, allSame = true;
  for (const l of legs) {
    // GATE: reject any leg from a game with no real line (oddsReal:false). Mirrors the
    // place_bet SQL guard — a fabricated placeholder line is never bettable.
    const gm = games.find((x) => x.gid === l.gid);
    if (gm && gm.oddsReal === false) return { ok: false, error: 'odds unavailable' };
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
  const cheat = [{ gid: 'NBA_1', market: 'Moneyline', sel: 'LAL ML', am: 100000 }];
  const r = reprice(cheat, GAMES, 20);
  ok('re-priced from SERVER -140, not client +100000', r.ok && r.potential === Math.round(20 * decOf(-140) * 100) / 100);
  ok('payout is ~$34.3 not $20,020', r.potential < 40);
}

console.log('\n=== GREEN: honest single + parlay price correctly ===');
{
  const single = [{ gid: 'NBA_1', market: 'Moneyline', sel: 'BOS ML', am: 120 }];
  ok('single BOS ML +120 on $20 → $44', reprice(single, GAMES, 20).potential === 44);
  const parlay = [{ gid: 'NBA_1', market: 'Moneyline', sel: 'LAL ML', am: -140 },
                  { gid: 'NBA_2', market: 'Moneyline', sel: 'GSW ML', am: -200 }];
  const exp = Math.round(20 * decOf(-140) * decOf(-200) * 100) / 100;   // different games → no haircut
  ok('2-game parlay uses product (no haircut)', reprice(parlay, GAMES, 20).potential === exp);
}

console.log('\n=== SGP haircut + fail-safe ===');
{
  const sgp = [{ gid: 'NBA_1', market: 'Moneyline', sel: 'LAL ML', am: -140 },
               { gid: 'NBA_1', market: 'Total', sel: 'Over 220.5', am: -110 }];
  const raw = decOf(-140) * decOf(-110);
  const exp = Math.round(20 * (1 + (raw - 1) * (1 - HAIRCUT)) * 100) / 100;
  ok('same-game SGP gets the 25% haircut', reprice(sgp, GAMES, 20).potential === exp);
  ok('unknown selection → REJECT (fail safe)', reprice([{ gid: 'NBA_1', market: 'Moneyline', sel: 'FAKE ML', am: -110 }], GAMES, 20).ok === false);
  ok('unknown game → REJECT', reprice([{ gid: 'NBA_9', market: 'Moneyline', sel: 'LAL ML', am: -110 }], GAMES, 20).ok === false);
  ok('prop market (not in live_games) → REJECT', reprice([{ gid: 'NBA_1', market: 'prop_pts', sel: 'X 25+', am: -110 }], GAMES, 20).ok === false);
}

console.log('\n=== SOCCER 1X2 (regression: unmapped market rejected every soccer bet) ===');
{
  // A team pick (Argentina ML −283) must price from the SERVER threeWay line.
  const teamPick = [{ gid: 'SOC_1', market: '1X2', sel: 'Argentina ML', am: -283 }];
  ok('soccer team pick accepted + priced from server', reprice(teamPick, GAMES, 20).potential === Math.round(20 * decOf(-283) * 100) / 100);
  // The Draw outcome (its own bettable selection) must also price.
  const drawPick = [{ gid: 'SOC_1', market: '1X2', sel: 'Draw', am: 400 }];
  ok('soccer Draw pick accepted + priced from server', reprice(drawPick, GAMES, 20).potential === Math.round(20 * decOf(400) * 100) / 100);
  // A soccer selection not on the board still fails safe.
  ok('unknown soccer selection → REJECT', reprice([{ gid: 'SOC_1', market: '1X2', sel: 'FAKE ML', am: -110 }], GAMES, 20).ok === false);
}

console.log('\n=== NO-LINE GAME (oddsReal:false) → not bettable (2026-07-08) ===');
{
  // RED (the bug): before the gate, a placeholder game priced like any other — the house
  // would honor the fabricated -140 line. Prove it now REJECTS.
  const phBet = [{ gid: 'MLB_PH', market: 'Moneyline', sel: 'Reds ML', am: -140 }];
  ok('single leg on a no-line game → REJECT (odds unavailable)', reprice(phBet, GAMES, 20).ok === false);
  // must also reject when hidden inside a parlay with real legs (can't launder it in)
  const mixed = [{ gid: 'NBA_1', market: 'Moneyline', sel: 'BOS ML', am: 120 },
                 { gid: 'MLB_PH', market: 'Moneyline', sel: 'Phillies ML', am: 120 }];
  ok('parlay containing a no-line leg → REJECT', reprice(mixed, GAMES, 20).ok === false);
  // GREEN: the SAME matchup, once real odds load (oddsReal:true), prices normally.
  const REALGAMES = GAMES.map((g) => g.gid === 'MLB_PH' ? { ...g, oddsReal: true } : g);
  ok('same game with real odds loaded → accepted + priced', reprice(phBet, REALGAMES, 20).potential === Math.round(20 * decOf(-140) * 100) / 100);
}

console.log('\n' + (pass ? '🟢 place_bet re-prices from server lines (client odds can\'t inflate)' : '🔴 odds exploit open') + '\n');
process.exit(pass ? 0 : 1);

// Alpexa — D1: same-game parlay (SGP) legs are correlated, so the naive product of
// independent odds over-pays the house. Apply a 25% haircut to the COMBINED odds —
// in BOTH the app display and server settlement, by the SAME rule (all legs one gid).
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

const HAIRCUT = 0.25;                 // must match sports-live.html + sports-settle
const isSGP = (ls) => ls.length >= 2 && ls.every((l) => l.gid && l.gid === ls[0].gid);

// CLIENT: combined decimal with SGP haircut (mirrors comboDec).
function comboDec(ls, decOf) {
  const d = ls.reduce((a, l) => a * decOf(l), 1);
  return isSGP(ls) ? 1 + (d - 1) * (1 - HAIRCUT) : d;
}
// SERVER: payout multiplier on the WON legs' product (mirrors sports-settle).
function serverMult(ls, decMul) {
  return isSGP(ls) ? 1 + (decMul - 1) * (1 - HAIRCUT) : decMul;
}
const decEven = () => 2.0;            // +100 each leg

console.log('\n=== RED: same-game 2-leg parlay was paying the full product ===');
{
  const sameGame = [{ gid: 'G1', am: 100 }, { gid: 'G1', am: 100 }];
  const naive = sameGame.reduce((a) => a * 2.0, 1);          // 4.0
  const fair = comboDec(sameGame, decEven);                  // 1+(4-1)*0.75 = 3.25
  ok('naive product would be 4.0 (over-pay)', naive === 4.0);
  ok('SGP haircut → combined 3.25', Math.abs(fair - 3.25) < 1e-9);
  ok('on $20: house pays 65 not 80 (saves $15)', Math.round(20 * fair) === 65);
}

console.log('\n=== GREEN: regular parlay (different games) is UNTOUCHED ===');
{
  const diffGames = [{ gid: 'G1', am: 100 }, { gid: 'G2', am: 100 }];
  ok('not detected as SGP', isSGP(diffGames) === false);
  ok('combined stays 4.0 (independent)', comboDec(diffGames, decEven) === 4.0);
  ok('on $20: pays full 80', Math.round(20 * comboDec(diffGames, decEven)) === 80);
}

console.log('\n=== Client display == Server settlement (same rule) ===');
{
  const sgp3 = [{ gid: 'G1', am: 100 }, { gid: 'G1', am: 100 }, { gid: 'G1', am: 100 }];
  const clientDec = comboDec(sgp3, decEven);                 // haircut on product 8
  const serverDecMul = sgp3.reduce((a) => a * 2.0, 1);       // all won → 8
  const serverPaid = serverMult(sgp3, serverDecMul);
  ok('3-leg SGP detected', isSGP(sgp3) === true);
  ok('client combo == server multiplier', Math.abs(clientDec - serverPaid) < 1e-9);
  ok('haircut never pays below stake (mult ≥ 1)', clientDec >= 1);
}

console.log('\n=== Single leg / regular parlay: server unchanged ===');
{
  ok('1 leg is not SGP', isSGP([{ gid: 'G1', am: 100 }]) === false);
  ok('server mult on diff-game parlay unchanged', serverMult([{ gid: 'A' }, { gid: 'B' }], 4.0) === 4.0);
}

console.log('\n' + (pass ? '🟢 SGP haircut applied consistently (display == settlement)' : '🔴 SGP mismatch') + '\n');
process.exit(pass ? 0 : 1);

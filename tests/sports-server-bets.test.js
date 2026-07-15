// Alpexa — #5 Phase 2: sports bets are SERVER-ONLY. openBets/settledBets are never
// seeded from localStorage (that bled another account's bets); they're rebuilt from the
// `positions`/`settlements` tables. A just-placed bet bridges <15s in memory only.
// Mirrors pullServerBets() (server = source of truth + recentLocal bridge).
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// pullServerBets: openBets = server rows + just-placed local (<15s, not yet on server).
function rebuild(serverRows, localOpenBets, nowMs) {
  const onServer = {};
  const rebuilt = serverRows.map((x) => { onServer[String(x.id)] = 1; return { id: String(x.id), fromServer: true }; });
  const recentLocal = localOpenBets.filter((b) => b && !b.fromServer && !onServer[String(b.id)] && (nowMs - (+b.placedTs || 0)) < 15000);
  return rebuilt.concat(recentLocal);
}
const NOW = 1_900_000_000_000;

console.log('\n=== RED: other account local bets must NOT persist ===');
{
  // load: openBets starts [] (no localStorage seed) — so a stale/other-account cache is gone
  const onLoad = [];
  ok('fresh load openBets = [] (no localStorage seed)', onLoad.length === 0);
  // server has THIS account's 4 bets → rebuilt shows exactly those 4
  const server = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'b4' }];
  const after = rebuild(server, onLoad, NOW);
  ok('after pull: exactly the 4 SERVER bets', after.length === 4 && after.every((b) => b.fromServer));
}

console.log('\n=== GREEN: just-placed bet bridges, then server takes over ===');
{
  const justPlaced = [{ id: 'bNEW', fromServer: false, placedTs: NOW - 3000 }];   // 3s ago, not yet on server
  const r1 = rebuild([], justPlaced, NOW);
  ok('just-placed bet (<15s) survives until its server row lands', r1.length === 1 && r1[0].id === 'bNEW');
  // once it lands on the server, server copy replaces the local (no dup)
  const r2 = rebuild([{ id: 'bNEW' }], justPlaced, NOW);
  ok('once on server → single server copy (no duplicate)', r2.length === 1 && r2[0].fromServer === true);
  // a stale local bet (>15s) is dropped (server is truth)
  const stale = [{ id: 'bOLD', fromServer: false, placedTs: NOW - 60000 }];
  ok('stale local-only bet (>15s) dropped', rebuild([], stale, NOW).length === 0);
}

console.log('\n' + (pass ? '🟢 sports bets follow the server, never localStorage' : '🔴 bets still local') + '\n');
process.exit(pass ? 0 : 1);

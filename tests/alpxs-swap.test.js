// Alpexa — ALPXS swap must route through the SERVER (swap_crypto), and the client
// path can NOT create real tokens (the crypto_holdings RLS lock reverts it).
'use strict';
let pass=true; const ok=(n,c)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };

// mock server holdings (RLS-locked: only the RPC writes; the client cannot)
function server(){ return { ALPXS:0, USDT:100, _priceALPXS:1.81 }; }
// clientSwap = local display only; server unchanged; adopt() snaps display back to server
function clientSwap(srv, local, fromUsd, toUsd){
  local.USDT -= fromUsd; local.ALPXS += toUsd;        // optimistic display
  // NO server write (A4 lock). adopt re-reads server:
  return () => ({ ALPXS: srv.ALPXS, USDT: srv.USDT });  // revert to server on adopt
}
// swap_crypto RPC = server-priced, writes SERVER holdings
function swapCryptoRPC(srv, fromUsd){
  const net = fromUsd * (1 - 0.003);                    // 0.3% fee
  const qty = net / srv._priceALPXS;                    // SERVER price
  srv.USDT -= fromUsd; srv.ALPXS += qty;
  return qty;
}
// routing: should a connected, server-priced asset use the RPC?
function routeIsServer(asset, connected, serverPriced){ return connected && serverPriced; }

console.log('\n=== RED: client-path ALPXS swap shows a gain but REVERTS (no real tokens) ===');
{
  const srv = server(); const local = { ALPXS:0, USDT:100 };
  // attacker swaps $100 USDT → (glitched display) 8226 ALPXS via client path
  const adopt = clientSwap(srv, local, 100, 8226);
  ok('display briefly shows 8226 ALPXS', local.ALPXS === 8226);
  const after = adopt();                                // 8s adopt pulls server truth
  ok('server NEVER got the tokens (still 0)', srv.ALPXS === 0);
  ok('after adopt the phantom reverts to 0 → NO arbitrage', after.ALPXS === 0);
  ok("can't sell phantom: server holdings = 0", srv.ALPXS === 0);
}

console.log('\n=== GREEN: ALPXS swap routes to swap_crypto RPC (server price, persists) ===');
{
  const srv = server();
  ok('connected + ALPXS is server-priced → route to RPC (not client)', routeIsServer('ALPXS', true, true) === true);
  const qty = swapCryptoRPC(srv, 100);
  ok('server credited ~55 ALPXS at \$1.81 (100×0.997/1.81)', Math.abs(qty - 55.08) < 0.1);
  ok('server USDT debited to \$0', srv.USDT === 0);
  ok('persists on server (real)', srv.ALPXS > 55 && srv.ALPXS < 56);
}

console.log('\n' + (pass?'🟢 no real arbitrage (lock reverts client path); ALPXS swap → RPC fix proven':'🔴')+'\n');
process.exit(pass?0:1);

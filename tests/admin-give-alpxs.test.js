// Alpexa — admin_give_alpxs must credit ALPXS to crypto_holdings server-side,
// is_admin-gated and IDEMPOTENT by ref. The bug class this guards: a naive
// additive credit double-credits when the same call is retried (network flake,
// double-tap) — money code must never move on a retry. Mirrors the SQL RPC in
// supabase/sql/admin_give_alpxs.sql.
'use strict';
let pass=true; const ok=(n,c)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };

// ── server state: crypto money lives in crypto_holdings(acct,asset)=qty ──
function server(){ return { holdings:{}, grants:new Set() }; }
const hold=(s,acct,asset)=> (s.holdings[acct+'|'+asset]||0);
const setHold=(s,acct,asset,q)=>{ s.holdings[acct+'|'+asset]=q; };

// ── RED model: naive grant — credits every call, NO ref dedup ──
function giveAlpxsNaive(s, isAdmin, acct, qty){
  if(!isAdmin) return {ok:false,error:'not admin'};
  if(!(qty>0)) return {ok:false,error:'qty must be > 0'};
  setHold(s, acct, 'ALPXS', hold(s,acct,'ALPXS')+qty);   // no idempotency → retry double-credits
  return {ok:true,qty};
}

// ── GREEN model: admin_give_alpxs — is_admin gate + ref idempotency ──
function giveAlpxsRPC(s, isAdmin, ref, acct, qty){
  if(!isAdmin) return {ok:false,error:'not admin'};
  if(!ref || ref.length<6) return {ok:false,error:'bad ref'};
  if(!(qty>0)) return {ok:false,error:'qty must be > 0'};
  if(s.grants.has(ref)) return {ok:true,duplicate:true};   // idempotency gate BEFORE mutation
  s.grants.add(ref);                                        // record FIRST (PK backstop)
  setHold(s, acct, 'ALPXS', hold(s,acct,'ALPXS')+qty);     // then credit
  return {ok:true,qty};
}

console.log('\n=== RED: naive grant double-credits on a retried (same) call ===');
{
  const s=server(); const A='CR-1';
  giveAlpxsNaive(s, true, A, 100);
  giveAlpxsNaive(s, true, A, 100);   // network retry of the SAME grant
  ok('naive path credits 200 ALPXS from one intended 100-grant (BUG)', hold(s,A,'ALPXS')===200);
}

console.log('\n=== GREEN: ref-idempotent grant credits exactly once on retry ===');
{
  const s=server(); const A='CR-1'; const ref='alpxs-CR-1-1700000000000';
  const r1=giveAlpxsRPC(s, true, ref, A, 100);
  const r2=giveAlpxsRPC(s, true, ref, A, 100);   // same ref = retry
  ok('first grant ok, second is duplicate', r1.ok===true && r2.duplicate===true);
  ok('credited exactly 100 ALPXS (no double-credit)', hold(s,A,'ALPXS')===100);
}

console.log('\n=== gate: only is_admin may grant ===');
{
  const s=server();
  const r=giveAlpxsRPC(s, false, 'alpxs-x-1700000000000', 'CR-1', 100);
  ok('non-admin rejected', r.ok===false && r.error==='not admin');
  ok('no ALPXS created for non-admin', hold(s,'CR-1','ALPXS')===0);
}

console.log('\n=== validation: qty must be > 0 ===');
{
  const s=server();
  ok('zero qty rejected', giveAlpxsRPC(s,true,'alpxs-z-1700000000000','CR-1',0).ok===false);
  ok('negative qty rejected', giveAlpxsRPC(s,true,'alpxs-n-1700000000000','CR-1',-50).ok===false);
  ok('no ALPXS created', hold(s,'CR-1','ALPXS')===0);
}

console.log('\n=== additive: distinct grants stack (VIP gets more each time) ===');
{
  const s=server(); const A='CR-1';
  giveAlpxsRPC(s, true, 'alpxs-CR-1-1700000000001', A, 100);
  giveAlpxsRPC(s, true, 'alpxs-CR-1-1700000000002', A, 500);   // different ref → real 2nd grant
  ok('two distinct grants stack to 600 ALPXS', hold(s,A,'ALPXS')===600);
}

console.log(pass?'\n🟢 admin-give-alpxs: PASS':'\n🔴 admin-give-alpxs: FAIL');
process.exit(pass?0:1);

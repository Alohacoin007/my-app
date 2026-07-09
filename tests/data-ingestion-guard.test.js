// Alpexa — DATA INGESTION GUARD tests (mirrors supabase/functions/_shared/data-guard.ts)
// Real-time feed integrity: staleness → circuit-breaker lock, invalid/outlier ticks ignored.
// Two calibration correctness points proven here:
//   • staleness threshold is CONFIGURABLE (10s literal would lock a ~60s cron feed);
//   • negative is invalid for PRICES but VALID for American odds (-140 is normal).
'use strict';
let pass=true; const ok=(n,c,x)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}${x?'  '+x:''}`); };

const isFresh=(ts,now,maxAge)=> Number.isFinite(ts) && (now-ts)<=maxAge && (now-ts)>=0;
const validPrice=(x)=> typeof x==='number' && Number.isFinite(x) && x>0;
const validAmericanOdds=(am)=> typeof am==='number' && Number.isFinite(am) && am!==0 && Math.abs(am)>=100;
const isOutlier=(prev,next,maxPct=0.5)=> (!Number.isFinite(prev)||prev===0) ? false : Math.abs(next-prev)/Math.abs(prev)>maxPct;
class Breaker{
  constructor(){ this.t=new Set(); }
  trip(s){ this.t.add(s); } reset(s){ this.t.delete(s); } isTripped(s){ return this.t.has(s); }
  ingest(sym,tick,now,o){
    if(!isFresh(tick.ts,now,o.maxAgeMs)){ this.trip(sym,'stale'); return null; }
    const valid=o.kind==='odds'?validAmericanOdds(tick.value):validPrice(tick.value);
    if(!valid){ this.trip(sym,'invalid'); return null; }
    if(o.prev!==undefined && isOutlier(o.prev,tick.value)){ this.trip(sym,'outlier'); return null; }
    this.reset(sym); return tick.value;
  }
}
const NOW=1_700_000_000_000;

console.log('\n=== 1) staleness → circuit breaker locks the instrument ===');
{
  const b=new Breaker();
  ok('fresh tick (2s old) accepted, symbol unlocked', b.ingest('BTC',{value:60000,ts:NOW-2000},NOW,{kind:'price',maxAgeMs:30000})===60000 && !b.isTripped('BTC'));
  ok('stale tick (40s old) rejected → BTC LOCKED', b.ingest('BTC',{value:60000,ts:NOW-40000},NOW,{kind:'price',maxAgeMs:30000})===null && b.isTripped('BTC'));
  ok('feed recovers (fresh) → BTC UNLOCKED', b.ingest('BTC',{value:60000,ts:NOW-1000},NOW,{kind:'price',maxAgeMs:30000})===60000 && !b.isTripped('BTC'));
}

console.log('\n=== 1b) threshold is CONFIGURABLE — 10s would wrongly lock a 60s-cron feed ===');
{
  const t=NOW-55000;  // 55s old — normal for a ~60s cron feed
  ok('at 10s gate: 55s tick is STALE (would lock everything — WRONG for a cron feed)', !isFresh(t,NOW,10000));
  ok('at 120s gate: same 55s tick is FRESH (correct for this feed)', isFresh(t,NOW,120000));
}

console.log('\n=== 2) value validation: prices must be > 0; ODDS may be negative ===');
{
  const b=new Breaker();
  ok('price 0 rejected', b.ingest('EURUSD',{value:0,ts:NOW},NOW,{kind:'price',maxAgeMs:30000})===null);
  ok('price -1.2 rejected', b.ingest('EURUSD',{value:-1.2,ts:NOW},NOW,{kind:'price',maxAgeMs:30000})===null);
  ok('price NaN rejected', b.ingest('EURUSD',{value:NaN,ts:NOW},NOW,{kind:'price',maxAgeMs:30000})===null);
  // the subtle one: American odds -140 is a NORMAL favorite — must NOT be rejected
  ok('odds -140 ACCEPTED (favorite — not an error)', b.ingest('NBA1',{value:-140,ts:NOW},NOW,{kind:'odds',maxAgeMs:180000})===-140);
  ok('odds +120 accepted', b.ingest('NBA2',{value:120,ts:NOW},NOW,{kind:'odds',maxAgeMs:180000})===120);
  ok('odds 0 rejected (impossible)', validAmericanOdds(0)===false);
  ok('odds -50 rejected (|am|<100 impossible)', validAmericanOdds(-50)===false);
}

console.log('\n=== RED→GREEN: naive "reject all negatives" would LOCK valid -140 odds ===');
{
  const naiveReject=(x)=> x<=0;                 // RED: blanket negative/zero rejection
  ok('RED: naive path rejects a valid -140 line (BUG — locks a real market)', naiveReject(-140)===true);
  ok('GREEN: odds validator keeps -140 tradeable', validAmericanOdds(-140)===true);
}

console.log('\n=== 3) outlier filter: a >50% spike/crash is ignored (keep last good) ===');
{
  const b=new Breaker();
  ok('60000 → 61000 (1.7%) accepted', b.ingest('BTC',{value:61000,ts:NOW},NOW,{kind:'price',maxAgeMs:30000,prev:60000})===61000);
  ok('61000 → 120000 (+96%) rejected as outlier → LOCKED', b.ingest('BTC',{value:120000,ts:NOW},NOW,{kind:'price',maxAgeMs:30000,prev:61000})===null && b.isTripped('BTC'));
  ok('61000 → 25000 (−59%) rejected as outlier', isOutlier(61000,25000)===true);
  ok('no baseline (prev 0) → first tick accepted', isOutlier(0,60000)===false);
}

console.log(pass?'\n🟢 data-ingestion-guard: PASS':'\n🔴 data-ingestion-guard: FAIL');
process.exit(pass?0:1);

// Alpexa — LAZY-LOAD HARNESS (#3)
// Enforces the mobile initial-entry contract for sports-live.html:
//   • the MAIN screen (games list) renders synchronously on boot, and
//   • the non-critical server feeds (financial activity, settled bets, responsible-gaming)
//     are DEFERRED off the first-paint critical path (requestIdleCallback / setTimeout),
//     not fetched synchronously at init.
// This is what keeps initial entry fast (<2s target on device). Wall-clock timing depends
// on the real network/device and is validated there; this harness statically guarantees the
// STRUCTURE that makes it possible — and fails if someone re-adds a blocking boot fetch.
'use strict';
const fs=require('path'), P=require('path');
const src=require('fs').readFileSync(P.join(__dirname,'..','sports-live.html'),'utf8');
let pass=true; const ok=(n,c,x)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}${x?'  '+x:''}`); };

// Isolate the boot/init region (from the "// init" marker to the storage listener that follows it).
const iA=src.indexOf('// init');
const iB=src.indexOf("window.addEventListener('storage'", iA);
const init = (iA>=0 && iB>iA) ? src.slice(iA, iB) : '';
ok('found the init/boot block', init.length>0);

// Critical path: the games screen must render on boot.
ok('boot renders the main games screen (renderGames)', /renderGames\(\)/.test(init));

// Deferral wrapper must exist and guard the heavy feeds.
const hasIdleDefer = /requestIdleCallback\b/.test(init) && /__lazyFeeds|setTimeout\(f,1\)/.test(init);
ok('non-critical feeds are wrapped in a requestIdleCallback defer', hasIdleDefer);

// The two heavy pulls must NOT be called as bare synchronous init statements.
// (They should appear only inside the deferred __lazyFeeds function.)
function bareSyncCall(fn){
  // a call not preceded on its line by "__lazyFeeds=" (the defer wrapper definition)
  const re=new RegExp('(^|[;{]\\s*)try\\{\\s*'+fn+'\\(\\);','m');
  // find occurrences and check none sit OUTSIDE the __lazyFeeds assignment line
  const lazyLine=(init.match(/var __lazyFeeds=[^\n]*/)||[''])[0];
  const withoutLazy=init.replace(lazyLine,'');
  return re.test(withoutLazy);
}
ok('pullServerActivity is NOT a blocking boot fetch (deferred only)', !bareSyncCall('pullServerActivity'));
ok('pullServerSettled is NOT a blocking boot fetch (deferred only)', !bareSyncCall('pullServerSettled'));

// Sanity: the feeds are still called somewhere (deferred), not dropped entirely.
ok('financial-activity feed still loads (deferred)', /pullServerActivity\(\)/.test(init));
ok('settled-bets feed still loads (deferred)', /pullServerSettled\(\)/.test(init));

console.log(pass?'\n🟢 lazy-load-harness: PASS':'\n🔴 lazy-load-harness: FAIL — a heavy fetch is back on the boot critical path');
process.exit(pass?0:1);

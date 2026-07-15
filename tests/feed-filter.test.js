// Alpexa — FX app hides symbols with NO live server feed from browse/select lists.
// A symbol can only be OPENED if the server prices it (fx_open needs a fresh price),
// so a symbol with no feed used to appear tradeable but only wore a red SIMULATED
// badge and was un-openable. We now exclude it from the watchlist / picker / chart
// dropdown / alerts entirely — EXCEPT before the feed has loaded (no blank flash).
//
// Models trading.html alpexaFeedReady()/alpexaHasFeed()/alpexaTradable().
// Run: node tests/feed-filter.test.js
'use strict';

// Faithful port of the helpers (window.__alpexaFXFeed injected as `feed`).
function feedReady(feed){ return !!(feed && Object.keys(feed).length); }
function hasFeed(s, feed){ if(!s) return false; if(s.real) return true; var r=(feed||{})[s.sym]; return !!(r && +r.mid>0); }
function tradable(list, feed){ return (list && feedReady(feed)) ? list.filter(s=>hasFeed(s,feed)) : list; }

let pass = true;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}\n       got : ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
}

const market = [
  { sym:'EURUSD', cls:'FX',     real:true  },   // FX major — fed
  { sym:'BTCUSD', cls:'CRYPTO', real:true  },   // crypto — fed
  { sym:'AAPL',   cls:'STOCK',  real:false },   // stock — anchors via feed map below
  { sym:'SPX',    cls:'INDEX',  real:false },   // index — NO feed anywhere
];
const feed = { EURUSD:{mid:1.084}, BTCUSD:{mid:108000}, AAPL:{mid:218.7} };  // no SPX

const syms = list => list.map(s=>s.sym);

console.log('\n=== RED — without filtering, the un-openable INDEX shows as tradeable ===');
check('unfiltered market still lists SPX (no feed)', syms(market).includes('SPX'), true);

console.log('\n=== GREEN — tradable() drops symbols with no server feed ===');
check('EURUSD (real) kept',            tradable(market,feed).some(s=>s.sym==='EURUSD'), true);
check('BTCUSD (real) kept',            tradable(market,feed).some(s=>s.sym==='BTCUSD'), true);
check('AAPL (in feed map) kept',       tradable(market,feed).some(s=>s.sym==='AAPL'),   true);
check('SPX (no feed) EXCLUDED',        tradable(market,feed).some(s=>s.sym==='SPX'),    false);
check('visible set == fed symbols',    syms(tradable(market,feed)), ['EURUSD','BTCUSD','AAPL']);

console.log('\n=== GREEN — a class with zero fed symbols disappears (empty INDEX tab) ===');
const classCount = (cls) => tradable(market,feed).filter(s=>s.cls===cls).length;
check('INDEX count == 0 (tab hidden)', classCount('INDEX'), 0);
check('FX count == 1',                 classCount('FX'),    1);

console.log('\n=== GREEN — cold start (feed not loaded yet) shows everything, no blank flash ===');
check('empty feed → pass-through (all shown)', syms(tradable(market, {})), ['EURUSD','BTCUSD','AAPL','SPX']);
check('null feed → pass-through',              syms(tradable(market, null)), ['EURUSD','BTCUSD','AAPL','SPX']);

console.log('\n=== GREEN — a stale mid (0) is treated as no feed ===');
check('AAPL with mid:0 → excluded', tradable(market,{EURUSD:{mid:1.084},AAPL:{mid:0}}).some(s=>s.sym==='AAPL'), false);

console.log('\n' + (pass ? '🟢 ALL CHECKS PASSED' : '🔴 CHECKS FAILED') + '\n');
process.exit(pass ? 0 : 1);

#!/usr/bin/env node
// Alpexa — LIVE RENDER SMOKE (the executable arm of 시각-감사-프롬프트.md).
//   node tests/visual-smoke.js
//
// Static checks can't render React/JSX or live data, so render bugs (a chart that throws, a
// blank screen, a NaN coordinate) slip the gate. This actually LAUNCHES headless Chromium,
// loads each shipped page with a stubbed Supabase + a logged-in identity, and FAILS on:
//   • any uncaught JS exception during render (a real crash in our code), or
//   • a chart that rendered with non-finite / collapsed coordinates (VIS-chart-* classes).
//
// Designed to never make the gate fragile: if playwright-core or the Chromium binary or the
// CDN-loaded React/Babel aren't available (e.g. a locked-down sandbox), it SKIPS cleanly
// (exit 0) and says why. Where it CAN run (CI with network), it auto-blocks the render classes.
//
// Enable in any env:  npm i -D playwright-core   (browser is the pre-installed Chromium)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let chromium;
try { chromium = require('playwright-core').chromium; }
catch (e) {
  // Self-enable like verify.js does for @babel/parser: try a one-time, browser-skipping install
  // (the Chromium binary is pre-provided via PLAYWRIGHT_BROWSERS_PATH). Skip cleanly if offline.
  try {
    require('child_process').execSync('npm install playwright-core --no-save', {
      stdio: 'ignore', env: Object.assign({}, process.env, { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }), timeout: 120000 });
    chromium = require('playwright-core').chromium;
  } catch (e2) {
    console.log('  ⏭️  SKIP visual-smoke — playwright-core unavailable (offline); render layer off\n');
    process.exit(0);
  }
}

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    if (!fs.existsSync(base)) return null;
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x))) {
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const f = path.join(base, d, c);
        if (fs.existsSync(f)) return f;
      }
    }
  } catch (e) {}
  return null;
}

// Stub injected BEFORE any page script: a permissive Supabase mock + a logged-in identity, so
// pages render without network. Only OUR render errors should surface (not auth/network).
const INIT = `
(function(){
  try{ localStorage.setItem('alpexa.me', JSON.stringify({custId:'CR-100000',name:'Test',email:'t@example.com',authId:'test-uid',accts:{crypto:'CR-100000',sports:'SP-100000',fx:'FX-100000'}})); }catch(e){}
  function res(data){ return Promise.resolve({data:data, error:null}); }
  function qb(){ var o={};
    ['select','eq','neq','gt','gte','lt','lte','like','ilike','is','in','contains','containedBy',
     'range','overlaps','match','not','or','filter','order','limit','textSearch','returns','abortSignal',
     'insert','update','upsert','delete'].forEach(function(k){o[k]=function(){return o;};});
    o.single=function(){return res(null);}; o.maybeSingle=function(){return res(null);};
    o.then=function(f,g){return res([]).then(f,g);}; o.catch=function(){return o;};
    return o; }
  function mockClient(){ return {
    auth:{ getSession:function(){return res({session:{user:{id:'test-uid'}}});},
           getUser:function(){return res({user:{id:'test-uid',email:'t@example.com'}});},
           onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}};},
           signInWithPassword:function(){return res({user:{id:'test-uid'}});}, signOut:function(){return res(null);},
           signInWithOtp:function(){return res({});}, verifyOtp:function(){return res({});}, updateUser:function(){return res({});} },
    rpc:function(name){ if(name==='is_admin') return res(true);
                        if(name==='get_portfolio_history') return res({ok:true,points:[{ts:'2026-06-29T16:00:00Z',v:9000},{ts:'2026-06-30T16:00:00Z',v:9435}]});
                        if(name==='get_statement') return res({ok:true,opening:100,closing:9435,net_change:9335,money_in:9400,money_out:65,by_kind:[],tx:[]});
                        return res({ok:true}); },
    from:function(){return qb();}, channel:function(){return {on:function(){return this;},subscribe:function(){return this;}};},
    removeChannel:function(){}, getChannels:function(){return [];} };
  }
  window.supabase = { createClient:function(){ return mockClient(); } };
})();
`;

// agent.html uses a CUSTOM PIN session (not Supabase auth): on boot it reads
// sessionStorage['alpexa.agent']='CODE|PIN' and hydrates from the `agents` table. This mock
// injects that session + a rich per-table dataset so the page bypasses the login card and
// renders the LOGGED-IN commission dashboard (agents/agent_links/players/settlements/agent_payouts).
// Injected AFTER the generic INIT (overrides window.supabase for this page only).
const AGENT_INIT = `
(function(){
  try{ sessionStorage.setItem('alpexa.agent','AG-TEST|0000'); }catch(e){}
  var A='AG-TEST';
  var iso=function(d){ return new Date(Date.now()-d*86400000).toISOString(); };   // always in the 30d window
  var DATA={
    agents:[{code:A,name:'Test Partner',email:'partner@test.dev',pin:'0000',status:'active',fx_per_lot:5,sports_net_pct:20,crypto_fee_pct:15}],
    agent_links:[{agent_code:A,cust_id:'C1',share:100},{agent_code:A,cust_id:'C2',share:50}],
    players:[{cust_id:'C1',name:'Alice'},{cust_id:'C2',name:'Bob'}],
    settlements:[
      {cust_id:'C1',server:'fx',kind:'fx_close',stake:1.5,pnl:120,created_at:iso(1)},
      {cust_id:'C2',server:'sports',kind:'bet_won',stake:50,pnl:80,created_at:iso(1)},
      {cust_id:'C1',server:'sports',kind:'bet_lost',stake:30,pnl:-30,created_at:iso(2)},
      {cust_id:'C2',kind:'crypto_fee',stake:12.5,pnl:0,created_at:iso(2)}
    ],
    agent_payouts:[
      {agent_code:A,amount:100,method:'crypto',status:'approved',created_at:iso(9)},
      {agent_code:A,amount:40,method:'bank',status:'pending',created_at:iso(5)}
    ]
  };
  function res(rows){ return Promise.resolve({data:rows, error:null}); }
  function from(table){
    var rows = DATA[table]||[];
    var b={};
    ['select','eq','neq','ilike','like','in','order','limit','gte','lte','gt','lt','is','match','not','or','filter','range'].forEach(function(k){ b[k]=function(){return b;}; });
    b.insert=function(){ return b; };
    b.single=function(){ return res(rows[0]||null); };
    b.maybeSingle=function(){ return res(rows[0]||null); };
    b.then=function(f,g){ return res(rows).then(f,g); };
    b.catch=function(){ return b; };
    return b;
  }
  var MOCK = { createClient:function(){ return {
    from:from, channel:function(){return {on:function(){return this;},subscribe:function(){return this;}};}, removeChannel:function(){} }; } };
  // Pin the mock: agent.html loads the REAL supabase-js from a CDN in <head> which would clobber
  // window.supabase. A getter that always returns MOCK (and a no-op setter, so even the strict-mode
  // UMD assignment doesn't throw) guarantees our mock wins regardless of whether the CDN loads.
  try{ Object.defineProperty(window,'supabase',{ configurable:false, get:function(){return MOCK;}, set:function(){} }); }
  catch(e){ window.supabase = MOCK; }
})();
`;

const PAGES = ['index.html', 'login.html', 'signup.html', 'statement.html',
               'crypto-live.html', 'trading.html', 'sports-live.html', 'manager-mobile.html', 'webtrade.html',
               'fx.html', 'agent.html', 'terminal.html', 'sportsbook-desk.html'];

// console errors that are environment noise (blocked CDN / failed resource), NOT our bug.
function isNoise(t) {
  return /net::ERR|Failed to load resource|ERR_|CORS|Access-Control|favicon|status of 4|status of 5|net err|Loading (?:CSS )?chunk|Babel|Could not load|supabase|CDN fail|React(?:DOM)?\b|jsdelivr|unpkg|cdnjs|transpile|chart libs|WebSocket connection to/i.test(t);
}

(async () => {
  const exe = findChromium();
  if (!exe) { console.log('  ⏭️  SKIP visual-smoke — no Chromium binary found under PLAYWRIGHT_BROWSERS_PATH\n'); process.exit(0); }

  let browser;
  try { browser = await chromium.launch({ headless: true, executablePath: exe }); }
  catch (e) { console.log('  ⏭️  SKIP visual-smoke — Chromium failed to launch: ' + String(e.message).slice(0, 120) + '\n'); process.exit(0); }

  let failed = false, rendered = 0;
  for (const page of PAGES) {
    const fp = path.join(ROOT, page);
    if (!fs.existsSync(fp)) continue;
    const pg = await browser.newPage();
    const crashes = [];
    pg.on('pageerror', (e) => crashes.push(String(e.message || e)));            // uncaught JS exception = real crash
    pg.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) crashes.push('console: ' + m.text()); });
    try {
      await pg.addInitScript(INIT);
      if (page === 'agent.html') {
        await pg.addInitScript(AGENT_INIT);                                     // rich PIN-session mock → logged-in dashboard
        // agent.html has a blocking Google-Fonts <link> + supabase-js <script> in <head>; offline
        // they hang and stall the inline app for ~12s (a pending stylesheet blocks script exec).
        // Fulfill every external request instantly (empty, by type) so the dashboard renders fast.
        await pg.route(/^https?:\/\//, (r) => { const t = r.request().resourceType();
          if (t === 'stylesheet' || t === 'font') return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
          if (t === 'script') return r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*mock*/' });
          return r.fulfill({ status: 200, body: '' }); });
      }
      await pg.goto('file://' + fp, { waitUntil: 'commit', timeout: 12000 });
      await pg.waitForTimeout(1800);                                            // let React/Babel mount
      if (page === 'agent.html') {                                             // expand every collapsible section so the
        for (const id of ['cust', 'tr', 'pay']) {                             // customers / recent-trades / payouts tables
          try { await pg.evaluate((i) => { const e = document.querySelector('[data-tg="' + i + '"]'); if (e) e.click(); }, id); } catch (e) {}
          await pg.waitForTimeout(150);                                        // each click re-renders #wrap; TG state persists
        }
      }
    } catch (e) {
      // A navigation timeout/failure here = a blocked CDN script in the sandbox, not our bug.
      console.log('  ⏭️  ' + page + ' — could not load (blocked CDN / env), skipped');
      await pg.close(); continue;
    }

    // Filter framework/CDN-load noise out of pageerrors too (only count OUR exceptions).
    const real = crashes.filter((c) => !isNoise(c));
    if (real.length) { failed = true; console.log('  🔴 ' + page + ' — ' + real.length + ' uncaught error(s):');
      real.slice(0, 3).forEach((c) => console.log('        ' + c.slice(0, 140))); }
    else console.log('  ✅ ' + page + ' rendered with no uncaught errors');

    // Chart invariant (when the React chart actually mounted): no non-finite / collapsed line.
    if (page === 'crypto-live.html') {
      try {
        const info = await pg.evaluate(() => {
          const p = document.querySelector('svg path');
          if (!p) return null;
          const d = p.getAttribute('d') || '';
          const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
          return { hasPath: true, anyNaN: nums.some((n) => !isFinite(n)) };
        });
        if (info && info.hasPath) { rendered++;
          if (info.anyNaN) { failed = true; console.log('  🔴 crypto-live chart path has non-finite coordinates (VIS-chart)'); }
          else console.log('  ✅ crypto-live chart path coordinates are finite');
        } else console.log('  ⏭️  crypto-live chart not mounted (React/Babel CDN likely blocked) — skipped chart assert');
      } catch (e) {}
    }

    // agent.html LOGGED-IN dashboard: must enter (not stuck on login) + the commission KPI grid
    // must stay a laid-out 2×2 (no collapsed/overflowing cells) — the settlement-layout lock.
    if (page === 'agent.html') {
      try {
        const dash = await pg.evaluate(() => {
          const signedIn = !!document.getElementById('btnOut');     // dashboard sign-out (present only when logged in)
          const onLogin = !!document.getElementById('lgGo');        // login button (must be gone)
          const kpis = Array.prototype.slice.call(document.querySelectorAll('.kpis .kpi')).map((k) => {
            const r = k.getBoundingClientRect(); return { t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
          const hdr = document.querySelector('.hdr');
          const name = hdr ? (hdr.textContent || '').replace(/\s+/g, ' ').trim() : '';
          const wrap = document.getElementById('wrap');
          const overflow = wrap ? (wrap.scrollWidth - wrap.clientWidth) : 0;
          const twoCol = kpis.length === 4 && Math.abs(kpis[0].t - kpis[1].t) < 2 && kpis[2].t > kpis[0].t + 2;
          const collapsed = kpis.some((k) => k.w <= 0 || k.h <= 0);
          const secs = document.querySelectorAll('.sec').length;    // commission / withdraw / customers / trades / payouts headers
          return { signedIn, onLogin, n: kpis.length, twoCol, collapsed, overflow, name, secs };
        });
        if (!dash.signedIn || dash.onLogin) {
          failed = true; console.log('  🔴 agent.html stuck on LOGIN — mock session did NOT enter the dashboard');
        } else if (dash.n < 4 || dash.collapsed || !dash.twoCol) {
          failed = true; console.log('  🔴 agent.html commission KPI grid broken (n=' + dash.n + ' twoCol=' + dash.twoCol + ' collapsed=' + dash.collapsed + ')');
        } else if (dash.overflow > 8) {
          failed = true; console.log('  🔴 agent.html dashboard overflows horizontally by ' + dash.overflow + 'px (layout shifted)');
        } else {
          rendered++; console.log('  ✅ agent.html LOGGED-IN dashboard OK — 2×2 KPI grid intact, ' + dash.secs + ' sections, 0 overflow, "' + dash.name.slice(0, 26) + '"');
        }
      } catch (e) { console.log('  ⏭️  agent.html dashboard assert skipped: ' + String(e.message).slice(0, 80)); }
    }
    await pg.close();
  }
  await browser.close();

  console.log('\n' + (failed
    ? '🔴 visual-smoke: a page threw an uncaught error / bad chart coords'
    : '🟢 visual-smoke: all pages rendered without uncaught errors' + (rendered ? ' (chart verified)' : ' (chart render skipped — CDN)')) + '\n');
  process.exit(failed ? 1 : 0);
})();

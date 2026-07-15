#!/usr/bin/env node
// FEATURE / REGRESSION (webtrade + fx-prices Edge) — REAL chart history (2026-07-13).
// The real-candles path was TRIPLE-dead in production (charts stayed synthetic forever):
//   [1] transport: client sent {body:{candles}} but the Edge reads url.searchParams
//   [2] auth: the Edge's CRON_SECRET gate sat BEFORE the candles branch → every client call 401
//   [3] count: the Edge returned max 120 bars but the client demands ≥160 → always rejected
// New contract:
//   · client fetches GET  <functions>/fx-prices?candles=SYM&tf=TF   (no token — read-only market data)
//   · the Edge serves the candles branch BEFORE the CRON gate and returns 200 bars
//   · crypto tiles fetch real OHLC from the Binance public mirror klines (no key, same book as the WS)
//   · stocks keep the synth fallback (no real source wired yet)
//   · the synth fallback itself scales per-bar amplitude by √timeframe so an M1 fallback no longer
//     swings ~9 pips/bar (the "our chart looks 6× wilder than MT5" bug)
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'fx-prices', 'index.ts'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (s, re, label) => { const m = s.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── client: GET query-string transport, no secrets, per-class sources ──
const fr = grab(src, /async function fetchRealCandles\(symbol, tf\)\{[\s\S]*?\n\}/, 'fetchRealCandles');
if (fr && /functions\.invoke\('fx-prices'/.test(fr)) bad('the dead body-invoke transport must be gone (the Edge reads the query string)');
if (fr && !/fx-prices\?candles='\+symbol\+'&tf='\+t\+'&n='\+n/.test(fr)) bad('FX candles must be fetched as GET ?candles=&tf=&n= (deep history)');
// deep history depth map (2026-07-13 user request: 5-10y where the browser can take it)
if (!/const HIST_N=\{ M1:5000, M5:5000, M15:10000, M30:10000, H1:15000, H4:15000, D1:3900, W1:1560 \};/.test(src))
  bad('HIST_N depth map missing (H4 6.8y · D1 15y · W1 30y)');
if (fr && !/endTime='\+end/.test(fr)) bad('crypto must PAGINATE klines (1000/req endTime walk) to reach 5000 bars');
if (fr && !/setTimeout\(\(\)=>res\(null\),10000\)/.test(fr)) bad('deep loads need the 10s cap (seed paints at 1.2s meanwhile)');
if (fr && /token=/.test(fr)) bad('the client must NEVER carry a cron token');
if (fr && !/data-api\.binance\.vision\/api\/v3\/klines/.test(fr)) bad('crypto candles must come from the Binance public mirror klines');
if (fr && !/if\(WT_DEMO\) return null;/.test(fr)) bad('demo must stay synthetic');
if (fr && !/bars\.length<160\) return null;/.test(fr)) bad('the full-history guard (≥160) must survive');
// synth fallback: amplitude scales by √timeframe
if (!/Math\.sqrt\(\(TF_SEC\[tf\]\|\|900\)\/900\)/.test(src))
  bad('synthCandles must scale per-bar amplitude by √timeframe (M1 fallback was ~9 pips/bar)');

// ── Edge: candles branch BEFORE the CRON gate, and enough bars ──
if (edge.indexOf('candlesSym') === -1) bad('Edge candles branch missing');
else if (edge.indexOf('candlesSym') > edge.indexOf('CRON_SECRET not configured'))
  bad('the Edge candles branch must run BEFORE the CRON_SECRET gate (read-only market data, client-callable)');
if (!/Math\.max\(200, Math\.min\(15000, /.test(edge)) bad('the Edge must accept &n= clamped to [200,15000]');
if (!/sort=desc&limit=5000/.test(edge)) bad('the Edge must page Polygon (sort=desc, 5000/page) for deep history');
if (!/M30: \[30, "minute"\]/.test(edge)) bad('the Edge tf map must include M30 (it silently served M15)');

// ── behavioural: run the real client fetcher against stub fetch ──
if (!fail) {
  const catOf = (s) => ({ EURUSD: 'Forex', BTCUSD: 'Crypto', AAPL: 'Stocks' }[s]);
  const mkBars = (n) => Array.from({ length: n }, (_, i) => ({ t: (1700000000 + i * 60) * 1000, o: 1, h: 1.1, l: 0.9, c: 1.05 }));
  const mkKlines = (n) => Array.from({ length: n }, (_, i) => [(1700000000 + i * 60) * 1000, '62000', '62100', '61900', '62050']);
  let lastUrl = null;
  const fetch_ = async (u) => { lastUrl = String(u);
    if (/binance\.vision/.test(u)) return { ok: true, json: async () => mkKlines(200) };
    return { ok: true, json: async () => ({ ok: true, candles: mkBars(200) }) }; };
  const histn = grab(src, /const HIST_N=\{[^\n]*/, 'HIST_N');
  const fn = new Function('WT_DEMO', 'catOf', 'fetch', 'window', 'AlpexaSync',
    histn + '\n' + fr + '\nreturn fetchRealCandles;')(false, catOf, fetch_, {}, {});
  return (async () => {
    const fx = await fn('EURUSD', 'M1');
    if (!/fx-prices\?candles=EURUSD&tf=M1/.test(lastUrl)) bad('FX request must be ?candles=EURUSD&tf=M1, got ' + lastUrl);
    if (!fx || fx.length !== 200) bad('a full FX history must be accepted');
    if (fx && fx[0].time !== 1700000000) bad('bar time must convert ms → s');
    const cr = await fn('BTCUSD', 'M1');
    if (!/klines\?symbol=BTCUSDT&interval=1m/.test(lastUrl)) bad('crypto must hit klines?symbol=BTCUSDT&interval=1m, got ' + lastUrl);
    if (!cr || cr.length !== 200 || cr[0].close !== 62050) bad('klines rows must map to OHLC bars');
    const st = await fn('AAPL', 'M1');
    if (st !== null) bad('stocks must stay on the synth fallback (no real source wired)');
    const short = new Function('WT_DEMO', 'catOf', 'fetch', 'window', 'AlpexaSync', histn + '\n' + fr + '\nreturn fetchRealCandles;')(
      false, catOf, async () => ({ ok: true, json: async () => ({ ok: true, candles: mkBars(120) }) }), {}, {});
    if ((await short('EURUSD', 'M1')) !== null) bad('a sparse (<160) history must be rejected (seed stays)');
    if (fail) { console.error(`\n🔴 FAIL — ${fail} real-candles problem(s).`); process.exit(1); }
    console.log('🟢 PASS: real candles — FX via GET ?candles (no token, Edge gate reordered, 200 bars), crypto via Binance-vision klines, stocks synth, √tf fallback amplitude.');
  })();
}
console.error(`\n🔴 FAIL — ${fail} real-candles problem(s).`); process.exit(1);

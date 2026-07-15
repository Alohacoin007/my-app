#!/usr/bin/env node
// FEATURE / REGRESSION (webtrade) — Binance WS direct crypto feed (stage 3). Drift-safety rules:
//  [1] SAME upstream as the server: crypto-prices Edge samples Binance bookTicker; the client
//      connects to the public data mirror (binance.vision) of the SAME book — no second source.
//  [2] SAME pipeline + SAME units: WS bid/ask → {symbol, mid, spr_pts in BPS} (exactly what
//      crypto-prices writes) → the one _apply → the one halfPx. No parallel parser.
//  [3] PRIORITY GATE: a symbol with a fresh WS tick must not be dragged backwards by the 3s
//      cron row (poll/Realtime yield); after >10s of WS silence the cron feed takes back over
//      (fallback recovery). Non-WS symbols (FX/stocks) flow through untouched.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };
const grab = (re, label) => { const m = src.match(re); if (!m) bad(label + ' not found'); return m ? m[0] : ''; };

// ── static ──
const ws_src = grab(/startCryptoWS\(\)\{ try\{[\s\S]*?\n  \}catch\(e\)\{\} \},/, 'priceStore.startCryptoWS');
if (ws_src && !/data-stream\.binance\.vision/.test(ws_src)) bad('must use the public data mirror (binance.vision) — binance.com is geo-fenced');
if (ws_src && !/bookTicker/.test(ws_src)) bad('must subscribe bookTicker (real bid/ask, the same book the server samples)');
if (ws_src && !/this\._apply\(\[/.test(ws_src)) bad('WS rows must go through the one _apply pipeline');
if (ws_src && !/'ws'/.test(ws_src)) bad("WS rows must be tagged src='ws' for the priority gate");
if (ws_src && !/startCryptoWS\(\)/.test(ws_src.replace(/^startCryptoWS\(\)\{/, ''))) bad('WS must auto-reconnect (re-arm startCryptoWS on close)');
const start_src = grab(/start\(\)\{ if\(this\.timer\) return;[^\n]*/, 'priceStore.start');
if (start_src && !/this\.startCryptoWS\(\)/.test(start_src)) bad('start() must open the crypto WS');
const apply_src = grab(/_apply\(rows, src\)\{[\s\S]*?\n  \},/, '_apply with src param + priority gate');

// ── behavioural ──
if (!fail) {
  const halfPx = (sym, mid, spr) => mid * Math.max(10, +spr || 0) / 10000 / 2;   // crypto branch stub
  const seedSpread = () => 10;
  let wsInst = null;
  function FakeWS(url) { this.url = url; wsInst = this; }
  FakeWS.prototype.close = function(){ if (this.onclose) this.onclose(); };
  global.WebSocket = FakeWS;
  const mk = () => new Function('halfPx', 'seedSpread', 'WebSocket',
    'const store={ mids:{}, marks:{}, live:false, sets:[], notified:0,\n' +
    '_set(sym,mid,half,spr,now){ this.sets.push({sym,mid,half,spr}); this.mids[sym]={mid,spr}; },\nnotify(){ this.notified++; },\n' +
    apply_src + '\n' + ws_src + '\n};\nreturn store;')(halfPx, seedSpread, FakeWS);
  const store = mk();
  store.startCryptoWS();
  if (!wsInst || !/data-stream\.binance\.vision/.test(wsInst.url)) bad('WS must connect to the vision mirror');
  // [2] a bookTicker frame lands as mid + REAL bps through _apply/_set
  wsInst.onmessage({ data: JSON.stringify({ data: { s: 'BTCUSDT', b: '61900', a: '61910' } }) });
  const t = store.sets[store.sets.length - 1];
  if (!t || t.sym !== 'BTCUSD') bad('BTCUSDT frame must land under app symbol BTCUSD');
  if (t && Math.abs(t.mid - 61905) > 1e-9) bad(`WS mid must be (a+b)/2 = 61905, got ${t && t.mid}`);
  if (t && Math.abs(t.spr - (10 / 61905) * 10000) > 0.01) bad(`WS spr must be real bps ≈1.62, got ${t && t.spr}`);
  if (t && Math.abs(t.half - halfPx('BTCUSD', 61905, t.spr)) > 1e-9) bad('WS half must come from the one halfPx (floor wins here)');
  if (store.notified < 1) bad('a WS tick must notify subscribers');
  // [3] priority gate: the stale 3s cron row must NOT drag the WS-fresh symbol backwards…
  store._apply([{ symbol: 'BTCUSD', mid: 61000, spr_pts: 0 }]);
  if (store.mids.BTCUSD.mid !== 61905) bad('poll row must YIELD to a WS-fresh symbol (price regression)');
  // …but non-WS symbols flow through untouched…
  store._apply([{ symbol: 'EURUSD', mid: 1.1386, spr_pts: 1 }]);
  if (!store.mids.EURUSD || store.mids.EURUSD.mid !== 1.1386) bad('non-WS symbols (FX/stocks) must apply normally');
  // …and after >10s of WS silence the cron feed takes back over (fallback recovery)
  store.wsAt.BTCUSD = Date.now() - 11000;
  store._apply([{ symbol: 'BTCUSD', mid: 61111, spr_pts: 0 }]);
  if (store.mids.BTCUSD.mid !== 61111) bad('after 10s WS silence the poll/Realtime feed must take back over');
  // junk frames are ignored
  const n = store.sets.length;
  wsInst.onmessage({ data: 'not json' }); wsInst.onmessage({ data: JSON.stringify({ data: { s: 'BTCUSDT', b: '0', a: '0' } }) });
  if (store.sets.length !== n) bad('junk/zero frames must be ignored');
  delete global.WebSocket;
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} crypto-WS problem(s).`); process.exit(1); }
console.log('🟢 PASS: Binance-vision bookTicker → one _apply/halfPx pipeline in server units (bps); WS-fresh symbols outrank the 3s cron, cron recovers after 10s silence; junk-safe.');

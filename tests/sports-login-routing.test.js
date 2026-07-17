#!/usr/bin/env node
// REGRESSION (2026-07-15) — login DEVICE routing for the Sports server must mirror FX:
//   · Desktop (PC) → sports-dashboard.html  (the widget dashboard = "컴퓨터용")
//   · Mobile        → sports-live.html       (the phone app)
// FX already does this (webtrade.html on PC / trading.html on mobile). Sports used to
// ALWAYS land on sports-live.html unless a dashboard return-token was present — so a PC
// user picking Sports got the phone app. This test freezes the parallel routing.
//
// Contract is expressed as a runnable fxDest(): we lift the function body out of login.html
// and evaluate it under a faked navigator, so the test exercises the REAL routing code.
'use strict';
const fs = require('fs');
const path = require('path');
const lg = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) Extract the real fxDest(server) source from login.html.
const m = lg.match(/function fxDest\(server\)\{[\s\S]*?\n\}/);
if (!m) { bad('fxDest(server) not found in login.html'); console.error('\n🔴 FAIL'); process.exit(1); }
const src = m[0];

// 2) Evaluate it under a controllable fake navigator + sessionStorage (per case).
function makeFxDest(ua, token) {
  const store = { 'alpexa.dest2': token || '' };
  const sandbox = {
    navigator: { userAgent: ua },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      removeItem: (k) => { delete store[k]; },
      setItem: (k, v) => { store[k] = v; }
    }
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('navigator', 'sessionStorage', src + '\nreturn fxDest;');
  return factory(sandbox.navigator, sandbox.sessionStorage);
}
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile/15E148';

function eq(label, got, want) {
  if (got !== want) bad(label + ' → got "' + got + '", want "' + want + '"');
}

// 3) Sports (server 2): device-based default, mirroring FX.
eq('PC + Sports (no token) = 컴퓨터용 대시보드', makeFxDest(PC)(2), 'sports-dashboard.html');
eq('Mobile + Sports (no token) = 폰 앱',          makeFxDest(PHONE)(2), 'sports-live.html');

// 4) FX (server 3): unchanged — the parallel we are matching.
eq('PC + FX = webtrade 터미널',   makeFxDest(PC)(3), 'webtrade.html');
eq('Mobile + FX = trading 앱',    makeFxDest(PHONE)(3), 'trading.html');

// 5) Crypto (server 1) — 2026-07-17 계약 변경(사장님 지시): 크립토도 기기 라우팅.
eq('Crypto PC = 크립토 대시보드', makeFxDest(PC)(1), 'dev/crypto-dashboard.html');
eq('Crypto 폰 = crypto-live 앱', makeFxDest(PHONE)(1), 'crypto-live.html');

// 6) Explicit return tokens still win (dashboard round-trip + a way back to the app).
eq('token sports-dashboard → 대시보드 (모바일이라도 명시복귀)', makeFxDest(PHONE, 'sports-dashboard')(2), 'sports-dashboard.html');
eq('token sports-live → 폰 앱 (PC라도 명시복귀)',              makeFxDest(PC, 'sports-live')(2), 'sports-live.html');

// 7) Token is single-use (consumed) — no sticky redirect loop.
{
  const f = makeFxDest(PHONE, 'sports-dashboard');
  f(2);                                  // consume
  eq('토큰 1회용: 소비 후 기기 기본값 복귀', f(2), 'sports-live.html');
}

if (fail) { console.error('\n🔴 FAIL — sports 로그인 라우팅 ' + fail + '건'); process.exit(1); }
console.log('🟢 PASS: sports 로그인 라우팅 — PC=대시보드 / 모바일=앱, FX 병렬 + 명시토큰 유지.');

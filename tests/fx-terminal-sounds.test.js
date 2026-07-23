// Alpexa — 레전드 2(터미널) MT5 사운드 게이트 (정적 핀, 네트워크 0, 돈 0)
//
// 계약 (2026-07-23 사장님 "사운드 전부"):
//  ① 합성음 폴백 엔진 — /assets/sounds/에 .wav가 0개여도 모든 이벤트가 소리를 낸다
//     (구 fxSnd는 파일 재생만 시도 → 파일이 없어 사실상 무음이던 원인 제거, webtrade 엔진 락스텝)
//  ② 전 수명주기 배선 — 체결/청산/대기접수/취소/수정/거절/SL·TP·스탑아웃/장마감/프라이스알림/로그인
//  ③ 첫 제스처 AudioContext 언락 (모바일 자동재생 차단 회피)
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'terminal.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx-terminal sounds — MT5 사운드 게이트');

// ① 엔진
ok('① FX_SYN 합성음 8종 (ok/close/timeout/stops/request/tick/alert/startup)',
   ['ok.wav','close.wav','timeout.wav','stops.wav','request.wav','tick.wav','alert.wav','startup.wav']
     .every(k => new RegExp("'" + k.replace('.', '\\.') + "':\\s*\\(\\)=>_tone").test(src)));
ok('① fxSnd = 파일 우선 + 합성 폴백 (파일 없어도 항상 발음)',
   /const syn=FX_SYN\[name\]\|\|FX_SYN\['tick\.wav'\]/.test(src) && /if\(p&&p\.catch\) p\.catch\(\(\)=>syn\(\)\)/.test(src));
ok('① 경로 = assets/sounds/ (루트 승격 정합)', /new Audio\('assets\/sounds\/'\+name\)/.test(src) && !/\.\.\/assets\/sounds/.test(src));

// ② 배선 — 이벤트별
ok('② LIVE 체결 성공 ok.wav · 거절 timeout.wav', /fxSnd\('ok\.wav'\)/.test(src) && /fxSnd\('timeout\.wav'\)/.test(src));
ok('② LIVE 청산 close.wav · 데모 청산도 close.wav', (src.match(/fxSnd\('close\.wav'\)/g) || []).length >= 2);
ok('② SL/TP·스탑아웃 stops.wav (서버 정산 Realtime)', /fxSnd\('stops\.wav'\)/.test(src));
ok('② 대기 접수 request.wav (데모)', /fxSnd\('request\.wav'\)/.test(src));
ok('② 수정/취소 tick.wav (LIVE fx_modify·fx_cancel_pending + 데모 취소)', (src.match(/fxSnd\('tick\.wav'\)/g) || []).length >= 3);
ok('② 프라이스 알림 히트 alert.wav', /fxSnd\('alert\.wav'\); JOURNAL\.log\('Alert — '/.test(src));
ok('② 로그인 차임 startup.wav (authed 전환 시 1회)', /this\.authed=true; fxSnd\('startup\.wav'\)/.test(src));
ok('② 장마감 거절 timeout.wav (세션 게이트)', /fxSnd\('timeout\.wav'\); toast\('🔒 '/.test(src));

// ③ 언락
ok('③ 첫 제스처(터치/클릭/키)에서 AudioContext 언락', /\['touchstart','pointerdown','click','keydown'\]\.forEach\(ev=>\s*\n?\s*document\.addEventListener\(ev, \(\)=>_primeCtx\(\), \{once:true, passive:true\}\)\)/.test(src));

console.log((fail ? '🔴' : '🟢') + ' fx-terminal-sounds — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

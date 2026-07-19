// Alpexa — crypto-live 앱 시세 하네스 핀 (2026-07-19 "구멍 다 막아" 승인 범위)
// 지키는 것: ① 미러 도메인(geo-fence 대응) ② 조용한 정지 워치독(소켓 재활용) ③ 무조건 8s 서버 폴.
// 지우면 이 테스트가 🔴 — 고객 앱의 자가치유가 사라졌다는 뜻.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'crypto-live.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
console.log('crypto-live feed watchdog pins');

ok('Binance = 미러 WS (data-stream.binance.vision, 본체 금지)',
   html.includes('wss://data-stream.binance.vision') && !html.includes('stream.binance.com'));
ok('klines = 미러 REST (data-api.binance.vision)',
   html.includes('data-api.binance.vision/api/v3/klines') && !/https:\/\/api\.binance\.com/.test(html));
ok('워치독 존재 — 틱 끊기면 소켓 재활용(silent-stall)',
   /silent-stall[\s\S]{0,200}?ws\.close\(\)/.test(html) && /function srcNewest\(/.test(html));
ok('소켓 핸들 관리 (WS_B/WS_C + onclose에서 해제)',
   /WS_B\s*=\s*ws/.test(html) && /WS_C\s*=\s*ws/.test(html) && /WS_B=null/.test(html));
ok('서버 폴백 폴은 무조건 8s (sticky 게이트 금지)',
   /setInterval\(function \(\) \{ if \(!document\.hidden\) poll\(\); \}, 8000\)/.test(html));

console.log((fail ? '🔴' : '🟢') + ' crypto-live-feed-watchdog — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

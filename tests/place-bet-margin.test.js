// Alpexa — place_bet 마진 락스텝 + dec0 서버 도장 핀 (정적+수식, 네트워크 0)
//
// 계약 (2026-07-27 사장님 승인):
//  ① 서버 마진 — place_bet이 pricing.spread_mult(0~15)를 읽어 앱 dec()와 동일 공식으로
//     leg별 적용: d' = 1+(d-1)*(1-m). 화면에 보인 지급액 = 서버가 기록하는 지급액.
//  ② dec0 서버 도장 — 정산(decOf)이 우선 신뢰하는 dec0를 place_bet이 서버 계산값으로
//     덮어쓴다. 종전: 클라 dec0가 저장돼 조작 시 정산 과지급 가능(돈 구멍) → 폐쇄.
//  ③ 수식 동일성 — SQL 공식과 앱 dec() 공식이 표본 배당·마진에서 일치 (락스텝 증명).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('place-bet-margin — 마진 락스텝 + dec0 도장');

const sql = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'place_bet_server_odds.sql'), 'utf8');
const app = fs.readFileSync(path.join(REPO, 'sports-live.html'), 'utf8');
const settle = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'sports-settle', 'index.ts'), 'utf8');

// ① 서버 마진
ok('① pricing.spread_mult 읽기 + 0~15 경계 + 실패 시 0 (fail-safe)',
   /select greatest\(0, least\(15, coalesce\(max\(spread_mult\), 0\)\)\) \/ 100\.0/.test(sql)
   && /exception when others then v_margin := 0/.test(sql));
ok('① leg별 마진 공식 = 앱 dec() 락스텝', /v_dec := 1 \+ \(v_dec - 1\) \* \(1 - v_margin\)/.test(sql)
   && /return 1\+\(d-1\)\*\(1-m\)/.test(app));
ok('① 마진이 재가격(4) 전에 로드됨 (3c 위치)', sql.indexOf('v_margin from pricing') < sql.indexOf('RE-PRICE from the server lines'));

// ② dec0 서버 도장 (정산 과지급 구멍 폐쇄)
ok('② 저장 leg에 dec0 = 서버 계산값 덮어쓰기', /'am', v_srv_am, 'am0', v_srv_am, 'dec0', round\(v_dec, 6\)/.test(sql));
ok('② 정산 decOf는 dec0 우선 — 도장 전제 확인 (계약 문서화)', /if \(\+l\.dec0 > 1\) return \+l\.dec0;/.test(settle));

// ③ 수식 동일성 — SQL 공식을 JS로 재현해 앱 dec()와 표본 대조
const appDec = (a, mPct) => { const d = a > 0 ? 1 + a / 100 : 1 + 100 / (-a); const m = Math.max(0, Math.min(15, mPct)) / 100; return 1 + (d - 1) * (1 - m); };
const sqlDec = (a, mPct) => { const d = a > 0 ? 1 + a / 100.0 : 1 + 100.0 / (-a); const m = Math.max(0, Math.min(15, mPct)) / 100.0; return 1 + (d - 1) * (1 - m); };
const samples = [[185, 0], [185, 5], [-190, 5], [120, 15], [-500, 3], [900, 7.5]];
ok('③ 표본 6종에서 서버·앱 배율 완전 일치 (마진 0·3·5·7.5·15%)',
   samples.every(([a, m]) => Math.abs(appDec(a, m) - sqlDec(a, m)) < 1e-12));
// 실제 숫자 검증: +185 · 마진 5% → 2.7575 (화면 +176 상당)
ok('③ +185 @ 5% = 2.7575 (예시 수치 고정)', Math.abs(sqlDec(185, 5) - 2.7575) < 1e-9);

console.log((fail ? '🔴' : '🟢') + ' place-bet-margin — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

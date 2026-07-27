// Alpexa — 돈 경로 "클라 신뢰 지점" 소거 핀 (2026-07-27 전수감사, 정적, 네트워크 0)
//
// 감사 렌즈: 지급·차감 수식에 들어가는 값 중 클라이언트가 보낸 것이 검증 없이 살아남는가.
// 이 핀은 감사에서 나온 3건의 수정이 계속 살아있는지 지킨다 (+ 같은 클래스 재유입 차단).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('money-client-trust — 클라 신뢰 지점 소거 핀');

const settle = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'sports-settle', 'index.ts'), 'utf8');
const trade = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'crypto_trade.sql'), 'utf8');
const lock = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'cash_out_lockdown.sql'), 'utf8');
const pb = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'place_bet_server_odds.sql'), 'utf8');

// ① 정산 stake = 서버 차감 컬럼만 (meta.stake 클라 신뢰 폐쇄)
ok('① settle stake = positions.stake 컬럼만 (meta.stake 사용 0)',
   /const stake = \+p\.stake \|\| 0;/.test(settle) && !/meta\.stake/.test(settle.replace(/\/\/[^\n]*/g, '')));

// ② cash_out 잠금 — 고객 실행 권한 회수 (경쟁 중복지급 구멍, 재설계 전까지)
ok('② cash_out revoke from authenticated (+anon/public)',
   /revoke execute on function public\.cash_out\(text, numeric\) from public, anon, authenticated/.test(lock));

// ③ crypto_trade — 하우스 마크업은 서버(pricing_marks)가 정함, 클라 p_markup은 수식에서 소거
ok('③ crypto_trade v_mk = pricing_marks 서버 조회 (0~50 경계·fail-safe 0)',
   /from public\.pricing_marks where symbol = p_symbol limit 1/.test(trade)
   && /greatest\(0, least\(50, coalesce\(markup_pts, 0\)\)\)/.test(trade));
ok('③ p_markup이 수수료 수식에 미사용 (시그니처 하위호환만)',
   !/coalesce\(p_markup/.test(trade) && /p_markup numeric default 0/.test(trade));

// ④ (동일 클래스 — 오늘 앞서 수정) place_bet dec0/마진 서버 도장 유지 확인
ok('④ place_bet dec0 서버 도장 + 마진 락스텝 유지', /'dec0', round\(v_dec, 6\)/.test(pb)
   && /v_dec := 1 \+ \(v_dec - 1\) \* \(1 - v_margin\)/.test(pb));

console.log((fail ? '🔴' : '🟢') + ' money-client-trust — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

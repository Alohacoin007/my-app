// Alpexa — sports-odds 폴링 다이어트 구조 핀 (정적, 네트워크 0, 돈 0)
//
// 배경(결함-로그 2026-07-25): 라이브 리그 매분 폴링 + 유휴 9분이 월 10만 크레딧을 25일에
// 소진 → 배당 14시간 동결. 사장님 승인 차등: 먼 경기 30분 · 임박(≤2h)/라이브 5분.
// 이 핀은 그 차등이 계속 살아있는지 + 골프 라이브 5분(=place_bet 15분 신선도 게이트의
// 전제)이 유지되는지 지킨다.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('sports-odds diet — 폴링 다이어트 핀');

const src = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'sports-odds', 'index.ts'), 'utf8');
const sc  = fs.readFileSync(path.join(REPO, 'tests', 'daily-selfcheck.js'), 'utf8');

ok('유휴 리그 = 30분 (구 9분 폐지)', /STALE_MS = 30 \* 60 \* 1000/.test(src) && !/STALE_MS = 9 \*/.test(src));
ok('임박·라이브 리그 = 5분 (매분 폴링 폐지)', /STALE_HOT_MS = 5 \* 60 \* 1000/.test(src)
   && /age >= \(hot\.has\(LG_OF\[sp\] \|\| ""\) \? STALE_HOT_MS : STALE_MS\)/.test(src));
ok('임박 창 = 시작 2시간 전 ~ 시작 후 6시간', /HOT_BEFORE_MS = 2 \* 60 \* 60 \* 1000/.test(src) && /HOT_AFTER_MS = 6 \* 60 \* 60 \* 1000/.test(src));
ok('hot 판정 = 우리 live_games 행 (크레딧 0·ESPN 호출 최소화)', /hotLeagues\(SB_URL, SB_KEY\)/.test(src)
   && /candidates\.filter\(\(sp\) => OUTRIGHTS\.has\(sp\)\)/.test(src));
ok('골프 outright — 라이브 5분·유휴 30분 게이트 유지 (place_bet 신선도 게이트의 전제)',
   /STALE_OUTRIGHT_LIVE_MS = 5 \* 60 \* 1000/.test(src)
   && /age >= \(live\.has\(sp\) \? STALE_OUTRIGHT_LIVE_MS : STALE_OUTRIGHT_MS\)/.test(src));
ok('카탈로그(무료) 일 1회 + 쿼터 보고(api_usage) 유지', /__sports_list/.test(src) && /api_usage\?on_conflict=provider/.test(src));
ok('CRON_SECRET fail-closed 유지', /CRON_SECRET not configured \(fail-closed\)/.test(src));
ok('자가검진 ④ 쿼터 경보 — 90% 소진 = 🔴, 70% = ⚠️', /pct >= 90/.test(sc) && /pct >= 70/.test(sc) && /api_usage/.test(sc));

console.log((fail ? '🔴' : '🟢') + ' sports-odds-diet — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

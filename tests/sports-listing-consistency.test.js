// Alpexa — 경기 목록 일관성 핀 (정적, 네트워크 0, 돈 0)
//
// 계약 (2026-07-27 사장님 두 지시의 영구핀):
//  ① "이렇게 되면 안 되잖아" — 베팅 걸린 미래 경기는 ESPN 창에서 밀려나도 목록 유지 (sticky).
//     이월/합성 행은 배당 초기화 + oddsReal:false (묵은 가격 생존 금지 — 오즈 불변식),
//     overlay가 실배당을 재부착할 때만 다시 열림. 과거 경기는 이월 안 함(정산 몫).
//  ② "일관성이 없잖아" — 목록 창 = 배당 존재 지평. 프로바이더가 가격 낸 가장 먼 경기까지
//     ESPN 조회 범위를 자동 확장 (상한 60일·하한 8일). 규칙 하나: "배당이 있으면 판다".
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('sports-listing-consistency — sticky + 배당 지평 핀');

const src = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'sports-games', 'index.ts'), 'utf8');

// ① sticky
ok('① stickyOpenBetGames — 열린 베팅 leg gid를 목록과 대조', /positions\?server=eq\.sports&status=eq\.open&select=meta/.test(src)
   && /stickyOpenBetGames\(games, SB_URL, H\)/.test(src));
ok('① 이월 우선(직전 행, 팀명 온전) + 부트스트랩 합성(leg gm) 이중 경로', /prev\.find\(\(g: any\) => g && g\.gid === gid\)/.test(src)
   && /String\(l\.gm \|\| l\.game \|\| ""\)\.split\("@"\)/.test(src));
ok('① 이월·합성 행 = 배당 비움 + oddsReal:false (묵은 가격 생존 금지)',
   (src.match(/ml: \[\], spread: \[\], total: \[\], threeWay: \[\], outright: \[\], oddsReal: false/g) || []).length >= 1
   && /live: false, time: fmtTime\(iso\),\n          ml: \[\], spread: \[\], total: \[\], threeWay: \[\], outright: \[\], oddsReal: false/.test(src));
ok('① 과거·시각미상 경기 이월 금지 (정산 엔진 몫)', /if \(!Number\.isFinite\(t\) \|\| t < Date\.now\(\)\) continue;/.test(src));
ok('① sticky는 overlay보다 먼저 (실배당 재부착 가능)', src.indexOf('stickyOpenBetGames(games') < src.indexOf('overlayRealOdds(games, oddsRows)'));

// ② 배당 지평
ok('② oddsHorizons — 리그별 최장 commence_time으로 창 확장', /function oddsHorizons\(rows: any\[\]\)/.test(src)
   && /fetchLeague\(L, games, hz\[L\.lg\]\)/.test(src));
ok('② 상한 60일 · 하한 8일', /MAX = now \+ 60 \* 86400000/.test(src) && /MIN = now \+ 8 \* 86400000/.test(src)
   && /Math\.max\(hz\[lg\], MIN\)/.test(src) && /Math\.max\(endMs \|\| 0, Date\.now\(\) \+ 8 \* 86400000\)/.test(src));
ok('② sports_odds 1회 로드 공유 (overlay 이중 fetch 금지)', /const oddsRows = await fetchOddsRows\(SB_URL, H\)/.test(src)
   && /overlayRealOdds\(games: any\[\], rows: any\[\]\)/.test(src)
   && !/overlayRealOdds[\s\S]{0,200}rest\/v1\/sports_odds/.test(src));

console.log((fail ? '🔴' : '🟢') + ' sports-listing-consistency — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

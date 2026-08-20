#!/usr/bin/env node
// Alpexa — ESPN User-Agent 락스텝 핀 (2026-08-20 블랙아웃에서 나옴)
// ============================================================================
// 실측으로 확정된 사실 (live_games id='diag', 2026-08-20 04:16 · sports-games UA 매트릭스):
//     deno-default (Deno 가 자동으로 붙이는 `User-Agent: Deno/x.x`)  → 403 ×11
//     빈 UA (`User-Agent: ""`)                                      → 403 ×11
//     "alpexa-feed/1.0" (정직한 자기 식별)                            → 200, 전 리그 정상
// 즉 ESPN 은 IP 가 아니라 **Deno 의 기본 UA** 를 막는다. 브라우저 위장(크롬 UA +
// Referer: espn.com)은 통과가 아니라 탐지 신호라 오히려 403 을 부른다 — 그걸 모르고
// 배포했다가 블랙아웃을 하루 더 끌었다.
//
// 이 핀이 지키는 계약 — ESPN 을 부르는 Edge 함수는 **3개**이고, 셋이 같이 움직여야 한다:
//     sports-games  (경기 목록 = 화면)
//     sports-settle (최종 스코어 = **돈**. 죽으면 끝난 경기 베팅이 영원히 안 닫힌다)
//     sports-odds   (라이브 판정 = 배당 갱신 주기)
// 2026-08-19 사고의 구조가 정확히 이거였다: 화면만 보고 sports-games 를 고치면
// **정산은 계속 죽어 있는데 아무도 모른다.** 화면은 살아났으니 초록으로 보인다.
// 그래서 값이 같은지(락스텝) + 셋 다 UA 를 실제로 보내는지 + 위장이 아닌지를 강제한다.
//
// 실행: node tests/espn-ua-lockstep.test.js   (verify 게이트에 자동 포함)
// ============================================================================

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const FILES = ['sports-games', 'sports-settle', 'sports-odds'];
const srcs = {};
for (const f of FILES) {
  const p = path.join(ROOT, 'supabase/functions', f, 'index.ts');
  if (!fs.existsSync(p)) { bad(`${f}/index.ts 가 없다 — ESPN 호출자 목록이 바뀌었으면 이 핀도 같이 고쳐라`); continue; }
  srcs[f] = fs.readFileSync(p, 'utf8');
}

// ── P1 · 셋 다 ESPN UA 를 선언한다 ──
const uas = {};
for (const f of Object.keys(srcs)) {
  const m = srcs[f].match(/ESPN_UA\s*=\s*["']([^"']+)["']/);
  if (!m) bad(`${f}: ESPN_UA 선언이 없다 — Deno 기본 UA 로 나가면 403 (실측)`);
  else uas[f] = m[1];
}

// ── P2 · 값이 셋 다 같다 (락스텝) ──
const vals = [...new Set(Object.values(uas))];
if (vals.length > 1) {
  bad(`ESPN UA 가 함수마다 다르다 — ${JSON.stringify(uas)}. 한쪽만 고치면 다른 쪽이 조용히 죽는다(2026-08-19 구조).`);
}

// ── P3 · 위장 UA 금지 (브라우저인 척하면 403) ──
for (const f of Object.keys(uas)) {
  if (/mozilla|chrome|safari|applewebkit/i.test(uas[f]))
    bad(`${f}: ESPN_UA 가 브라우저 위장값("${uas[f]}") — 실측상 이게 403 을 만든다. 정직한 자기 식별자를 써라.`);
}
for (const f of Object.keys(srcs)) {
  if (/["']Referer["']\s*:\s*["']https:\/\/(?:www\.)?espn/i.test(srcs[f]))
    bad(`${f}: Referer: espn.com 위장 헤더 — 403 유발 (2026-08-19 사고)`);
}

// ── P4 · ESPN fetch 가 UA 없이 나가는 자리가 남아 있으면 안 된다 ──
// 헤더를 안 붙인 fetch(u, { cache: "no-store" }) 는 Deno 기본 UA 로 나간다 = 403.
for (const f of Object.keys(srcs)) {
  const naked = srcs[f].match(/fetch\(\s*u\s*,\s*\{\s*cache:\s*["']no-store["']\s*\}\s*\)/g);
  if (naked) bad(`${f}: UA 없는 ESPN fetch 가 ${naked.length}곳 남아 있다 — Deno 기본 UA = 403`);
}

// ── P5 · 정산은 특히 조용히 죽는다 — 사람이 읽을 이유가 파일에 남아 있어야 한다 ──
// (주석이 사라지면 다음 사람이 "화면 고쳤으니 끝"이라고 판단한다. 이번에 내가 그랬다.)
if (srcs['sports-settle'] && !/정산|settle/i.test((srcs['sports-settle'].match(/🪪[\s\S]{0,600}/) || [''])[0]))
  bad('sports-settle: ESPN UA 주석에 "정산이 죽으면 무슨 일이 나는지"가 없다 — 화면만 고치고 끝내는 실수가 반복된다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log(`🟢 PASS: ESPN 호출자 3종(games·settle·odds)이 같은 정직한 UA("${vals[0]}")로 락스텝. 위장 없음, UA 누락 없음.`);

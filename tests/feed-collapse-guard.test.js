#!/usr/bin/env node
// MONEY-ADJACENT / 운영 — 스포츠 피드 블랙아웃 (2026-08-19 실사고, 사장님 "경기 피드가 하나도 없어").
//
// 무슨 일이 있었나
//   아침 점검 15:00 UTC : live_games 441경기 🟢
//   그날 02:50 UTC 확인 : live_games **2경기** — 남은 건 베팅이 걸린 SOC·NFL 각 1개(sticky 이월)뿐.
//   고객 스포츠북이 사실상 비었는데 **감시는 내내 초록**이었다.
//
// 왜 못 잡았나 (두 겹 다 뚫림)
//   ① 서버: sports-games 의 write 에 **바닥 가드가 없었다**. 상류(ESPN)가 빈 값을 주면 games 에는
//      sticky 이월분만 남는데 그걸로 멀쩡한 441경기 행을 그대로 덮어썼다 = fail-open.
//   ② 감시: daily-selfcheck 가 `updated_at` **나이만** 봤다. 크론은 계속 돌며 빈 목록을 새로 쓰니
//      "1분 전 갱신" 이라 항상 🟢. **내용(경기 수)을 아무도 안 봤다.**
//
// 계약
//   P1. 서버는 건강한 행을 붕괴한 목록으로 **덮어쓰지 않는다** (직전 20경기+ · 2h 이내 · 새 목록이 절반 미만).
//   P2. 그 가드는 **자가치유** 한다 — 진짜 축소면 직전 행이 낡으면서 통과된다(상태 저장 없음).
//   P3. 감시는 나이뿐 아니라 **경기 수 바닥**을 본다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── P1/P2 · 서버 가드 ──
const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/sports-games/index.ts'), 'utf8');
const iGuard = src.indexOf('collapse-guard');
const iWrite = src.indexOf('live_games?on_conflict=id');
if (iGuard < 0) bad('sports-games 에 붕괴 가드가 없다 — 빈 피드가 멀쩡한 행을 덮어쓴다');
else if (iWrite >= 0 && iGuard > iWrite) bad('붕괴 가드가 upsert 뒤에 있다 — 이미 덮어쓴 뒤라 의미가 없다');
if (!/prevCount >= 20/.test(src)) bad('직전 행이 건강한지(20경기+) 보지 않는다 — 첫 배포·빈 테이블까지 막으면 안 된다');
if (!/prevAgeMs < 2 \* 3600 \* 1000/.test(src))
  bad('가드에 시간 탈출구가 없다 — 진짜로 경기가 줄어든 경우 영원히 갱신이 막힌다(자가치유 필요)');
if (!/return json\(\{ ok: false, error: "collapse-guard/.test(src))
  bad('붕괴를 조용히 넘기면 안 된다 — 실패로 보고해야 크론/감시가 본다');

// ── P4 · 실패가 **보여야** 한다 (2026-08-19: 왜 0경기인지 알 길이 없어 진단이 하루 늦었다) ──
// (정규식 주의: 기록 코드 안에 u.slice(0, 60) 의 괄호가 있어 [^)]* 로는 못 넘는다)
if (!/if \(!res\.ok\) \{ DIAG\.push\(/.test(src) || !/status: res\.status/.test(src))
  bad('ESPN 응답이 !ok 일 때 조용히 건너뛴다 — 왜 0경기인지 알 수 없다. 시도별 상태를 남길 것');
if (!/diag: DIAG\.slice/.test(src))
  bad('진단을 응답에 싣지 않는다 — 한 번 호출로 원인을 못 본다');
// 응답에만 실으면 크론이 받아가고 끝 → 사람이 대시보드를 뒤져야 한다(원인 파악이 하루 늦었다).
// DB(id='diag')에도 남겨 운영 스크립트가 직접 읽게 한다.
if (!/id: "diag"/.test(src))
  bad('진단을 DB(live_games id=diag)에 안 남긴다 — 매번 사람이 대시보드를 뒤져야 한다');
if (!/api\.allorigins\.win/.test(src))
  bad('미러가 corsproxy 하나뿐이다 — 그 프록시가 죽으면 보드가 통째로 빈다');

// ── P5 · ESPN 요청에 브라우저 위장 헤더를 붙이지 않는다 (2026-08-20 실측으로 뒤집힘) ──
// ⚠️ 이 항목은 원래 정반대였다. 2026-08-19 블랙아웃 때 "헤더 없는 데이터센터 요청이 차단된다"는
//    *가설*을 그대로 핀으로 굳혀 "UA/Referer 를 붙여라"를 강제했다. 하루 뒤 실측이 그 가설을
//    뒤집었다 (tests/espn-transport-probe.js, 같은 러너·같은 IP·ms 차이):
//        헤더 없음 → 200 events=632/111/50 (MLB/NFL/EPL)   ·   위장 헤더 → 403/403/403
//    ESPN(Akamai)은 헤더 없는 요청은 그냥 내주고, 크롬 UA 인데 TLS 지문이 크롬이 아닌 요청을
//    봇으로 본다. 위장은 통과가 아니라 탐지 신호다 — 그 헤더가 블랙아웃을 하루 더 끌었다.
//    👉 교훈: **검증 안 된 가설을 핀으로 만들지 마라.** 핀은 실측한 사실만 굳힌다.
// 금지 대상은 "UA 를 보내는 것"이 아니라 **브라우저인 척하는 것**이다. 정직한 식별자
// (alpexa-feed/1.0)나 빈 UA 는 허용 — 실제로 Deno 자동 UA 를 우회하는 정당한 수단이다.
if (/ESPN_HEADERS/.test(src)) bad('ESPN 위장 헤더 상수가 되살아났다 — 실측상 이게 403 을 만든다');
if (/["'](?:User-Agent|Referer)["']\s*:\s*["'](?:Mozilla|https:\/\/(?:www\.)?espn)/i.test(src))
  bad('ESPN 요청에 브라우저 위장 UA/Referer 를 붙이고 있다 (403 유발, 2026-08-20 실측)');
// UA 변형 폴백이 살아 있어야 한다 — Deno 자동 UA 가 막히면 이게 유일한 자가치유 경로다.
if (!/UA_TRIES/.test(src))
  bad('UA 변형 폴백이 없다 — Deno 자동 UA 하나에만 의존하면 그게 막히는 순간 전 리그 블랙아웃');
if (!/AbortSignal\.timeout/.test(src))
  bad('ESPN fetch 에 타임아웃이 없다 — 죽은 미러가 20초씩 매달려 갱신을 잡아먹는다(실측 19.7초)');

// ── P3 · 감시가 내용까지 본다 ──
const chk = fs.readFileSync(path.join(ROOT, 'tests/daily-selfcheck.js'), 'utf8');
if (!/BLACKOUT_FLOOR/.test(chk)) bad('daily-selfcheck 가 경기 수 바닥을 안 본다 — 빈 피드가 신선하면 🟢로 통과한다');
if (!/all\.length < BLACKOUT_FLOOR/.test(chk)) bad('블랙아웃 판정이 실제 경기 수에 걸려 있지 않다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 서버는 붕괴한 목록으로 건강한 피드를 덮어쓰지 않고(2h 자가치유), 감시는 나이뿐 아니라 경기 수 바닥까지 본다.');

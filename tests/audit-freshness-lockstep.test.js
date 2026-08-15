#!/usr/bin/env node
// REGRESSION (감시 신뢰도) — 신선도 임계값 **3곳 락스텝**.
//
// 2026-08-14 저녁점검: 돈-상태 감사가 🟡 YELLOW + 이메일을 매일 쏘고 있었다. 원인은 사고가 아니라
// **오탐** — sports_audit.sql 의 C7 이 `15분 일괄` 이었는데, 2026-07-25 폴링 다이어트로 실제 주기가
// 유휴 30분 / 카탈로그 하루 1회 로 바뀐 뒤에도 그대로였다. 실측: 카탈로그 939분 · NBA·NCAAB 23분 ·
// EPL 20분 — 전부 설계대로인데 스테일 판정. feed-check 는 이미 맞춰져 있었고 SQL만 뒤처졌다.
//
// 계약: **감시 임계값 ≥ 실제 폴링 주기** (여유 포함). 안 그러면 정상 운영이 경보를 울리고,
//       매일 울리는 경보는 무시당한다 → 진짜 돈 사고 때 아무도 안 본다.
//   ① sports-odds  = 진짜 주기의 源 (유휴 STALE_MS · outright STALE_OUTRIGHT_MS · 카탈로그 24h)
//   ② feed-check   = thrOf (카탈로그 26h · 골프 70m · 팀 35m)
//   ③ sports_audit = C7 (같은 기준을 SQL interval 로)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const odds = fs.readFileSync(path.join(ROOT, 'supabase/functions/sports-odds/index.ts'), 'utf8');
const feed = fs.readFileSync(path.join(ROOT, 'tests/sports-feed-check.js'), 'utf8');
const sql = fs.readFileSync(path.join(ROOT, 'supabase/sql/sports_audit.sql'), 'utf8');

// ── ① 실제 폴링 주기 (분) ──
const minsOf = (re, label) => {
  const m = odds.match(re);
  if (!m) { bad(`sports-odds 에서 ${label} 를 못 찾음 — 폴링 계약이 바뀌었는지 확인`); return null; }
  return Number(m[1]);
};
const idleMin = minsOf(/const STALE_MS = (\d+) \* 60 \* 1000;/, 'STALE_MS(유휴 주기)');
const outMin = minsOf(/const STALE_OUTRIGHT_MS = (\d+) \* 60 \* 1000;/, 'STALE_OUTRIGHT_MS(outright 주기)');
// 카탈로그는 24시간마다 1회
if (!/now - \(updated\["__sports_list"\] \|\| 0\) >= 24 \* 3600 \* 1000/.test(odds))
  bad('sports-odds 의 카탈로그 적재 주기(24h)를 못 찾음 — 감시 임계값 근거가 바뀌었다');
const catMin = 24 * 60;

// ── ② feed-check thrOf ──
const thr = feed.match(/const thrOf = \(s\) =>[^\n]*/);
if (!thr) bad('feed-check 의 thrOf 를 못 찾음');
else {
  const fCat = (thr[0].match(/(\d+) \* 3600e3/) || [])[1];
  const fGolf = (thr[0].match(/\? (\d+) \* 60000 :/) || [])[1];
  const fTeam = (thr[0].match(/: (\d+) \* 60000;/) || [])[1];
  const chk = (name, got, need) => {
    if (got == null) { bad(`feed-check thrOf 에서 ${name} 임계값을 못 읽음`); return; }
    if (Number(got) < need) bad(`feed-check ${name} 임계값 ${got} < 실제 주기 ${need} — 정상 운영이 경보를 울린다`);
  };
  chk('카탈로그(시간)', fCat, 24);
  if (outMin != null) chk('골프(분)', fGolf, outMin);
  if (idleMin != null) chk('팀스포츠(분)', fTeam, idleMin);
}

// ── ③ sports_audit.sql C7 — 종목별 임계값이어야 하고, 각각 실제 주기 이상 ──
const c7 = sql.match(/-- C7[\s\S]*?end;/);
if (!c7) bad('sports_audit.sql 에서 C7 블록을 못 찾음');
else {
  const body = c7[0];
  if (/interval '15 minutes'/.test(body) && !/case/.test(body))
    bad("C7 이 아직 '15분 일괄' 이다 — 폴링 다이어트(유휴 30분·카탈로그 일 1회) 이후로는 정상 운영이 매일 🟡 를 띄운다");
  if (!/sport = '__sports_list'/.test(body))
    bad('C7 에 카탈로그(__sports_list) 전용 임계값이 없다 — 하루 1회 적재라 항상 스테일로 잡힌다');
  if (!/sport like 'golf%'/.test(body))
    bad('C7 에 골프 outright 전용 임계값이 없다 (30분 주기)');
  const catH = (body.match(/interval '(\d+) hours'/) || [])[1];
  const golfM = (body.match(/interval '(\d+) minutes'[\s\S]*?else/) || [])[1];
  const teamM = (body.match(/else\s+interval '(\d+) minutes'/) || [])[1];
  if (!catH || Number(catH) * 60 < catMin) bad(`C7 카탈로그 임계값 ${catH}h 이 적재 주기(24h) 보다 짧다`);
  if (outMin != null && (!golfM || Number(golfM) < outMin)) bad(`C7 골프 임계값 ${golfM}분 이 outright 주기(${outMin}분) 보다 짧다`);
  if (idleMin != null && (!teamM || Number(teamM) < idleMin)) bad(`C7 팀스포츠 임계값 ${teamM}분 이 유휴 주기(${idleMin}분) 보다 짧다`);
  // 반대로 너무 느슨해도 안 된다 — 진짜 중단을 놓친다 (주기의 3배 이내)
  if (idleMin != null && teamM && Number(teamM) > idleMin * 3)
    bad(`C7 팀스포츠 임계값 ${teamM}분 이 주기의 3배(${idleMin * 3}분)를 넘는다 — 진짜 피드 중단을 놓친다`);
}

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 신선도 임계값이 실제 폴링 주기와 락스텝 (sports-odds ↔ feed-check ↔ sports_audit C7) — 정상 운영은 조용하고, 진짜 중단은 잡힌다.');

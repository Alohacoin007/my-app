#!/usr/bin/env node
// REGRESSION (스포츠 표시) — 경기 카드에 **날짜가 없고 시각만** 보이던 버그 (사장님 2026-08-14).
//
// 원인: 서버(sports-games)의 fmtTime() 은 `{weekday, hour, minute}` 만 만든다 → "Wed · 5:15 PM".
//       ① 날짜(월/일)가 없어 **몇 주 뒤 경기가 이번 주처럼** 보이고
//       ② 서버(UTC)에서 포맷돼 **보는 사람 시간대가 아니다**.
// 이 결함은 2026-07-24에 이미 한 번 터졌고(9/10 NFL이 "Thu 12:20 AM"으로 보여 미정산 오해),
// 그때 **베팅슬립(legKick)만** 고치고 **경기 카드 렌더는 놓쳤다**. 여기서 나머지 사용처를 못 박는다.
//
// 계약: 라이브가 아닌 경기의 킥오프 라벨은 클라가 `iso` 에서 **월·일을 포함해** 현지 시각으로 만든다.
//       라이브 경기는 서버의 경기 시계(g.time = "Top 2nd")를 그대로 쓴다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 실제 경기 모양 (2026-08-14 live_games 실측 스키마) — NFL 개막전, 3주 이상 뒤
const FAR = { lg: 'NFL', live: false, iso: '2026-09-10T00:15:00Z', time: 'Wed, 5:15 PM' };
const LIVE = { lg: 'MLB', live: true, iso: '2026-08-14T18:20Z', time: 'Top 2nd' };
const hasMonthDay = (s) => /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}|\d{1,2}\/\d{1,2}/i.test(s);

// 여러 줄 함수를 통째로 뽑는다 (정규식 non-greedy 는 첫 줄에서 끊긴다)
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let d = 0, started = false;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// ── ① sports-dashboard.html · gameKick ──
const dash = fs.readFileSync(path.join(ROOT, 'sports-dashboard.html'), 'utf8');
const gkSrc = grabFn(dash, 'gameKick');
if (!gkSrc) bad('sports-dashboard.html 에 gameKick() 이 없다 — 카드가 서버 g.time(날짜 없음)을 그대로 쓴다');
else {
  const gameKick = new Function(gkSrc + '\nreturn gameKick;')();
  const far = gameKick(FAR);
  if (!hasMonthDay(far)) bad(`gameKick(먼 경기) = "${far}" — 월·일이 없다 (몇 주 뒤 경기가 이번 주처럼 보인다)`);
  if (!/\d{1,2}:\d{2}/.test(far)) bad(`gameKick(먼 경기) = "${far}" — 시각이 없다`);
  if (gameKick(LIVE) !== 'Top 2nd') bad(`gameKick(라이브) = "${gameKick(LIVE)}" — 라이브는 경기 시계(g.time)를 유지해야 한다`);
  // iso 가 깨졌을 때 서버 문자열로 폴백 (빈칸보다 낫다)
  if (gameKick({ live: false, iso: 'zzz', time: 'Wed, 5:15 PM' }) !== 'Wed, 5:15 PM')
    bad('gameKick 은 iso 파싱 실패 시 서버 g.time 으로 폴백해야 한다');
}
// 카드 렌더가 **날것의 g.time** 을 쓰지 않는지 — 라이브 전용 분기만 허용
const rawCard = dash.split('\n').map((l, i) => [i + 1, l])
  .filter(([, l]) => /esc\(g\.time\)/.test(l) && !/g&&g\.live\)\?/.test(l));
if (rawCard.length)
  bad(`대시보드에 날것의 esc(g.time) 렌더가 남아 있다 (라인 ${rawCard.map(([n]) => n).join(', ')}) — gameKick(g) 를 쓸 것`);

// ── ② index.html · fmtShort (홈 경기보드) ──
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fsSrc = grabFn(idx, 'fmtShort');
if (!fsSrc) bad('index.html 에 fmtShort() 가 없다');
else {
  const fmtShort = new Function(fsSrc + '\nreturn fmtShort;')();
  const far = fmtShort(FAR.iso);
  if (!hasMonthDay(far)) bad(`index fmtShort = "${far}" — 월·일이 없다 (요일만으론 몇 주 뒤 경기를 구분 못 한다)`);
}

// ── ③ 서버 fmtTime 은 날짜가 없다는 사실 자체를 고정 (클라가 iso 로 다시 만들어야 하는 이유) ──
const edge = fs.readFileSync(path.join(ROOT, 'supabase/functions/sports-games/index.ts'), 'utf8');
const ft = edge.match(/function fmtTime[\s\S]{0,300}/);
if (ft && /toLocaleString[^\n]*month:/.test(ft[0]))
  console.log('  ℹ️  서버 fmtTime 에 month 가 생겼다 — 클라 재포맷과 중복인지 검토할 것(이 핀은 계속 유효).');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 경기 카드·홈 보드가 iso 에서 월·일 포함 현지 시각으로 킥오프를 표시한다 (라이브는 경기 시계 유지, iso 깨지면 서버 문자열 폴백).');
